package app.mindsetforest.phone

import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.time.OffsetDateTime

/** A response the server gave on purpose (4xx/5xx). Network trouble is an IOException instead. */
class HttpError(val code: Int, val body: String) : Exception("HTTP $code: ${body.take(300)}")

data class Tokens(val access: String, val refresh: String, val expiresAt: Long, val userId: String, val email: String)

/**
 * The two Supabase endpoints the app needs, over plain HttpURLConnection:
 * Auth (password sign-in, token refresh) and PostgREST (upsert sessions).
 * The anon key is the public one; the signed-in user's token is what RLS checks.
 */
class SupabaseApi(private val url: String, private val anonKey: String) : SessionApi {

    fun signIn(email: String, password: String): Tokens =
        tokens("password", JSONObject().put("email", email).put("password", password))

    override fun refresh(refreshToken: String): Tokens =
        tokens("refresh_token", JSONObject().put("refresh_token", refreshToken))

    /** Inserts or updates rows keyed by (user_id, device_id, started_at), as the Windows tracker does. */
    override fun upsertSessions(json: String, accessToken: String) {
        request(
            "POST",
            "$url/rest/v1/app_usage_sessions?on_conflict=user_id,device_id,started_at",
            json,
            mapOf(
                "Authorization" to "Bearer $accessToken",
                "Prefer" to "resolution=merge-duplicates,return=minimal",
            ),
        )
    }

    override fun latestEnd(devicePrefix: String, accessToken: String): Long? {
        val like = URLEncoder.encode("$devicePrefix*", "UTF-8").replace("+", "%20")
        val text = request(
            "GET",
            "$url/rest/v1/app_usage_sessions?select=ended_at&device_id=like.$like&order=ended_at.desc&limit=1",
            null,
            mapOf("Authorization" to "Bearer $accessToken"),
        )
        val rows = JSONArray(text)
        if (rows.length() == 0) return null
        return OffsetDateTime.parse(rows.getJSONObject(0).getString("ended_at")).toInstant().toEpochMilli()
    }

    override fun insertArchive(json: String, accessToken: String): String? {
        val text = request(
            "POST",
            "$url/rest/v1/archive_blocks?select=id",
            json,
            mapOf("Authorization" to "Bearer $accessToken", "Prefer" to "return=representation"),
        )
        val rows = try { JSONArray(text) } catch (_: Exception) { return null }
        return rows.optJSONObject(0)?.optString("id")?.ifEmpty { null }
    }

    /** Best effort: index a note for the Archive's semantic search, as the web app and the tracker do. */
    fun embedBlock(blockId: String, accessToken: String) {
        try {
            request(
                "POST",
                "$url/functions/v1/ai-embed-block",
                JSONObject().put("action", "embed").put("blockId", blockId).toString(),
                mapOf("Authorization" to "Bearer $accessToken"),
            )
        } catch (_: Exception) {
            // The note is saved; the Archive indexes unindexed notes later.
        }
    }

    override fun dueReminders(until: Long, accessToken: String): List<Reminder> {
        val iso = URLEncoder.encode(java.time.Instant.ofEpochMilli(until).toString(), "UTF-8")
        val text = request(
            "GET",
            "$url/rest/v1/reminders?select=id,message,deliver_at,created_at&dismissed_at=is.null&deliver_at=lte.$iso&order=deliver_at.asc&limit=50",
            null,
            mapOf("Authorization" to "Bearer $accessToken"),
        )
        val rows = JSONArray(text)
        return (0 until rows.length()).mapNotNull { i ->
            val o = rows.optJSONObject(i) ?: return@mapNotNull null
            try {
                Reminder(
                    id = o.getString("id"),
                    message = o.optString("message"),
                    deliverAt = OffsetDateTime.parse(o.getString("deliver_at")).toInstant().toEpochMilli(),
                    createdAt = OffsetDateTime.parse(o.getString("created_at")).toInstant().toEpochMilli(),
                )
            } catch (_: Exception) {
                null
            }
        }
    }

    private fun tokens(grant: String, body: JSONObject): Tokens {
        val json = JSONObject(request("POST", "$url/auth/v1/token?grant_type=$grant", body.toString(), emptyMap()))
        val user = json.getJSONObject("user")
        val expiresIn = json.optLong("expires_in", 3600)
        return Tokens(
            access = json.getString("access_token"),
            refresh = json.getString("refresh_token"),
            expiresAt = System.currentTimeMillis() + expiresIn * 1000,
            userId = user.getString("id"),
            email = user.optString("email"),
        )
    }

    private fun request(method: String, target: String, body: String?, headers: Map<String, String>): String {
        val conn = URL(target).openConnection() as HttpURLConnection
        try {
            conn.requestMethod = method
            conn.connectTimeout = 20_000
            conn.readTimeout = 30_000
            conn.setRequestProperty("apikey", anonKey)
            conn.setRequestProperty("Content-Type", "application/json")
            for ((k, v) in headers) conn.setRequestProperty(k, v)
            if (body != null) {
                conn.doOutput = true
                conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            }
            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val text = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            if (code !in 200..299) throw HttpError(code, text)
            return text
        } finally {
            conn.disconnect()
        }
    }

    companion object {
        /** The server's own words for a failed sign-in, or a fallback. */
        fun message(e: HttpError): String = try {
            val j = JSONObject(e.body)
            j.optString("msg").ifEmpty { j.optString("error_description") }.ifEmpty { j.optString("message") }
                .ifEmpty { "HTTP ${e.code}" }
        } catch (_: Exception) {
            "HTTP ${e.code}"
        }
    }
}

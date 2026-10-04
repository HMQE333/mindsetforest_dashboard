package app.mindsetforest.phone

import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.net.InetAddress
import java.net.ServerSocket
import kotlin.concurrent.thread

/** Real HTTP against a local server standing in for Supabase. */
class SupabaseApiTest {
    private lateinit var server: ServerSocket
    private val seen = mutableListOf<Map<String, String>>()
    @Volatile private var status = 200
    @Volatile private var reply = ""

    /** A one-connection-at-a-time HTTP/1.1 server: enough for HttpURLConnection. */
    @Before
    fun start() {
        server = ServerSocket(0, 10, InetAddress.getByName("127.0.0.1"))
        thread(isDaemon = true) {
            while (!server.isClosed) {
                val socket = try { server.accept() } catch (_: Exception) { break }
                socket.use { s ->
                    val input = s.getInputStream().buffered()
                    fun line(): String {
                        val sb = StringBuilder()
                        while (true) {
                            val c = input.read()
                            if (c == -1 || c == '\n'.code) break
                            if (c != '\r'.code) sb.append(c.toChar())
                        }
                        return sb.toString()
                    }
                    val (method, uri) = line().split(" ").let { it[0] to it[1] }
                    val headers = HashMap<String, String>()
                    while (true) {
                        val h = line()
                        if (h.isEmpty()) break
                        val i = h.indexOf(':')
                        headers[h.substring(0, i).trim().lowercase()] = h.substring(i + 1).trim()
                    }
                    val length = headers["content-length"]?.toInt() ?: 0
                    val body = ByteArray(length)
                    var read = 0
                    while (read < length) read += input.read(body, read, length - read)
                    synchronized(seen) {
                        seen += mapOf(
                            "method" to method,
                            "uri" to uri,
                            "apikey" to headers["apikey"].orEmpty(),
                            "auth" to headers["authorization"].orEmpty(),
                            "prefer" to headers["prefer"].orEmpty(),
                            "type" to headers["content-type"].orEmpty(),
                            "body" to body.toString(Charsets.UTF_8),
                        )
                    }
                    val bytes = reply.toByteArray()
                    val head = "HTTP/1.1 $status X\r\nContent-Type: application/json\r\nContent-Length: ${bytes.size}\r\nConnection: close\r\n\r\n"
                    s.getOutputStream().apply { write(head.toByteArray()); write(bytes); flush() }
                }
            }
        }
    }

    @After
    fun stop() = server.close()

    private fun api() = SupabaseApi("http://127.0.0.1:${server.localPort}", "anon-key")

    @Test
    fun signInUsesThePasswordGrant() {
        reply = """{"access_token":"acc","refresh_token":"ref","expires_in":3600,"user":{"id":"u-1","email":"a@b.c"}}"""
        val before = System.currentTimeMillis()
        val t = api().signIn("a@b.c", "secret \"pw\"")
        assertEquals(listOf("acc", "ref", "u-1", "a@b.c"), listOf(t.access, t.refresh, t.userId, t.email))
        assertTrue(t.expiresAt >= before + 3_600_000)
        val r = seen.single()
        assertEquals("POST", r["method"])
        assertEquals("/auth/v1/token?grant_type=password", r["uri"])
        assertEquals("anon-key", r["apikey"])
        assertEquals("application/json", r["type"])
        val body = JSONObject(r["body"]!!)
        assertEquals("secret \"pw\"", body.getString("password"))
    }

    @Test
    fun refreshUsesTheRefreshGrant() {
        reply = """{"access_token":"acc2","refresh_token":"ref2","expires_in":60,"user":{"id":"u-1"}}"""
        assertEquals("ref2", api().refresh("ref1").refresh)
        assertEquals("/auth/v1/token?grant_type=refresh_token", seen.single()["uri"])
        assertEquals("ref1", JSONObject(seen.single()["body"]!!).getString("refresh_token"))
    }

    @Test
    fun upsertMergesOnTheSessionKey() {
        status = 201
        val rows = listOf(UsageRow("YouTube", "com.google.android.youtube", 1_759_557_600_000, 1_759_557_660_000, "2025-10-04"))
        api().upsertSessions(rowsJson(rows, "u-1", "android-abc"), "acc")
        val r = seen.single()
        assertEquals("/rest/v1/app_usage_sessions?on_conflict=user_id,device_id,started_at", r["uri"])
        assertEquals("Bearer acc", r["auth"])
        assertEquals("resolution=merge-duplicates,return=minimal", r["prefer"])
        val row = JSONArray(r["body"]!!).getJSONObject(0)
        assertEquals("android-abc", row.getString("device_id"))
        assertEquals(60, row.getInt("seconds"))
        assertEquals("2025-10-04T06:00:00Z", row.getString("started_at"))
    }

    @Test
    fun latestEndAsksForThisPhoneModelsNewestRow() {
        reply = """[{"ended_at":"2026-10-04T06:01:01.5+00:00"}]"""
        assertEquals(1_791_093_661_500L, api().latestEnd("android:Pixel 8:", "acc"))
        val r = seen.single()
        assertEquals("GET", r["method"])
        assertEquals("/rest/v1/app_usage_sessions?select=ended_at&device_id=like.android%3APixel%208%3A*&order=ended_at.desc&limit=1", r["uri"])
        assertEquals("Bearer acc", r["auth"])
        reply = "[]"
        assertEquals(null, api().latestEnd("android:Pixel 8:", "acc"))
    }

    @Test
    fun errorsCarryTheStatusAndTheServersMessage() {
        status = 400
        reply = """{"code":400,"error_code":"invalid_credentials","msg":"Invalid login credentials"}"""
        val e = runCatching { api().signIn("a@b.c", "bad") }.exceptionOrNull() as HttpError
        assertEquals(400, e.code)
        assertEquals("Invalid login credentials", SupabaseApi.message(e))
        assertEquals("HTTP 502", SupabaseApi.message(HttpError(502, "<html>bad gateway</html>")))
    }
}

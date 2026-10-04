package app.mindsetforest.phone

import java.io.IOException
import java.time.ZoneId

/** How a sync went, for the screen and for the job's retry decision. */
sealed class SyncResult {
    data class Done(val rows: Int) : SyncResult()
    /** Worth retrying later (offline, server hiccup). */
    data class Retry(val message: String) : SyncResult()
    /** Needs the user (no access, signed out, not connected). */
    data class Blocked(val message: String) : SyncResult()
}

/** The server calls a sync makes (SupabaseApi; a fake in tests). */
interface SessionApi {
    fun refresh(refreshToken: String): Tokens
    fun upsertSessions(json: String, accessToken: String)
    /** Epoch ms of the latest ended_at among this user's rows whose device_id starts with `prefix`, or null. */
    fun latestEnd(devicePrefix: String, accessToken: String): Long?
}

/** What a sync reads and writes between runs (Store; a fake in tests). */
interface SyncState {
    var cursor: Long
    val userId: String
    val deviceId: String
    val refreshToken: String
    val accessToken: String
    val accessExpiresAt: Long
    fun saveTokens(t: Tokens)
    fun signOut()
}

/** First sync: Android keeps roughly a week of events, ask for a bit more and take what is there. */
const val FIRST_SYNC_DAYS = 10L
private const val DAY_MS = 86_400_000L
private const val BATCH = 500

/** The part of a sync that needs no Android: tokens, upload, retry, cursor. */
class SyncCore(
    private val api: SessionApi,
    private val state: SyncState,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    /**
     * Where to start reading events. The first sync after an install reads up
     * to ten days back, but not before what this phone model already sent: a
     * reinstall can come with a new device id (a new signing key changes
     * ANDROID_ID), and the same days must not be counted twice.
     */
    fun since(now: Long): Long {
        if (state.cursor > 0) return state.cursor
        val floor = now - FIRST_SYNC_DAYS * DAY_MS
        val sent = api.latestEnd(devicePrefix(state.deviceId), accessToken()) ?: return floor
        return maxOf(floor, sent)
    }

    /** Sends the sessions built from `events` and moves the cursor; returns the number of rows sent. */
    fun upload(events: List<UsageEvent>, now: Long, ignored: (String) -> Boolean, zone: ZoneId, label: (String) -> String): Int {
        val sessions = buildSessions(events, now, ignored)
        val rows = toRows(sessions, zone, label)
        if (rows.isNotEmpty()) {
            var token = accessToken()
            for (chunk in rows.chunked(BATCH)) {
                val json = rowsJson(chunk, state.userId, state.deviceId)
                try {
                    api.upsertSessions(json, token)
                } catch (e: HttpError) {
                    if (e.code != 401) throw e
                    token = accessToken(force = true)
                    api.upsertSessions(json, token)
                }
            }
        }
        state.cursor = nextCursor(sessions, now)
        return rows.size
    }

    /** The stored access token, refreshed when it is about to expire (or was just rejected). */
    fun accessToken(force: Boolean = false): String {
        val current = state.accessToken
        if (!force && current.isNotEmpty() && state.accessExpiresAt > clock() + 60_000) return current
        val t = try {
            api.refresh(state.refreshToken)
        } catch (e: HttpError) {
            // A refused refresh token means signing in again; a rate limit or an outage does not.
            val rejected = e.code in 400..499 && e.code != 429
            if (rejected) state.signOut()
            throw if (rejected) HttpError(401, e.body) else e
        }
        state.saveTokens(t)
        return t.access
    }
}

/** "android:Pixel 8:" for "android:Pixel 8:1a2b3c": what stays the same when the phone is reinstalled. */
fun devicePrefix(deviceId: String): String = deviceId.substringBeforeLast(':') + ":"

/** The device id: platform, model and Settings.Secure.ANDROID_ID. */
fun deviceIdFor(model: String, androidId: String): String =
    "android:" + model.replace(":", "").trim().ifEmpty { "phone" } + ":" + androidId.ifEmpty { "unknown" }

/** A failed sync in words for the screen, and whether trying again later can help. */
fun failure(e: Exception): SyncResult = when (e) {
    is HttpError -> when {
        e.code == 401 || e.code == 403 -> SyncResult.Blocked("Sesja wygasła, zaloguj się ponownie")
        e.code >= 500 || e.code == 429 -> SyncResult.Retry("Serwer: HTTP ${e.code}")
        else -> SyncResult.Blocked("Serwer odrzucił dane: ${SupabaseApi.message(e)}")
    }
    is IOException -> SyncResult.Retry("Brak połączenia z internetem")
    else -> throw e
}

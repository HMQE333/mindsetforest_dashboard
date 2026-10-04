package app.mindsetforest.phone

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/**
 * Turns Android's usage events into the sessions the dashboard stores
 * (public.app_usage_sessions), the same shape the Windows tracker writes.
 *
 * Android keeps a few days of foreground events (UsageStatsManager), so the
 * app does not have to watch the screen: every sync reads the events since its
 * cursor and rebuilds the sessions from them. A session's start is its key on
 * the server (user_id, device_id, started_at), so rebuilding the same events
 * gives the same rows and re-uploading them is harmless.
 *
 * Pure Kotlin, no Android types, so it runs in plain JVM unit tests.
 */

/** The UsageEvents.Event types used here (numbers, so tests need no Android). */
object EventType {
    const val RESUMED = 1
    const val PAUSED = 2
    const val SCREEN_INTERACTIVE = 15
    const val SCREEN_NON_INTERACTIVE = 16
    const val KEYGUARD_SHOWN = 17
    const val KEYGUARD_HIDDEN = 18
    const val STOPPED = 23
    const val DEVICE_SHUTDOWN = 26
    const val DEVICE_STARTUP = 27
}

data class UsageEvent(val time: Long, val type: Int, val pkg: String)

/** Time in one app, in epoch milliseconds. `open` means it is still in front. */
data class PhoneSession(val pkg: String, val start: Long, val end: Long, val open: Boolean = false) {
    val millis: Long get() = end - start
}

/** Activity switches inside one app (A paused, B resumed) take a moment: still one session. */
const val SAME_APP_GAP_MS = 2_000L

/** Shorter visits are app-switching noise. Open ones this short are sent once they grow. */
const val MIN_SESSION_MS = 2_000L

/** The dashboard's day starts at 04:00 local, as on the computer. */
const val DAY_START_HOUR = 4L

/** How far back a sync with nothing pending starts, in case events land a little late. */
const val CURSOR_LAG_MS = 5 * 60_000L

/**
 * Sessions from events in time order. `ignored` packages (the launcher, the
 * system UI) end the current session without starting one.
 */
fun buildSessions(events: List<UsageEvent>, now: Long, ignored: (String) -> Boolean): List<PhoneSession> {
    val out = ArrayList<PhoneSession>()
    var current: String? = null
    var start = 0L
    var pausedAt: Long? = null

    fun close(at: Long) {
        val pkg = current
        if (pkg != null) {
            val end = pausedAt ?: at
            if (end - start >= MIN_SESSION_MS) out += PhoneSession(pkg, start, end)
        }
        current = null
        pausedAt = null
    }

    for (e in events.sortedBy { it.time }) {
        when (e.type) {
            EventType.RESUMED -> when {
                ignored(e.pkg) -> close(e.time)
                e.pkg == current && (pausedAt.let { it == null || e.time - it <= SAME_APP_GAP_MS }) -> pausedAt = null
                else -> {
                    close(e.time)
                    current = e.pkg
                    start = e.time
                }
            }
            EventType.PAUSED, EventType.STOPPED ->
                if (e.pkg == current && pausedAt == null) pausedAt = e.time
            EventType.SCREEN_NON_INTERACTIVE, EventType.KEYGUARD_SHOWN,
            EventType.DEVICE_SHUTDOWN, EventType.DEVICE_STARTUP -> close(e.time)
        }
    }

    val pkg = current
    if (pkg != null) {
        val paused = pausedAt
        if (paused != null) close(paused)
        else if (now - start >= MIN_SESSION_MS) out += PhoneSession(pkg, start, now, open = true)
    }
    return out
}

/** "YYYY-MM-DD" of the dashboard day a moment belongs to (days start at 04:00 local). */
fun localDate(ms: Long, zone: ZoneId): String =
    Instant.ofEpochMilli(ms).atZone(zone).minusHours(DAY_START_HOUR).toLocalDate().toString()

/** A session never spans 04:00: the part after it belongs to the next day. */
fun splitAtDayStart(s: PhoneSession, zone: ZoneId): List<PhoneSession> {
    val parts = ArrayList<PhoneSession>()
    var from = s.start
    while (true) {
        val day = LocalDate.parse(localDate(from, zone))
        val boundary = day.plusDays(1).atTime(DAY_START_HOUR.toInt(), 0).atZone(zone).toInstant().toEpochMilli()
        if (boundary >= s.end) {
            parts += s.copy(start = from)
            return parts
        }
        parts += PhoneSession(s.pkg, from, boundary)
        from = boundary
    }
}

/**
 * Where the next sync starts reading. The last session is always rebuilt (it
 * may still be open, or continue after a short pause); when it ended a while
 * ago nothing is pending and only the last few minutes are read again.
 */
fun nextCursor(sessions: List<PhoneSession>, now: Long): Long {
    val last = sessions.maxByOrNull { it.start } ?: return now - CURSOR_LAG_MS
    return if (!last.open && last.end < now - CURSOR_LAG_MS) now - CURSOR_LAG_MS else last.start
}

/** The moment the dashboard day containing `ms` began (04:00 local). */
fun dayStart(ms: Long, zone: ZoneId): Long =
    LocalDate.parse(localDate(ms, zone)).atTime(DAY_START_HOUR.toInt(), 0).atZone(zone).toInstant().toEpochMilli()

/** Milliseconds per app from `from` on, most used first. */
fun totalsByApp(sessions: List<PhoneSession>, from: Long): List<Pair<String, Long>> =
    sessions.groupBy { it.pkg }
        .mapValues { (_, list) -> list.sumOf { maxOf(0L, it.end - maxOf(it.start, from)) } }
        .filterValues { it > 0 }
        .toList()
        .sortedByDescending { it.second }

/** "42 min", "1 h 05 min", "<1 min". */
fun formatDuration(ms: Long): String {
    val minutes = ms / 60_000
    return when {
        minutes < 1 -> "<1 min"
        minutes < 60 -> "$minutes min"
        else -> "${minutes / 60} h %02d min".format(minutes % 60)
    }
}

/** One app_usage_sessions row. */
data class UsageRow(
    val app: String,
    val appKey: String,
    val startedAt: Long,
    val endedAt: Long,
    val localDate: String,
) {
    val seconds: Int get() = ((endedAt - startedAt) / 1000).toInt()
}

/**
 * Rows for upload. The app's name goes in `app` and in the title too, so the
 * dashboard's keyword rules ("tiktok", "youtube") match phone apps whose
 * package name says nothing (com.zhiliaoapp.musically).
 */
fun toRows(sessions: List<PhoneSession>, zone: ZoneId, label: (String) -> String): List<UsageRow> =
    sessions.flatMap { splitAtDayStart(it, zone) }
        .filter { it.millis >= 1000 }
        .map { UsageRow(label(it.pkg), it.pkg, it.start, it.end, localDate(it.start, zone)) }

/** JSON for PostgREST, written by hand so it runs (and is tested) without Android's org.json. */
fun rowsJson(rows: List<UsageRow>, userId: String, deviceId: String): String =
    rows.joinToString(",", "[", "]") { r ->
        buildString {
            append('{')
            append("\"user_id\":").append(jsonString(userId)).append(',')
            append("\"device_id\":").append(jsonString(deviceId)).append(',')
            append("\"app\":").append(jsonString(r.app)).append(',')
            append("\"app_key\":").append(jsonString(r.appKey)).append(',')
            append("\"window_title\":").append(jsonString(r.app)).append(',')
            append("\"started_at\":").append(jsonString(Instant.ofEpochMilli(r.startedAt).toString())).append(',')
            append("\"ended_at\":").append(jsonString(Instant.ofEpochMilli(r.endedAt).toString())).append(',')
            append("\"seconds\":").append(r.seconds).append(',')
            append("\"idle\":false,")
            append("\"local_date\":").append(jsonString(r.localDate))
            append('}')
        }
    }

fun jsonString(s: String): String = buildString {
    append('"')
    for (c in s) {
        when {
            c == '"' -> append("\\\"")
            c == '\\' -> append("\\\\")
            c == '\n' -> append("\\n")
            c == '\r' -> append("\\r")
            c == '\t' -> append("\\t")
            c < ' ' -> append(String.format("\\u%04x", c.code))
            else -> append(c)
        }
    }
    append('"')
}

package app.mindsetforest.phone

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.ZoneId
import java.time.ZonedDateTime

class SessionsTest {
    private val waw = ZoneId.of("Europe/Warsaw")
    private val noneIgnored: (String) -> Boolean = { false }

    private fun ev(sec: Long, type: Int, pkg: String = "") = UsageEvent(sec * 1000, type, pkg)
    private fun at(y: Int, mo: Int, d: Int, h: Int, mi: Int = 0) =
        ZonedDateTime.of(y, mo, d, h, mi, 0, 0, waw).toInstant().toEpochMilli()

    @Test
    fun switchingAppsEndsOneSessionAndStartsTheNext() {
        val s = buildSessions(
            listOf(
                ev(0, EventType.RESUMED, "yt"),
                ev(60, EventType.PAUSED, "yt"),
                ev(60, EventType.RESUMED, "ig"),
                ev(100, EventType.PAUSED, "ig"),
                ev(101, EventType.SCREEN_NON_INTERACTIVE),
            ),
            now = 200_000, ignored = noneIgnored,
        )
        assertEquals(listOf(PhoneSession("yt", 0, 60_000), PhoneSession("ig", 60_000, 100_000)), s)
    }

    @Test
    fun activitiesInsideOneAppStayOneSession() {
        val s = buildSessions(
            listOf(
                ev(0, EventType.RESUMED, "yt"),
                ev(30, EventType.PAUSED, "yt"),
                ev(31, EventType.RESUMED, "yt"), // another screen of the same app
                ev(90, EventType.PAUSED, "yt"),
                ev(120, EventType.RESUMED, "yt"), // back after a real break: a new session
                ev(150, EventType.KEYGUARD_SHOWN),
            ),
            now = 300_000, ignored = noneIgnored,
        )
        assertEquals(listOf(PhoneSession("yt", 0, 90_000), PhoneSession("yt", 120_000, 150_000)), s)
    }

    @Test
    fun screenOffAndTheLauncherEndTheSession() {
        val launcher = setOf("launcher")
        val s = buildSessions(
            listOf(
                ev(0, EventType.RESUMED, "chat"),
                ev(40, EventType.SCREEN_NON_INTERACTIVE), // no pause event before the screen went off
                ev(100, EventType.KEYGUARD_HIDDEN),
                ev(101, EventType.RESUMED, "chat"),
                ev(130, EventType.RESUMED, "launcher"),
                ev(140, EventType.RESUMED, "maps"),
                ev(141, EventType.PAUSED, "maps"), // 1 s: noise
                ev(142, EventType.RESUMED, "launcher"),
            ),
            now = 400_000, ignored = { it in launcher },
        )
        assertEquals(listOf(PhoneSession("chat", 0, 40_000), PhoneSession("chat", 101_000, 130_000)), s)
    }

    @Test
    fun theAppInFrontIsAnOpenSessionUntilNow() {
        val events = listOf(ev(0, EventType.RESUMED, "yt"), ev(50, EventType.PAUSED, "yt"), ev(50, EventType.RESUMED, "ig"))
        assertEquals(
            listOf(PhoneSession("yt", 0, 50_000), PhoneSession("ig", 50_000, 80_000, open = true)),
            buildSessions(events, now = 80_000, ignored = noneIgnored),
        )
        // One second in, the open session is not sent yet.
        assertEquals(listOf(PhoneSession("yt", 0, 50_000)), buildSessions(events, now = 51_000, ignored = noneIgnored))
    }

    @Test
    fun rebuildingFromTheCursorGivesTheSameStarts() {
        val all = listOf(
            ev(0, EventType.RESUMED, "yt"),
            ev(50, EventType.PAUSED, "yt"),
            ev(50, EventType.RESUMED, "ig"),
            ev(500, EventType.PAUSED, "ig"),
            ev(500, EventType.RESUMED, "maps"),
        )
        val first = buildSessions(all.take(3), now = 100_000, ignored = noneIgnored)
        val cursor = nextCursor(first, 100_000)
        assertEquals(50_000L, cursor) // ig is still open
        val later = buildSessions(all.filter { it.time >= cursor - 1000 }, now = 600_000, ignored = noneIgnored)
        assertEquals(PhoneSession("ig", 50_000, 500_000), later.first())
    }

    @Test
    fun nothingPendingRereadsOnlyTheLastMinutes() {
        val now = 10_000_000L
        assertEquals(now - CURSOR_LAG_MS, nextCursor(emptyList(), now))
        assertEquals(now - CURSOR_LAG_MS, nextCursor(listOf(PhoneSession("a", 0, 60_000)), now))
        assertEquals(now - 60_000, nextCursor(listOf(PhoneSession("a", now - 60_000, now - 10_000)), now))
    }

    @Test
    fun theDayStartsAtFourInTheMorning() {
        assertEquals("2026-10-03", localDate(at(2026, 10, 4, 1, 30), waw))
        assertEquals("2026-10-04", localDate(at(2026, 10, 4, 4, 0), waw))
        val s = PhoneSession("yt", at(2026, 10, 4, 3, 30), at(2026, 10, 4, 4, 20), open = true)
        val parts = splitAtDayStart(s, waw)
        assertEquals(
            listOf(
                PhoneSession("yt", at(2026, 10, 4, 3, 30), at(2026, 10, 4, 4, 0)),
                PhoneSession("yt", at(2026, 10, 4, 4, 0), at(2026, 10, 4, 4, 20), open = true),
            ),
            parts,
        )
        val rows = toRows(listOf(s), waw) { "YouTube" }
        assertEquals(listOf("2026-10-03", "2026-10-04"), rows.map { it.localDate })
        assertEquals(listOf(1800, 1200), rows.map { it.seconds })
    }

    @Test
    fun rowsAreThePostgrestJson() {
        val rows = listOf(UsageRow("Gmail \"work\"", "com.google.android.gm", 1_759_557_600_000, 1_759_557_661_500, "2025-10-04"))
        val json = rowsJson(rows, "user-1", "android-abc")
        assertEquals(
            "[{\"user_id\":\"user-1\",\"device_id\":\"android-abc\",\"app\":\"Gmail \\\"work\\\"\"," +
                "\"app_key\":\"com.google.android.gm\",\"window_title\":\"Gmail \\\"work\\\"\"," +
                "\"started_at\":\"2025-10-04T06:00:00Z\",\"ended_at\":\"2025-10-04T06:01:01.500Z\"," +
                "\"seconds\":61,\"idle\":false,\"local_date\":\"2025-10-04\"}]",
            json,
        )
        assertEquals("\"a\\nb\\u0001\"", jsonString("a\nb\u0001"))
        assertTrue(rowsJson(emptyList(), "u", "d") == "[]")
    }
}

class TodayTest {
    @Test
    fun totalsCountFromTheDayStartMostUsedFirst() {
        val totals = totalsByApp(
            listOf(
                PhoneSession("yt", 0, 600_000),
                PhoneSession("ig", 600_000, 660_000),
                PhoneSession("yt", 700_000, 760_000, open = true),
                PhoneSession("old", -100_000, -50_000),
            ),
            from = 0,
        )
        assertEquals(listOf("yt" to 660_000L, "ig" to 60_000L), totals)
    }

    @Test
    fun durationsReadNaturally() {
        assertEquals("<1 min", formatDuration(59_000))
        assertEquals("42 min", formatDuration(42 * 60_000L))
        assertEquals("1 h 05 min", formatDuration(65 * 60_000L))
        assertEquals("2026-10-04T02:00:00Z", java.time.Instant.ofEpochMilli(dayStart(
            java.time.ZonedDateTime.of(2026, 10, 4, 9, 0, 0, 0, java.time.ZoneId.of("Europe/Warsaw")).toInstant().toEpochMilli(),
            java.time.ZoneId.of("Europe/Warsaw"),
        )).toString())
    }
}

package app.mindsetforest.phone

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class CaptureTest {
    @Test
    fun aSelectionBecomesTheSameNoteAsOnTheComputer() {
        // Same rules as tracker/mindsetforest_tracker/archive_capture.py build_block.
        assertEquals(
            "First line of a long quote second line" to "First line of a long quote\nsecond line\n\nSource: Chrome",
            buildCapture("  First line of a long quote\r\nsecond line  ", "Chrome"),
        )
        assertEquals(60, buildCapture("x".repeat(500), "")!!.first.length)
        assertEquals("x", buildCapture("x", "")!!.second)
        assertNull(buildCapture("   \n ", "Chrome"))
    }

    @Test
    fun aSharedLinkIsTitledByItsPage() {
        assertEquals(
            "Deep Work summary" to "Deep Work summary\nhttps://example.com/deep\n\nSource: Chrome",
            buildCapture("https://example.com/deep", "Chrome", "Deep Work summary"),
        )
        // Shared text with a subject keeps the subject as part of the source.
        assertEquals(
            "a quote" to "a quote\n\nSource: Some article · Chrome",
            buildCapture("a quote", "Chrome", "Some article"),
        )
    }

    @Test
    fun theRowAndTheQueueSurviveTheRoundTrip() {
        val c = PendingCapture("Zażółć \"gęślą\"\njaźń", "Notes", "", 42)
        assertEquals(
            "{\"user_id\":\"u\",\"title\":\"Zażółć \\\"gęślą\\\" jaźń\",\"content\":\"Zażółć \\\"gęślą\\\"\\njaźń\\n\\nSource: Notes\"," +
                "\"tags\":[\"quick-capture\"],\"pillars\":[]}",
            captureJson(c, "u"),
        )
        val queue = listOf(c, PendingCapture("https://x.y", "", "Title", 7))
        assertEquals(queue, decodeQueue(encodeQueue(queue)))
        assertEquals(emptyList<PendingCapture>(), decodeQueue("not json"))
        assertEquals(emptyList<PendingCapture>(), decodeQueue(null))
    }
}

class ReminderPlanTest {
    private val now = 1_000_000_000L
    private fun r(id: String, at: Long) = Reminder(id, "m$id", at, 0)

    @Test
    fun dueNowShowsLaterGetsAnAlarmShownOnesAreLeftAlone() {
        val plan = planReminders(
            listOf(r("late", now - 5_000), r("now", now), r("soon", now + 60_000), r("far", now + 2 * REMINDER_HORIZON_MS), r("seen", now - 1)),
            now,
            setOf("seen"),
        )
        assertEquals(listOf("late", "now"), plan.now.map { it.id })
        assertEquals(listOf("soon"), plan.later.map { it.id })
    }
}

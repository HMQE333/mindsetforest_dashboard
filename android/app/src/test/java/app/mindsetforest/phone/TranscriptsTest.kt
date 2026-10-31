package app.mindsetforest.phone

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException

class TranscriptsTest {
    private val t0 = 1_791_000_000_000L
    private fun p(id: String, at: Long = t0) = PendingTranscript(id, "https://www.instagram.com/reel/$id/", at)

    @Test
    fun onlyTheServersHeadingsCountAsFilled() {
        assertTrue(transcriptFilled("Reel\n\n**Transcript**\nhello"))
        assertTrue(transcriptFilled("**Key points**\n- one"))
        assertFalse(transcriptFilled("https://www.instagram.com/reel/abc/\n\nSource: Instagram"))
        assertFalse(transcriptFilled("Transcript: soon"))
    }

    @Test
    fun theFirstLookWaitsThenBacksOff() {
        assertNull(transcriptCheckDelay(emptyList(), t0))
        assertEquals(45_000L, transcriptCheckDelay(listOf(p("a")), t0))
        assertEquals(35_000L, transcriptCheckDelay(listOf(p("a")), t0 + 10_000))
        assertEquals(25_000L, transcriptCheckDelay(listOf(p("a")), t0 + 50_000))
        assertEquals(90_000L, transcriptCheckDelay(listOf(p("a")), t0 + 240_000))
        // The oldest note sets the pace.
        assertEquals(30_000L, transcriptCheckDelay(listOf(p("new", t0 + 50_000), p("old")), t0 + 60_000))
    }

    @Test
    fun filledNotesAreAnnouncedGoneOnesAndOldOnesDropped() {
        val notes = mapOf(
            "done" to ArchiveNote("done", "How to focus", "link\n\n**Transcript**\n..."),
            "wait" to ArchiveNote("wait", "link", "https://www.instagram.com/reel/wait/"),
        )
        val asked = mutableListOf<String>()
        val r = checkTranscripts(
            listOf(p("done"), p("wait"), p("gone"), p("old", t0 - TRANSCRIPT_GIVE_UP_MS)),
            t0 + 60_000,
        ) { asked += it; notes[it] }
        assertEquals(listOf("done"), r.ready.map { it.id })
        assertEquals(listOf("wait"), r.remaining.map { it.id })
        assertEquals(listOf("done", "wait", "gone"), asked)
    }

    @Test
    fun offlineKeepsTheRestUntilTheLimit() {
        val now = t0 + 4 * 60_000L
        val r = checkTranscripts(listOf(p("a"), p("b", t0 - 90_000), p("c")), now) { throw IOException("offline") }
        assertEquals(listOf("a", "c"), r.remaining.map { it.id })
        assertTrue(r.ready.isEmpty())
        val refused = checkTranscripts(listOf(p("a")), now) { throw HttpError(503, "") }
        assertEquals(listOf("a"), refused.remaining.map { it.id })
    }

    @Test
    fun theWaitingListSurvivesPreferences() {
        val items = listOf(p("a"), PendingTranscript("b", "https://x.com/u/status/1?q=\"x\"", 5))
        assertEquals(items, decodeTranscripts(encodeTranscripts(items)))
        assertEquals(emptyList<PendingTranscript>(), decodeTranscripts("not json"))
        assertEquals(listOf(PendingTranscript("z", "", 0)), decodeTranscripts("""[{"l":"x"},{"i":"z"}]"""))
    }
}

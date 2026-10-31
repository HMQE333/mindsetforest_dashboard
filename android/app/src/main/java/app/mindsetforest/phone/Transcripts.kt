package app.mindsetforest.phone

import org.json.JSONArray

/**
 * A saved reel's note waits for its transcript: social-transcript fills the
 * same archive_blocks row in the background (~20-90 s). The phone remembers
 * which notes it asked for and looks again a little later (TranscriptJob),
 * so it can say "Transkrypt gotowy" without keeping anything running.
 */

/** A note waiting for its transcript: the block id, the reel's link, and when it was asked for (epoch ms). */
data class PendingTranscript(val id: String, val link: String, val at: Long)

/** The parts of a note a check reads. */
data class ArchiveNote(val id: String, val title: String, val content: String)

/** The first look comes after this long; the server rarely finishes sooner. */
const val TRANSCRIPT_FIRST_CHECK_MS = 45_000L
/** A note still unfilled after this long is given up on, quietly. */
const val TRANSCRIPT_GIVE_UP_MS = 5 * 60_000L

/** The server's filled note carries one of these headings; the link alone never does. */
fun transcriptFilled(content: String): Boolean =
    content.contains("**Transcript**") || content.contains("**Key points**")

/**
 * How long until the next look, from the oldest waiting note's age: the first
 * at 45 s, then backing off (half its age, 20-90 s); null when nothing waits.
 */
fun transcriptCheckDelay(pending: List<PendingTranscript>, now: Long): Long? {
    val oldest = pending.minOfOrNull { it.at } ?: return null
    val age = (now - oldest).coerceAtLeast(0)
    if (age < TRANSCRIPT_FIRST_CHECK_MS) return TRANSCRIPT_FIRST_CHECK_MS - age
    return (age / 2).coerceIn(20_000L, 90_000L)
}

/** Notes to announce (filled), and the ones still worth waiting for. */
data class TranscriptCheck(val ready: List<ArchiveNote>, val remaining: List<PendingTranscript>)

/**
 * Looks at each waiting note once. `fetch` returns the note, or null when it
 * is gone (deleted: dropped). A note past the time limit is dropped unread;
 * offline or a refused request stops the run and keeps the rest (unless too old).
 */
fun checkTranscripts(pending: List<PendingTranscript>, now: Long, fetch: (String) -> ArchiveNote?): TranscriptCheck {
    val ready = ArrayList<ArchiveNote>()
    val remaining = ArrayList<PendingTranscript>()
    for ((i, p) in pending.withIndex()) {
        if (now - p.at >= TRANSCRIPT_GIVE_UP_MS) continue
        val note = try {
            fetch(p.id)
        } catch (e: Exception) {
            if (e !is java.io.IOException && e !is HttpError) throw e
            remaining += pending.drop(i).filter { now - it.at < TRANSCRIPT_GIVE_UP_MS }
            break
        }
        when {
            note == null -> {}
            transcriptFilled(note.content) -> ready += note
            else -> remaining += p
        }
    }
    return TranscriptCheck(ready, remaining)
}

/** The waiting list as a string for preferences, and back (a broken entry is dropped, never the list). */
fun encodeTranscripts(items: List<PendingTranscript>): String =
    items.joinToString(",", "[", "]") { "{\"i\":${jsonString(it.id)},\"l\":${jsonString(it.link)},\"a\":${it.at}}" }

fun decodeTranscripts(stored: String?): List<PendingTranscript> {
    if (stored.isNullOrBlank()) return emptyList()
    val arr = try { JSONArray(stored) } catch (_: Exception) { return emptyList() }
    return (0 until arr.length()).mapNotNull { i ->
        val o = arr.optJSONObject(i) ?: return@mapNotNull null
        val id = o.optString("i")
        if (id.isEmpty()) null else PendingTranscript(id, o.optString("l"), o.optLong("a"))
    }
}

package app.mindsetforest.phone

import org.json.JSONArray

/**
 * Saving text to the Archive from any app: select text -> "Zapisz w Archive"
 * in the selection menu, or Share -> MindsetForest. The note is the same
 * archive_blocks row the Windows tracker's hotkey writes (tracker/
 * mindsetforest_tracker/archive_capture.py): tagged quick-capture, with where
 * it came from as its source. Offline, captures wait in a queue and go out
 * with the next sync.
 */

const val CAPTURE_TAG = "quick-capture"
private const val TITLE_CHARS = 60
private const val MAX_CHARS = 200_000

/** Text waiting to be saved: what was captured, the app it came from, a shared page's title, and when (epoch ms). */
data class PendingCapture(val text: String, val source: String, val subject: String = "", val at: Long = 0)

/** The note's title and content, or null when there is nothing to save. */
fun buildCapture(text: String, source: String, subject: String = ""): Pair<String, String>? {
    val body = text.replace("\r\n", "\n").replace('\r', '\n').trim().take(MAX_CHARS)
    if (body.isEmpty()) return null
    // A shared link with the page's title: the title says more than the address.
    val isLink = Regex("""^https?://\S+$""").matches(body)
    val title = (if (isLink && subject.isNotBlank()) subject else body)
        .take(TITLE_CHARS).replace(Regex("""\s+"""), " ").trim()
    val from = listOf(subject.takeIf { it.isNotBlank() && !isLink }, source.takeIf { it.isNotBlank() })
        .filterNotNull().joinToString(" · ")
    val content = if (isLink && subject.isNotBlank()) "${subject.trim()}\n$body" else body
    return title to (if (from.isNotEmpty()) "$content\n\nSource: $from" else content)
}

/** The archive_blocks row as JSON, or null when there is nothing to save. */
fun captureJson(c: PendingCapture, userId: String): String? {
    val (title, content) = buildCapture(c.text, c.source, c.subject) ?: return null
    return "{\"user_id\":${jsonString(userId)},\"title\":${jsonString(title)},\"content\":${jsonString(content)}," +
        "\"tags\":[${jsonString(CAPTURE_TAG)}],\"pillars\":[]}"
}

/** The queue as a string for preferences, and back (a broken entry is dropped, never the queue). */
fun encodeQueue(items: List<PendingCapture>): String =
    items.joinToString(",", "[", "]") {
        "{\"t\":${jsonString(it.text)},\"s\":${jsonString(it.source)},\"j\":${jsonString(it.subject)},\"a\":${it.at}}"
    }

fun decodeQueue(stored: String?): List<PendingCapture> {
    if (stored.isNullOrBlank()) return emptyList()
    val arr = try { JSONArray(stored) } catch (_: Exception) { return emptyList() }
    return (0 until arr.length()).mapNotNull { i ->
        val o = arr.optJSONObject(i) ?: return@mapNotNull null
        val text = o.optString("t")
        if (text.isEmpty()) null else PendingCapture(text, o.optString("s"), o.optString("j"), o.optLong("a"))
    }
}

/** A reminder from public.reminders. Times are epoch ms. */
data class Reminder(val id: String, val message: String, val deliverAt: Long, val createdAt: Long)

/** Show these now, set alarms for those; reminders already shown on this phone are left alone. */
data class ReminderPlan(val now: List<Reminder>, val later: List<Reminder>)

/** Reminders due within this long get an alarm; the rest wait for a later sync. */
const val REMINDER_HORIZON_MS = 24 * 60 * 60_000L

/** A reminder older than this when the phone first sees it is shown anyway, just once. */
fun planReminders(reminders: List<Reminder>, now: Long, shown: Set<String>): ReminderPlan {
    val fresh = reminders.filter { it.id !in shown }
    return ReminderPlan(
        now = fresh.filter { it.deliverAt <= now }.sortedBy { it.deliverAt },
        later = fresh.filter { it.deliverAt in (now + 1)..(now + REMINDER_HORIZON_MS) }.sortedBy { it.deliverAt },
    )
}

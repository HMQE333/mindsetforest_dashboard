package app.mindsetforest.phone

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri

/**
 * A one-off job that looks whether saved reels got their transcript
 * (Transcripts.kt), notifies "Transkrypt gotowy" for each that did, and
 * schedules itself again while any note is still waiting (up to ~5 minutes).
 */
class TranscriptJob : JobService() {
    @Volatile private var worker: Thread? = null

    override fun onStartJob(params: JobParameters): Boolean {
        worker = Thread {
            try {
                run(applicationContext)
            } finally {
                jobFinished(params, false)
                // Only now is this job gone, so the next look can be scheduled under the same id.
                schedule(applicationContext, Store(applicationContext))
            }
        }.apply { start() }
        return true
    }

    override fun onStopJob(params: JobParameters): Boolean = false

    companion object {
        private const val JOB_ID = 2
        private const val CHANNEL = "archive"
        private const val SITE = "https://www.hmqe.org/"
        private val lock = Any()

        /** Remembers a note the server is transcribing and makes sure a look is scheduled. */
        fun add(context: Context, store: Store, id: String, link: String) {
            synchronized(lock) {
                store.pendingTranscripts = store.pendingTranscripts.filter { it.id != id } +
                    PendingTranscript(id, link, System.currentTimeMillis())
            }
            schedule(context, store)
        }

        private fun schedule(context: Context, store: Store) {
            val delay = transcriptCheckDelay(store.pendingTranscripts, System.currentTimeMillis()) ?: return
            val scheduler = context.getSystemService(JobScheduler::class.java)
            // A look already scheduled serves the newer note too: it reschedules while any wait.
            if (scheduler.getPendingJob(JOB_ID) != null) return
            val job = JobInfo.Builder(JOB_ID, ComponentName(context, TranscriptJob::class.java))
                .setMinimumLatency(delay)
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .build()
            scheduler.schedule(job)
        }

        private fun run(context: Context) {
            val store = Store(context)
            if (!store.configured || !store.signedIn) {
                synchronized(lock) { store.pendingTranscripts = emptyList() }
                return
            }
            val api = SupabaseApi(store.supabaseUrl, store.anonKey)
            val core = SyncCore(api, store)
            val pending = store.pendingTranscripts
            val result = checkTranscripts(pending, System.currentTimeMillis()) { id ->
                try {
                    api.archiveNote(id, core.accessToken())
                } catch (e: HttpError) {
                    if (e.code != 401) throw e
                    api.archiveNote(id, core.accessToken(force = true))
                }
            }
            synchronized(lock) {
                // Notes added while this run was looking stay; the ones it settled go.
                val looked = pending.map { it.id }.toSet()
                store.pendingTranscripts = result.remaining + store.pendingTranscripts.filter { it.id !in looked }
            }
            for (note in result.ready) notify(context, store, note)
        }

        private fun notify(context: Context, store: Store, note: ArchiveNote) {
            if (!Reminders.canNotify(context)) return
            val nm = context.getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL, context.getString(R.string.archive_channel), NotificationManager.IMPORTANCE_DEFAULT),
            )
            val site = store.siteUrl.takeIf { it.startsWith("https://") } ?: SITE
            val tap = PendingIntent.getActivity(
                context, note.id.hashCode(), // ?open=archive: the dashboard opens on the Archive Library, where the note is on top.
                Intent(Intent.ACTION_VIEW, Uri.parse(site).buildUpon().appendQueryParameter("open", "archive").build()),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
            val text = note.title.ifBlank { context.getString(R.string.capture_title) }
            val n = Notification.Builder(context, CHANNEL)
                .setSmallIcon(R.drawable.ic_notify)
                .setContentTitle(context.getString(R.string.transcript_ready))
                .setContentText(text)
                .setContentIntent(tap)
                .setAutoCancel(true)
                .build()
            nm.notify(note.id.hashCode(), n)
        }
    }
}

package app.mindsetforest.phone

import android.app.Activity
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
import android.provider.Settings
import android.widget.Toast
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/**
 * Looks for a newer APK about every 12 hours (Updates.kt), downloads and
 * verifies it in the background, then notifies "Aktualizacja gotowa".
 * Independent of sign-in, so even a signed-out phone keeps up to date.
 */
class UpdateJob : JobService() {
    @Volatile private var worker: Thread? = null

    override fun onStartJob(params: JobParameters): Boolean {
        worker = Thread {
            val ok = try { check(applicationContext, force = false) != CheckResult.Failed } catch (e: Exception) { false }
            jobFinished(params, !ok)
        }.apply { start() }
        return true
    }

    override fun onStopJob(params: JobParameters): Boolean = true

    enum class CheckResult { UpToDate, Ready, Failed, Skipped }

    companion object {
        private const val JOB_ID = 3
        private const val CHANNEL = "updates"
        private const val NOTIFICATION_ID = 0x5550
        const val EXTRA_INSTALL = "install_update"
        private val lock = Any()

        fun schedule(context: Context) {
            val scheduler = context.getSystemService(JobScheduler::class.java)
            if (scheduler.getPendingJob(JOB_ID) != null) return
            val job = JobInfo.Builder(JOB_ID, ComponentName(context, UpdateJob::class.java))
                .setPeriodic(UPDATE_CHECK_EVERY_MS)
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPersisted(true)
                .build()
            scheduler.schedule(job)
        }

        fun dir(context: Context): File = File(context.filesDir, "updates")

        fun apkFile(context: Context, versionCode: Int): File = File(dir(context), "mindsetforest-$versionCode.apk")

        /** The verified update waiting to be installed, if any. */
        fun pending(context: Context): ReadyUpdate? =
            pendingInstall(Store(context).readyUpdate, BuildConfig.VERSION_CODE)?.takeIf { apkFile(context, it.versionCode).isFile }

        /** Runs on a background thread. [force] skips the 12-hour spacing (the screen's button). */
        fun check(context: Context, force: Boolean): CheckResult = synchronized(lock) {
            val store = Store(context)
            val now = System.currentTimeMillis()
            cleanUp(context, store)
            if (!force && !updateCheckDue(store.updateCheckedAt, now)) return CheckResult.Skipped
            val site = updateSite(store.siteUrl)
            val info = try {
                val manifestUrl = resolveUpdateUrl(site, UPDATE_MANIFEST_PATH) ?: return CheckResult.Failed
                parseUpdateInfo(get(manifestUrl).toString(Charsets.UTF_8)) ?: return CheckResult.Failed
            } catch (e: IOException) {
                return CheckResult.Failed
            }
            store.updateCheckedAt = now
            if (!isNewer(info, BuildConfig.VERSION_CODE)) return CheckResult.UpToDate

            val file = apkFile(context, info.versionCode)
            val reuse = canReuseDownload(info, store.readyUpdate) {
                if (file.isFile) file.inputStream().use(::sha256Hex) else null
            }
            if (!reuse) {
                store.readyUpdate = null
                val apkUrl = resolveUpdateUrl(site, info.url) ?: return CheckResult.Failed
                dir(context).mkdirs()
                val part = File(dir(context), "download.part")
                try {
                    download(apkUrl, part)
                } catch (e: IOException) {
                    part.delete()
                    return CheckResult.Failed
                }
                val hash = part.inputStream().use(::sha256Hex)
                if (!hash.equals(info.sha256, ignoreCase = true) || !part.renameTo(file)) {
                    part.delete() // Tampered or truncated: never offered.
                    return CheckResult.Failed
                }
                store.readyUpdate = ReadyUpdate(info.versionCode, info.versionName, info.sha256)
                cleanUp(context, store)
            }
            notifyReady(context, store.readyUpdate ?: return CheckResult.Failed)
            CheckResult.Ready
        }

        /** Drops APKs that are not the waiting update (installed, superseded, or half-downloaded). */
        private fun cleanUp(context: Context, store: Store) {
            val keep = pendingInstall(store.readyUpdate, BuildConfig.VERSION_CODE)
            if (keep == null && store.readyUpdate != null) store.readyUpdate = null
            dir(context).listFiles()?.forEach { f ->
                if (f.name == "download.part") return@forEach
                if (keep == null || f.name != apkFile(context, keep.versionCode).name) f.delete()
            }
        }

        private fun notifyReady(context: Context, ready: ReadyUpdate) {
            if (!Reminders.canNotify(context)) return
            val nm = context.getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL, context.getString(R.string.updates_channel), NotificationManager.IMPORTANCE_DEFAULT),
            )
            // Through the app's screen, which decides between the installer and the "unknown apps" setting at tap time.
            val tap = PendingIntent.getActivity(
                context, NOTIFICATION_ID,
                Intent(context, MainActivity::class.java).putExtra(EXTRA_INSTALL, true).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
            val n = Notification.Builder(context, CHANNEL)
                .setSmallIcon(R.drawable.ic_notify)
                .setContentTitle(context.getString(R.string.update_ready, ready.versionName))
                .setContentText(context.getString(R.string.update_tap))
                .setContentIntent(tap)
                .setAutoCancel(true)
                .build()
            nm.notify(NOTIFICATION_ID, n)
        }

        /**
         * Opens the system installer for the waiting APK, or, while this app may
         * not install apps, its "Install unknown apps" switch with a short note.
         */
        fun install(activity: Activity) {
            val ready = pending(activity) ?: return
            if (!activity.packageManager.canRequestPackageInstalls()) {
                Toast.makeText(activity, R.string.update_allow, Toast.LENGTH_LONG).show()
                activity.startActivity(
                    Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${activity.packageName}")),
                )
                return
            }
            activity.getSystemService(NotificationManager::class.java).cancel(NOTIFICATION_ID)
            val uri = ApkProvider.uriFor(activity, apkFile(activity, ready.versionCode))
            activity.startActivity(
                Intent(Intent.ACTION_VIEW).setDataAndType(uri, ApkProvider.APK_TYPE)
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK),
            )
        }

        private fun open(url: String): HttpURLConnection {
            val c = URL(url).openConnection() as HttpURLConnection
            c.connectTimeout = 15_000
            c.readTimeout = 60_000
            c.setRequestProperty("Cache-Control", "no-cache")
            if (c.responseCode !in 200..299) {
                c.disconnect()
                throw IOException("HTTP ${c.responseCode}")
            }
            return c
        }

        private fun get(url: String): ByteArray {
            val c = open(url)
            try { return c.inputStream.use { it.readBytes() } } finally { c.disconnect() }
        }

        private fun download(url: String, to: File) {
            val c = open(url)
            try { c.inputStream.use { input -> to.outputStream().use { input.copyTo(it) } } } finally { c.disconnect() }
        }
    }
}

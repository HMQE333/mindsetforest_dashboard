package app.mindsetforest.phone

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Process
import java.io.IOException
import java.time.ZoneId

/** The Android side of a sync: usage access, events, app names. The rest is SyncCore. */
object Sync {
    private val lock = Any()
    private const val SETTINGS = "com.android.settings"

    fun hasUsageAccess(context: Context): Boolean {
        val ops = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        val mode = if (Build.VERSION.SDK_INT >= 29) {
            ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
        } else {
            @Suppress("DEPRECATION")
            ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
        }
        return mode == AppOpsManager.MODE_ALLOWED
    }

    /** Reads new events, uploads the sessions, moves the cursor. One at a time. */
    fun run(context: Context): SyncResult = synchronized(lock) {
        val store = Store(context)
        val result = try {
            runLocked(context, store)
        } catch (e: HttpError) {
            failure(e)
        } catch (e: IOException) {
            failure(e)
        }
        when (result) {
            is SyncResult.Done -> {
                store.lastSyncAt = System.currentTimeMillis()
                store.lastSyncRows = result.rows
                store.lastError = ""
            }
            is SyncResult.Retry -> store.lastError = result.message
            is SyncResult.Blocked -> store.lastError = result.message
        }
        result
    }

    private fun runLocked(context: Context, store: Store): SyncResult {
        if (!store.configured) return SyncResult.Blocked("Brak połączenia z bazą")
        if (!store.signedIn) return SyncResult.Blocked("Zaloguj się")
        if (!hasUsageAccess(context)) return SyncResult.Blocked("Brak dostępu do statystyk użycia")

        val core = SyncCore(SupabaseApi(store.supabaseUrl, store.anonKey), store)
        val now = System.currentTimeMillis()
        val events = readEvents(context, core.since(now) - 1000, now)
        val ignored = ignoredPackages(context)
        val labels = HashMap<String, String>()
        val rows = core.upload(events, now, { it in ignored }, ZoneId.systemDefault()) { pkg ->
            labels.getOrPut(pkg) { label(context, pkg) }
        }
        return SyncResult.Done(rows)
    }

    /** Today's time per app (since 04:00), most used first. Read on the phone, nothing is sent. */
    fun today(context: Context, now: Long = System.currentTimeMillis()): List<Pair<String, Long>> {
        val from = dayStart(now, ZoneId.systemDefault())
        val ignored = ignoredPackages(context)
        val sessions = buildSessions(readEvents(context, from, now), now) { it in ignored }
        return totalsByApp(sessions, from).map { (pkg, ms) -> label(context, pkg) to ms }
    }

    private fun readEvents(context: Context, begin: Long, end: Long): List<UsageEvent> {
        val usm = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val events = usm.queryEvents(begin, end) ?: return emptyList()
        val out = ArrayList<UsageEvent>()
        val e = UsageEvents.Event()
        while (events.hasNextEvent()) {
            events.getNextEvent(e)
            out += UsageEvent(e.timeStamp, e.eventType, e.packageName.orEmpty())
        }
        return out
    }

    /**
     * The home screen and the system UI end a session but are not time in an
     * app. Only the launcher in use counts as the home screen: Settings answers
     * HOME too (FallbackHome, shown while the phone boots), and taking every
     * HOME app hid all time spent in Settings.
     */
    private fun ignoredPackages(context: Context): Set<String> {
        val pm = context.packageManager
        val home = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
        val current = pm.resolveActivity(home, PackageManager.MATCH_DEFAULT_ONLY)?.activityInfo?.packageName
        val launchers =
            if (current != null && current != "android") setOf(current)
            else pm.queryIntentActivities(home, 0).map { it.activityInfo.packageName }.toSet() - SETTINGS
        return launchers + setOf("com.android.systemui", "android")
    }

    private fun label(context: Context, pkg: String): String = try {
        val pm = context.packageManager
        pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString().ifBlank { pkg }
    } catch (_: PackageManager.NameNotFoundException) {
        pkg
    }
}

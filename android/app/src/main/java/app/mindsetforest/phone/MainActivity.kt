package app.mindsetforest.phone

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.text.format.DateUtils
import android.view.View
import android.view.WindowInsets
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import java.io.IOException
import java.util.concurrent.Executors

/**
 * The one screen: three setup steps (connection, usage access, account) and
 * the sync status. Opened by the dashboard's "Połącz telefon" link
 * (mindsetforest://setup?url=…&key=…), which fills in the connection.
 */
class MainActivity : Activity() {
    private companion object {
        const val TODAY_SHOWN = 8
    }

    private val io = Executors.newSingleThreadExecutor()
    private lateinit var store: Store
    private var busy = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        store = Store(this)
        padForSystemBars(findViewById(R.id.root))

        find<Button>(R.id.connectManual).setOnClickListener {
            find<View>(R.id.connectForm).visibility = View.VISIBLE
            find<EditText>(R.id.url).setText(store.supabaseUrl)
            find<EditText>(R.id.key).setText(store.anonKey)
            it.visibility = View.GONE
        }
        find<Button>(R.id.saveConnection).setOnClickListener {
            if (saveConnection(find<EditText>(R.id.url).text.toString(), find<EditText>(R.id.key).text.toString())) {
                find<View>(R.id.connectForm).visibility = View.GONE
            }
            render()
        }
        find<Button>(R.id.grantAccess).setOnClickListener {
            startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS))
        }
        find<Button>(R.id.signIn).setOnClickListener { signIn() }
        find<Button>(R.id.signOut).setOnClickListener {
            store.signOut()
            SyncJob.cancel(this)
            render()
        }
        find<Button>(R.id.syncNow).setOnClickListener { syncNow() }

        handleSetupLink(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleSetupLink(intent)
    }

    override fun onResume() {
        super.onResume()
        // Back from the usage-access screen, or just opened: sync if everything is in place.
        if (store.configured && store.signedIn && Sync.hasUsageAccess(this)) {
            SyncJob.schedule(this)
            syncNow()
        }
        render()
        showToday()
    }

    override fun onDestroy() {
        io.shutdown()
        super.onDestroy()
    }

    private fun handleSetupLink(intent: Intent?) {
        val uri: Uri = intent?.data ?: return
        if (uri.scheme != "mindsetforest" || uri.host != "setup") return
        saveConnection(uri.getQueryParameter("url").orEmpty(), uri.getQueryParameter("key").orEmpty())
        render()
    }

    private fun saveConnection(url: String, key: String): Boolean {
        val u = url.trim().trimEnd('/')
        if (!u.startsWith("https://") || key.isBlank()) {
            find<TextView>(R.id.connectText).text = getString(R.string.connect_invalid)
            return false
        }
        if (u != store.supabaseUrl) {
            // Another database: the old login and cursor belong to the old one.
            store.signOut()
            store.cursor = 0
        }
        store.supabaseUrl = u
        store.anonKey = key
        return true
    }

    private fun signIn() {
        val email = find<EditText>(R.id.email).text.toString().trim()
        val password = find<EditText>(R.id.password).text.toString()
        if (email.isEmpty() || password.isEmpty() || busy) return
        busy = true
        val button = find<Button>(R.id.signIn)
        button.isEnabled = false
        button.text = getString(R.string.signing_in)
        val api = SupabaseApi(store.supabaseUrl, store.anonKey)
        io.execute {
            val error = try {
                store.saveTokens(api.signIn(email, password))
                null
            } catch (e: HttpError) {
                SupabaseApi.message(e)
            } catch (e: IOException) {
                "Brak połączenia z internetem"
            }
            runOnUiThread {
                busy = false
                button.isEnabled = true
                button.text = getString(R.string.sign_in)
                if (error == null) {
                    find<EditText>(R.id.password).setText("")
                    SyncJob.schedule(this)
                    syncNow()
                } else {
                    store.lastError = error
                }
                render()
            }
        }
    }

    private fun syncNow() {
        if (busy) return
        busy = true
        val button = find<Button>(R.id.syncNow)
        button.isEnabled = false
        button.text = getString(R.string.syncing)
        io.execute {
            val result = Sync.run(applicationContext)
            runOnUiThread {
                busy = false
                button.text = getString(R.string.sync_now)
                if (result is SyncResult.Done) {
                    find<TextView>(R.id.statusText).text = getString(R.string.sync_done, result.rows)
                }
                render(keepStatus = result is SyncResult.Done)
            }
        }
    }

    private fun render(keepStatus: Boolean = false) {
        val connected = store.configured
        val access = Sync.hasUsageAccess(this)
        val signedIn = store.signedIn

        find<TextView>(R.id.connectTitle).text = mark(connected, getString(R.string.step_connect))
        find<TextView>(R.id.connectText).text =
            if (connected) getString(R.string.connect_ok, Uri.parse(store.supabaseUrl).host ?: store.supabaseUrl)
            else getString(R.string.connect_missing)

        find<TextView>(R.id.accessTitle).text = mark(access, getString(R.string.step_access))
        find<TextView>(R.id.accessText).text = getString(if (access) R.string.access_ok else R.string.access_missing)
        find<View>(R.id.grantAccess).visibility = if (access) View.GONE else View.VISIBLE

        find<TextView>(R.id.accountTitle).text = mark(signedIn, getString(R.string.step_account))
        find<TextView>(R.id.accountText).text =
            if (signedIn) getString(R.string.signed_in_as, store.email.ifEmpty { "…" }) else getString(R.string.account_hint)
        find<View>(R.id.signInForm).visibility = if (signedIn) View.GONE else View.VISIBLE
        find<View>(R.id.signOut).visibility = if (signedIn) View.VISIBLE else View.GONE
        find<View>(R.id.signIn).isEnabled = connected && !busy

        if (!keepStatus) {
            find<TextView>(R.id.statusText).text =
                if (store.lastSyncAt == 0L) getString(R.string.status_never)
                else getString(
                    R.string.status_last,
                    DateUtils.getRelativeTimeSpanString(store.lastSyncAt, System.currentTimeMillis(), DateUtils.MINUTE_IN_MILLIS),
                    store.lastSyncRows,
                )
        }
        val error = find<TextView>(R.id.errorText)
        error.text = store.lastError
        error.visibility = if (store.lastError.isEmpty()) View.GONE else View.VISIBLE
        find<View>(R.id.syncNow).isEnabled = connected && access && signedIn && !busy
    }

    /** The top apps today, so it is plain what gets recorded. */
    private fun showToday() {
        if (!Sync.hasUsageAccess(this)) {
            find<View>(R.id.todayCard).visibility = View.GONE
            return
        }
        io.execute {
            val totals = try { Sync.today(applicationContext) } catch (e: Exception) { emptyList() }
            runOnUiThread {
                find<View>(R.id.todayCard).visibility = View.VISIBLE
                find<TextView>(R.id.todayText).text =
                    if (totals.isEmpty()) getString(R.string.today_empty)
                    else totals.take(TODAY_SHOWN).joinToString("\n") { (app, ms) -> "$app · ${formatDuration(ms)}" }
                val total = find<TextView>(R.id.todayTotal)
                total.text = getString(R.string.today_total, formatDuration(totals.sumOf { it.second }))
                total.visibility = if (totals.isEmpty()) View.GONE else View.VISIBLE
            }
        }
    }

    private fun mark(done: Boolean, title: String) = if (done) "✓ $title" else title

    private fun <T : View> find(id: Int): T = findViewById(id)

    /** Android 15 draws apps edge to edge: keep the content clear of the status and navigation bars. */
    private fun padForSystemBars(view: View) {
        val base = view.paddingTop
        view.setOnApplyWindowInsetsListener { v, insets ->
            if (Build.VERSION.SDK_INT >= 30) {
                val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.ime())
                v.setPadding(bars.left, base + bars.top, bars.right, bars.bottom)
            } else {
                @Suppress("DEPRECATION")
                v.setPadding(insets.systemWindowInsetLeft, base + insets.systemWindowInsetTop, insets.systemWindowInsetRight, insets.systemWindowInsetBottom)
            }
            insets
        }
    }
}

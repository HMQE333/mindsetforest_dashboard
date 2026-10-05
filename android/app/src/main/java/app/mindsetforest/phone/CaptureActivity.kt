package app.mindsetforest.phone

import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.widget.Button
import android.widget.TextView
import java.util.concurrent.Executors

/**
 * "Zapisz w Archive" in any app's text-selection menu, and MindsetForest in
 * the Share sheet. A small card says what happened and closes itself; the app
 * underneath stays where it was. No overlay permission: Android hands the
 * selected or shared text over itself.
 */
class CaptureActivity : Activity() {
    private val io = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_capture)
        findViewById<View>(R.id.captureRoot).setOnClickListener { finish() }

        val text = when (intent?.action) {
            Intent.ACTION_PROCESS_TEXT -> intent.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT)?.toString()
            Intent.ACTION_SEND -> intent.getStringExtra(Intent.EXTRA_TEXT)
            else -> null
        }.orEmpty()
        if (text.isBlank()) { finish(); return }
        val subject = intent.getStringExtra(Intent.EXTRA_SUBJECT).orEmpty()
        val capture = PendingCapture(text, sourceApp(), subject, System.currentTimeMillis())

        val status = findViewById<TextView>(R.id.captureStatus)
        val button = findViewById<Button>(R.id.captureOpen)
        status.text = getString(R.string.capture_saving)
        io.execute {
            val outcome = Sync.capture(applicationContext, capture)
            runOnUiThread {
                when (outcome) {
                    Sync.CaptureOutcome.SAVED -> { status.text = getString(R.string.capture_saved); closeIn(1200) }
                    Sync.CaptureOutcome.QUEUED -> {
                        status.text = getString(R.string.capture_queued)
                        SyncJob.schedule(this)
                        closeIn(2800)
                    }
                    Sync.CaptureOutcome.REFUSED -> { status.text = getString(R.string.capture_refused); closeIn(2800) }
                    Sync.CaptureOutcome.SIGNED_OUT -> {
                        status.text = getString(R.string.capture_sign_in)
                        button.visibility = View.VISIBLE
                        button.setOnClickListener {
                            startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                            finish()
                        }
                    }
                }
            }
        }
    }

    override fun onDestroy() {
        main.removeCallbacksAndMessages(null)
        io.shutdown()
        super.onDestroy()
    }

    private fun closeIn(ms: Long) = main.postDelayed({ finish() }, ms)

    /** The name of the app the text came from ("Chrome"), when Android says. */
    private fun sourceApp(): String {
        val pkg = referrer?.takeIf { it.scheme == "android-app" }?.host ?: callingPackage ?: return ""
        if (pkg == packageName) return ""
        return try {
            packageManager.getApplicationLabel(packageManager.getApplicationInfo(pkg, 0)).toString()
        } catch (_: PackageManager.NameNotFoundException) {
            ""
        }
    }
}

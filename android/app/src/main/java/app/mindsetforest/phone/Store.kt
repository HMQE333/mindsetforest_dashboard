package app.mindsetforest.phone

import android.annotation.SuppressLint
import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import android.provider.Settings
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Everything the app remembers, in its private preferences. The tokens are
 * encrypted with a key that never leaves the Android Keystore, the phone's
 * counterpart of DPAPI on Windows. Backups are off (manifest), so a restore
 * onto another phone starts signed out.
 */
class Store(context: Context) : SyncState {
    private val prefs: SharedPreferences = context.getSharedPreferences("mindsetforest", Context.MODE_PRIVATE)
    private val appContext = context.applicationContext

    var supabaseUrl: String
        get() = prefs.getString("supabase_url", "") ?: ""
        set(v) = prefs.edit().putString("supabase_url", v.trimEnd('/')).apply()

    var anonKey: String
        get() = prefs.getString("anon_key", "") ?: ""
        set(v) = prefs.edit().putString("anon_key", v.trim()).apply()

    val configured: Boolean get() = supabaseUrl.startsWith("https://") && anonKey.isNotEmpty()

    var email: String
        get() = prefs.getString("email", "") ?: ""
        set(v) = prefs.edit().putString("email", v).apply()

    override var userId: String
        get() = prefs.getString("user_id", "") ?: ""
        set(v) = prefs.edit().putString("user_id", v).apply()

    val signedIn: Boolean get() = userId.isNotEmpty() && refreshToken.isNotEmpty()

    override var refreshToken: String
        get() = decrypt(prefs.getString("refresh_token", null))
        set(v) {
            // Written synchronously: Supabase rotates refresh tokens, losing the new one means signing in again.
            prefs.edit().putString("refresh_token", encrypt(v)).commit()
        }

    override var accessToken: String
        get() = decrypt(prefs.getString("access_token", null))
        set(v) = prefs.edit().putString("access_token", encrypt(v)).apply()

    /** Epoch ms the access token stops working. */
    override var accessExpiresAt: Long
        get() = prefs.getLong("access_expires_at", 0)
        set(v) = prefs.edit().putLong("access_expires_at", v).apply()

    /** Where the next sync starts reading events (epoch ms; 0 = never synced). */
    override var cursor: Long
        get() = prefs.getLong("cursor", 0)
        set(v) = prefs.edit().putLong("cursor", v).apply()

    var lastSyncAt: Long
        get() = prefs.getLong("last_sync_at", 0)
        set(v) = prefs.edit().putLong("last_sync_at", v).apply()

    var lastSyncRows: Int
        get() = prefs.getInt("last_sync_rows", 0)
        set(v) = prefs.edit().putInt("last_sync_rows", v).apply()

    var lastError: String
        get() = prefs.getString("last_error", "") ?: ""
        set(v) = prefs.edit().putString("last_error", v).apply()

    /**
     * "android:<model>:<ANDROID_ID>". ANDROID_ID stays the same across
     * reinstalls of an app signed with the same key, so those re-upload onto
     * the same rows; the model lets a reinstall under a new key find where
     * this phone left off (SyncCore.since) and the dashboard name the phone.
     */
    @get:SuppressLint("HardwareIds")
    override val deviceId: String
        get() = deviceIdFor(
            Build.MODEL.orEmpty(),
            Settings.Secure.getString(appContext.contentResolver, Settings.Secure.ANDROID_ID).orEmpty(),
        )

    override fun saveTokens(t: Tokens) {
        refreshToken = t.refresh
        accessToken = t.access
        accessExpiresAt = t.expiresAt
        userId = t.userId
        if (t.email.isNotEmpty()) email = t.email
    }

    override fun signOut() {
        prefs.edit()
            .remove("user_id").remove("email")
            .remove("refresh_token").remove("access_token").remove("access_expires_at")
            .apply()
    }

    private fun key(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getEntry(KEY_ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        gen.init(
            KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build(),
        )
        return gen.generateKey()
    }

    private fun encrypt(plain: String): String? {
        if (plain.isEmpty()) return null
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val sealed = cipher.iv + cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
        return Base64.encodeToString(sealed, Base64.NO_WRAP)
    }

    /** Empty when nothing is stored or the key no longer opens it (then the user signs in again). */
    private fun decrypt(stored: String?): String {
        if (stored.isNullOrEmpty()) return ""
        return try {
            val sealed = Base64.decode(stored, Base64.NO_WRAP)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, sealed, 0, IV_BYTES))
            String(cipher.doFinal(sealed, IV_BYTES, sealed.size - IV_BYTES), Charsets.UTF_8)
        } catch (e: Exception) {
            ""
        }
    }

    private companion object {
        const val KEY_ALIAS = "mindsetforest-tokens"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val IV_BYTES = 12
    }
}

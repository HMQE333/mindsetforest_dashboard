package app.mindsetforest.phone

import org.json.JSONObject
import java.io.InputStream
import java.net.URI
import java.security.MessageDigest

/**
 * Self-update for the sideloaded APK. The site publishes
 * /downloads/phone-version.json next to the APK; the phone reads it about
 * twice a day (UpdateJob), downloads a newer APK, checks its SHA-256 and
 * offers it to the system installer. Android always asks for one confirm tap.
 */

/** What phone-version.json says: the published build and where its APK is. */
data class UpdateInfo(val versionCode: Int, val versionName: String, val sha256: String, val url: String)

/** An APK already downloaded and verified (the file is UpdateJob.apkFile(versionCode)). */
data class ReadyUpdate(val versionCode: Int, val versionName: String, val sha256: String)

const val UPDATE_CHECK_EVERY_MS = 12 * 60 * 60_000L
const val UPDATE_MANIFEST_PATH = "/downloads/phone-version.json"
const val DEFAULT_SITE = "https://www.hmqe.org/"

private val SHA256_HEX = Regex("^[0-9a-fA-F]{64}$")

/** null for anything malformed, so a broken file never starts a download. */
fun parseUpdateInfo(json: String): UpdateInfo? = try {
    val o = JSONObject(json)
    val code = o.optInt("versionCode", 0)
    val sha = o.optString("sha256", "").trim()
    val url = o.optString("url", "").trim()
    if (code <= 0 || !SHA256_HEX.matches(sha) || url.isEmpty()) null
    else UpdateInfo(code, o.optString("versionName", code.toString()).ifBlank { code.toString() }, sha.lowercase(), url)
} catch (e: Exception) {
    null
}

fun isNewer(info: UpdateInfo, installedCode: Int): Boolean = info.versionCode > installedCode

/** The site to ask: the dashboard address from the setup link, else the public one. */
fun updateSite(siteUrl: String): String = siteUrl.takeIf { it.startsWith("https://") } ?: DEFAULT_SITE

/** A path or URL from the manifest made absolute against the site; null unless it ends up https. */
fun resolveUpdateUrl(site: String, url: String): String? = try {
    URI(site).resolve(url).toString().takeIf { it.startsWith("https://") }
} catch (e: Exception) {
    null
}

/** Due after 12 h, or when the clock went backwards. */
fun updateCheckDue(lastCheckedAt: Long, now: Long, every: Long = UPDATE_CHECK_EVERY_MS): Boolean =
    lastCheckedAt <= 0 || now < lastCheckedAt || now - lastCheckedAt >= every

/**
 * Whether the APK already on disk is this release: same version and hash as
 * recorded, and the file still hashes to it (hashing only when the rest agrees).
 */
fun canReuseDownload(info: UpdateInfo, ready: ReadyUpdate?, fileHash: () -> String?): Boolean =
    ready != null && ready.versionCode == info.versionCode &&
        ready.sha256.equals(info.sha256, ignoreCase = true) &&
        fileHash()?.equals(info.sha256, ignoreCase = true) == true

/** A ready update still worth offering: newer than what is installed. */
fun pendingInstall(ready: ReadyUpdate?, installedCode: Int): ReadyUpdate? =
    ready?.takeIf { it.versionCode > installedCode }

fun sha256Hex(input: InputStream): String {
    val md = MessageDigest.getInstance("SHA-256")
    val buf = ByteArray(64 * 1024)
    while (true) {
        val n = input.read(buf)
        if (n < 0) break
        md.update(buf, 0, n)
    }
    return md.digest().joinToString("") { "%02x".format(it) }
}

fun encodeReadyUpdate(r: ReadyUpdate): String =
    JSONObject().put("versionCode", r.versionCode).put("versionName", r.versionName).put("sha256", r.sha256).toString()

fun decodeReadyUpdate(s: String?): ReadyUpdate? {
    if (s.isNullOrEmpty()) return null
    return try {
        val o = JSONObject(s)
        ReadyUpdate(o.getInt("versionCode"), o.getString("versionName"), o.getString("sha256"))
    } catch (e: Exception) {
        null
    }
}

package app.mindsetforest.phone

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class UpdatesTest {
    private val sha = "e513336ae6fc41ed7341d918e9f52c7da0e6408043eca6d3659d6569ba8fdfcd"
    private val info = UpdateInfo(6, "1.5", sha, "/downloads/mindsetforest-phone.apk")

    @Test
    fun parsesThePublishedManifest() {
        val json = """{"versionCode": 6, "versionName": "1.5", "sha256": "${sha.uppercase()}", "url": "/downloads/mindsetforest-phone.apk"}"""
        assertEquals(info, parseUpdateInfo(json))
    }

    @Test
    fun rejectsMalformedManifests() {
        assertNull(parseUpdateInfo("<html>404</html>"))
        assertNull(parseUpdateInfo("""{"versionCode": 0, "sha256": "$sha", "url": "/a.apk"}"""))
        assertNull(parseUpdateInfo("""{"versionCode": 6, "sha256": "abc", "url": "/a.apk"}"""))
        assertNull(parseUpdateInfo("""{"versionCode": 6, "sha256": "$sha", "url": ""}"""))
        // A missing name falls back to the code.
        assertEquals("7", parseUpdateInfo("""{"versionCode": 7, "sha256": "$sha", "url": "/a.apk"}""")?.versionName)
    }

    @Test
    fun onlyAHigherCodeIsNewer() {
        assertTrue(isNewer(info, 5))
        assertFalse(isNewer(info, 6))
        assertFalse(isNewer(info, 7))
    }

    @Test
    fun resolvesAgainstTheSiteAndRequiresHttps() {
        assertEquals("https://www.hmqe.org/downloads/phone-version.json", resolveUpdateUrl(updateSite(""), UPDATE_MANIFEST_PATH))
        assertEquals("https://x.dev/downloads/a.apk", resolveUpdateUrl(updateSite("https://x.dev/app/"), "/downloads/a.apk"))
        assertEquals(DEFAULT_SITE, updateSite("http://insecure.dev/"))
        assertEquals("https://cdn.dev/a.apk", resolveUpdateUrl("https://x.dev/", "https://cdn.dev/a.apk"))
        assertNull(resolveUpdateUrl("https://x.dev/", "http://cdn.dev/a.apk"))
    }

    @Test
    fun checksAtMostEveryTwelveHours() {
        val t = 1_791_000_000_000L
        assertTrue(updateCheckDue(0, t))
        assertFalse(updateCheckDue(t, t + UPDATE_CHECK_EVERY_MS - 1))
        assertTrue(updateCheckDue(t, t + UPDATE_CHECK_EVERY_MS))
        assertTrue(updateCheckDue(t, t - 1000)) // clock went back
    }

    @Test
    fun reusesOnlyAVerifiedDownloadOfTheSameRelease() {
        val ready = ReadyUpdate(6, "1.5", sha)
        assertTrue(canReuseDownload(info, ready) { sha })
        assertFalse(canReuseDownload(info, ready) { null }) // file gone
        assertFalse(canReuseDownload(info, ready) { "0".repeat(64) }) // file changed
        assertFalse(canReuseDownload(info, null) { sha })
        var hashed = false
        assertFalse(canReuseDownload(info, ReadyUpdate(5, "1.4", sha)) { hashed = true; sha })
        assertFalse("no hashing when the record already differs", hashed)
    }

    @Test
    fun aReadyUpdateIsDroppedOnceInstalled() {
        val ready = ReadyUpdate(6, "1.5", sha)
        assertEquals(ready, pendingInstall(ready, 5))
        assertNull(pendingInstall(ready, 6))
        assertNull(pendingInstall(null, 5))
    }

    @Test
    fun hashesAndRoundTrips() {
        assertEquals(
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
            sha256Hex("abc".byteInputStream()),
        )
        val ready = ReadyUpdate(6, "1.5", sha)
        assertEquals(ready, decodeReadyUpdate(encodeReadyUpdate(ready)))
        assertNull(decodeReadyUpdate(null))
        assertNull(decodeReadyUpdate("junk"))
    }
}

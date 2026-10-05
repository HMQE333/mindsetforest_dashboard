package app.mindsetforest.phone

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException
import java.time.ZoneId

class SyncCoreTest {
    private val utc = ZoneId.of("UTC")
    private val now = 1_759_557_600_000L // 2025-10-04 06:00 UTC

    private class FakeState : SyncState {
        override var cursor = 0L
        override var userId = "user-1"
        override val deviceId = "android:Pixel 8:abc"
        override var refreshToken = "refresh-1"
        override var accessToken = "access-1"
        override var accessExpiresAt = 0L
        var signedOut = false
        override fun saveTokens(t: Tokens) {
            refreshToken = t.refresh
            accessToken = t.access
            accessExpiresAt = t.expiresAt
            userId = t.userId
        }
        override fun signOut() {
            signedOut = true
            refreshToken = ""
        }
    }

    private class FakeApi(
        var upsertFails: MutableList<Exception> = mutableListOf(),
        var refreshFails: Exception? = null,
        var sent: Long? = null,
    ) : SessionApi {
        val uploads = mutableListOf<Pair<String, String>>()
        val asked = mutableListOf<String>()
        override fun latestEnd(devicePrefix: String, accessToken: String): Long? {
            asked += devicePrefix
            return sent
        }
        var refreshes = 0
        override fun refresh(refreshToken: String): Tokens {
            refreshFails?.let { throw it }
            refreshes++
            return Tokens("access-${refreshes + 1}", "refresh-${refreshes + 1}", Long.MAX_VALUE, "user-1", "a@b.c")
        }
        override fun upsertSessions(json: String, accessToken: String) {
            if (upsertFails.isNotEmpty()) throw upsertFails.removeAt(0)
            uploads += json to accessToken
        }
        val archived = mutableListOf<String>()
        var archiveFails = mutableListOf<Exception?>()
        override fun insertArchive(json: String, accessToken: String): String? {
            archiveFails.removeFirstOrNull()?.let { throw it }
            archived += json
            return "block-${archived.size}"
        }
        override fun dueReminders(until: Long, accessToken: String): List<Reminder> = emptyList()
    }

    private val events = listOf(
        UsageEvent(now - 600_000, EventType.RESUMED, "yt"),
        UsageEvent(now - 300_000, EventType.PAUSED, "yt"),
        UsageEvent(now - 300_000, EventType.RESUMED, "ig"),
    )

    @Test
    fun uploadsSessionsAndMovesTheCursorToTheOpenOne() {
        val state = FakeState().apply { accessExpiresAt = Long.MAX_VALUE }
        val api = FakeApi()
        val rows = SyncCore(api, state) { now }.upload(events, now, { false }, utc) { it.uppercase() }
        assertEquals(2, rows)
        assertEquals(1, api.uploads.size)
        assertEquals("access-1", api.uploads[0].second)
        assertTrue(api.uploads[0].first.contains("\"app\":\"IG\""))
        assertEquals(now - 300_000, state.cursor)
        assertEquals(0, api.refreshes)
    }

    @Test
    fun firstSyncReadsTenDaysThenFollowsTheCursor() {
        val state = FakeState()
        val api = FakeApi()
        val core = SyncCore(api, state) { now }
        assertEquals(now - FIRST_SYNC_DAYS * 86_400_000L, core.since(now))
        assertEquals(listOf("android:Pixel 8:"), api.asked)
        state.cursor = 123L
        assertEquals(123L, core.since(now))
        assertEquals(1, api.asked.size) // with a cursor the server is not asked
    }

    @Test
    fun aReinstallStartsWhereThisPhoneLeftOff() {
        val sent = now - 2 * 86_400_000L
        assertEquals(sent, SyncCore(FakeApi(sent = sent), FakeState()) { now }.since(now))
        val ancient = now - 60 * 86_400_000L
        assertEquals(now - FIRST_SYNC_DAYS * 86_400_000L, SyncCore(FakeApi(sent = ancient), FakeState()) { now }.since(now))
    }

    @Test
    fun theDeviceIdKeepsTheModelForReinstalls() {
        assertEquals("android:Pixel 8:1a2b", deviceIdFor("Pixel 8", "1a2b"))
        assertEquals("android:Pixel 8:", devicePrefix(deviceIdFor("Pixel 8", "1a2b")))
        assertEquals("android:ab:unknown", deviceIdFor("a:b", ""))
        assertEquals("android:phone:x", deviceIdFor(" ", "x"))
    }

    @Test
    fun anExpiredTokenIsRefreshedFirstAndARejectedOneOnce() {
        val state = FakeState() // accessExpiresAt = 0: expired
        val api = FakeApi(upsertFails = mutableListOf(HttpError(401, "jwt expired")))
        SyncCore(api, state) { now }.upload(events, now, { false }, utc) { it }
        assertEquals(2, api.refreshes) // once because it had expired, once after the 401
        assertEquals("access-3", api.uploads.single().second)
        assertEquals("refresh-3", state.refreshToken)
    }

    @Test
    fun aRefusedRefreshTokenSignsOutButAnOutageDoesNot() {
        val refused = FakeState()
        val e = runCatching {
            SyncCore(FakeApi(refreshFails = HttpError(400, "{\"error_code\":\"refresh_token_not_found\"}")), refused) { now }.accessToken()
        }.exceptionOrNull() as HttpError
        assertEquals(401, e.code)
        assertTrue(refused.signedOut)
        assertEquals("Sesja wygasła, zaloguj się ponownie", (failure(e) as SyncResult.Blocked).message)

        for (outage in listOf<Exception>(HttpError(503, "down"), HttpError(429, "slow down"), IOException("offline"))) {
            val state = FakeState()
            val err = runCatching { SyncCore(FakeApi(refreshFails = outage), state) { now }.accessToken() }.exceptionOrNull() as Exception
            assertTrue(!state.signedOut)
            assertTrue(failure(err) is SyncResult.Retry)
        }
    }

    @Test
    fun nothingToSendStillMovesTheCursorWithoutTouchingTheServer() {
        val state = FakeState()
        val api = FakeApi(refreshFails = IOException("offline"))
        assertEquals(0, SyncCore(api, state) { now }.upload(emptyList(), now, { false }, utc) { it })
        assertEquals(now - CURSOR_LAG_MS, state.cursor)
        assertTrue(api.uploads.isEmpty())
    }

    @Test
    fun aFailedUploadKeepsTheCursor() {
        val state = FakeState().apply { accessExpiresAt = Long.MAX_VALUE; cursor = 42L }
        val api = FakeApi(upsertFails = mutableListOf(IOException("offline")))
        assertTrue(runCatching { SyncCore(api, state) { now }.upload(events, now, { false }, utc) { it } }.isFailure)
        assertEquals(42L, state.cursor)
    }

    @Test
    fun capturesGoOutInOrderAndOfflineKeepsTheRest() {
        val state = FakeState().apply { accessExpiresAt = Long.MAX_VALUE }
        val queue = listOf(PendingCapture("one", "Chrome"), PendingCapture("two", ""), PendingCapture("three", ""))
        val api = FakeApi().apply { archiveFails = mutableListOf(null, IOException("offline")) }
        val r = SyncCore(api, state) { now }.sendCaptures(queue)
        assertEquals(listOf("block-1"), r.savedIds)
        assertEquals(listOf("two", "three"), r.remaining.map { it.text })
        assertTrue(api.archived.single().contains("\"content\":\"one\\n\\nSource: Chrome\""))
    }

    @Test
    fun aCaptureTheServerRefusesIsDroppedNotRetriedForever() {
        val state = FakeState().apply { accessExpiresAt = Long.MAX_VALUE }
        val api = FakeApi().apply { archiveFails = mutableListOf(HttpError(400, "bad"), null) }
        val r = SyncCore(api, state) { now }.sendCaptures(listOf(PendingCapture("bad", ""), PendingCapture("good", "")))
        assertEquals(listOf("block-1"), r.savedIds)
        assertTrue(r.remaining.isEmpty())
        val outage = FakeApi().apply { archiveFails = mutableListOf(HttpError(503, "down")) }
        assertEquals(1, SyncCore(outage, state) { now }.sendCaptures(listOf(PendingCapture("x", ""))).remaining.size)
    }

    @Test
    fun rejectedRowsAreBlockedWithTheServersWords() {
        val e = HttpError(400, "{\"code\":\"23502\",\"message\":\"null value in column \\\"app\\\"\"}")
        assertEquals("Serwer odrzucił dane: null value in column \"app\"", (failure(e) as SyncResult.Blocked).message)
    }
}

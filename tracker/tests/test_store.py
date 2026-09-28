from datetime import datetime, timezone

from mindsetforest_tracker.sessions import Session, iso_utc
from mindsetforest_tracker.store import Store

T0 = 1_800_000_000


def sess(start=T0, end=T0 + 60, app="Code", idle=False, title="x"):
    return Session(app, f"{app} | p", title, idle, start, end)


def test_round_trip_and_sync_flags():
    st = Store()
    st.upsert_session(sess(), "dev-1")
    rows = st.unsynced()
    assert len(rows) == 1
    r = rows[0]
    assert (r.app, r.app_key, r.window_title, r.seconds, r.idle, r.device_id) == ("Code", "Code | p", "x", 60, False, "dev-1")
    assert r.started_at == iso_utc(T0) and r.ended_at == iso_utc(T0 + 60) and r.synced is False
    assert st.mark_synced(rows) == 1
    assert st.unsynced() == [] and st.get_session(iso_utc(T0)).synced is True


def test_update_in_place_by_started_at_resets_synced():
    st = Store()
    st.upsert_session(sess(end=T0 + 60), "d")
    st.mark_synced(st.unsynced())
    st.upsert_session(sess(end=T0 + 120), "d")
    assert st.count() == 1
    row = st.get_session(iso_utc(T0))
    assert row.seconds == 120 and row.synced is False and row.rev == 2


def test_unchanged_reupsert_keeps_synced():
    st = Store()
    st.upsert_session(sess(), "d")
    st.mark_synced(st.unsynced())
    st.upsert_session(sess(), "d")
    assert st.unsynced() == []


def test_mark_synced_ignores_rows_changed_meanwhile():
    st = Store()
    st.upsert_session(sess(end=T0 + 60), "d")
    rows = st.unsynced()
    st.upsert_session(sess(end=T0 + 90), "d")  # capture thread grew the open session
    assert st.mark_synced(rows) == 0
    assert len(st.unsynced()) == 1


def test_unsynced_limit_and_order():
    st = Store()
    for i in range(5):
        st.upsert_session(sess(start=T0 + i * 100, end=T0 + i * 100 + 50), "d")
    rows = st.unsynced(limit=3)
    assert [r.started_at for r in rows] == [iso_utc(T0 + i * 100) for i in range(3)]


def test_purge_synced_older_than():
    st = Store()
    old = T0 - 100 * 86400
    st.upsert_session(sess(start=old, end=old + 10), "d")
    st.upsert_session(sess(start=T0, end=T0 + 10), "d")
    st.mark_synced(st.unsynced())
    st.upsert_session(sess(start=old - 500, end=old - 400), "d")  # old but unsynced: kept
    now = datetime.fromtimestamp(T0, timezone.utc)
    assert st.purge_synced_older_than(90, now=now) == 1
    assert st.count() == 2


def test_delete_session():
    st = Store()
    st.upsert_session(sess(), "d")
    assert st.delete_session(iso_utc(T0)) is True
    assert st.delete_session(iso_utc(T0)) is False and st.count() == 0


def test_kv_and_device_id_persist_across_reopen(tmp_path):
    path = tmp_path / "t.db"
    st = Store(path)
    dev = st.device_id()
    st.set_kv("last_error", "boom")
    st.close()
    st2 = Store(path)
    assert st2.device_id() == dev and len(dev) == 36
    assert st2.get_kv("last_error") == "boom" and st2.get_kv("missing", "dflt") == "dflt"

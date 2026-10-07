import json
from datetime import datetime, timedelta
from pathlib import Path

from mindsetforest_tracker.recordings import (
    IntakeState, Known, KosClient, assign_session, mp3_chunks, mp3_duration, mp3_frames, process_file,
    recorded_at, session_note,
)
from mindsetforest_tracker.auth import SupabaseAuth, Tokens

# MPEG-1 Layer III, 128 kbps, 44.1 kHz, no padding: 417-byte frames of 1152 samples.
HEADER = bytes([0xFF, 0xFB, 0x90, 0x00])
FRAME = HEADER + bytes(413)


def mp3(seconds: float, id3: bool = True) -> bytes:
    n = round(seconds / (1152 / 44100))
    tag = b"ID3\x03\x00\x00\x00\x00\x00\x0a" + bytes(10) if id3 else b""
    return tag + FRAME * n


def test_frames_duration_and_chunks():
    data = mp3(20 * 60)
    frames = mp3_frames(data)
    assert abs(mp3_duration(frames) - 1200) < 0.1
    chunks = mp3_chunks(data, frames, max_seconds=480)
    assert [round(s) for s, _ in chunks] == [0, 480, 960]
    assert sum(len(c) for _, c in chunks) == len(FRAME) * len(frames)  # every frame once, tag dropped
    assert all(c[:2] == b"\xff\xfb" for _, c in chunks)


def test_start_time_from_bandicam_name_or_file_time():
    assert recorded_at(Path("bandicam 2026-10-07 14-03-12-123.mp3"), 60, 0) == datetime(2026, 10, 7, 14, 3, 12)
    mtime = datetime(2026, 10, 7, 15, 0, 0).timestamp()
    assert recorded_at(Path("lecture.mp3"), 600, mtime) == datetime(2026, 10, 7, 14, 50, 0)


def test_parts_of_one_lecture_share_a_session():
    t = datetime(2026, 10, 7, 14, 0)
    a = Known("a", t, t + timedelta(minutes=30), "2026-10-07 14-00", 1, "a")
    assert assign_session(t + timedelta(minutes=45), [a], 20) == ("2026-10-07 14-00", 2)
    assert assign_session(t + timedelta(minutes=55), [a], 20) == ("2026-10-07 14-55", 1)
    assert assign_session(t - timedelta(hours=2), [a], 20) == ("2026-10-07 12-00", 1)


def test_session_note_keeps_the_routines_work_and_reopens():
    first = session_note(None, "S", [(1, "p1")])
    assert "status: new" in first and "[[Recordings/p1]]" in first
    done = first.replace("status: new", "status: processed").replace(
        "_The Claude routine fills this in and sets `status: processed`._", "- [[Knowledge/Idea]]")
    again = session_note(done, "S", [(1, "p1"), (2, "p2")])
    assert "status: new" in again and "parts: 2" in again
    assert "[[Recordings/p2]]" in again and "[[Knowledge/Idea]]" in again


class FakeResp:
    def __init__(self, status, body):
        self.status_code, self._body, self.text = status, body, json.dumps(body)

    def json(self):
        return self._body


class FakeHttp:
    def __init__(self):
        self.calls = []

    def post(self, url, headers=None, json=None, timeout=None):
        self.calls.append((url, json))
        if url.endswith("/kos-transcribe"):
            return FakeResp(200, {"model": "openai/whisper-large-v3-turbo", "language": "en",
                                  "segments": [{"start": 1.0, "end": 4.0, "text": " Hello there."}]})
        return FakeResp(201, [{"id": "rec-1"}])


def test_a_recording_becomes_a_note_and_the_audio_is_untouched(tmp_path):
    folder, vault = tmp_path / "Bandicam", tmp_path / "Vault"
    folder.mkdir()
    audio = folder / "bandicam 2026-10-07 14-03-12-123.mp3"
    audio.write_bytes(mp3(10 * 60))
    before = audio.read_bytes()
    auth = SupabaseAuth("https://p.supabase.co", "anon", tmp_path / "s.bin", http=None, clock=lambda: 0.0)
    auth.tokens = Tokens("acc", "ref", "user-1", 1e12, "a@b.c")
    http = FakeHttp()
    state = IntakeState.load(tmp_path / "recordings.json")
    note = process_file(audio, KosClient("https://p.supabase.co", "anon", auth, http=http), state, vault, 20)

    assert audio.read_bytes() == before
    assert len([c for c in http.calls if c[0].endswith("/kos-transcribe")]) == 2  # 600 s in 480 s chunks
    row = http.calls[-1][1]
    assert row["session_key"] == "2026-10-07 14-03" and row["part"] == 1 and row["user_id"] == "user-1"
    assert [s["start"] for s in row["segments"]] == [1.0, 481.0]
    text = (vault / "Recordings" / f"{note}.md").read_text(encoding="utf-8")
    assert "**[00:08:01]** Hello there. ^t0481" in text and "recording_id: rec-1" in text
    assert "status: new" in (vault / "Sessions" / "2026-10-07 14-03.md").read_text(encoding="utf-8")
    assert (vault / "_SYSTEM" / "processing-rules.md").exists()
    # Seen again (restart): nothing is sent twice.
    again = IntakeState.load(tmp_path / "recordings.json")
    n = len(http.calls)
    assert process_file(audio, KosClient("https://p.supabase.co", "anon", auth, http=http), again, vault, 20) == note
    assert len(http.calls) == n

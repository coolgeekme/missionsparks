"""Iteration 6: Voice-based Moment logging tests.

Covers:
 - POST /api/moments/parse-audio (real Whisper + Claude via Emergent LLM key)
   * happy path for student (no student_id) and parent
   * 400 empty audio
   * 413 oversized audio
   * 401 unauth
   * output shape guarantees: moment_type in catalog, intensity 1-5,
     triggers only valid catalog keys (or empty)
 - POST /api/moments persists audio_data + audio_mime + transcript
   * 413 when audio_data > ~5MB (7M chars cap)
 - GET /api/moments returns audio_data + audio_mime + transcript
 - GET /api/moments/export.csv now includes a 'transcript' column at the end
"""
import io
import math
import os
import struct
import wave

import pytest
import requests


def _load_backend_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip()
    raise RuntimeError("REACT_APP_BACKEND_URL not set")


BASE_URL = _load_backend_url().rstrip("/")
API = f"{BASE_URL}/api"

PARENT = {"email": "parent@demo.com", "password": "demo1234"}
STUDENT = {"email": "student@demo.com", "password": "demo1234"}


# --------------------------- fixtures ---------------------------
def _login(creds):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def parent_sess():
    return _login(PARENT)


@pytest.fixture(scope="module")
def student_sess():
    return _login(STUDENT)


@pytest.fixture(scope="module")
def student_user(student_sess):
    r = student_sess.get(f"{API}/auth/me", timeout=10)
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="module")
def parent_linked_student_id(parent_sess):
    """Parent's linked student ID (Enzo)."""
    r = parent_sess.get(f"{API}/students", timeout=10)
    assert r.status_code == 200, r.text
    items = r.json()
    assert items, "Parent should have at least one linked student"
    return items[0]["id"]


# ---------------------------- helpers ----------------------------
def _tone_wav_bytes(duration_sec=1.0, freq=200, rate=16000):
    """Generate a tiny mono 16-bit PCM WAV with a sine tone."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        n = int(duration_sec * rate)
        for i in range(n):
            sample = int(16000 * math.sin(2 * math.pi * freq * i / rate))
            w.writeframesraw(struct.pack("<h", sample))
    return buf.getvalue()


def _upload_audio(sess, raw, filename="moment.wav", content_type="audio/wav"):
    files = {"audio": (filename, raw, content_type)}
    return sess.post(f"{API}/moments/parse-audio", files=files, timeout=60)


# ---------------------- parse-audio tests -----------------------
class TestParseAudioHappy:
    def test_student_parse_audio_ok(self, student_sess):
        r = _upload_audio(student_sess, _tone_wav_bytes(1.0))
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        body = r.json()
        for k in ("transcript", "audio_data", "audio_mime", "parsed"):
            assert k in body, f"missing key {k}"
        assert isinstance(body["transcript"], str) and body["transcript"]
        assert isinstance(body["audio_data"], str) and len(body["audio_data"]) > 100
        # mime echoes upload (audio/wav)
        assert "wav" in body["audio_mime"].lower()

        p = body["parsed"]
        # Output shape guarantees
        assert isinstance(p["moment_type"], str) and p["moment_type"]
        assert isinstance(p["intensity"], int)
        assert 1 <= p["intensity"] <= 5
        assert isinstance(p["triggers"], list)
        # context_note/antecedent/response/outcome/notes always strings
        for k in ("context_note", "antecedent", "response", "outcome", "notes"):
            assert isinstance(p[k], str)

    def test_parent_parse_audio_ok(self, parent_sess):
        r = _upload_audio(parent_sess, _tone_wav_bytes(1.0))
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        body = r.json()
        assert body["transcript"]
        assert body["audio_data"]
        assert "wav" in body["audio_mime"].lower()

    def test_parsed_moment_type_is_valid_catalog_key(self, student_sess):
        """moment_type must always be a valid catalog key (fuzzy/fallback to 'frustrated')."""
        r = _upload_audio(student_sess, _tone_wav_bytes(1.0))
        assert r.status_code == 200, r.text
        # Pull catalog
        cat = student_sess.get(f"{API}/moments/catalog", timeout=10).json()
        valid_types = {t["key"] for t in cat["moment_types"]}
        valid_trigs = {t["key"] for t in cat["triggers"]}

        p = r.json()["parsed"]
        assert p["moment_type"] in valid_types, p["moment_type"]
        for tg in p["triggers"]:
            assert tg in valid_trigs, tg


class TestParseAudioErrors:
    def test_empty_audio_400(self, student_sess):
        files = {"audio": ("empty.wav", b"", "audio/wav")}
        r = student_sess.post(f"{API}/moments/parse-audio", files=files, timeout=20)
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"

    def test_oversized_audio_413(self, student_sess):
        # 25MB of zeros — exceeds 24MB cap
        big = b"\x00" * (25 * 1024 * 1024)
        files = {"audio": ("big.wav", big, "audio/wav")}
        r = student_sess.post(f"{API}/moments/parse-audio", files=files, timeout=60)
        assert r.status_code == 413, f"expected 413, got {r.status_code}: {r.text[:200]}"

    def test_parse_audio_requires_auth(self):
        r = requests.post(
            f"{API}/moments/parse-audio",
            files={"audio": ("x.wav", _tone_wav_bytes(0.5), "audio/wav")},
            timeout=20,
        )
        assert r.status_code in (401, 403), r.status_code


# ------------------ persistence tests on POST /moments ------------------
class TestMomentAudioPersistence:
    def test_post_moment_with_audio_fields(self, student_sess, student_user):
        # small base64-ish blob (well under 7M cap)
        payload = {
            "moment_type": "frustrated",
            "intensity": 2,
            "triggers": [],
            "notes": "TEST_iter6_audio persistence",
            "transcript": "TEST_iter6 he was upset because of homework",
            "audio_data": "AAAA" * 200,  # 800 chars, well below cap
            "audio_mime": "audio/wav",
        }
        r = student_sess.post(f"{API}/moments", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        m = r.json()
        mid = m["id"]
        assert m["transcript"] == payload["transcript"]
        assert m["audio_mime"] == "audio/wav"
        assert m["audio_data"] == payload["audio_data"]

        # GET list — must include this moment with all three fields
        r2 = student_sess.get(f"{API}/moments", timeout=15)
        assert r2.status_code == 200
        items = r2.json()
        found = next((x for x in items if x["id"] == mid), None)
        assert found is not None, "moment not in list"
        assert found.get("transcript") == payload["transcript"]
        assert found.get("audio_data") == payload["audio_data"]
        assert found.get("audio_mime") == "audio/wav"

        # cleanup
        student_sess.delete(f"{API}/moments/{mid}", timeout=10)

    def test_post_moment_audio_too_large_413(self, student_sess):
        payload = {
            "moment_type": "frustrated",
            "intensity": 3,
            "triggers": [],
            "audio_data": "A" * 7_000_001,  # exceeds 7M cap
            "audio_mime": "audio/wav",
        }
        r = student_sess.post(f"{API}/moments", json=payload, timeout=20)
        assert r.status_code == 413, f"expected 413, got {r.status_code}: {r.text[:200]}"

    def test_get_moments_returns_audio_fields(self, student_sess):
        """Schema must include audio_data/audio_mime/transcript keys (values may be None)."""
        r = student_sess.get(f"{API}/moments", timeout=15)
        assert r.status_code == 200, r.text
        items = r.json()
        # Find any item to inspect keys (or seed one if list empty)
        if not items:
            seed = student_sess.post(
                f"{API}/moments",
                json={"moment_type": "frustrated", "intensity": 1, "triggers": []},
                timeout=10,
            )
            assert seed.status_code == 200
            items = student_sess.get(f"{API}/moments", timeout=10).json()
        assert items, "no moments to inspect"
        sample = items[0]
        for k in ("audio_data", "audio_mime", "transcript"):
            assert k in sample, f"GET /moments item missing key {k}"


class TestCsvIncludesTranscript:
    def test_csv_header_has_transcript_last(self, student_sess):
        # Seed a moment with a transcript so the value column is exercised too
        seed = student_sess.post(
            f"{API}/moments",
            json={
                "moment_type": "frustrated",
                "intensity": 1,
                "triggers": [],
                "transcript": "TEST_iter6_csv transcript value",
            },
            timeout=10,
        )
        assert seed.status_code == 200, seed.text
        mid = seed.json()["id"]

        try:
            r = student_sess.get(f"{API}/moments/export.csv", timeout=15)
            assert r.status_code == 200, r.text
            assert "text/csv" in r.headers.get("content-type", "")
            body = r.text
            first_line = body.splitlines()[0]
            cols = [c.strip() for c in first_line.split(",")]
            assert cols[-1] == "transcript", f"last column should be 'transcript', got {cols!r}"
            assert "TEST_iter6_csv transcript value" in body
        finally:
            student_sess.delete(f"{API}/moments/{mid}", timeout=10)


# Regression: existing moments with NO audio fields still work
class TestNoAudioRegression:
    def test_create_moment_without_audio_fields_ok(self, student_sess):
        payload = {
            "moment_type": "frustrated",
            "intensity": 4,
            "triggers": [],
            "notes": "TEST_iter6_regression no-audio path",
        }
        r = student_sess.post(f"{API}/moments", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        m = r.json()
        # New fields default to None and are present in the response
        assert m.get("audio_data") is None
        assert m.get("audio_mime") is None
        assert m.get("transcript") is None
        student_sess.delete(f"{API}/moments/{m['id']}", timeout=10)

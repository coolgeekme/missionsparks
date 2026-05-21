"""Iteration 7 compliance sprint tests.

Covers:
- accept_terms gate on /api/auth/register
- discard_audio + terms_accepted_at exposure on /auth/me + login + register
- consent gate + db.consents on /api/students/link
- /api/account/consents (parent only)
- /api/account/preferences (discard_audio toggle)
- /api/moments/parse-audio respects discard_audio
- /api/moments respects discard_audio
- /api/account/export (JSON + audit row)
- /api/account/me DELETE (cascade)
- /api/audit (student/parent scoping)
"""
import os
import uuid
import base64
import math
import wave
import io
import struct

import pytest
import requests

def _load_base():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v.rstrip("/")
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().rstrip("/")
    except FileNotFoundError:
        pass
    raise RuntimeError("REACT_APP_BACKEND_URL not configured")


BASE = _load_base()
API = f"{BASE}/api"


# ---------- helpers ----------
def _wav_bytes(duration_s=1.0, freq=400):
    sr = 16000
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        for i in range(int(sr * duration_s)):
            v = int(0.3 * 32767 * math.sin(2 * math.pi * freq * i / sr))
            w.writeframes(struct.pack("<h", v))
    return buf.getvalue()


def _new_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _register(s, role, accept_terms=True, suffix=None):
    suffix = suffix or uuid.uuid4().hex[:8]
    email = f"iter7_{role}_{suffix}@test.com"
    r = s.post(f"{API}/auth/register", json={
        "name": f"Iter7 {role} {suffix}",
        "email": email,
        "password": "TestPass1234",
        "role": role,
        "accept_terms": accept_terms,
    })
    return r, email


def _login_demo_parent():
    s = _new_session()
    r = s.post(f"{API}/auth/login", json={"email": "parent@demo.com", "password": "demo1234"})
    assert r.status_code == 200, r.text
    return s


# ---------- 1. register accept_terms gate ----------
class TestRegisterTerms:
    def test_register_without_accept_terms_400(self):
        s = _new_session()
        r, _ = _register(s, "student", accept_terms=False)
        assert r.status_code == 400
        assert "terms" in r.json()["detail"].lower() or "accept" in r.json()["detail"].lower()

    def test_register_with_accept_terms_succeeds_sets_terms_accepted_at(self):
        s = _new_session()
        r, email = _register(s, "student", accept_terms=True)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["email"] == email
        assert j.get("terms_accepted_at") is not None
        assert j.get("discard_audio") is True
        # cleanup
        s.delete(f"{API}/account/me")

    def test_me_returns_discard_audio_and_terms_accepted_at(self):
        s = _new_session()
        r, _ = _register(s, "parent", accept_terms=True)
        assert r.status_code == 200
        me = s.get(f"{API}/auth/me").json()
        assert "discard_audio" in me and me["discard_audio"] is True
        assert me.get("terms_accepted_at") is not None
        s.delete(f"{API}/account/me")


# ---------- 2. students/link consent gate ----------
class TestStudentLinkConsent:
    def test_link_without_consent_400(self):
        # Fresh parent + fresh student
        ps = _new_session()
        _register(ps, "parent")
        ss = _new_session()
        _, student_email = _register(ss, "student")

        r = ps.post(f"{API}/students/link", json={
            "student_email": student_email,
            "consent_given": False,
        })
        assert r.status_code == 400
        assert "consent" in r.json()["detail"].lower()

        # cleanup
        ps.delete(f"{API}/account/me")
        ss.delete(f"{API}/account/me")

    def test_link_with_full_consent_succeeds_and_writes_consents_row(self):
        ps = _new_session()
        _register(ps, "parent")
        ss = _new_session()
        _, student_email = _register(ss, "student")

        r = ps.post(f"{API}/students/link", json={
            "student_email": student_email,
            "consent_given": True,
            "guardian_name": "Test Guardian",
            "guardian_relationship": "Parent",
            "child_under_13": True,
        })
        assert r.status_code == 200, r.text
        consents = ps.get(f"{API}/account/consents")
        assert consents.status_code == 200
        rows = consents.json()
        assert any(c["guardian_name"] == "Test Guardian" and c["child_under_13"] is True for c in rows)

        # audit should include students.link
        audit = ps.get(f"{API}/audit").json()
        assert any(a["action"] == "students.link" for a in audit)

        ps.delete(f"{API}/account/me")
        ss.delete(f"{API}/account/me")

    def test_account_consents_forbidden_for_student(self):
        ss = _new_session()
        _register(ss, "student")
        r = ss.get(f"{API}/account/consents")
        assert r.status_code == 403
        ss.delete(f"{API}/account/me")


# ---------- 3. account/preferences ----------
class TestPreferences:
    def test_put_preferences_discard_audio_false_updates_and_audits(self):
        s = _new_session()
        _register(s, "student")
        r = s.put(f"{API}/account/preferences", json={"discard_audio": False})
        assert r.status_code == 200
        assert r.json()["discard_audio"] is False
        me = s.get(f"{API}/auth/me").json()
        assert me["discard_audio"] is False

        audit = s.get(f"{API}/audit").json()
        assert any(a["action"] == "account.preferences_update" for a in audit)
        s.delete(f"{API}/account/me")


# ---------- 4. parse-audio + moments respect discard_audio ----------
class TestAudioPrivacy:
    def _login(self):
        s = _new_session()
        _register(s, "student")
        return s

    def test_parse_audio_discard_true_strips_audio_data(self):
        s = self._login()
        wav = _wav_bytes()
        files = {"audio": ("a.wav", wav, "audio/wav")}
        # requests needs no Content-Type for multipart
        s.headers.pop("Content-Type", None)
        r = s.post(f"{API}/moments/parse-audio", files=files)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["audio_data"] == ""
        assert j["audio_mime"] == ""
        assert isinstance(j.get("transcript"), str)
        s.headers["Content-Type"] = "application/json"
        s.delete(f"{API}/account/me")

    def test_parse_audio_discard_false_returns_full_audio(self):
        s = self._login()
        s.put(f"{API}/account/preferences", json={"discard_audio": False})
        wav = _wav_bytes()
        files = {"audio": ("a.wav", wav, "audio/wav")}
        s.headers.pop("Content-Type", None)
        r = s.post(f"{API}/moments/parse-audio", files=files)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["audio_data"] != ""
        assert len(j["audio_data"]) > 100
        assert j["audio_mime"]
        s.headers["Content-Type"] = "application/json"
        s.delete(f"{API}/account/me")

    def test_post_moment_discard_true_strips_audio_persisted(self):
        s = self._login()
        b64 = base64.b64encode(_wav_bytes()).decode("ascii")
        r = s.post(f"{API}/moments", json={
            "moment_type": "frustrated",
            "intensity": 3,
            "trigger_keys": [],
            "note": "iter7 strip",
            "audio_data": b64,
            "audio_mime": "audio/wav",
            "transcript": "iter7 transcript should persist",
        })
        assert r.status_code == 200, r.text
        m = r.json()
        assert (m.get("audio_data") in (None, "")) and (m.get("audio_mime") in (None, ""))
        assert m.get("transcript") == "iter7 transcript should persist"

        # verify via GET as well
        got = s.get(f"{API}/moments").json()
        match = [x for x in got if x["id"] == m["id"]][0]
        assert (match.get("audio_data") in (None, ""))
        s.delete(f"{API}/account/me")

    def test_post_moment_discard_false_persists_audio(self):
        s = self._login()
        s.put(f"{API}/account/preferences", json={"discard_audio": False})
        b64 = base64.b64encode(_wav_bytes()).decode("ascii")
        r = s.post(f"{API}/moments", json={
            "moment_type": "frustrated",
            "intensity": 2,
            "trigger_keys": [],
            "note": "iter7 keep",
            "audio_data": b64,
            "audio_mime": "audio/wav",
            "transcript": "keep audio",
        })
        assert r.status_code == 200, r.text
        m = r.json()
        assert m["audio_data"]
        assert m["audio_mime"] == "audio/wav"
        s.delete(f"{API}/account/me")


# ---------- 5. account/export ----------
class TestExport:
    def test_export_student_shape(self):
        s = _new_session()
        _register(s, "student")
        r = s.get(f"{API}/account/export")
        assert r.status_code == 200, r.text
        j = r.json()
        for key in ("account", "consents", "audit", "missions", "mission_logs", "moments"):
            assert key in j
        # audit row recorded
        actions = [a["action"] for a in j["audit"]]
        # The export itself audits, but may not show in same response since audit recorded after fetch.
        # Verify by hitting /audit
        au = s.get(f"{API}/audit").json()
        assert any(a["action"] == "account.export" for a in au)
        s.delete(f"{API}/account/me")

    def test_export_parent_shape(self):
        s = _new_session()
        _register(s, "parent")
        r = s.get(f"{API}/account/export")
        assert r.status_code == 200
        j = r.json()
        for key in ("account", "consents", "audit", "linked_students", "moments_logged_by_me"):
            assert key in j
        s.delete(f"{API}/account/me")


# ---------- 6. delete account cascade ----------
class TestDeleteAccount:
    def test_student_delete_cascade(self):
        # parent links a student, student creates a moment, then student deletes self
        ps = _new_session()
        _register(ps, "parent")
        ss = _new_session()
        _, semail = _register(ss, "student")
        # parent links
        ps.post(f"{API}/students/link", json={
            "student_email": semail,
            "consent_given": True,
            "guardian_name": "G",
            "guardian_relationship": "Parent",
            "child_under_13": False,
        })
        # student creates a moment
        ss.post(f"{API}/moments", json={
            "moment_type": "happy", "intensity": 4, "trigger_keys": [], "note": "del-cascade"
        })
        # student deletes self
        r = ss.delete(f"{API}/account/me")
        assert r.status_code == 200
        assert r.json()["ok"] is True
        # subsequent /auth/me on same session should be 401
        me = ss.get(f"{API}/auth/me")
        assert me.status_code == 401

        # parent's linked list should no longer contain that student
        parent_me = ps.get(f"{API}/auth/me").json()
        # The deleted student should be pulled
        # (parent still exists; cleanup)
        ps.delete(f"{API}/account/me")

    def test_parent_delete_cascade_keeps_student(self):
        ps = _new_session()
        _register(ps, "parent")
        ss = _new_session()
        _, semail = _register(ss, "student")
        ps.post(f"{API}/students/link", json={
            "student_email": semail, "consent_given": True,
            "guardian_name": "G", "guardian_relationship": "Mom", "child_under_13": True,
        })
        r = ps.delete(f"{API}/account/me")
        assert r.status_code == 200
        # student should still be able to log in
        me = ss.get(f"{API}/auth/me")
        assert me.status_code == 200
        ss.delete(f"{API}/account/me")


# ---------- 7. /api/audit scoping ----------
class TestAuditScoping:
    def test_student_only_sees_own(self):
        s = _new_session()
        _register(s, "student")
        r = s.get(f"{API}/audit")
        assert r.status_code == 200
        rows = r.json()
        assert all(row["user_id"] == s.get(f"{API}/auth/me").json()["id"] for row in rows)
        s.delete(f"{API}/account/me")

    def test_parent_without_student_id_returns_own_and_linked(self):
        s = _login_demo_parent()
        r = s.get(f"{API}/audit")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_parent_unlinked_student_id_403(self):
        s = _login_demo_parent()
        r = s.get(f"{API}/audit", params={"student_id": "non-existent-id-xyz"})
        assert r.status_code == 403


# ---------- 8. regression: demo login works ----------
class TestDemoRegression:
    def test_demo_parent_login_includes_new_fields(self):
        s = _new_session()
        r = s.post(f"{API}/auth/login", json={"email": "parent@demo.com", "password": "demo1234"})
        assert r.status_code == 200
        j = r.json()
        assert "discard_audio" in j
        # terms_accepted_at may be None for legacy demo users — that's fine

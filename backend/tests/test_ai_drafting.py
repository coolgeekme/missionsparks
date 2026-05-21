"""Backend tests for AI mission drafting + profile_notes (iteration 2)."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://mission-tracker-100.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

PARENT_EMAIL = "parent@demo.com"
PARENT_PW = "demo1234"
STUDENT_EMAIL = "student@demo.com"
STUDENT_PW = "demo1234"

# Real Claude calls can take 3-10s+; use generous timeouts.
AI_TIMEOUT = 60


def _session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def parent():
    s = _session()
    r = s.post(f"{API}/auth/login", json={"email": PARENT_EMAIL, "password": PARENT_PW})
    assert r.status_code == 200, r.text
    return s, r.json()


@pytest.fixture(scope="module")
def student():
    s = _session()
    r = s.post(f"{API}/auth/login", json={"email": STUDENT_EMAIL, "password": STUDENT_PW})
    assert r.status_code == 200, r.text
    return s, r.json()


@pytest.fixture(scope="module")
def student_id(parent):
    s, _ = parent
    students = s.get(f"{API}/students").json()
    sid = next(x["id"] for x in students if x["email"] == STUDENT_EMAIL)
    return sid


# ---------- UserPublic.profile_notes propagation ----------
class TestProfileNotesShape:
    def test_me_includes_profile_notes(self, parent):
        s, _ = parent
        r = s.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert "profile_notes" in r.json()

    def test_login_response_includes_profile_notes(self):
        s = _session()
        r = s.post(f"{API}/auth/login", json={"email": PARENT_EMAIL, "password": PARENT_PW})
        assert r.status_code == 200
        assert "profile_notes" in r.json()

    def test_register_response_includes_profile_notes(self):
        s = _session()
        email = f"TEST_pn_{uuid.uuid4().hex[:6]}@example.com"
        r = s.post(f"{API}/auth/register", json={
            "name": "PN", "email": email, "password": "pw12345", "role": "parent"
        , "accept_terms": True})
        assert r.status_code == 200, r.text
        assert "profile_notes" in r.json()

    def test_students_list_includes_profile_notes(self, parent):
        s, _ = parent
        r = s.get(f"{API}/students")
        assert r.status_code == 200
        for s_ in r.json():
            assert "profile_notes" in s_


# ---------- PUT /api/students/{id}/profile ----------
class TestProfileUpdate:
    def test_parent_updates_profile_notes(self, parent, student_id):
        s, _ = parent
        notes = f"TEST_notes loves dragons {uuid.uuid4().hex[:6]}"
        r = s.put(f"{API}/students/{student_id}/profile", json={"profile_notes": notes})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["id"] == student_id
        assert body["profile_notes"] == notes

        # GET to verify persistence
        students = s.get(f"{API}/students").json()
        target = next(x for x in students if x["id"] == student_id)
        assert target["profile_notes"] == notes

    def test_parent_cannot_update_unlinked_student(self, parent):
        s, _ = parent
        bogus_id = str(uuid.uuid4())
        r = s.put(f"{API}/students/{bogus_id}/profile", json={"profile_notes": "x"})
        assert r.status_code == 403

    def test_student_cannot_update_profile(self, student, student_id):
        s, _ = student
        r = s.put(f"{API}/students/{student_id}/profile", json={"profile_notes": "x"})
        assert r.status_code == 403


# ---------- /api/ai/draft-mission ----------
class TestDraftMission:
    def test_student_forbidden(self, student, student_id):
        s, _ = student
        r = s.post(f"{API}/ai/draft-mission", json={"student_id": student_id, "prompt": "x"}, timeout=AI_TIMEOUT)
        assert r.status_code == 403

    def test_unlinked_student_forbidden(self, parent):
        s, _ = parent
        bogus = str(uuid.uuid4())
        r = s.post(f"{API}/ai/draft-mission", json={"student_id": bogus, "prompt": "reading"}, timeout=AI_TIMEOUT)
        assert r.status_code == 403

    def test_draft_with_prompt(self, parent, student_id):
        s, _ = parent
        r = s.post(
            f"{API}/ai/draft-mission",
            json={"student_id": student_id, "prompt": "Reading practice with our chapter book about dragons"},
            timeout=AI_TIMEOUT,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        # required fields
        for k in ["title", "description", "steps", "estimated_minutes", "skill_ids", "strategy_ids", "skill_names", "strategy_names"]:
            assert k in d, f"missing field {k} in {d}"
        assert isinstance(d["title"], str) and d["title"].strip()
        assert isinstance(d["steps"], list) and len(d["steps"]) >= 1
        assert isinstance(d["estimated_minutes"], int) and 5 <= d["estimated_minutes"] <= 60
        # skill/strategy ids should reference real seeded items (when matched).
        skills = {x["id"] for x in s.get(f"{API}/skills").json()}
        strats = {x["id"] for x in s.get(f"{API}/strategies").json()}
        for sid in d["skill_ids"]:
            assert sid in skills, f"skill id {sid} not in seeded pool"
        for sid in d["strategy_ids"]:
            assert sid in strats, f"strategy id {sid} not in seeded pool"

    def test_draft_with_empty_prompt(self, parent, student_id):
        s, _ = parent
        r = s.post(
            f"{API}/ai/draft-mission",
            json={"student_id": student_id, "prompt": ""},
            timeout=AI_TIMEOUT,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["title"].strip()
        assert len(d["steps"]) >= 1

    def test_draft_returns_usable_mission_for_create(self, parent, student_id):
        """The AI draft should be usable directly as a POST /api/missions body."""
        s, _ = parent
        r = s.post(
            f"{API}/ai/draft-mission",
            json={"student_id": student_id, "prompt": "Short focus warm-up before homework"},
            timeout=AI_TIMEOUT,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        from datetime import datetime, timezone
        today = datetime.now(timezone.utc).date().isoformat()
        create_payload = {
            "student_id": student_id,
            "title": f"TEST_ai_{d['title'][:30]}",
            "description": d["description"],
            "steps": d["steps"],
            "estimated_minutes": d["estimated_minutes"],
            "due_date": today,
            "skill_ids": d["skill_ids"],
            "strategy_ids": d["strategy_ids"],
        }
        cr = s.post(f"{API}/missions", json=create_payload)
        assert cr.status_code == 200, cr.text
        mid = cr.json()["id"]
        # cleanup
        s.delete(f"{API}/missions/{mid}")


# ---------- /api/ai/draft-day ----------
class TestDraftDay:
    def test_student_forbidden(self, student, student_id):
        s, _ = student
        r = s.post(f"{API}/ai/draft-day", json={"student_id": student_id, "count": 3}, timeout=AI_TIMEOUT)
        assert r.status_code == 403

    def test_default_count_three(self, parent, student_id):
        s, _ = parent
        r = s.post(f"{API}/ai/draft-day", json={"student_id": student_id, "count": 3, "prompt": ""}, timeout=AI_TIMEOUT)
        assert r.status_code == 200, r.text
        body = r.json()
        assert isinstance(body, list)
        assert 1 <= len(body) <= 3
        for d in body:
            for k in ["title", "description", "steps", "estimated_minutes", "skill_ids", "strategy_ids"]:
                assert k in d
            assert d["title"].strip()
            assert len(d["steps"]) >= 1

    def test_unlinked_forbidden(self, parent):
        s, _ = parent
        bogus = str(uuid.uuid4())
        r = s.post(f"{API}/ai/draft-day", json={"student_id": bogus, "count": 3}, timeout=AI_TIMEOUT)
        assert r.status_code == 403

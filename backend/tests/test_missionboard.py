"""End-to-end backend tests for MissionBoard API."""
import os
import uuid
from datetime import datetime, timezone

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://mission-tracker-100.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

PARENT_EMAIL = "parent@demo.com"
PARENT_PW = "demo1234"
STUDENT_EMAIL = "student@demo.com"
STUDENT_PW = "demo1234"

TODAY = datetime.now(timezone.utc).date().isoformat()


def _new_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def parent():
    s = _new_session()
    r = s.post(f"{API}/auth/login", json={"email": PARENT_EMAIL, "password": PARENT_PW})
    assert r.status_code == 200, r.text
    return s, r.json()


@pytest.fixture(scope="module")
def student():
    s = _new_session()
    r = s.post(f"{API}/auth/login", json={"email": STUDENT_EMAIL, "password": STUDENT_PW})
    assert r.status_code == 200, r.text
    return s, r.json()


# ---------- Health ----------
class TestHealth:
    def test_root(self):
        r = requests.get(f"{API}/")
        assert r.status_code == 200
        assert r.json().get("status") == "ok"


# ---------- Auth ----------
class TestAuth:
    def test_login_sets_cookie(self):
        s = _new_session()
        r = s.post(f"{API}/auth/login", json={"email": PARENT_EMAIL, "password": PARENT_PW})
        assert r.status_code == 200
        body = r.json()
        assert body["email"] == PARENT_EMAIL
        assert body["role"] == "parent"
        assert "access_token" in s.cookies, f"cookie not set; cookies={s.cookies.get_dict()} headers={r.headers.get('set-cookie')}"

    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login", json={"email": PARENT_EMAIL, "password": "wrong"})
        assert r.status_code == 401

    def test_me_unauth(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_me_with_cookie(self, parent):
        s, _ = parent
        r = s.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json()["email"] == PARENT_EMAIL

    def test_register_and_login(self):
        s = _new_session()
        email = f"TEST_user_{uuid.uuid4().hex[:8]}@example.com"
        r = s.post(f"{API}/auth/register", json={
            "name": "Test User", "email": email, "password": "pw12345", "role": "parent"
        , "accept_terms": True})
        assert r.status_code == 200, r.text
        u = r.json()
        assert u["email"] == email.lower()
        assert u["role"] == "parent"
        assert "access_token" in s.cookies
        # duplicate
        r2 = requests.post(f"{API}/auth/register", json={
            "name": "X", "email": email, "password": "pw12345", "role": "parent"
        , "accept_terms": True})
        assert r2.status_code == 400

    def test_logout(self, parent):
        s, _ = parent
        r = s.post(f"{API}/auth/logout")
        assert r.status_code == 200
        # Re-login so the fixture stays good for later tests
        s.post(f"{API}/auth/login", json={"email": PARENT_EMAIL, "password": PARENT_PW})


# ---------- Skills / Strategies ----------
class TestSeed:
    def test_skills(self, parent):
        s, _ = parent
        r = s.get(f"{API}/skills")
        assert r.status_code == 200
        skills = r.json()
        assert len(skills) >= 4
        assert all("id" in x and "name" in x and "category" in x for x in skills)

    def test_strategies(self, parent):
        s, _ = parent
        r = s.get(f"{API}/strategies")
        assert r.status_code == 200
        strats = r.json()
        assert len(strats) >= 4


# ---------- Students linking ----------
class TestStudents:
    def test_list_students_parent(self, parent):
        s, me = parent
        r = s.get(f"{API}/students")
        assert r.status_code == 200
        students = r.json()
        emails = [x["email"] for x in students]
        assert STUDENT_EMAIL in emails

    def test_link_student_idempotent(self, parent):
        s, _ = parent
        r = s.post(f"{API}/students/link", json={"student_email": STUDENT_EMAIL, "guardian_name": "Test Guardian", "guardian_relationship": "parent", "child_under_13": False, "consent_given": True})
        assert r.status_code == 200
        assert any(True for _ in r.json()["linked_student_ids"])

    def test_link_unknown_student(self, parent):
        s, _ = parent
        r = s.post(f"{API}/students/link", json={"student_email": "nobody@example.com", "guardian_name": "Test Guardian", "guardian_relationship": "parent", "child_under_13": False, "consent_given": True})
        assert r.status_code == 404

    def test_student_forbidden_on_students_list(self, student):
        s, _ = student
        r = s.get(f"{API}/students")
        assert r.status_code == 403


# ---------- Missions ----------
class TestMissions:
    def test_list_today_for_demo_student(self, parent):
        s, _ = parent
        # find student id
        st = s.get(f"{API}/students").json()
        student_id = next(x["id"] for x in st if x["email"] == STUDENT_EMAIL)
        r = s.get(f"{API}/missions", params={"student_id": student_id, "due_date": TODAY})
        assert r.status_code == 200
        missions = r.json()
        assert len(missions) >= 2, f"expected >=2 seeded missions today, got {len(missions)}"

    def test_student_sees_own_missions(self, student):
        s, _ = student
        r = s.get(f"{API}/missions", params={"due_date": TODAY})
        assert r.status_code == 200
        assert len(r.json()) >= 2

    def test_student_cannot_create_mission(self, student, parent):
        s, _ = student
        _, parent_me = parent
        st_id = next(x for x in parent_me["linked_student_ids"])
        r = s.post(f"{API}/missions", json={
            "student_id": st_id, "title": "x", "due_date": TODAY
        })
        assert r.status_code == 403

    def test_parent_crud_full(self, parent):
        s, _ = parent
        student_id = s.get(f"{API}/students").json()[0]["id"]
        skills = s.get(f"{API}/skills").json()
        strats = s.get(f"{API}/strategies").json()
        # CREATE
        payload = {
            "student_id": student_id,
            "title": "TEST_mission",
            "description": "from pytest",
            "steps": ["step1", "step2"],
            "estimated_minutes": 15,
            "due_date": TODAY,
            "skill_ids": [skills[0]["id"]],
            "strategy_ids": [strats[0]["id"]],
        }
        r = s.post(f"{API}/missions", json=payload)
        assert r.status_code == 200, r.text
        m = r.json()
        assert m["title"] == "TEST_mission"
        assert m["student_id"] == student_id
        assert m["steps"] == ["step1", "step2"]
        mid = m["id"]
        # GET
        r2 = s.get(f"{API}/missions/{mid}")
        assert r2.status_code == 200
        assert r2.json()["title"] == "TEST_mission"
        # UPDATE
        r3 = s.put(f"{API}/missions/{mid}", json={"title": "TEST_mission_v2", "estimated_minutes": 25})
        assert r3.status_code == 200
        assert r3.json()["title"] == "TEST_mission_v2"
        assert r3.json()["estimated_minutes"] == 25
        # confirm persisted
        r4 = s.get(f"{API}/missions/{mid}")
        assert r4.json()["title"] == "TEST_mission_v2"
        # DELETE
        r5 = s.delete(f"{API}/missions/{mid}")
        assert r5.status_code == 200
        # gone
        r6 = s.get(f"{API}/missions/{mid}")
        assert r6.status_code == 404


# ---------- Mission logs ----------
class TestLogs:
    def test_student_creates_log_and_parent_sees_it(self, parent, student):
        ps, _ = parent
        ss, _ = student
        # find a mission for today belonging to demo student
        student_id = ps.get(f"{API}/students").json()[0]["id"]
        missions = ps.get(f"{API}/missions", params={"student_id": student_id, "due_date": TODAY}).json()
        assert missions, "no seeded missions found for today"
        mid = missions[0]["id"]
        # Parent attempt to log -> 403
        bad = ps.post(f"{API}/missions/{mid}/log", json={"status": "completed"})
        assert bad.status_code == 403
        # Student creates log
        r = ss.post(f"{API}/missions/{mid}/log", json={
            "status": "completed",
            "used_strategies": True,
            "difficulty_rating": "medium",
            "feeling": "good",
            "note": "TEST_reflection"
        })
        assert r.status_code == 200, r.text
        log = r.json()
        assert log["mission_id"] == mid
        assert log["status"] == "completed"
        assert log["feeling"] == "good"
        # Student sees their logs
        rs = ss.get(f"{API}/logs")
        assert rs.status_code == 200
        assert any(x["id"] == log["id"] for x in rs.json())
        # Parent sees student's logs and they are sorted desc
        rp = ps.get(f"{API}/logs", params={"student_id": student_id})
        assert rp.status_code == 200
        logs = rp.json()
        assert any(x["id"] == log["id"] for x in logs)
        ts = [x["timestamp"] for x in logs]
        assert ts == sorted(ts, reverse=True)

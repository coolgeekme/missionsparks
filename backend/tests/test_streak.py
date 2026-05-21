"""Backend tests for /api/streak feature."""
import os
import uuid
from datetime import datetime, timezone, timedelta

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://mission-tracker-100.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

PARENT_EMAIL = "parent@demo.com"
PARENT_PW = "demo1234"
STUDENT_EMAIL = "student@demo.com"
STUDENT_PW = "demo1234"

TODAY = datetime.now(timezone.utc).date()
TODAY_ISO = TODAY.isoformat()


def _session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(email, pw):
    s = _session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, r.text
    return s, r.json()


@pytest.fixture(scope="module")
def parent():
    return _login(PARENT_EMAIL, PARENT_PW)


@pytest.fixture(scope="module")
def student():
    return _login(STUDENT_EMAIL, STUDENT_PW)


@pytest.fixture(scope="module")
def demo_student_id(parent):
    s, _ = parent
    st = s.get(f"{API}/students").json()
    sid = next(x["id"] for x in st if x["email"] == STUDENT_EMAIL)
    return sid


REQUIRED_KEYS = {
    "current_streak", "longest_streak", "completed_today",
    "completed_today_count", "missions_today_count",
    "last_completed_date", "week",
}


def _validate_shape(body):
    assert REQUIRED_KEYS.issubset(set(body.keys())), f"missing keys: {REQUIRED_KEYS - set(body.keys())}"
    assert isinstance(body["current_streak"], int)
    assert isinstance(body["longest_streak"], int)
    assert isinstance(body["completed_today"], bool)
    assert isinstance(body["completed_today_count"], int)
    assert isinstance(body["missions_today_count"], int)
    assert isinstance(body["week"], list)
    assert len(body["week"]) == 7
    for i, day in enumerate(body["week"]):
        assert set(day.keys()) >= {"date", "completed", "is_today"}
        assert isinstance(day["completed"], bool)
        assert isinstance(day["is_today"], bool)
    # last entry is today
    assert body["week"][-1]["is_today"] is True
    assert body["week"][-1]["date"] == TODAY_ISO
    # only one is_today
    assert sum(1 for d in body["week"] if d["is_today"]) == 1
    # consecutive ISO dates ending today
    for i in range(7):
        expected = (TODAY - timedelta(days=6 - i)).isoformat()
        assert body["week"][i]["date"] == expected, f"week[{i}].date {body['week'][i]['date']} != {expected}"
    # longest >= current
    assert body["longest_streak"] >= body["current_streak"]


class TestStreakStudent:
    def _ensure_today_completed(self, student_session):
        """Make sure demo student has at least 1 completed log today."""
        r = student_session.get(f"{API}/missions", params={"due_date": TODAY_ISO})
        assert r.status_code == 200
        missions = r.json()
        assert missions, "no missions today for demo student"
        # check existing logs
        rlogs = student_session.get(f"{API}/logs")
        assert rlogs.status_code == 200
        logs = rlogs.json()
        completed_today_mids = {
            lg["mission_id"] for lg in logs
            if lg.get("status") == "completed" and (lg.get("timestamp", "")[:10] == TODAY_ISO)
        }
        if completed_today_mids:
            return  # already have a completed log today
        # else create one
        mid = missions[0]["id"]
        rc = student_session.post(f"{API}/missions/{mid}/log", json={
            "status": "completed",
            "used_strategies": True,
            "difficulty_rating": "easy",
            "feeling": "good",
            "note": "TEST_streak_seed",
        })
        assert rc.status_code == 200, rc.text

    def test_student_streak_ok(self, student):
        s, me = student
        self._ensure_today_completed(s)
        r = s.get(f"{API}/streak")
        assert r.status_code == 200, r.text
        body = r.json()
        _validate_shape(body)
        # demo student should have completed today now
        assert body["completed_today"] is True
        assert body["current_streak"] >= 1
        assert body["completed_today_count"] >= 1
        assert body["missions_today_count"] >= 2  # seeded >=2
        assert body["last_completed_date"] == TODAY_ISO

    def test_streak_unauth(self):
        r = requests.get(f"{API}/streak")
        assert r.status_code == 401

    def test_parent_cannot_use_my_streak(self, parent):
        s, _ = parent
        r = s.get(f"{API}/streak")
        assert r.status_code == 403
        body = r.json()
        # helpful error mentioning the parent endpoint
        detail = (body.get("detail") or "").lower()
        assert "parent" in detail or "student" in detail


class TestStreakByStudentId:
    def test_parent_linked_ok(self, parent, demo_student_id):
        s, _ = parent
        r = s.get(f"{API}/streak/{demo_student_id}")
        assert r.status_code == 200, r.text
        body = r.json()
        _validate_shape(body)

    def test_parent_not_linked_403(self, demo_student_id):
        # register a fresh parent that is NOT linked to demo student
        s = _session()
        email = f"TEST_unlinked_{uuid.uuid4().hex[:8]}@example.com"
        r = s.post(f"{API}/auth/register", json={
            "name": "Unlinked Parent", "email": email, "password": "pw12345", "role": "parent"
        , "accept_terms": True})
        assert r.status_code == 200, r.text
        r2 = s.get(f"{API}/streak/{demo_student_id}")
        assert r2.status_code == 403

    def test_student_owns_streak(self, student):
        s, me = student
        r = s.get(f"{API}/streak/{me['id']}")
        assert r.status_code == 200

    def test_different_student_403(self, demo_student_id):
        # register a new student account that is not the demo student
        s = _session()
        email = f"TEST_otherstudent_{uuid.uuid4().hex[:8]}@example.com"
        r = s.post(f"{API}/auth/register", json={
            "name": "Other Student", "email": email, "password": "pw12345", "role": "student"
        , "accept_terms": True})
        assert r.status_code == 200, r.text
        r2 = s.get(f"{API}/streak/{demo_student_id}")
        assert r2.status_code == 403

    def test_fresh_student_zero_streak(self):
        """A brand-new student with no logs should have streak=0, completed_today=False, week is consecutive dates."""
        s = _session()
        email = f"TEST_freshstu_{uuid.uuid4().hex[:8]}@example.com"
        r = s.post(f"{API}/auth/register", json={
            "name": "Fresh Student", "email": email, "password": "pw12345", "role": "student"
        , "accept_terms": True})
        assert r.status_code == 200, r.text
        r2 = s.get(f"{API}/streak")
        assert r2.status_code == 200, r2.text
        body = r2.json()
        _validate_shape(body)
        assert body["current_streak"] == 0
        assert body["longest_streak"] == 0
        assert body["completed_today"] is False
        assert body["completed_today_count"] == 0
        assert body["last_completed_date"] is None
        # week should all be completed=False
        assert all(d["completed"] is False for d in body["week"])

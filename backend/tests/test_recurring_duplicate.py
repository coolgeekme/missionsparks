"""Tests for recurring missions, duplicate endpoint, and edit-with-logs (iter11)."""
import os
import time
import uuid
import requests
import pytest
from datetime import date, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
PARENT_EMAIL = "parent@demo.com"
PARENT_PW = "demo1234"
STUDENT_EMAIL = "student@demo.com"
STUDENT_PW = "demo1234"
ENZO_ID = "232f66a6-a4d0-4515-8905-7219f0083646"


# --- helpers ---
def _login(email, pw):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def parent():
    return _login(PARENT_EMAIL, PARENT_PW)


@pytest.fixture(scope="module")
def student():
    return _login(STUDENT_EMAIL, STUDENT_PW)


@pytest.fixture(scope="module")
def other_parent():
    """Register a brand-new parent who does NOT own Enzo."""
    email = f"TEST_otherparent_{int(time.time())}@example.com"
    s = requests.Session()
    r = s.post(
        f"{API}/auth/register",
        json={
            "name": "Other Parent",
            "email": email,
            "password": "demo1234",
            "role": "parent",
            "accept_terms": True,
        },
    )
    assert r.status_code in (200, 201), f"register failed: {r.status_code} {r.text}"
    return s


def _make_mission(sess, due_iso, *, title="TEST_recur", steps=None, recurrence=None,
                  student_id=ENZO_ID, estimated_minutes=10):
    body = {
        "student_id": student_id,
        "title": title,
        "description": "test",
        "steps": steps or ["s1", "s2"],
        "estimated_minutes": estimated_minutes,
        "due_date": due_iso,
        "skill_ids": [],
        "strategy_ids": [],
    }
    if recurrence is not None:
        body["recurrence"] = recurrence
    r = sess.post(f"{API}/missions", json=body)
    return r


def _future_monday():
    """Return ISO date of the next Monday at least 7 days out (so spawn window
    captures multiple instances of every pattern)."""
    today = date.today()
    days_ahead = (0 - today.weekday()) % 7  # 0=Mon
    if days_ahead < 7:
        days_ahead += 7
    return (today + timedelta(days=days_ahead)).isoformat()


# --- recurrence creation ---
class TestRecurrence:
    def test_weekdays_spawns_only_mon_fri(self, parent):
        start = _future_monday()
        r = _make_mission(parent, start, title="TEST_weekdays",
                          recurrence={"pattern": "weekdays"})
        assert r.status_code == 200, r.text
        parent_mission = r.json()
        assert parent_mission["recurrence_pattern"] == "weekdays"
        assert parent_mission["recurrence_parent_id"] is None
        pid = parent_mission["id"]

        listing = parent.get(f"{API}/missions", params={"student_id": ENZO_ID})
        assert listing.status_code == 200
        instances = [m for m in listing.json() if m.get("recurrence_parent_id") == pid]
        # 30-day window starting day after start -> ~21-22 weekdays
        assert 20 <= len(instances) <= 23, f"expected ~22 weekday instances, got {len(instances)}"
        for inst in instances:
            wd = date.fromisoformat(inst["due_date"]).weekday()
            assert wd < 5, f"instance {inst['due_date']} is weekend (wd={wd})"
            # all instances should NOT carry the recurrence_pattern themselves
            assert inst["recurrence_parent_id"] == pid

    def test_daily_spawns_about_30(self, parent):
        start = _future_monday()
        r = _make_mission(parent, start, title="TEST_daily",
                          recurrence={"pattern": "daily"})
        assert r.status_code == 200
        pid = r.json()["id"]
        listing = parent.get(f"{API}/missions", params={"student_id": ENZO_ID}).json()
        instances = [m for m in listing if m.get("recurrence_parent_id") == pid]
        assert 28 <= len(instances) <= 31, f"daily got {len(instances)}"

    def test_weekends_spawns_only_sat_sun(self, parent):
        start = _future_monday()
        r = _make_mission(parent, start, title="TEST_weekends",
                          recurrence={"pattern": "weekends"})
        assert r.status_code == 200
        pid = r.json()["id"]
        listing = parent.get(f"{API}/missions", params={"student_id": ENZO_ID}).json()
        instances = [m for m in listing if m.get("recurrence_parent_id") == pid]
        assert 7 <= len(instances) <= 10, f"weekends got {len(instances)}"
        for inst in instances:
            wd = date.fromisoformat(inst["due_date"]).weekday()
            assert wd >= 5

    def test_weekly_spawns_same_weekday(self, parent):
        start = _future_monday()
        start_wd = date.fromisoformat(start).weekday()
        r = _make_mission(parent, start, title="TEST_weekly",
                          recurrence={"pattern": "weekly"})
        assert r.status_code == 200
        pid = r.json()["id"]
        listing = parent.get(f"{API}/missions", params={"student_id": ENZO_ID}).json()
        instances = [m for m in listing if m.get("recurrence_parent_id") == pid]
        assert 3 <= len(instances) <= 5, f"weekly got {len(instances)}"
        for inst in instances:
            assert date.fromisoformat(inst["due_date"]).weekday() == start_wd

    def test_none_spawns_zero(self, parent):
        start = _future_monday()
        r = _make_mission(parent, start, title="TEST_oneoff",
                          recurrence={"pattern": "none"})
        assert r.status_code == 200
        pid = r.json()["id"]
        assert r.json()["recurrence_pattern"] is None
        listing = parent.get(f"{API}/missions", params={"student_id": ENZO_ID}).json()
        instances = [m for m in listing if m.get("recurrence_parent_id") == pid]
        assert len(instances) == 0

    def test_no_recurrence_field_spawns_zero(self, parent):
        start = _future_monday()
        r = _make_mission(parent, start, title="TEST_no_recur", recurrence=None)
        assert r.status_code == 200
        pid = r.json()["id"]
        assert r.json()["recurrence_pattern"] is None
        listing = parent.get(f"{API}/missions", params={"student_id": ENZO_ID}).json()
        instances = [m for m in listing if m.get("recurrence_parent_id") == pid]
        assert len(instances) == 0


# --- duplicate endpoint ---
class TestDuplicate:
    def test_duplicate_happy_path(self, parent):
        # create original
        start = _future_monday()
        r = _make_mission(parent, start, title="TEST_dup_src",
                          steps=["a", "b", "c"], estimated_minutes=15)
        assert r.status_code == 200
        src = r.json()
        # duplicate to 2026-03-15
        dup_resp = parent.post(f"{API}/missions/{src['id']}/duplicate",
                               json={"due_date": "2026-03-15"})
        assert dup_resp.status_code == 200, dup_resp.text
        dup = dup_resp.json()
        assert dup["id"] != src["id"]
        assert dup["title"] == src["title"]
        assert dup["steps"] == src["steps"]
        assert dup["estimated_minutes"] == src["estimated_minutes"]
        assert dup["due_date"] == "2026-03-15"
        assert dup["recurrence_pattern"] is None
        assert dup["recurrence_parent_id"] is None
        assert dup["created_at"] != src["created_at"]
        # GET verifies persistence
        got = parent.get(f"{API}/missions/{dup['id']}")
        assert got.status_code == 200
        assert got.json()["due_date"] == "2026-03-15"

    def test_duplicate_strips_recurrence(self, parent):
        # If we duplicate a recurring parent, the dup must be a one-off
        start = _future_monday()
        r = _make_mission(parent, start, title="TEST_dup_recur",
                          recurrence={"pattern": "daily"})
        assert r.status_code == 200
        src = r.json()
        dup = parent.post(f"{API}/missions/{src['id']}/duplicate",
                          json={"due_date": "2026-04-01"}).json()
        assert dup["recurrence_pattern"] is None
        assert dup["recurrence_parent_id"] is None

    def test_duplicate_authz_other_parent(self, parent, other_parent):
        start = _future_monday()
        r = _make_mission(parent, start, title="TEST_dup_authz")
        mid = r.json()["id"]
        bad = other_parent.post(f"{API}/missions/{mid}/duplicate",
                                json={"due_date": "2026-04-02"})
        assert bad.status_code in (403, 404), f"expected 403/404, got {bad.status_code}"

    def test_duplicate_authz_student_role(self, parent, student):
        start = _future_monday()
        r = _make_mission(parent, start, title="TEST_dup_studentrole")
        mid = r.json()["id"]
        bad = student.post(f"{API}/missions/{mid}/duplicate",
                           json={"due_date": "2026-04-03"})
        assert bad.status_code == 403

    def test_duplicate_404_for_missing(self, parent):
        bad = parent.post(f"{API}/missions/{uuid.uuid4()}/duplicate",
                          json={"due_date": "2026-04-04"})
        assert bad.status_code == 404


# --- edit endpoint persists fields even with logs ---
class TestEditWithLogs:
    def test_edit_steps_with_existing_log(self, parent, student):
        # parent creates a mission for today so student can log it
        today = date.today().isoformat()
        r = _make_mission(parent, today, title="TEST_edit_logs",
                          steps=["s1", "s2"])
        assert r.status_code == 200
        mid = r.json()["id"]
        # student creates a log
        log = student.post(f"{API}/missions/{mid}/log",
                           json={"status": "in_progress", "used_strategies": False})
        assert log.status_code == 200, log.text
        # parent edits steps -> should succeed and persist
        upd = parent.put(f"{API}/missions/{mid}",
                         json={"steps": ["a", "b", "c", "d"]})
        assert upd.status_code == 200, upd.text
        assert upd.json()["steps"] == ["a", "b", "c", "d"]
        # GET verifies persistence
        got = parent.get(f"{API}/missions/{mid}").json()
        assert got["steps"] == ["a", "b", "c", "d"]

    def test_edit_independent_fields(self, parent):
        start = _future_monday()
        r = _make_mission(parent, start, title="TEST_edit_fields",
                          steps=["x"], estimated_minutes=10)
        mid = r.json()["id"]
        # title only
        parent.put(f"{API}/missions/{mid}", json={"title": "TEST_edit_fields2"})
        assert parent.get(f"{API}/missions/{mid}").json()["title"] == "TEST_edit_fields2"
        # estimated_minutes only
        parent.put(f"{API}/missions/{mid}", json={"estimated_minutes": 45})
        assert parent.get(f"{API}/missions/{mid}").json()["estimated_minutes"] == 45
        # due_date only
        parent.put(f"{API}/missions/{mid}", json={"due_date": "2026-05-01"})
        m = parent.get(f"{API}/missions/{mid}").json()
        assert m["due_date"] == "2026-05-01"
        # description only
        parent.put(f"{API}/missions/{mid}", json={"description": "new desc"})
        assert parent.get(f"{API}/missions/{mid}").json()["description"] == "new desc"


# --- Regression: existing endpoints still respond ---
class TestRegression:
    def test_citations(self, parent):
        r = parent.get(f"{API}/citations")
        assert r.status_code == 200
        assert isinstance(r.json(), list) and len(r.json()) > 0

    def test_skills(self, parent):
        r = parent.get(f"{API}/skills")
        assert r.status_code == 200
        assert len(r.json()) > 0

    def test_strategies(self, parent):
        r = parent.get(f"{API}/strategies")
        assert r.status_code == 200

    def test_moments_catalog(self, parent):
        r = parent.get(f"{API}/moments/catalog")
        assert r.status_code == 200

    def test_games_catalog(self, parent):
        r = parent.get(f"{API}/games/catalog")
        assert r.status_code == 200

    def test_public_stats(self):
        r = requests.get(f"{API}/public/stats")
        assert r.status_code == 200

    def test_intake_get(self, parent):
        r = parent.get(f"{API}/students/{ENZO_ID}/intake")
        assert r.status_code == 200

    def test_ai_draft_mission_has_rationale(self, parent):
        r = parent.post(f"{API}/ai/draft-mission",
                        json={"student_id": ENZO_ID,
                              "parent_prompt": "Reading comprehension practice for 15 minutes"})
        assert r.status_code == 200, r.text
        body = r.json()
        # rationale field still present
        assert "rationale" in body
        assert isinstance(body.get("title"), str) and len(body["title"]) > 0

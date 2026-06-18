"""
Iter 18 — Home Dashboard (public PIN-login) + Recurring Mission edit scope.

Covers:
  * PUT /api/families/{id}/home-dashboard
  * PUT/DELETE /api/students/{id}/home-pin
  * GET  /api/home/{slug}              (no auth, kid tiles)
  * POST /api/home/{slug}/login        (PIN lockout 5 strikes/10 min)
  * GET  /api/auth/me with PIN cookie  (role='student')
  * PUT  /api/missions/{id} with scope='this' | 'future' | 'series'
"""
import os
import uuid
import pytest
import requests
from datetime import date, timedelta
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://mission-tracker-100.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

PARENT_EMAIL = "parent@demo.com"
PARENT_PASSWORD = "demo1234"
DEMO_SLUG = "demo-parent-family"
DEMO_PIN = "1234"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "missionboard")


@pytest.fixture(scope="module")
def db():
    return MongoClient(MONGO_URL)[DB_NAME]


@pytest.fixture(scope="module")
def parent_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": PARENT_EMAIL, "password": PARENT_PASSWORD})
    assert r.status_code == 200, f"parent login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def parent_context(parent_session):
    me = parent_session.get(f"{API}/auth/me").json()
    fams = parent_session.get(f"{API}/families").json()
    owned = next((f for f in fams if any(m.get("user_id") == me["id"] and m.get("role") == "owner" for m in f.get("members", []))), None)
    assert owned, "Parent has no owned family"
    student_id = (me.get("linked_student_ids") or [None])[0]
    assert student_id, "Parent has no linked student"
    return {"me": me, "family_id": owned["id"], "student_id": student_id}


# ---------------- Home Dashboard toggle + PIN ----------------

class TestHomeDashboardToggle:
    def test_enable_home_dashboard_returns_slug(self, parent_session, parent_context, db):
        fam_id = parent_context["family_id"]
        r = parent_session.put(f"{API}/families/{fam_id}/home-dashboard", json={"enabled": True})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["enabled"] is True
        assert isinstance(body.get("slug"), str) and body["slug"]

        fam = db.families.find_one({"id": fam_id})
        assert fam.get("home_dashboard_enabled") is True
        assert fam.get("slug")

    def test_set_pin_4_digits(self, parent_session, parent_context, db):
        sid = parent_context["student_id"]
        r = parent_session.put(f"{API}/students/{sid}/home-pin", json={"pin": DEMO_PIN})
        assert r.status_code == 200, r.text
        u = db.users.find_one({"id": sid})
        h = u.get("home_pin_hash")
        assert h and h.startswith("$2"), f"PIN not bcrypt-hashed: {h!r}"
        assert DEMO_PIN not in h

    def test_set_pin_rejects_bad_input(self, parent_session, parent_context):
        sid = parent_context["student_id"]
        r = parent_session.put(f"{API}/students/{sid}/home-pin", json={"pin": "12"})
        assert r.status_code == 400

    def test_clear_pin_removes_hash(self, parent_session, parent_context, db):
        sid = parent_context["student_id"]
        r = parent_session.delete(f"{API}/students/{sid}/home-pin")
        assert r.status_code == 200
        assert "home_pin_hash" not in (db.users.find_one({"id": sid}) or {})
        # Re-set for subsequent tests
        parent_session.put(f"{API}/students/{sid}/home-pin", json={"pin": DEMO_PIN})


# ---------------- Public Home page + PIN login ----------------

class TestPublicHome:
    def test_public_home_no_auth(self, parent_context):
        s = requests.Session()
        r = s.get(f"{API}/home/{DEMO_SLUG}")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("family_name")
        assert isinstance(data.get("kids"), list) and len(data["kids"]) >= 1
        assert any(k["id"] == parent_context["student_id"] and k["has_pin"] for k in data["kids"])

    def test_public_home_404_when_disabled(self, parent_session, parent_context, db):
        fam_id = parent_context["family_id"]
        slug = (db.families.find_one({"id": fam_id}) or {}).get("slug", DEMO_SLUG)
        parent_session.put(f"{API}/families/{fam_id}/home-dashboard", json={"enabled": False})
        r = requests.get(f"{API}/home/{slug}")
        assert r.status_code == 404
        # restore
        parent_session.put(f"{API}/families/{fam_id}/home-dashboard", json={"enabled": True})

    def test_wrong_pin_returns_403_with_tries_left(self, parent_context, db):
        sid = parent_context["student_id"]
        db.home_pin_attempts.delete_many({"student_id": sid})
        s = requests.Session()
        r = s.post(f"{API}/home/{DEMO_SLUG}/login", json={"student_id": sid, "pin": "0000"})
        assert r.status_code == 403, r.text
        detail = (r.json() or {}).get("detail", "")
        assert "tries left" in detail.lower(), detail

    def test_lockout_after_5_wrong_pin(self, parent_context, db):
        sid = parent_context["student_id"]
        db.home_pin_attempts.delete_many({"student_id": sid})
        s = requests.Session()
        statuses = []
        for _ in range(5):
            r = s.post(f"{API}/home/{DEMO_SLUG}/login", json={"student_id": sid, "pin": "0000"})
            statuses.append(r.status_code)
        # 5th attempt should produce 429 lockout
        assert statuses[-1] == 429, statuses
        attempt = db.home_pin_attempts.find_one({"student_id": sid})
        assert attempt and attempt.get("locked_until")
        # Next attempt also blocked with 429
        r = s.post(f"{API}/home/{DEMO_SLUG}/login", json={"student_id": sid, "pin": DEMO_PIN})
        assert r.status_code == 429
        # Cleanup: clear lockout for downstream tests
        db.home_pin_attempts.delete_many({"student_id": sid})

    def test_correct_pin_issues_student_session(self, parent_context, db):
        sid = parent_context["student_id"]
        db.home_pin_attempts.delete_many({"student_id": sid})
        s = requests.Session()
        r = s.post(f"{API}/home/{DEMO_SLUG}/login", json={"student_id": sid, "pin": DEMO_PIN})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["student_id"] == sid
        # attempts cleared
        assert db.home_pin_attempts.find_one({"student_id": sid}) is None
        # cookie set
        assert s.cookies.get("access_token"), s.cookies.items()
        # /me with PIN cookie returns student role
        me = s.get(f"{API}/auth/me")
        assert me.status_code == 200
        m = me.json()
        assert m.get("role") == "student"
        assert m.get("id") == sid


# ---------------- Mission edit scope ----------------

class TestMissionScope:
    @pytest.fixture
    def recurring_series(self, parent_session, parent_context):
        """Create a 5-day daily recurring mission. Returns the parent mission + child instances."""
        sid = parent_context["student_id"]
        start = date.today()
        end = start + timedelta(days=4)
        title = f"TEST_RECUR_{uuid.uuid4().hex[:6]}"
        r = parent_session.post(f"{API}/missions", json={
            "student_id": sid,
            "title": title,
            "description": "scope test",
            "steps": ["a"],
            "estimated_minutes": 5,
            "due_date": start.isoformat(),
            "skill_ids": [],
            "strategy_ids": [],
            "recurrence": {"pattern": "daily", "end_date": end.isoformat()},
        })
        assert r.status_code == 200, r.text
        parent_mission = r.json()
        # Fetch instances
        rr = parent_session.get(f"{API}/missions", params={"student_id": sid})
        assert rr.status_code == 200
        all_missions = rr.json()
        # Series includes parent + all children with recurrence_parent_id==parent.id
        series = sorted(
            [m for m in all_missions if m["id"] == parent_mission["id"] or m.get("recurrence_parent_id") == parent_mission["id"]],
            key=lambda m: m["due_date"],
        )
        assert len(series) >= 3, f"expected daily series ≥3, got {len(series)}"
        yield {"parent": parent_mission, "series": series, "title": title}
        # Cleanup
        for m in series:
            parent_session.delete(f"{API}/missions/{m['id']}")

    def test_scope_this_updates_only_one(self, parent_session, recurring_series):
        series = recurring_series["series"]
        target = series[1]
        r = parent_session.put(f"{API}/missions/{target['id']}",
                               json={"title": "ONLY_THIS", "scope": "this"})
        assert r.status_code == 200, r.text
        for m in series:
            mr = parent_session.get(f"{API}/missions/{m['id']}").json()
            if m["id"] == target["id"]:
                assert mr["title"] == "ONLY_THIS"
            else:
                assert mr["title"] == recurring_series["title"], (m["id"], mr["title"])

    def test_scope_future_updates_this_and_later_uncompleted(self, parent_session, parent_context, recurring_series, db):
        series = recurring_series["series"]
        # Mark series[0] completed directly in DB (parent role cannot post mission_log; that's a student action)
        first = series[0]
        db.mission_logs.insert_one({
            "id": str(uuid.uuid4()), "mission_id": first["id"],
            "student_id": parent_context["student_id"], "status": "completed",
        })

        pivot = series[2]
        new_title = "FUTURE_UPDATE"
        r = parent_session.put(f"{API}/missions/{pivot['id']}",
                               json={"title": new_title, "scope": "future"})
        assert r.status_code == 200, r.text

        # Verify
        for idx, m in enumerate(series):
            mr = parent_session.get(f"{API}/missions/{m['id']}").json()
            if idx == 0:
                # completed → untouched
                assert mr["title"] == recurring_series["title"], f"completed mission was modified: {mr}"
            elif idx < 2:
                # before pivot, uncompleted → untouched
                assert mr["title"] == recurring_series["title"], f"past uncompleted modified: {mr}"
            else:
                assert mr["title"] == new_title, f"future not updated: {mr}"

    def test_scope_future_does_not_change_due_date(self, parent_session, recurring_series):
        series = recurring_series["series"]
        pivot = series[2]
        original_dates = {m["id"]: m["due_date"] for m in series}
        bad_date = (date.today() + timedelta(days=99)).isoformat()
        r = parent_session.put(f"{API}/missions/{pivot['id']}",
                               json={"due_date": bad_date, "scope": "future"})
        assert r.status_code == 200, r.text
        # due_date must NOT propagate even on the pivot itself in scope=future
        for m in series:
            mr = parent_session.get(f"{API}/missions/{m['id']}").json()
            assert mr["due_date"] == original_dates[m["id"]], (
                f"due_date changed under scope=future: {m['id']} {original_dates[m['id']]} -> {mr['due_date']}"
            )

    def test_scope_series_updates_all_uncompleted(self, parent_session, recurring_series, parent_context, db):
        series = recurring_series["series"]
        # Complete the last one (insert mission_log directly — parent can't POST as student)
        last = series[-1]
        db.mission_logs.insert_one({
            "id": str(uuid.uuid4()), "mission_id": last["id"],
            "student_id": parent_context["student_id"], "status": "completed",
        })

        any_mid = series[1]
        new_title = "SERIES_UPDATE"
        r = parent_session.put(f"{API}/missions/{any_mid['id']}",
                               json={"title": new_title, "scope": "series"})
        assert r.status_code == 200, r.text

        for m in series:
            mr = parent_session.get(f"{API}/missions/{m['id']}").json()
            # last one is completed → untouched
            if m["id"] == last["id"]:
                assert mr["title"] != new_title, "completed mission was updated under scope=series"
            else:
                assert mr["title"] == new_title, (m["id"], mr["title"])

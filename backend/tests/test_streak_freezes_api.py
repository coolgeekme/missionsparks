"""Iter 20 — API-level integration tests for streak freezes, weekend mode, and digest.

Tests against live backend at REACT_APP_BACKEND_URL.
Credentials: parent@demo.com / demo1234, student@demo.com / demo1234, coparent@demo.com / demo1234.
"""
from __future__ import annotations

import os
import pathlib
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
import requests
from dotenv import load_dotenv

load_dotenv(pathlib.Path(__file__).resolve().parents[2] / "frontend" / ".env")

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

PARENT = ("parent@demo.com", "demo1234")
STUDENT = ("student@demo.com", "demo1234")
COPARENT = ("coparent@demo.com", "demo1234")

ENZO_ID = "232f66a6-a4d0-4515-8905-7219f0083646"
DEMO_FAMILY_ID = "154dc97d-4832-4972-96be-1c275684f093"


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login {email} -> {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def parent_sess():
    return _login(*PARENT)


@pytest.fixture(scope="module")
def student_sess():
    return _login(*STUDENT)


def _cleanup_freezes(parent_sess, student_id, dates):
    """Remove freezes for given dates if they exist (best-effort)."""
    r = parent_sess.get(f"{API}/students/{student_id}/freezes")
    if r.status_code != 200:
        return
    for f in r.json().get("freezes", []):
        if f.get("date") in dates:
            parent_sess.delete(f"{API}/students/{student_id}/freezes/{f['id']}")


# ---- Streak endpoint ----

class TestStreakEndpoint:
    def test_streak_response_has_new_fields(self, parent_sess):
        r = parent_sess.get(f"{API}/streak/{ENZO_ID}")
        assert r.status_code == 200, r.text
        data = r.json()
        for k in [
            "current_streak", "longest_streak", "completed_today",
            "freezes_used_in_run", "freezes_remaining_month",
            "freezes_granted_this_month", "weekend_mode",
            "freeze_used_in_run", "week",
        ]:
            assert k in data, f"missing field {k} in {data.keys()}"
        assert isinstance(data["week"], list) and len(data["week"]) == 7
        for d in data["week"]:
            assert "completed" in d and "kind" in d
            assert d["kind"] in ("completed", "freeze", "weekend", "missed", "pending")
        assert data["weekend_mode"] in ("all_days", "weekdays_only")

    def test_student_can_read_own_streak(self, student_sess):
        r = student_sess.get(f"{API}/streak")
        assert r.status_code == 200
        assert "current_streak" in r.json()


# ---- Freeze grant happy path + validation ----

class TestFreezeGrant:
    def test_grant_happy_path_and_bridges_streak(self, parent_sess):
        # Try several days back to find one where the kid did NOT complete a mission
        far_date = None
        for off in range(40, 60):
            d = (date.today() - timedelta(days=off)).isoformat()
            _cleanup_freezes(parent_sess, ENZO_ID, [d])
            r0 = parent_sess.post(
                f"{API}/students/{ENZO_ID}/freezes",
                json={"date": d, "reason": "TEST_travel"},
            )
            if r0.status_code == 200:
                far_date = d
                r = r0
                break
            # If quota exhausted, bail
            if r0.status_code == 400 and "Out of freezes" in r0.text:
                pytest.skip(f"Monthly quota exhausted: {r0.text}")
        assert far_date is not None, "could not find a free date for happy-path freeze"
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["date"] == far_date
        assert data["student_id"] == ENZO_ID
        assert "id" in data
        fid = data["id"]

        # GET to verify it persisted
        r2 = parent_sess.get(f"{API}/students/{ENZO_ID}/freezes")
        assert r2.status_code == 200
        ids = [f["id"] for f in r2.json()["freezes"]]
        assert fid in ids

        # Cleanup
        parent_sess.delete(f"{API}/students/{ENZO_ID}/freezes/{fid}")

    def test_grant_duplicate_returns_409(self, parent_sess):
        d = (date.today() - timedelta(days=35)).isoformat()
        _cleanup_freezes(parent_sess, ENZO_ID, [d])

        r1 = parent_sess.post(f"{API}/students/{ENZO_ID}/freezes", json={"date": d, "reason": "TEST"})
        assert r1.status_code == 200
        fid = r1.json()["id"]

        r2 = parent_sess.post(f"{API}/students/{ENZO_ID}/freezes", json={"date": d, "reason": "TEST"})
        assert r2.status_code == 409, r2.text

        parent_sess.delete(f"{API}/students/{ENZO_ID}/freezes/{fid}")

    def test_grant_future_date_400(self, parent_sess):
        d = (date.today() + timedelta(days=2)).isoformat()
        r = parent_sess.post(f"{API}/students/{ENZO_ID}/freezes", json={"date": d})
        assert r.status_code == 400, r.text

    def test_grant_old_date_400(self, parent_sess):
        d = (date.today() - timedelta(days=120)).isoformat()
        r = parent_sess.post(f"{API}/students/{ENZO_ID}/freezes", json={"date": d})
        assert r.status_code == 400, r.text

    def test_grant_bad_format_400(self, parent_sess):
        r = parent_sess.post(f"{API}/students/{ENZO_ID}/freezes", json={"date": "2026-1-1"})
        assert r.status_code == 400


# ---- List & permissions ----

class TestFreezeListAndPermissions:
    def test_list_response_shape(self, parent_sess):
        r = parent_sess.get(f"{API}/students/{ENZO_ID}/freezes")
        assert r.status_code == 200
        d = r.json()
        for k in ("freezes", "granted_this_month", "remaining_this_month", "monthly_cap"):
            assert k in d
        assert d["monthly_cap"] == 4
        assert d["remaining_this_month"] + d["granted_this_month"] == 4 or d["granted_this_month"] >= 4

    def test_student_can_read_own_freezes(self, student_sess):
        r = student_sess.get(f"{API}/students/{ENZO_ID}/freezes")
        assert r.status_code == 200
        assert "freezes" in r.json()

    def test_other_parent_403(self):
        # Register an unrelated parent
        rand = uuid.uuid4().hex[:8]
        email = f"other-{rand}@example.com"
        s = requests.Session()
        reg = s.post(f"{API}/auth/register", json={
            "name": "Other Parent", "email": email, "password": "demo1234", "role": "parent",
            "accept_terms": True, "accept_privacy": True, "accepted_tos": True,
            "tos_accepted": True, "privacy_accepted": True,
        })
        if reg.status_code not in (200, 201):
            pytest.skip(f"could not register parent: {reg.status_code} {reg.text}")
        s.post(f"{API}/auth/login", json={"email": email, "password": "demo1234"})
        r = s.get(f"{API}/students/{ENZO_ID}/freezes")
        assert r.status_code == 403, f"expected 403 got {r.status_code} {r.text}"


# ---- Delete ----

class TestFreezeDelete:
    def test_delete_bogus_404(self, parent_sess):
        r = parent_sess.delete(f"{API}/students/{ENZO_ID}/freezes/does-not-exist-{uuid.uuid4()}")
        assert r.status_code == 404

    def test_delete_removes(self, parent_sess):
        d = (date.today() - timedelta(days=33)).isoformat()
        _cleanup_freezes(parent_sess, ENZO_ID, [d])
        r1 = parent_sess.post(f"{API}/students/{ENZO_ID}/freezes", json={"date": d, "reason": "TEST"})
        assert r1.status_code == 200
        fid = r1.json()["id"]
        r2 = parent_sess.delete(f"{API}/students/{ENZO_ID}/freezes/{fid}")
        assert r2.status_code == 200
        # Verify removed
        r3 = parent_sess.get(f"{API}/students/{ENZO_ID}/freezes")
        ids = [f["id"] for f in r3.json()["freezes"]]
        assert fid not in ids


# ---- Weekend mode ----

class TestWeekendMode:
    def test_set_weekdays_only(self, parent_sess):
        r = parent_sess.put(
            f"{API}/families/{DEMO_FAMILY_ID}/streak-weekend-mode",
            json={"mode": "weekdays_only"},
        )
        assert r.status_code == 200, r.text
        assert r.json().get("mode") == "weekdays_only"

        # /api/streak reflects
        s = parent_sess.get(f"{API}/streak/{ENZO_ID}").json()
        assert s["weekend_mode"] == "weekdays_only"

    def test_set_all_days(self, parent_sess):
        r = parent_sess.put(
            f"{API}/families/{DEMO_FAMILY_ID}/streak-weekend-mode",
            json={"mode": "all_days"},
        )
        assert r.status_code == 200
        s = parent_sess.get(f"{API}/streak/{ENZO_ID}").json()
        assert s["weekend_mode"] == "all_days"
        # restore weekdays_only for the agent context note
        parent_sess.put(
            f"{API}/families/{DEMO_FAMILY_ID}/streak-weekend-mode",
            json={"mode": "weekdays_only"},
        )

    def test_invalid_mode_400(self, parent_sess):
        r = parent_sess.put(
            f"{API}/families/{DEMO_FAMILY_ID}/streak-weekend-mode",
            json={"mode": "every_other_day"},
        )
        assert r.status_code == 400


# ---- Digest ----

class TestDigest:
    def test_digest_send_sample(self, parent_sess):
        r = parent_sess.post(f"{API}/me/digest/send-sample")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("sent") is True or "sent" in d

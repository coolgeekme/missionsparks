"""Iter9 tests: public landing endpoints + existing endpoint regression."""
import os
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://mission-tracker-100.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def parent_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": "parent@demo.com", "password": "demo1234"})
    if r.status_code != 200:
        pytest.skip(f"parent login failed: {r.status_code} {r.text}")
    return s


# ---------- /api/public/stats ----------
class TestPublicStats:
    def test_stats_no_auth(self, session):
        r = session.get(f"{API}/public/stats")
        assert r.status_code == 200
        data = r.json()
        for k in ("citations", "skills", "strategies", "waitlist"):
            assert k in data, f"missing key {k}"
            assert isinstance(data[k], int)
        assert data["citations"] >= 31, f"expected >=31 citations, got {data['citations']}"


# ---------- /api/public/waitlist ----------
class TestPublicWaitlist:
    def test_waitlist_signup_and_idempotency(self, session):
        email = f"TEST_landing_e2e_{int(time.time()*1000)}@example.com"
        payload = {"email": email, "role": "parent", "source": "landing_hero"}

        r1 = session.post(f"{API}/public/waitlist", json=payload)
        assert r1.status_code == 200, r1.text
        d1 = r1.json()
        assert d1.get("ok") is True
        assert d1.get("already_on_waitlist") is False

        # Submit same email again -> already_on_waitlist True
        r2 = session.post(f"{API}/public/waitlist", json=payload)
        assert r2.status_code == 200, r2.text
        d2 = r2.json()
        assert d2.get("ok") is True
        assert d2.get("already_on_waitlist") is True

    def test_waitlist_email_case_insensitive(self, session):
        email = f"TEST_case_{int(time.time()*1000)}@example.com"
        r1 = session.post(f"{API}/public/waitlist", json={"email": email, "role": "therapist"})
        assert r1.status_code == 200
        r2 = session.post(f"{API}/public/waitlist", json={"email": email.upper(), "role": "therapist"})
        assert r2.status_code == 200
        assert r2.json().get("already_on_waitlist") is True

    def test_waitlist_invalid_email(self, session):
        r = session.post(f"{API}/public/waitlist", json={"email": "not-an-email"})
        assert r.status_code in (400, 422)

    def test_waitlist_get_requires_parent_auth(self, session):
        r = session.get(f"{API}/waitlist")
        assert r.status_code in (401, 403)

    def test_waitlist_get_as_parent(self, parent_session):
        r = parent_session.get(f"{API}/waitlist")
        assert r.status_code == 200, r.text
        d = r.json()
        assert "count" in d and "items" in d
        assert isinstance(d["items"], list)
        assert d["count"] == len(d["items"])


# ---------- Regression: existing endpoints still work (parent-auth) ----------
class TestRegression:
    def test_citations(self, parent_session):
        r = parent_session.get(f"{API}/citations")
        assert r.status_code == 200
        data = r.json()
        items = data if isinstance(data, list) else data.get("items", data.get("citations", []))
        assert isinstance(items, list)
        assert len(items) >= 31

    def test_skills(self, parent_session):
        r = parent_session.get(f"{API}/skills")
        assert r.status_code == 200
        data = r.json()
        items = data if isinstance(data, list) else data.get("items", [])
        assert len(items) > 0

    def test_strategies(self, parent_session):
        r = parent_session.get(f"{API}/strategies")
        assert r.status_code == 200
        data = r.json()
        items = data if isinstance(data, list) else data.get("items", [])
        assert len(items) > 0

    def test_moments_catalog(self, parent_session):
        r = parent_session.get(f"{API}/moments/catalog")
        assert r.status_code == 200

    def test_games_catalog(self, parent_session):
        r = parent_session.get(f"{API}/games/catalog")
        assert r.status_code == 200

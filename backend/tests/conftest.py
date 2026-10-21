"""Shared test setup.

The app now buckets streaks, "today" and daily counts in the HOUSEHOLD's
timezone (stored on the family record), not UTC. These tests were written
against UTC calendar dates, so pin the demo family to UTC once per run —
otherwise results depend on whatever timezone the demo account last saw from
a browser, and the suite would flake during the evening hours.

One fixture, zero per-test edits.
"""
import os

import pytest
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL", "https://mission-tracker-100.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE_URL}/api"

PARENT_EMAIL = "parent@demo.com"
PARENT_PW = "demo1234"


@pytest.fixture(scope="session", autouse=True)
def pin_demo_timezone():
    """Force the demo household into UTC for the run."""
    try:
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        r = s.post(f"{API}/auth/login",
                   json={"email": PARENT_EMAIL, "password": PARENT_PW},
                   timeout=20)
        if r.status_code == 200:
            s.post(f"{API}/me/timezone", json={"tz": "UTC"}, timeout=20)
    except Exception:
        # Never let setup failure mask the real tests — they'll report what broke.
        pass
    yield

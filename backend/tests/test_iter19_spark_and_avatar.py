"""
Iter 19 — Family Home Page enrichments:
  * Enriched kid tiles on GET /api/home/{slug}
  * GET /api/home/{slug}/spark   (24h cache, kind rotation)
  * GET /api/me/avatar  (auth: any role)
  * PUT /api/me/avatar  (student-only, palette validation)
"""
import os
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://mission-tracker-100.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

PARENT_EMAIL = "parent@demo.com"
PARENT_PASSWORD = "demo1234"
STUDENT_EMAIL = "student@demo.com"
STUDENT_PASSWORD = "demo1234"
DEMO_SLUG = "demo-parent-family"

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
def student_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": STUDENT_EMAIL, "password": STUDENT_PASSWORD})
    assert r.status_code == 200, f"student login failed: {r.status_code} {r.text}"
    return s


# -------- Public Home Dashboard tile shape (enriched) --------
class TestHomeTileShape:
    def test_home_kids_have_new_fields(self):
        r = requests.get(f"{API}/home/{DEMO_SLUG}")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "kids" in data and isinstance(data["kids"], list) and len(data["kids"]) > 0
        for k in data["kids"]:
            for f in ("streak_current", "open_missions_today", "missions_today_count",
                       "interest_tag", "avatar_emoji", "avatar_color"):
                assert f in k, f"missing field {f} in kid tile {k}"
            assert isinstance(k["streak_current"], int)
            assert isinstance(k["open_missions_today"], int)
            assert isinstance(k["missions_today_count"], int)


# -------- Spark of the Day --------
SPARK_KINDS = ("fun_fact", "riddle", "affirmation", "science_nugget")


class TestSpark:
    def test_spark_returns_today(self):
        r = requests.get(f"{API}/home/{DEMO_SLUG}/spark", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "date" in data and "kind" in data and "content" in data
        assert data["kind"] in SPARK_KINDS
        assert isinstance(data["content"], str) and len(data["content"]) > 0

    def test_spark_same_day_is_cached(self):
        r1 = requests.get(f"{API}/home/{DEMO_SLUG}/spark", timeout=30).json()
        r2 = requests.get(f"{API}/home/{DEMO_SLUG}/spark", timeout=30).json()
        assert r1["content"] == r2["content"], "Same-day spark must be cached (identical content)"
        assert r1["kind"] == r2["kind"]
        assert r1["date"] == r2["date"]

    def test_spark_404_on_bogus_slug(self):
        r = requests.get(f"{API}/home/bogus-slug-iter19/spark")
        assert r.status_code == 404

    def test_spark_persisted_in_db(self, db):
        # Ensure cache row exists
        requests.get(f"{API}/home/{DEMO_SLUG}/spark", timeout=30)
        fam = db.families.find_one({"slug": DEMO_SLUG})
        assert fam, "demo family not found"
        from datetime import datetime, timezone
        today = datetime.now(timezone.utc).date().isoformat()
        row = db.home_sparks.find_one({"family_id": fam["id"], "date": today})
        assert row is not None
        assert row["kind"] in SPARK_KINDS


# -------- Avatar endpoints --------
class TestAvatar:
    def test_get_avatar_palettes(self, student_session):
        r = student_session.get(f"{API}/me/avatar")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "emoji" in data and "color" in data
        assert "emoji_palette" in data and isinstance(data["emoji_palette"], list)
        assert len(data["emoji_palette"]) >= 12
        assert "color_palette" in data and isinstance(data["color_palette"], list)
        assert len(data["color_palette"]) == 8

    def test_put_avatar_valid(self, student_session):
        r = student_session.put(f"{API}/me/avatar", json={"emoji": "🦖", "color": "emerald"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["emoji"] == "🦖" and data["color"] == "emerald"
        # GET reflects
        g = student_session.get(f"{API}/me/avatar").json()
        assert g["emoji"] == "🦖" and g["color"] == "emerald"

    def test_home_reflects_avatar(self, student_session):
        # Set known avatar then check public home reflects it
        student_session.put(f"{API}/me/avatar", json={"emoji": "🦖", "color": "emerald"})
        r = requests.get(f"{API}/home/{DEMO_SLUG}")
        assert r.status_code == 200
        kids = r.json()["kids"]
        enzo = next((k for k in kids if k["name"].lower().startswith("enzo")), None)
        assert enzo, "Enzo not found in home tiles"
        assert enzo["avatar_emoji"] == "🦖"
        assert enzo["avatar_color"] == "emerald"

    def test_put_avatar_off_palette_emoji(self, student_session):
        r = student_session.put(f"{API}/me/avatar", json={"emoji": "🍔"})
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"

    def test_put_avatar_off_palette_color(self, student_session):
        r = student_session.put(f"{API}/me/avatar", json={"color": "chartreuse"})
        assert r.status_code == 400

    def test_put_avatar_clear_both(self, student_session):
        r = student_session.put(f"{API}/me/avatar", json={"emoji": "", "color": ""})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["emoji"] in (None, "")
        assert data["color"] in (None, "")
        g = student_session.get(f"{API}/me/avatar").json()
        assert g["emoji"] in (None, "")
        assert g["color"] in (None, "")
        # restore for FE testing convenience
        student_session.put(f"{API}/me/avatar", json={"emoji": "🦖", "color": "emerald"})

    def test_parent_cannot_update_avatar(self, parent_session):
        r = parent_session.put(f"{API}/me/avatar", json={"emoji": "🚀", "color": "pink"})
        assert r.status_code == 403, f"expected 403 for parent, got {r.status_code}: {r.text}"

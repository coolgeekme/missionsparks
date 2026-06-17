"""Tests for POST /api/missions/practice (iter13).

Validates that the new endpoint generates a reading passage or writing prompt
AND creates a mission that links to it, plus authz contracts.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

PARENT_EMAIL = "parent@demo.com"
PARENT_PW = "demo1234"
STUDENT_EMAIL = "student@demo.com"
STUDENT_PW = "demo1234"
ENZO_ID = "232f66a6-a4d0-4515-8905-7219f0083646"


def _login(email: str, password: str) -> requests.Session:
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def parent_session() -> requests.Session:
    return _login(PARENT_EMAIL, PARENT_PW)


@pytest.fixture(scope="module")
def student_session() -> requests.Session:
    return _login(STUDENT_EMAIL, STUDENT_PW)


@pytest.fixture(scope="module")
def other_parent_session() -> requests.Session:
    """Creates a brand new TEST_ parent with no link to Enzo for authz tests."""
    ts = int(time.time())
    email = f"TEST_practice_op_{ts}@example.com"
    s = requests.Session()
    r = s.post(
        f"{API}/auth/register",
        json={"name": "TestOtherParent", "email": email, "password": "demo1234", "role": "parent", "accept_terms": True},
        timeout=30,
    )
    assert r.status_code in (200, 201), f"Register failed: {r.status_code} {r.text}"
    return s


# --- Happy path: reading ---

class TestPracticeReading:
    def test_create_reading_practice_mission(self, parent_session):
        r = parent_session.post(
            f"{API}/missions/practice",
            json={
                "student_id": ENZO_ID,
                "due_date": "2026-01-31",
                "kind": "reading",
                "topic_hint": "ocean animals",
                "estimated_minutes": 12,
            },
            timeout=90,
        )
        assert r.status_code == 200, f"Got {r.status_code}: {r.text}"
        data = r.json()
        # Mission shape
        assert data["student_id"] == ENZO_ID
        assert data["mission_type"] == "reading_passage"
        assert data["linked_passage_id"], "linked_passage_id should be set"
        assert data["linked_writing_id"] is None
        assert data["title"].startswith("📖 Read:"), f"Title was: {data['title']}"
        assert data["estimated_minutes"] == 12
        assert data["due_date"] == "2026-01-31"
        assert data["steps"] == []
        assert data["recurrence_pattern"] is None
        # Linked passage is queryable
        passage_id = data["linked_passage_id"]
        pr = parent_session.get(f"{API}/reading/passage/{passage_id}", timeout=30)
        assert pr.status_code == 200, f"Linked passage GET failed: {pr.status_code} {pr.text}"
        passage = pr.json()
        assert passage["id"] == passage_id
        assert passage["student_id"] == ENZO_ID
        assert isinstance(passage.get("questions"), list)
        assert len(passage["questions"]) >= 3
        # Mission appears in GET /missions
        ml = parent_session.get(f"{API}/missions?student_id={ENZO_ID}", timeout=30)
        assert ml.status_code == 200
        ids = [m["id"] for m in ml.json()]
        assert data["id"] in ids, "newly created mission missing from list"


# --- Happy path: writing ---

class TestPracticeWriting:
    def test_create_writing_practice_mission(self, parent_session):
        r = parent_session.post(
            f"{API}/missions/practice",
            json={
                "student_id": ENZO_ID,
                "due_date": "2026-02-01",
                "kind": "writing",
                "topic_hint": "my favorite season",
            },
            timeout=90,
        )
        assert r.status_code == 200, f"Got {r.status_code}: {r.text}"
        data = r.json()
        assert data["mission_type"] == "writing_prompt"
        assert data["linked_writing_id"], "linked_writing_id should be set"
        assert data["linked_passage_id"] is None
        assert data["title"].startswith("✍️ Write:"), f"Title was: {data['title']}"
        assert data["estimated_minutes"] == 15  # default
        # Linked piece queryable
        piece_id = data["linked_writing_id"]
        pr = parent_session.get(f"{API}/writing/piece/{piece_id}", timeout=30)
        assert pr.status_code == 200, f"Linked piece GET failed: {pr.status_code} {pr.text}"
        piece = pr.json()
        assert piece["id"] == piece_id
        assert piece["student_id"] == ENZO_ID
        assert piece.get("prompt"), "writing piece should have a prompt"
        assert isinstance(piece.get("scaffold"), list)
        assert isinstance(piece.get("sentence_starters"), list)


# --- Authz ---

class TestPracticeMissionAuthz:
    def test_student_cannot_create_practice_mission(self, student_session):
        r = student_session.post(
            f"{API}/missions/practice",
            json={"student_id": ENZO_ID, "due_date": "2026-01-31", "kind": "reading"},
            timeout=30,
        )
        assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"

    def test_anon_cannot_create_practice_mission(self):
        r = requests.post(
            f"{API}/missions/practice",
            json={"student_id": ENZO_ID, "due_date": "2026-01-31", "kind": "reading"},
            timeout=30,
        )
        assert r.status_code == 401, f"Expected 401, got {r.status_code}: {r.text}"

    def test_other_parent_cannot_create_for_unowned_student(self, other_parent_session):
        r = other_parent_session.post(
            f"{API}/missions/practice",
            json={"student_id": ENZO_ID, "due_date": "2026-01-31", "kind": "reading"},
            timeout=30,
        )
        assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"

    def test_invalid_kind_rejected(self, parent_session):
        r = parent_session.post(
            f"{API}/missions/practice",
            json={"student_id": ENZO_ID, "due_date": "2026-01-31", "kind": "math"},
            timeout=30,
        )
        assert r.status_code == 422, f"Expected 422 on bad kind, got {r.status_code}"


# --- Regression: existing endpoints still work ---

class TestRegression:
    def test_standard_mission_create_still_works(self, parent_session):
        r = parent_session.post(
            f"{API}/missions",
            json={
                "student_id": ENZO_ID,
                "title": "TEST_regression_standard",
                "description": "regression",
                "steps": ["s1", "s2"],
                "estimated_minutes": 10,
                "due_date": "2026-01-31",
                "skill_ids": [],
                "strategy_ids": [],
            },
            timeout=30,
        )
        assert r.status_code == 200, f"Standard mission create failed: {r.status_code} {r.text}"
        m = r.json()
        assert m.get("mission_type", "standard") == "standard"
        assert m["linked_passage_id"] is None
        assert m["linked_writing_id"] is None

    def test_reading_standalone_generation_still_works(self, parent_session):
        r = parent_session.post(
            f"{API}/reading/passage",
            json={"student_id": ENZO_ID, "topic_hint": "trees"},
            timeout=90,
        )
        assert r.status_code == 200, f"{r.status_code}: {r.text}"
        assert r.json()["student_id"] == ENZO_ID

    def test_writing_standalone_generation_still_works(self, parent_session):
        r = parent_session.post(
            f"{API}/writing/prompt",
            json={"student_id": ENZO_ID, "topic_hint": "robots"},
            timeout=90,
        )
        assert r.status_code == 200, f"{r.status_code}: {r.text}"
        assert r.json()["student_id"] == ENZO_ID

    def test_portfolio_still_works(self, parent_session):
        r = parent_session.get(f"{API}/students/{ENZO_ID}/portfolio", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "reading" in data and "writing" in data
        assert isinstance(data["reading"], list)
        assert isinstance(data["writing"], list)

    def test_intake_endpoint_still_works(self, parent_session):
        r = parent_session.get(f"{API}/students/{ENZO_ID}/intake", timeout=30)
        assert r.status_code == 200

    def test_skills_catalog_still_works(self, parent_session):
        r = parent_session.get(f"{API}/skills", timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_strategies_catalog_still_works(self, parent_session):
        r = parent_session.get(f"{API}/strategies", timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

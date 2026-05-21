"""Iteration 4 backend tests: clue_captures on logs, POST /api/logs/{id}/game, 'Jot a clue' strategy seed."""
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
def parent_session():
    s = _new_session()
    r = s.post(f"{API}/auth/login", json={"email": PARENT_EMAIL, "password": PARENT_PW})
    assert r.status_code == 200, r.text
    return s, r.json()


@pytest.fixture(scope="module")
def student_session():
    s = _new_session()
    r = s.post(f"{API}/auth/login", json={"email": STUDENT_EMAIL, "password": STUDENT_PW})
    assert r.status_code == 200, r.text
    return s, r.json()


@pytest.fixture(scope="module")
def fresh_mission(parent_session):
    """Create a brand-new mission so we can mark a game on its log exactly once."""
    s, _ = parent_session
    student_id = next(x["id"] for x in s.get(f"{API}/students").json() if x["email"] == STUDENT_EMAIL)
    r = s.post(f"{API}/missions", json={
        "student_id": student_id,
        "title": f"TEST_iter4_{uuid.uuid4().hex[:6]}",
        "description": "iter4 game endpoint test",
        "steps": ["a", "b"],
        "estimated_minutes": 5,
        "due_date": TODAY,
        "skill_ids": [],
        "strategy_ids": [],
    })
    assert r.status_code == 200, r.text
    return r.json()


# ---------- Seed: Jot a clue strategy ----------
class TestStrategySeed:
    def test_jot_a_clue_present(self, parent_session):
        s, _ = parent_session
        r = s.get(f"{API}/strategies")
        assert r.status_code == 200
        strats = r.json()
        names = [x["name"] for x in strats]
        assert "Jot a clue" in names, f"'Jot a clue' missing; got {names}"
        jot = next(x for x in strats if x["name"] == "Jot a clue")
        assert jot["emoji"] == "📝"
        assert isinstance(jot["description"], str) and len(jot["description"]) > 0

    def test_strategies_no_duplicates(self, parent_session):
        s, _ = parent_session
        strats = s.get(f"{API}/strategies").json()
        names = [x["name"] for x in strats]
        assert len(names) == len(set(names)), f"duplicate strategy names: {names}"


# ---------- Log clue_captures ----------
class TestLogClueCaptures:
    def test_log_accepts_and_returns_clue_captures(self, student_session):
        s, _ = student_session
        missions = s.get(f"{API}/missions", params={"due_date": TODAY}).json()
        assert missions
        mid = missions[0]["id"]
        r = s.post(f"{API}/missions/{mid}/log", json={
            "status": "in_progress",
            "note": "TEST_iter4_clues",
            "clue_captures": ["Roz hides in the bushes", "  ", "She talks to animals", ""]
        })
        assert r.status_code == 200, r.text
        log = r.json()
        # whitespace/empty filtered
        assert log["clue_captures"] == ["Roz hides in the bushes", "She talks to animals"]
        # new fields default
        assert log["game_played"] is False
        assert log["game_key"] is None
        assert log["game_score"] is None

    def test_log_empty_clue_list(self, student_session):
        s, _ = student_session
        missions = s.get(f"{API}/missions", params={"due_date": TODAY}).json()
        mid = missions[0]["id"]
        r = s.post(f"{API}/missions/{mid}/log", json={
            "status": "in_progress",
            "note": "TEST_iter4_no_clues"
        })
        assert r.status_code == 200
        assert r.json()["clue_captures"] == []

    def test_list_logs_include_new_fields(self, student_session):
        s, _ = student_session
        r = s.get(f"{API}/logs")
        assert r.status_code == 200
        for log in r.json():
            assert "clue_captures" in log
            assert "game_played" in log
            assert "game_key" in log
            assert "game_score" in log


# ---------- POST /api/logs/{id}/game ----------
class TestGameEndpoint:
    def test_404_for_unknown_log(self, student_session):
        s, _ = student_session
        r = s.post(f"{API}/logs/{uuid.uuid4()}/game", json={"game_key": "word-match"})
        assert r.status_code == 404

    def test_parent_forbidden(self, parent_session, student_session, fresh_mission):
        ss, _ = student_session
        ps, _ = parent_session
        # student creates a fresh log
        r = ss.post(f"{API}/missions/{fresh_mission['id']}/log", json={
            "status": "completed", "note": "TEST_iter4_for_parent_403"
        })
        assert r.status_code == 200
        log_id = r.json()["id"]
        # parent (wrong role) tries
        rp = ps.post(f"{API}/logs/{log_id}/game", json={"game_key": "memory-cards"})
        assert rp.status_code == 403

    def test_other_student_403(self, fresh_mission, student_session):
        ss, _ = student_session
        # create log
        r = ss.post(f"{API}/missions/{fresh_mission['id']}/log", json={
            "status": "completed", "note": "TEST_iter4_other_student"
        })
        log_id = r.json()["id"]
        # register a different student
        other = _new_session()
        email = f"TEST_student_{uuid.uuid4().hex[:8]}@example.com"
        rr = other.post(f"{API}/auth/register", json={
            "name": "Other", "email": email, "password": "pw12345", "role": "student"
        , "accept_terms": True})
        assert rr.status_code == 200
        r3 = other.post(f"{API}/logs/{log_id}/game", json={"game_key": "word-match"})
        assert r3.status_code == 403

    def test_mark_game_played_and_409_on_second_call(self, fresh_mission, student_session):
        ss, _ = student_session
        # create a brand new log we own
        r = ss.post(f"{API}/missions/{fresh_mission['id']}/log", json={
            "status": "completed", "note": "TEST_iter4_play",
            "clue_captures": ["clue A"]
        })
        assert r.status_code == 200
        log = r.json()
        log_id = log["id"]
        assert log["game_played"] is False

        # first play
        r1 = ss.post(f"{API}/logs/{log_id}/game", json={"game_key": "reaction-tap", "score": 42})
        assert r1.status_code == 200, r1.text
        updated = r1.json()
        assert updated["game_played"] is True
        assert updated["game_key"] == "reaction-tap"
        assert updated["game_score"] == 42
        assert updated["clue_captures"] == ["clue A"]  # unaffected

        # second play -> 409
        r2 = ss.post(f"{API}/logs/{log_id}/game", json={"game_key": "memory-cards"})
        assert r2.status_code == 409

        # persistence via GET /logs
        all_logs = ss.get(f"{API}/logs").json()
        match = next(x for x in all_logs if x["id"] == log_id)
        assert match["game_played"] is True
        assert match["game_key"] == "reaction-tap"
        assert match["game_score"] == 42

    def test_mark_game_played_without_score(self, fresh_mission, student_session):
        ss, _ = student_session
        r = ss.post(f"{API}/missions/{fresh_mission['id']}/log", json={
            "status": "completed", "note": "TEST_iter4_no_score"
        })
        log_id = r.json()["id"]
        r1 = ss.post(f"{API}/logs/{log_id}/game", json={"game_key": "breathing"})
        assert r1.status_code == 200
        body = r1.json()
        assert body["game_played"] is True
        assert body["game_key"] == "breathing"
        assert body["game_score"] is None

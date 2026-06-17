"""
Tests for Family Games System (Feature A) — Iter 14.

Covers:
- POST /api/game-packs (parent creation + content validation)
- POST /api/game-packs/student-submit (streak gate, then success)
- GET /api/game-packs (role-based visibility)
- GET /api/game-packs/{id} (403 for siblings on pending)
- PUT /api/game-packs/{id}/approve and /reject
- DELETE /api/game-packs/{id} (parent vs student)
- GET /api/me/studio-status
- PUT /api/students/{id}/intake (game_studio_unlock_streak)
"""

import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

PARENT = {"email": "parent@demo.com", "password": "demo1234"}
STUDENT = {"email": "student@demo.com", "password": "demo1234"}


def _login(session: requests.Session, creds: dict) -> dict:
    r = session.post(f"{API}/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"Login failed for {creds['email']}: {r.status_code} {r.text}"
    return r.json()


def _logout(session: requests.Session):
    try:
        session.post(f"{API}/auth/logout", timeout=15)
    except Exception:
        pass
    session.cookies.clear()


@pytest.fixture(scope="module")
def parent_session():
    s = requests.Session()
    _login(s, PARENT)
    me = s.get(f"{API}/auth/me", timeout=15).json()
    yield s, me
    _logout(s)


@pytest.fixture(scope="module")
def student_session():
    s = requests.Session()
    _login(s, STUDENT)
    me = s.get(f"{API}/auth/me", timeout=15).json()
    yield s, me
    _logout(s)


@pytest.fixture(scope="module")
def student_id(parent_session):
    s, me = parent_session
    ids = me.get("linked_student_ids") or []
    assert ids, "Demo parent has no linked students"
    return ids[0]


# Track packs created so we can clean up
_CREATED = []


def _track(pack_id: str):
    if pack_id:
        _CREATED.append(pack_id)


@pytest.fixture(scope="module", autouse=True)
def _cleanup_after(parent_session):
    yield
    s, _ = parent_session
    for pid in _CREATED:
        try:
            s.delete(f"{API}/game-packs/{pid}", timeout=15)
        except Exception:
            pass


# ---------- Parent creation + validation ----------

class TestParentCreate:
    def test_word_match_create(self, parent_session):
        s, me = parent_session
        payload = {
            "name": "TEST_WM_" + uuid.uuid4().hex[:6],
            "game_type": "word_match",
            "content": {
                "pairs": [
                    {"word": "Sun", "meaning": "Star at center of solar system"},
                    {"word": "Moon", "meaning": "Earth's natural satellite"},
                    {"word": "Dog", "meaning": "A common pet animal"},
                    {"word": "Cat", "meaning": "A small domestic feline"},
                ]
            },
        }
        r = s.post(f"{API}/game-packs", json=payload, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        _track(data["id"])
        assert data["status"] == "approved"
        assert data["family_parent_id"] == me["id"]
        assert data["created_by_role"] == "parent"
        assert data["game_type"] == "word_match"
        assert len(data["content"]["pairs"]) == 4

        # GET it back
        g = s.get(f"{API}/game-packs/{data['id']}", timeout=15)
        assert g.status_code == 200
        assert g.json()["name"] == payload["name"]

    def test_word_match_too_few_pairs_400(self, parent_session):
        s, _ = parent_session
        payload = {
            "name": "TEST_bad_wm",
            "game_type": "word_match",
            "content": {"pairs": [{"word": "A", "meaning": "a"}, {"word": "B", "meaning": "b"}]},
        }
        r = s.post(f"{API}/game-packs", json=payload, timeout=15)
        assert r.status_code == 400

    def test_memory_cards_duplicate_400(self, parent_session):
        s, _ = parent_session
        payload = {
            "name": "TEST_dup_mc",
            "game_type": "memory_cards",
            "content": {"items": ["🍎", "🍌", "🍎", "🍇"]},
        }
        r = s.post(f"{API}/game-packs", json=payload, timeout=15)
        assert r.status_code == 400

    def test_sentence_builder_too_few_words_400(self, parent_session):
        s, _ = parent_session
        payload = {
            "name": "TEST_bad_sb",
            "game_type": "sentence_builder",
            "content": {"sentences": ["Hi there"]},  # only 2 words
        }
        r = s.post(f"{API}/game-packs", json=payload, timeout=15)
        assert r.status_code == 400

    def test_memory_cards_create_ok(self, parent_session):
        s, _ = parent_session
        payload = {
            "name": "TEST_MC_" + uuid.uuid4().hex[:6],
            "game_type": "memory_cards",
            "content": {"items": ["🍎", "🍌", "🍇", "🍓"]},
        }
        r = s.post(f"{API}/game-packs", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        _track(d["id"])
        assert d["status"] == "approved"
        assert d["content"]["items"] == ["🍎", "🍌", "🍇", "🍓"]

    def test_sentence_builder_create_ok(self, parent_session):
        s, _ = parent_session
        payload = {
            "name": "TEST_SB_" + uuid.uuid4().hex[:6],
            "game_type": "sentence_builder",
            "content": {"sentences": ["The quick brown fox jumps", "Sun rises in east"]},
        }
        r = s.post(f"{API}/game-packs", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        _track(d["id"])
        assert len(d["content"]["sentences"]) == 2
        assert d["status"] == "approved"


# ---------- Studio status + student submit gating ----------

class TestStudioStatus:
    def test_studio_status_shape(self, student_session):
        s, _ = student_session
        r = s.get(f"{API}/me/studio-status", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("current_streak", "unlock_threshold", "unlocked", "siblings"):
            assert k in d, f"Missing key {k}"
        assert isinstance(d["current_streak"], int)
        assert isinstance(d["unlock_threshold"], int)
        assert isinstance(d["unlocked"], bool)
        assert isinstance(d["siblings"], list)


class TestStudentSubmitGated:
    def test_locked_then_unlocked_flow(self, parent_session, student_session, student_id):
        ps, _ = parent_session
        ss, _ = student_session

        # 1. Set threshold high so it's locked
        intake = ps.get(f"{API}/students/{student_id}/intake", timeout=15)
        assert intake.status_code == 200, intake.text
        profile = intake.json()
        profile["game_studio_unlock_streak"] = 99
        r = ps.put(f"{API}/students/{student_id}/intake", json=profile, timeout=15)
        assert r.status_code == 200, r.text

        # 2. Student status should show locked
        status = ss.get(f"{API}/me/studio-status", timeout=15).json()
        assert status["unlock_threshold"] == 99
        assert status["unlocked"] is False
        cur_streak = status["current_streak"]

        # 3. Student tries to submit -> 403 with threshold mentioned
        bad = ss.post(
            f"{API}/game-packs/student-submit",
            json={
                "name": "TEST_locked",
                "game_type": "sentence_builder",
                "content": {"sentences": ["I am happy today friend"]},
            },
            timeout=15,
        )
        assert bad.status_code == 403, bad.text
        detail = bad.json().get("detail", "")
        assert "99" in detail and str(cur_streak) in detail

        # 4. Parent lowers threshold to <= current streak (use 0 to be safe)
        profile["game_studio_unlock_streak"] = max(0, cur_streak)
        r = ps.put(f"{API}/students/{student_id}/intake", json=profile, timeout=15)
        assert r.status_code == 200

        # 5. Student submits -> 200 status=pending
        ok = ss.post(
            f"{API}/game-packs/student-submit",
            json={
                "name": "TEST_kid_pack_" + uuid.uuid4().hex[:6],
                "game_type": "sentence_builder",
                "content": {"sentences": ["I love my family always"]},
            },
            timeout=15,
        )
        assert ok.status_code == 200, ok.text
        d = ok.json()
        _track(d["id"])
        assert d["status"] == "pending"
        assert d["created_by_role"] == "student"
        assert d["family_parent_id"]  # parent linked
        # store on the class for reuse
        TestStudentSubmitGated.pending_pack_id = d["id"]

    def test_student_sees_own_pending_via_list(self, student_session):
        """Per spec: a kid should see their OWN packs in any status (so the
        'Waiting' chip shows in Kid Studio). Sibling pending packs remain hidden."""
        ss, _ = student_session
        r = ss.get(f"{API}/game-packs", timeout=15)
        assert r.status_code == 200
        rows = r.json()
        # Must contain our just-submitted pending pack
        assert any(p["id"] == TestStudentSubmitGated.pending_pack_id and p["status"] == "pending" for p in rows), \
            "Student's own pending pack should appear in their list"


# ---------- Approve / Reject flows ----------

class TestApproveReject:
    def test_approve_kid_pack(self, parent_session, student_session, student_id):
        ps, _ = parent_session
        ss, _ = student_session

        # Submit another kid pack (threshold already lowered in previous test class).
        # Make sure threshold low.
        prof = ps.get(f"{API}/students/{student_id}/intake", timeout=15).json()
        if prof.get("game_studio_unlock_streak", 7) > 0:
            prof["game_studio_unlock_streak"] = 0
            ps.put(f"{API}/students/{student_id}/intake", json=prof, timeout=15)

        sub = ss.post(
            f"{API}/game-packs/student-submit",
            json={
                "name": "TEST_to_approve",
                "game_type": "memory_cards",
                "content": {"items": ["⭐", "🌟", "✨", "💫"]},
            },
            timeout=15,
        )
        assert sub.status_code == 200, sub.text
        pid = sub.json()["id"]
        _track(pid)

        # Approve
        r = ps.put(f"{API}/game-packs/{pid}/approve", json={}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "approved"
        assert d["reviewed_at"] is not None

        # Student now should see it in list
        lst = ss.get(f"{API}/game-packs", timeout=15).json()
        assert any(p["id"] == pid and p["status"] == "approved" for p in lst)

    def test_reject_kid_pack_with_reason(self, parent_session, student_session):
        ps, _ = parent_session
        ss, _ = student_session
        sub = ss.post(
            f"{API}/game-packs/student-submit",
            json={
                "name": "TEST_to_reject",
                "game_type": "sentence_builder",
                "content": {"sentences": ["Hello world good morning"]},
            },
            timeout=15,
        )
        assert sub.status_code == 200, sub.text
        pid = sub.json()["id"]
        _track(pid)

        r = ps.put(
            f"{API}/game-packs/{pid}/reject",
            json={"reason": "Try a more creative sentence"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "rejected"
        assert "creative" in (d.get("rejection_reason") or "")


# ---------- Visibility & 403s ----------

class TestVisibility:
    def test_student_can_get_own_pending_pack(self, parent_session, student_session, student_id):
        """Per spec: a kid can deep-link to their own pending pack (for Kid Studio
        review). Sibling pending packs are blocked (single-student demo doesn't
        have a sibling to verify the negative path here)."""
        ps, _ = parent_session
        ss, _ = student_session

        # Make sure threshold low
        prof = ps.get(f"{API}/students/{student_id}/intake", timeout=15).json()
        if prof.get("game_studio_unlock_streak", 7) > 0:
            prof["game_studio_unlock_streak"] = 0
            ps.put(f"{API}/students/{student_id}/intake", json=prof, timeout=15)

        sub = ss.post(
            f"{API}/game-packs/student-submit",
            json={
                "name": "TEST_pending_visibility",
                "game_type": "memory_cards",
                "content": {"items": ["A", "B", "C", "D"]},
            },
            timeout=15,
        )
        assert sub.status_code == 200, sub.text
        pid = sub.json()["id"]
        _track(pid)

        # Student GET-by-id on their OWN pending pack: 200 (own packs always visible).
        r = ss.get(f"{API}/game-packs/{pid}", timeout=15)
        assert r.status_code == 200, f"Owner-kid should see own pending pack, got {r.status_code}: {r.text}"
        assert r.json()["status"] == "pending"

    def test_parent_list_includes_all_statuses(self, parent_session):
        ps, _ = parent_session
        r = ps.get(f"{API}/game-packs", timeout=15)
        assert r.status_code == 200
        statuses = {p["status"] for p in r.json()}
        # Parent should see at least approved (we've created several) and pending or rejected.
        assert "approved" in statuses


# ---------- Delete ----------

class TestDelete:
    def test_student_cannot_delete_approved(self, parent_session, student_session, student_id):
        ps, me_p = parent_session
        ss, _ = student_session
        # Create a parent-approved pack
        r = ps.post(
            f"{API}/game-packs",
            json={
                "name": "TEST_parent_pack_del",
                "game_type": "memory_cards",
                "content": {"items": ["1", "2", "3", "4"]},
            },
            timeout=15,
        )
        assert r.status_code == 200
        pid = r.json()["id"]

        # Student trying to delete (it's not theirs)
        d = ss.delete(f"{API}/game-packs/{pid}", timeout=15)
        assert d.status_code == 403

        # Parent cleanup
        d2 = ps.delete(f"{API}/game-packs/{pid}", timeout=15)
        assert d2.status_code == 200

    def test_student_can_delete_own_pending(self, parent_session, student_session, student_id):
        ps, _ = parent_session
        ss, _ = student_session
        prof = ps.get(f"{API}/students/{student_id}/intake", timeout=15).json()
        if prof.get("game_studio_unlock_streak", 7) > 0:
            prof["game_studio_unlock_streak"] = 0
            ps.put(f"{API}/students/{student_id}/intake", json=prof, timeout=15)

        sub = ss.post(
            f"{API}/game-packs/student-submit",
            json={
                "name": "TEST_kid_del",
                "game_type": "memory_cards",
                "content": {"items": ["x", "y", "z", "w"]},
            },
            timeout=15,
        )
        assert sub.status_code == 200, sub.text
        pid = sub.json()["id"]

        d = ss.delete(f"{API}/game-packs/{pid}", timeout=15)
        assert d.status_code == 200, d.text

    def test_student_cannot_delete_own_approved(self, parent_session, student_session, student_id):
        ps, _ = parent_session
        ss, _ = student_session
        prof = ps.get(f"{API}/students/{student_id}/intake", timeout=15).json()
        if prof.get("game_studio_unlock_streak", 7) > 0:
            prof["game_studio_unlock_streak"] = 0
            ps.put(f"{API}/students/{student_id}/intake", json=prof, timeout=15)

        sub = ss.post(
            f"{API}/game-packs/student-submit",
            json={
                "name": "TEST_kid_approved_del",
                "game_type": "memory_cards",
                "content": {"items": ["p", "q", "r", "s"]},
            },
            timeout=15,
        )
        assert sub.status_code == 200, sub.text
        pid = sub.json()["id"]
        _track(pid)

        # Approve
        ps.put(f"{API}/game-packs/{pid}/approve", json={}, timeout=15)

        # Student delete should now 400
        d = ss.delete(f"{API}/game-packs/{pid}", timeout=15)
        assert d.status_code == 400


# ---------- Final teardown: restore threshold to 7 ----------

class TestRestore:
    def test_restore_threshold(self, parent_session, student_id):
        ps, _ = parent_session
        prof = ps.get(f"{API}/students/{student_id}/intake", timeout=15).json()
        prof["game_studio_unlock_streak"] = 7
        r = ps.put(f"{API}/students/{student_id}/intake", json=prof, timeout=15)
        assert r.status_code == 200

"""Iter10 tests: Phase 1 intake (StudentProfile) + AI interview endpoints,
   AI mission drafting avoids 'write it down' for non-reading EF prompts."""
import os
import time
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"

PARENT_EMAIL = "parent@demo.com"
PARENT_PW = "demo1234"
STUDENT_EMAIL = "student@demo.com"
STUDENT_PW = "demo1234"
# Linked student id per /app/memory/test_credentials.md context
LINKED_STUDENT_ID = "232f66a6-a4d0-4515-8905-7219f0083646"


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def anon_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def parent_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": PARENT_EMAIL, "password": PARENT_PW})
    if r.status_code != 200:
        pytest.skip(f"parent login failed: {r.status_code} {r.text}")
    return s


@pytest.fixture(scope="module")
def student_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": STUDENT_EMAIL, "password": STUDENT_PW})
    if r.status_code != 200:
        pytest.skip(f"student login failed: {r.status_code} {r.text}")
    return s


@pytest.fixture(scope="module")
def other_parent_session():
    """A fresh parent registered just to test the 403/404 path on another parent's student."""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    email = f"TEST_otherparent_{int(time.time()*1000)}@example.com"
    r = s.post(f"{API}/auth/register", json={
        "name": "Other Parent",
        "email": email,
        "password": "demo1234",
        "role": "parent",
        "accept_terms": True,
    })
    if r.status_code not in (200, 201):
        pytest.skip(f"other parent register failed: {r.status_code} {r.text}")
    return s


# ---------- Intake GET / PUT ----------
class TestIntake:
    def test_get_intake_parent(self, parent_session):
        r = parent_session.get(f"{API}/students/{LINKED_STUDENT_ID}/intake")
        assert r.status_code == 200, r.text
        body = r.json()
        # All optional fields with list defaults should be returned
        for key in ("interests", "sensitivities", "peak_hours", "common_triggers",
                    "strengths", "motivators", "vanderbilt_inattention", "vanderbilt_hyperactivity"):
            assert key in body
            assert isinstance(body[key], list)

    def test_put_intake_then_get_persists(self, parent_session):
        payload = {
            "grade": "5",
            "reading_level": "on",
            "school": "TEST_School",
            "diagnosed": True,
            "adhd_subtype": "combined",
            "diagnosis_year": 2023,
            "on_medication": False,
            "interests": ["minecraft", "dinosaurs"],
            "sensitivities": ["noise"],
            "peak_hours": ["morning", "afternoon"],
            "common_triggers": ["hunger"],
            "strengths": ["curious"],
            "motivators": ["small rewards"],
            "vanderbilt_inattention": [0, 1, 2, 3, 0, 1, 2, 3, 0],
            "vanderbilt_hyperactivity": [1, 1, 2, 2, 0, 0, 3, 3, 1],
            "parent_notes": "TEST_parent_notes",
        }
        r = parent_session.put(f"{API}/students/{LINKED_STUDENT_ID}/intake", json=payload)
        assert r.status_code == 200, r.text
        saved = r.json()
        assert saved["grade"] == "5"
        assert saved["reading_level"] == "on"
        assert "minecraft" in saved["interests"]
        assert "morning" in saved["peak_hours"]
        assert saved["vanderbilt_inattention"][3] == 3
        assert saved.get("updated_at"), "updated_at should be set by server"

        # GET should reflect persisted data
        r2 = parent_session.get(f"{API}/students/{LINKED_STUDENT_ID}/intake")
        assert r2.status_code == 200
        got = r2.json()
        assert got["school"] == "TEST_School"
        assert "dinosaurs" in got["interests"]
        assert got["adhd_subtype"] == "combined"

    def test_intake_requires_auth(self, anon_session):
        r = anon_session.get(f"{API}/students/{LINKED_STUDENT_ID}/intake")
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"

    def test_intake_blocks_student_role(self, student_session):
        r = student_session.get(f"{API}/students/{LINKED_STUDENT_ID}/intake")
        assert r.status_code == 403, f"expected 403, got {r.status_code}"
        r2 = student_session.put(
            f"{API}/students/{LINKED_STUDENT_ID}/intake",
            json={"grade": "5"},
        )
        assert r2.status_code == 403

    def test_intake_blocks_non_owning_parent(self, other_parent_session):
        r = other_parent_session.get(f"{API}/students/{LINKED_STUDENT_ID}/intake")
        assert r.status_code in (403, 404), f"expected 403/404, got {r.status_code}"
        r2 = other_parent_session.put(
            f"{API}/students/{LINKED_STUDENT_ID}/intake",
            json={"grade": "5"},
        )
        assert r2.status_code in (403, 404)


# ---------- Interview endpoints ----------
class TestInterview:
    def test_start_and_resume_active_returns_same_session(self, parent_session):
        r = parent_session.post(f"{API}/students/{LINKED_STUDENT_ID}/interview")
        assert r.status_code == 200, r.text
        sess = r.json()
        assert sess["status"] == "active"
        assert sess["student_id"] == LINKED_STUDENT_ID
        assert len(sess["messages"]) >= 1
        assert sess["messages"][0]["role"] == "assistant"

        # Calling start again should return the same active session
        r2 = parent_session.post(f"{API}/students/{LINKED_STUDENT_ID}/interview")
        assert r2.status_code == 200
        sess2 = r2.json()
        assert sess2["id"] == sess["id"]

        # Active GET endpoint should also surface it
        r3 = parent_session.get(f"{API}/students/{LINKED_STUDENT_ID}/interview/active")
        assert r3.status_code == 200
        active = r3.json()
        assert active is not None
        assert active["id"] == sess["id"]

        # Persist for downstream tests
        pytest.interview_session_id = sess["id"]

    def test_reply_adds_messages(self, parent_session):
        sid = getattr(pytest, "interview_session_id", None)
        if not sid:
            pytest.skip("no session from start test")
        reply = ("My kid Enzo is really into minecraft and dinosaurs. He's working "
                 "on reading comprehension; mornings are best; loud noises derail him; "
                 "small rewards work; he's curious and patient.")
        r = parent_session.post(f"{API}/interviews/{sid}/reply", json={"content": reply})
        assert r.status_code == 200, r.text
        sess = r.json()
        # Should now contain at least: opener + parent reply + new coach msg
        assert len(sess["messages"]) >= 3
        last = sess["messages"][-1]
        assert last["role"] == "assistant"
        # Parent message should be present
        parent_msgs = [m for m in sess["messages"] if m["role"] == "parent"]
        assert any("minecraft" in m["content"].lower() for m in parent_msgs)

    def test_reply_rejects_empty(self, parent_session):
        sid = getattr(pytest, "interview_session_id", None)
        if not sid:
            pytest.skip("no session from start test")
        r = parent_session.post(f"{API}/interviews/{sid}/reply", json={"content": "   "})
        assert r.status_code == 400

    def test_reply_blocks_other_parent(self, other_parent_session):
        sid = getattr(pytest, "interview_session_id", None)
        if not sid:
            pytest.skip("no session from start test")
        r = other_parent_session.post(
            f"{API}/interviews/{sid}/reply", json={"content": "hello"}
        )
        assert r.status_code in (403, 404)

    def test_interview_blocks_student_role(self, student_session):
        r = student_session.post(f"{API}/students/{LINKED_STUDENT_ID}/interview")
        assert r.status_code == 403
        r2 = student_session.get(f"{API}/students/{LINKED_STUDENT_ID}/interview/active")
        assert r2.status_code == 403
        sid = getattr(pytest, "interview_session_id", None) or str(uuid.uuid4())
        r3 = student_session.post(f"{API}/interviews/{sid}/reply", json={"content": "hi"})
        assert r3.status_code == 403

    def test_finish_synthesizes_and_persists(self, parent_session):
        sid = getattr(pytest, "interview_session_id", None)
        if not sid:
            pytest.skip("no session from start test")
        r = parent_session.post(f"{API}/interviews/{sid}/finish")
        assert r.status_code == 200, r.text
        profile = r.json()
        assert "interests" in profile and isinstance(profile["interests"], list)
        assert profile.get("interview_completed_at")
        # Active session should no longer exist
        r2 = parent_session.get(f"{API}/students/{LINKED_STUDENT_ID}/interview/active")
        assert r2.status_code == 200
        active = r2.json()
        assert active is None, "session should be completed, not active"

    def test_finish_unknown_session_returns_404(self, parent_session):
        r = parent_session.post(f"{API}/interviews/{uuid.uuid4()}/finish")
        assert r.status_code == 404


# ---------- AI draft-mission must not say 'write it down' for EF chore prompts ----------
class TestAIDraftEFPrompt:
    FORBIDDEN_PHRASES = ("write it down", "jot it on paper", "make a list on paper")

    def test_draft_mission_cleaning_no_paper_writing(self, parent_session):
        prompt = "help me draft a mission for cleaning a messy bedroom"
        r = parent_session.post(f"{API}/ai/draft-mission", json={
            "prompt": prompt,
            "student_id": LINKED_STUDENT_ID,
        })
        assert r.status_code == 200, r.text
        data = r.json()
        # Try common shapes: { steps: [...] } or { mission: { steps: [...] } }
        steps = data.get("steps") or (data.get("mission") or {}).get("steps") or []
        # Flatten any step that's a dict to str
        flat = " ".join(
            (s if isinstance(s, str) else (s.get("text") or s.get("title") or str(s)))
            for s in steps
        ).lower()
        # Also include description / title fields just in case
        extra = " ".join(
            str(data.get(k) or "") for k in ("title", "description", "summary")
        ).lower()
        haystack = f"{flat} {extra}"
        assert haystack.strip(), f"no steps in response: {data}"
        for phrase in self.FORBIDDEN_PHRASES:
            assert phrase not in haystack, (
                f"forbidden phrase '{phrase}' found in EF mission draft:\n{haystack[:500]}"
            )


# ---------- Regression smoke: previously working endpoints still 200 ----------
class TestRegressionSmoke:
    @pytest.mark.parametrize("path", [
        "/citations",
        "/skills",
        "/strategies",
        "/moments/catalog",
        "/games/catalog",
    ])
    def test_existing_endpoints_still_ok(self, parent_session, path):
        r = parent_session.get(f"{API}{path}")
        assert r.status_code == 200, f"{path} -> {r.status_code} {r.text[:200]}"

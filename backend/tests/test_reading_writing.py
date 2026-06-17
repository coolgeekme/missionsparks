"""Tests for adaptive content generation: reading passages, writing prompts,
portfolio aggregation, and audio transcribe (iter12)."""
import io
import os
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
PARENT_EMAIL = "parent@demo.com"
PARENT_PW = "demo1234"
STUDENT_EMAIL = "student@demo.com"
STUDENT_PW = "demo1234"
ENZO_ID = "232f66a6-a4d0-4515-8905-7219f0083646"


# --- auth helpers ---
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
    email = f"TEST_op_rw_{int(time.time())}@example.com"
    s = requests.Session()
    r = s.post(f"{API}/auth/register", json={
        "name": "Other Parent", "email": email, "password": "demo1234",
        "role": "parent", "accept_terms": True,
    })
    assert r.status_code in (200, 201), r.text
    return s


# --- shared module-level passage/piece (so we don't burn LLM calls per test) ---
@pytest.fixture(scope="module")
def passage(parent):
    r = parent.post(f"{API}/reading/passage",
                    json={"student_id": ENZO_ID, "topic_hint": "minecraft"})
    assert r.status_code == 200, f"generate passage failed: {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="module")
def writing_piece(parent):
    r = parent.post(f"{API}/writing/prompt",
                    json={"student_id": ENZO_ID, "topic_hint": "soccer"})
    assert r.status_code == 200, f"generate writing prompt failed: {r.status_code} {r.text}"
    return r.json()


# ========== Reading: generation ==========
class TestReadingPassageGeneration:
    def test_generate_passage_shape(self, passage):
        # Required fields
        for k in ("id", "student_id", "parent_id", "title", "topic", "level",
                  "grade_target", "word_count", "body", "questions", "citations", "created_at"):
            assert k in passage, f"missing {k}"
        assert passage["student_id"] == ENZO_ID
        assert isinstance(passage["body"], str) and len(passage["body"]) > 0
        wc = len(passage["body"].split())
        # 120-200 word target — allow ±25 wiggle since LLM is fuzzy
        assert 95 <= wc <= 230, f"word count {wc} outside reasonable bounds"

    def test_questions_count_and_types(self, passage):
        qs = passage["questions"]
        assert 4 <= len(qs) <= 5, f"expected 4-5 questions, got {len(qs)}"
        for q in qs:
            assert "id" in q and "text" in q and "type" in q
            assert q["type"] in ("literal", "inferential", "vocabulary")

    def test_citations_resolved(self, passage):
        # Backend asks for 4 specific citation keys
        assert isinstance(passage["citations"], list)
        assert len(passage["citations"]) >= 1, "expected at least one citation id resolved"

    def test_level_resolves_from_profile(self, parent, passage):
        # Read the actual student profile and validate grade_target follows
        # the resolver formula: on => grade N, below => N-1, above => N+1.
        ip = parent.get(f"{API}/students/{ENZO_ID}/intake").json()
        grade = int(str(ip.get("grade") or "3"))
        assert passage["level"] == (ip.get("reading_level") or "on")
        assert passage["grade_target"].startswith(str(grade))

    def test_level_override_below(self, parent):
        ip = parent.get(f"{API}/students/{ENZO_ID}/intake").json()
        grade = int(str(ip.get("grade") or "3"))
        r = parent.post(f"{API}/reading/passage",
                        json={"student_id": ENZO_ID, "topic_hint": "lego",
                              "level_override": "below"})
        assert r.status_code == 200
        data = r.json()
        assert data["level"] == "below"
        assert data["grade_target"].startswith(str(grade - 1))

    def test_level_override_above(self, parent):
        ip = parent.get(f"{API}/students/{ENZO_ID}/intake").json()
        grade = int(str(ip.get("grade") or "3"))
        r = parent.post(f"{API}/reading/passage",
                        json={"student_id": ENZO_ID, "topic_hint": "space",
                              "level_override": "above"})
        assert r.status_code == 200
        data = r.json()
        assert data["level"] == "above"
        assert data["grade_target"].startswith(str(grade + 1))


# ========== Reading: authz ==========
class TestReadingAuthz:
    def test_non_owning_parent_rejected(self, other_parent):
        r = other_parent.post(f"{API}/reading/passage",
                              json={"student_id": ENZO_ID, "topic_hint": "x"})
        assert r.status_code in (403, 404), f"got {r.status_code}"

    def test_student_role_rejected_on_generate(self, student):
        r = student.post(f"{API}/reading/passage",
                         json={"student_id": ENZO_ID, "topic_hint": "x"})
        assert r.status_code == 403

    def test_anonymous_rejected(self):
        r = requests.post(f"{API}/reading/passage",
                          json={"student_id": ENZO_ID})
        assert r.status_code == 401


# ========== Reading: submit answers ==========
class TestReadingAnswerSubmission:
    def test_parent_can_submit(self, parent, passage):
        # Generate a fresh passage just for this test (so it isn't already-submitted)
        r0 = parent.post(f"{API}/reading/passage",
                         json={"student_id": ENZO_ID, "topic_hint": "dogs"})
        assert r0.status_code == 200
        p = r0.json()
        answers = {q["id"]: q.get("answer_key", "something") for q in p["questions"]}
        r = parent.post(f"{API}/reading/passage/{p['id']}/answer",
                        json={"answers": answers})
        assert r.status_code == 200, r.text
        fb = r.json()
        assert "per_question" in fb and "overall" in fb
        assert "score" in fb and "total" in fb
        assert fb["total"] == len(p["questions"])
        assert isinstance(fb["score"], int)
        assert 0 <= fb["score"] <= fb["total"]
        for item in fb["per_question"]:
            assert "question_id" in item and "correct" in item and "feedback" in item

        # GET passage shows persisted answers / feedback / score
        r2 = parent.get(f"{API}/reading/passage/{p['id']}")
        assert r2.status_code == 200
        d = r2.json()
        assert d.get("answers") == answers
        assert d.get("score") == fb["score"]
        assert d.get("total") == fb["total"]
        assert d.get("feedback") is not None
        assert d.get("completed_at")

    def test_student_can_submit(self, parent, student):
        # parent must create the passage; student then submits
        r0 = parent.post(f"{API}/reading/passage",
                         json={"student_id": ENZO_ID, "topic_hint": "trains"})
        assert r0.status_code == 200
        p = r0.json()
        answers = {q["id"]: "I don't know" for q in p["questions"]}
        r = student.post(f"{API}/reading/passage/{p['id']}/answer",
                         json={"answers": answers})
        assert r.status_code == 200, r.text

    def test_other_parent_cannot_submit(self, parent, other_parent):
        r0 = parent.post(f"{API}/reading/passage",
                         json={"student_id": ENZO_ID, "topic_hint": "art"})
        assert r0.status_code == 200
        p = r0.json()
        r = other_parent.post(f"{API}/reading/passage/{p['id']}/answer",
                              json={"answers": {}})
        assert r.status_code == 403

    def test_passage_not_found(self, parent):
        r = parent.post(f"{API}/reading/passage/does-not-exist/answer",
                        json={"answers": {}})
        assert r.status_code == 404


# ========== Writing ==========
class TestWritingPrompt:
    def test_generate_shape(self, writing_piece):
        for k in ("id", "student_id", "parent_id", "prompt", "scaffold",
                  "sentence_starters", "topic", "level", "citations", "draft",
                  "feedback", "created_at"):
            assert k in writing_piece, f"missing {k}"
        assert writing_piece["student_id"] == ENZO_ID
        assert 3 <= len(writing_piece["scaffold"]) <= 6
        assert 3 <= len(writing_piece["sentence_starters"]) <= 6
        assert writing_piece["draft"] == ""
        assert writing_piece["feedback"] == ""
        assert writing_piece["submitted_at"] in (None, "")

    def test_level_override_below(self, parent):
        r = parent.post(f"{API}/writing/prompt",
                        json={"student_id": ENZO_ID, "level_override": "below"})
        assert r.status_code == 200
        assert r.json()["level"] == "below"

    def test_non_owning_parent_rejected(self, other_parent):
        r = other_parent.post(f"{API}/writing/prompt",
                              json={"student_id": ENZO_ID})
        assert r.status_code in (403, 404)

    def test_student_role_rejected(self, student):
        r = student.post(f"{API}/writing/prompt",
                         json={"student_id": ENZO_ID})
        assert r.status_code == 403


class TestWritingSubmit:
    def test_submit_draft(self, parent):
        r0 = parent.post(f"{API}/writing/prompt",
                         json={"student_id": ENZO_ID, "topic_hint": "pets"})
        assert r0.status_code == 200
        piece = r0.json()
        draft = "My dog is brown. He likes to chase the ball. He is funny."
        r = parent.post(f"{API}/writing/piece/{piece['id']}/submit",
                        json={"draft": draft})
        assert r.status_code == 200, r.text
        out = r.json()
        assert out["draft"] == draft
        assert out["feedback"], "feedback should not be empty"
        assert out["submitted_at"]

        # Persisted via GET
        r2 = parent.get(f"{API}/writing/piece/{piece['id']}")
        assert r2.status_code == 200
        assert r2.json()["draft"] == draft
        assert r2.json()["feedback"]

    def test_student_can_submit(self, parent, student):
        r0 = parent.post(f"{API}/writing/prompt",
                         json={"student_id": ENZO_ID, "topic_hint": "rainy day"})
        piece = r0.json()
        r = student.post(f"{API}/writing/piece/{piece['id']}/submit",
                         json={"draft": "Today it rained. I read a book."})
        assert r.status_code == 200

    def test_empty_draft_400(self, parent):
        r0 = parent.post(f"{API}/writing/prompt",
                         json={"student_id": ENZO_ID, "topic_hint": "music"})
        piece = r0.json()
        r = parent.post(f"{API}/writing/piece/{piece['id']}/submit",
                        json={"draft": "   "})
        assert r.status_code == 400

    def test_other_parent_cannot_submit(self, parent, other_parent):
        r0 = parent.post(f"{API}/writing/prompt",
                         json={"student_id": ENZO_ID, "topic_hint": "snow"})
        piece = r0.json()
        r = other_parent.post(f"{API}/writing/piece/{piece['id']}/submit",
                               json={"draft": "hello"})
        assert r.status_code == 403


# ========== Portfolio ==========
class TestPortfolio:
    def test_parent_sees_portfolio(self, parent, passage, writing_piece):
        r = parent.get(f"{API}/students/{ENZO_ID}/portfolio")
        assert r.status_code == 200
        data = r.json()
        assert "reading" in data and "writing" in data
        # passage & writing_piece fixtures should be present
        pids = [p["id"] for p in data["reading"]]
        wids = [w["id"] for w in data["writing"]]
        assert passage["id"] in pids
        assert writing_piece["id"] in wids

    def test_student_sees_own_portfolio(self, student):
        r = student.get(f"{API}/students/{ENZO_ID}/portfolio")
        assert r.status_code == 200
        d = r.json()
        assert "reading" in d and "writing" in d

    def test_other_parent_forbidden(self, other_parent):
        r = other_parent.get(f"{API}/students/{ENZO_ID}/portfolio")
        assert r.status_code in (403, 404)

    def test_anonymous_unauthorized(self):
        r = requests.get(f"{API}/students/{ENZO_ID}/portfolio")
        assert r.status_code == 401


# ========== Audio transcribe ==========
class TestAudioTranscribe:
    def test_empty_body_400(self, parent):
        # multipart with empty content
        files = {"audio": ("empty.webm", io.BytesIO(b""), "audio/webm")}
        r = parent.post(f"{API}/audio/transcribe", files=files)
        assert r.status_code == 400, f"got {r.status_code} {r.text}"

    def test_too_large_413(self, parent):
        # > 24 MB
        big = b"\x00" * (25 * 1024 * 1024)
        files = {"audio": ("big.webm", io.BytesIO(big), "audio/webm")}
        r = parent.post(f"{API}/audio/transcribe", files=files)
        assert r.status_code == 413, f"got {r.status_code} {r.text}"

    def test_anonymous_unauthorized(self):
        files = {"audio": ("x.webm", io.BytesIO(b"abc"), "audio/webm")}
        r = requests.post(f"{API}/audio/transcribe", files=files)
        assert r.status_code == 401


# ========== Regression smoke ==========
class TestRegressionSmoke:
    @pytest.mark.parametrize("path", [
        "/citations", "/skills", "/strategies",
        "/moments/catalog", "/games/catalog", "/public/stats",
    ])
    def test_catalog_endpoints(self, parent, path):
        # These require auth (per current backend); confirm they return 200 when authed.
        r = parent.get(f"{API}{path}")
        assert r.status_code == 200, f"{path} -> {r.status_code}"

    def test_public_stats_unauth(self):
        r = requests.get(f"{API}/public/stats")
        assert r.status_code == 200

    def test_intake_get(self, parent):
        r = parent.get(f"{API}/students/{ENZO_ID}/intake")
        assert r.status_code == 200

    def test_missions_list_today(self, parent):
        from datetime import date as _d
        r = parent.get(f"{API}/missions",
                       params={"student_id": ENZO_ID, "due_date": _d.today().isoformat()})
        assert r.status_code == 200

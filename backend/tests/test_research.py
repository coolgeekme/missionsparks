"""Tests for the Research / Citation library (Feb 2026 — research-backed feature).

Validates:
- /api/citations returns the seeded library
- skills/strategies surface evidence_refs aligned to the library
- /api/moments/catalog hydrates each entry with evidence_refs
- /api/games/catalog returns games with evidence_refs
- AI mission drafting (mocked via env skip if no key) attaches evidence
"""
import os
import pytest
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL", "https://mission-tracker-100.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE_URL}/api"

PARENT = {"email": "parent@demo.com", "password": "demo1234"}
STUDENT = {"email": "student@demo.com", "password": "demo1234"}


def _login(creds):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json=creds, timeout=10)
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def parent_sess():
    return _login(PARENT)


@pytest.fixture(scope="module")
def student_sess():
    return _login(STUDENT)


class TestCitationsEndpoint:
    def test_citations_listed_for_parent(self, parent_sess):
        r = parent_sess.get(f"{API}/citations", timeout=10)
        assert r.status_code == 200
        body = r.json()
        assert isinstance(body, list)
        assert len(body) >= 25, f"expected ~30 citations, got {len(body)}"
        # spot check schema
        c = body[0]
        for k in ("id", "key", "title", "authors", "year", "source", "source_type", "summary", "tags"):
            assert k in c, f"missing key {k}"
        assert c["source_type"] in {"peer_reviewed", "org", "guideline", "book"}

    def test_citations_listed_for_student(self, student_sess):
        # Read access is allowed (student UI doesn't surface, but API is benign + RO)
        r = student_sess.get(f"{API}/citations", timeout=10)
        assert r.status_code == 200
        assert len(r.json()) >= 25

    def test_citation_single_lookup(self, parent_sess):
        r = parent_sess.get(f"{API}/citations", timeout=10)
        c = r.json()[0]
        r2 = parent_sess.get(f"{API}/citations/{c['id']}", timeout=10)
        assert r2.status_code == 200
        assert r2.json()["id"] == c["id"]

    def test_citation_not_found(self, parent_sess):
        r = parent_sess.get(f"{API}/citations/does-not-exist", timeout=10)
        assert r.status_code == 404

    def test_no_anonymous_access(self):
        r = requests.get(f"{API}/citations", timeout=10)
        assert r.status_code == 401

    def test_includes_authoritative_orgs(self, parent_sess):
        body = parent_sess.get(f"{API}/citations", timeout=10).json()
        source_types = {c["source_type"] for c in body}
        assert "peer_reviewed" in source_types
        assert "org" in source_types
        assert "guideline" in source_types
        # CDC/NIMH must be present (proves the curated mix)
        keys = {c["key"] for c in body}
        assert "cdc_adhd" in keys
        assert "nimh_adhd" in keys
        assert "aap_2019_adhd_guideline" in keys


class TestSkillsAndStrategiesEvidence:
    def test_skills_have_evidence_refs(self, parent_sess):
        r = parent_sess.get(f"{API}/skills", timeout=10)
        assert r.status_code == 200
        skills = r.json()
        assert len(skills) >= 8
        for s in skills:
            assert "evidence_refs" in s
            assert isinstance(s["evidence_refs"], list)
            assert len(s["evidence_refs"]) >= 1, f"skill {s['name']} has no citations"

    def test_strategies_have_evidence_refs(self, parent_sess):
        r = parent_sess.get(f"{API}/strategies", timeout=10)
        assert r.status_code == 200
        strategies = r.json()
        assert len(strategies) >= 9
        for s in strategies:
            assert "evidence_refs" in s
            assert isinstance(s["evidence_refs"], list)
            assert len(s["evidence_refs"]) >= 1, f"strategy {s['name']} has no citations"

    def test_evidence_refs_resolve_to_real_citations(self, parent_sess):
        skills = parent_sess.get(f"{API}/skills", timeout=10).json()
        citations = parent_sess.get(f"{API}/citations", timeout=10).json()
        valid_ids = {c["id"] for c in citations}
        for s in skills:
            for ref in s["evidence_refs"]:
                assert ref in valid_ids, f"orphan evidence_ref on skill {s['name']}: {ref}"


class TestMomentsCatalogEvidence:
    def test_moment_types_have_evidence(self, parent_sess):
        cat = parent_sess.get(f"{API}/moments/catalog", timeout=10).json()
        assert "moment_types" in cat
        with_evidence = [t for t in cat["moment_types"] if t.get("evidence_refs")]
        # Most clinically meaningful types should be backed
        assert len(with_evidence) >= 10

    def test_triggers_have_evidence(self, parent_sess):
        cat = parent_sess.get(f"{API}/moments/catalog", timeout=10).json()
        assert "triggers" in cat
        with_evidence = [t for t in cat["triggers"] if t.get("evidence_refs")]
        assert len(with_evidence) >= 10


class TestGamesCatalog:
    def test_games_listed(self, parent_sess):
        r = parent_sess.get(f"{API}/games/catalog", timeout=10)
        assert r.status_code == 200
        games = r.json()
        assert len(games) == 6
        for g in games:
            assert "evidence_refs" in g
            assert len(g["evidence_refs"]) >= 1, f"game {g['key']} has no citations"

    def test_memory_cards_cites_klingberg(self, parent_sess):
        games = parent_sess.get(f"{API}/games/catalog", timeout=10).json()
        citations = parent_sess.get(f"{API}/citations", timeout=10).json()
        mc = next(g for g in games if g["key"] == "memory_cards")
        cited = [c["key"] for c in citations if c["id"] in mc["evidence_refs"]]
        # Klingberg's working-memory training paper is the canonical citation for memory games
        assert "klingberg_2005_wm_training" in cited


@pytest.mark.skipif(
    not os.environ.get("EMERGENT_LLM_KEY") and "AI_BACKED_TESTS" not in os.environ,
    reason="AI key not provided; mission-drafting evidence test requires live LLM"
)
class TestAIDraftIncludesEvidence:
    def test_draft_mission_attaches_evidence_refs(self, parent_sess):
        # Get the linked student id
        students = parent_sess.get(f"{API}/students", timeout=10).json()
        assert students, "parent has no linked students"
        student_id = students[0]["id"]
        r = parent_sess.post(
            f"{API}/ai/draft-mission",
            json={"student_id": student_id, "prompt": "Practice working memory with a tiny chunked task."},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        for k in ("title", "steps", "skill_ids", "strategy_ids", "evidence_tags", "evidence_refs"):
            assert k in body, f"missing key {k} in AI draft"
        # At least one of: explicit tag or transitive skill/strategy evidence
        assert isinstance(body["evidence_refs"], list)
        # AI should pick something workable; even if it returns empty tags, we get
        # transitive evidence from chosen skills/strategies.
        if body["skill_ids"] or body["strategy_ids"]:
            assert len(body["evidence_refs"]) >= 1, "expected at least one transitive citation"

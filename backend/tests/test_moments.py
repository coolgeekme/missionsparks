"""Iteration 5: Moments (ADHD behavior + trigger tracking) tests.

Covers:
 - GET  /api/moments/catalog
 - POST /api/moments  (student self-log + parent for linked student)
 - GET  /api/moments  (scoping, filters)
 - DELETE /api/moments/{id}
 - GET  /api/moments/insights
 - GET  /api/moments/export.csv  (content-type, header)
"""
import os
import uuid

import pytest
import requests

def _load_backend_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip()
    except FileNotFoundError:
        pass
    raise RuntimeError("REACT_APP_BACKEND_URL not set")


BASE_URL = _load_backend_url().rstrip("/")
API = f"{BASE_URL}/api"

PARENT = {"email": "parent@demo.com", "password": "demo1234"}
STUDENT = {"email": "student@demo.com", "password": "demo1234"}


def _login(creds):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def parent_sess():
    return _login(PARENT)


@pytest.fixture(scope="module")
def student_sess():
    return _login(STUDENT)


@pytest.fixture(scope="module")
def student_user(student_sess):
    r = student_sess.get(f"{API}/auth/me", timeout=10)
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="module")
def parent_user(parent_sess):
    r = parent_sess.get(f"{API}/auth/me", timeout=10)
    assert r.status_code == 200
    return r.json()


# Track ids created so they can be cleaned up after the module finishes.
_created_ids = []


@pytest.fixture(scope="module", autouse=True)
def _cleanup(parent_sess, student_sess):
    yield
    for mid in list(_created_ids):
        for sess in (student_sess, parent_sess):
            try:
                sess.delete(f"{API}/moments/{mid}", timeout=10)
            except Exception:
                pass


# ---------- /api/moments/catalog ----------
class TestCatalog:
    def test_catalog_requires_auth(self):
        r = requests.get(f"{API}/moments/catalog", timeout=10)
        assert r.status_code in (401, 403)

    def test_catalog_shape(self, student_sess):
        r = student_sess.get(f"{API}/moments/catalog", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert "moment_types" in data and "triggers" in data
        assert len(data["moment_types"]) == 14
        assert len(data["triggers"]) == 18
        for mt in data["moment_types"]:
            assert set(mt.keys()) >= {"key", "label", "emoji", "category"}
            assert mt["category"] in {"challenging", "positive", "neutral"}
        for tg in data["triggers"]:
            assert set(tg.keys()) >= {"key", "label", "emoji"}


# ---------- POST /api/moments ----------
class TestCreate:
    def test_student_self_log_ignores_supplied_student_id(self, student_sess, student_user):
        bogus = str(uuid.uuid4())
        payload = {
            "student_id": bogus,  # must be IGNORED
            "moment_type": "distracted",
            "intensity": 3,
            "triggers": ["hunger", "  ", "", "boredom"],  # whitespace must drop
            "context_note": "TEST_iter5 self log",
            "notes": "TEST_iter5",
        }
        r = student_sess.post(f"{API}/moments", json=payload, timeout=10)
        assert r.status_code == 200, r.text
        m = r.json()
        _created_ids.append(m["id"])
        assert m["student_id"] == student_user["id"]
        assert m["student_id"] != bogus
        assert m["logged_by_user_id"] == student_user["id"]
        assert m["logged_by_role"] == "student"
        assert m["triggers"] == ["hunger", "boredom"]

    def test_intensity_out_of_range_422(self, student_sess):
        for bad in (0, 6, -1, 99):
            r = student_sess.post(
                f"{API}/moments",
                json={"student_id": "x", "moment_type": "tired", "intensity": bad},
                timeout=10,
            )
            assert r.status_code == 422, f"intensity {bad} expected 422 got {r.status_code}"

    def test_parent_without_student_id_400(self, parent_sess):
        r = parent_sess.post(
            f"{API}/moments",
            json={"student_id": "", "moment_type": "tired", "intensity": 2},
            timeout=10,
        )
        assert r.status_code == 400

    def test_parent_not_linked_403(self, parent_sess):
        r = parent_sess.post(
            f"{API}/moments",
            json={"student_id": str(uuid.uuid4()), "moment_type": "tired", "intensity": 2},
            timeout=10,
        )
        assert r.status_code == 403

    def test_parent_log_for_linked_student(self, parent_sess, parent_user, student_user):
        assert student_user["id"] in parent_user.get("linked_student_ids", [])
        payload = {
            "student_id": student_user["id"],
            "moment_type": "frustrated",
            "intensity": 4,
            "duration_minutes": 12,
            "triggers": ["math", "time_pressure"],
            "context_note": "TEST_iter5 parent log",
            "antecedent": "started worksheet",
            "response": "took a break",
            "outcome": "calmed down",
            "notes": "TEST_iter5 parent",
        }
        r = parent_sess.post(f"{API}/moments", json=payload, timeout=10)
        assert r.status_code == 200, r.text
        m = r.json()
        _created_ids.append(m["id"])
        assert m["logged_by_role"] == "parent"
        assert m["logged_by_user_id"] == parent_user["id"]
        assert m["student_id"] == student_user["id"]
        assert m["triggers"] == ["math", "time_pressure"]
        assert m["duration_minutes"] == 12

    def test_triggers_capped_at_20(self, student_sess):
        triggers = [f"t{i}" for i in range(30)]
        r = student_sess.post(
            f"{API}/moments",
            json={"student_id": "ignored", "moment_type": "regulated", "intensity": 1, "triggers": triggers},
            timeout=10,
        )
        assert r.status_code == 200
        m = r.json()
        _created_ids.append(m["id"])
        assert len(m["triggers"]) == 20


# ---------- GET /api/moments ----------
class TestList:
    def test_student_sees_only_own(self, student_sess, student_user):
        r = student_sess.get(f"{API}/moments", timeout=10)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        for m in items:
            assert m["student_id"] == student_user["id"]
        # sorted desc by timestamp
        ts = [m["timestamp"] for m in items]
        assert ts == sorted(ts, reverse=True)

    def test_parent_sees_linked(self, parent_sess, student_user):
        r = parent_sess.get(f"{API}/moments", timeout=10)
        assert r.status_code == 200
        items = r.json()
        assert any(m["student_id"] == student_user["id"] for m in items)

    def test_parent_with_unlinked_student_403(self, parent_sess):
        r = parent_sess.get(f"{API}/moments", params={"student_id": str(uuid.uuid4())}, timeout=10)
        assert r.status_code == 403

    def test_filter_by_moment_type(self, student_sess):
        r = student_sess.get(f"{API}/moments", params={"moment_type": "distracted"}, timeout=10)
        assert r.status_code == 200
        for m in r.json():
            assert m["moment_type"] == "distracted"

    def test_filter_by_trigger(self, student_sess):
        r = student_sess.get(f"{API}/moments", params={"trigger": "hunger"}, timeout=10)
        assert r.status_code == 200
        for m in r.json():
            assert "hunger" in m["triggers"]


# ---------- DELETE /api/moments/{id} ----------
class TestDelete:
    def test_delete_missing_404(self, student_sess):
        r = student_sess.delete(f"{API}/moments/{uuid.uuid4()}", timeout=10)
        assert r.status_code == 404

    def test_student_deletes_own(self, student_sess):
        # create one to delete
        r = student_sess.post(
            f"{API}/moments",
            json={"student_id": "x", "moment_type": "tired", "intensity": 2, "notes": "TEST_iter5 del"},
            timeout=10,
        )
        assert r.status_code == 200
        mid = r.json()["id"]
        d = student_sess.delete(f"{API}/moments/{mid}", timeout=10)
        assert d.status_code == 200
        # subsequent delete -> 404
        d2 = student_sess.delete(f"{API}/moments/{mid}", timeout=10)
        assert d2.status_code == 404

    def test_parent_deletes_linked(self, parent_sess, student_user, student_sess):
        # student creates -> parent deletes
        r = student_sess.post(
            f"{API}/moments",
            json={"student_id": "x", "moment_type": "tired", "intensity": 2, "notes": "TEST_iter5 pdel"},
            timeout=10,
        )
        assert r.status_code == 200
        mid = r.json()["id"]
        d = parent_sess.delete(f"{API}/moments/{mid}", timeout=10)
        assert d.status_code == 200

    def test_parent_cannot_delete_unlinked(self, parent_sess):
        # Register a throwaway student to own a moment, then expect parent 403.
        other_email = f"TEST_iter5_other_{uuid.uuid4().hex[:8]}@demo.com"
        reg = requests.post(
            f"{API}/auth/register",
            json={"name": "Other", "email": other_email, "password": "demo1234", "role": "student", "accept_terms": True},
            timeout=15,
        )
        assert reg.status_code in (200, 201), reg.text
        os_sess = _login({"email": other_email, "password": "demo1234"})
        r = os_sess.post(
            f"{API}/moments",
            json={"student_id": "x", "moment_type": "tired", "intensity": 1, "notes": "TEST_iter5"},
            timeout=10,
        )
        mid = r.json()["id"]
        d = parent_sess.delete(f"{API}/moments/{mid}", timeout=10)
        assert d.status_code == 403
        # cleanup
        os_sess.delete(f"{API}/moments/{mid}", timeout=10)


# ---------- GET /api/moments/insights ----------
class TestInsights:
    def test_shape(self, student_sess):
        r = student_sess.get(f"{API}/moments/insights", timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ("total", "counts_by_type", "counts_by_trigger", "by_hour", "by_dow",
                 "daily_counts", "avg_intensity_by_type", "trigger_to_type",
                 "top_triggers", "top_types"):
            assert k in d
        assert isinstance(d["by_hour"], list) and len(d["by_hour"]) == 24
        assert isinstance(d["by_dow"], list) and len(d["by_dow"]) == 7
        assert len(d["daily_counts"]) == 30  # default days

    def test_days_clamp_low(self, student_sess):
        r = student_sess.get(f"{API}/moments/insights", params={"days": 0}, timeout=10)
        assert r.status_code == 200
        assert len(r.json()["daily_counts"]) == 1

    def test_days_clamp_high(self, student_sess):
        r = student_sess.get(f"{API}/moments/insights", params={"days": 500}, timeout=10)
        assert r.status_code == 200
        assert len(r.json()["daily_counts"]) == 180

    def test_parent_unlinked_403(self, parent_sess):
        r = parent_sess.get(f"{API}/moments/insights", params={"student_id": str(uuid.uuid4())}, timeout=10)
        assert r.status_code == 403


# ---------- GET /api/moments/export.csv ----------
class TestExport:
    def test_csv_content_type_and_header(self, student_sess):
        r = student_sess.get(f"{API}/moments/export.csv", timeout=15)
        assert r.status_code == 200
        ct = r.headers.get("content-type", "")
        assert "text/csv" in ct, f"unexpected content-type: {ct}"
        cd = r.headers.get("content-disposition", "")
        assert "attachment" in cd.lower()
        assert "filename=" in cd.lower()
        # header row
        body = r.text
        first_line = body.splitlines()[0]
        for col in ("timestamp", "moment_type", "intensity", "triggers"):
            assert col in first_line

    def test_csv_triggers_joined_with_semicolon(self, student_sess):
        # ensure there is at least one moment with multiple triggers
        r = student_sess.post(
            f"{API}/moments",
            json={"student_id": "x", "moment_type": "anxious", "intensity": 3,
                  "triggers": ["math", "loud_noise"], "notes": "TEST_iter5 csv"},
            timeout=10,
        )
        assert r.status_code == 200
        _created_ids.append(r.json()["id"])
        rcsv = student_sess.get(f"{API}/moments/export.csv", timeout=15)
        assert rcsv.status_code == 200
        assert "math; loud_noise" in rcsv.text

    def test_parent_unlinked_csv_403(self, parent_sess):
        r = parent_sess.get(f"{API}/moments/export.csv", params={"student_id": str(uuid.uuid4())}, timeout=10)
        assert r.status_code == 403

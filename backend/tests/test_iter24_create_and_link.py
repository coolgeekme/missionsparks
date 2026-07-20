"""
Iter 24 — Parent Dashboard: create-new-kid inline via /api/students/link.
Backend integration tests using the public backend URL.
"""
import os
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback to reading frontend/.env directly if env var not present
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
                    break
    except Exception:
        pass

API = f"{BASE_URL}/api"
PARENT_EMAIL = "parent@demo.com"
PARENT_PASS = "demo1234"


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def parent_session():
    return _login(PARENT_EMAIL, PARENT_PASS)


@pytest.fixture(scope="module")
def created_emails():
    """Track created emails so we can clean them up at the end."""
    emails = []
    yield emails
    # cleanup — best-effort deletion via mongo shell isn't available here;
    # we just leave them (parent's linked_student_ids can accumulate).
    # Names use newkid_ prefix as requested in the task.


CONSENT = {
    "guardian_name": "Test Parent",
    "guardian_relationship": "parent",
    "child_under_13": True,
    "consent_given": True,
}


# ---------- CREATE NEW ----------
def test_create_new_student_inline(parent_session, created_emails):
    email = f"newkid_{uuid.uuid4().hex[:8]}@demo.com"
    created_emails.append(email)
    r = parent_session.post(f"{API}/students/link", json={
        "student_email": email,
        "student_name": "Test Kid",
        "student_password": "demo1234",
        "grade": "3",
        "reading_level": "grade-3",
        **CONSENT,
    })
    assert r.status_code == 200, r.text
    parent = r.json()
    # Grab the new student id (should be the newest linked one)
    r_students = parent_session.get(f"{API}/students")
    assert r_students.status_code == 200
    students = r_students.json()
    match = [s for s in students if s.get("email") == email]
    assert match, f"newly created student {email} not present in /students"
    new_id = match[0]["id"]
    assert new_id in parent.get("linked_student_ids", []), \
        "parent's linked_student_ids does not include the new student"

    # Verify family.student_ids includes it
    r_fam = parent_session.get(f"{API}/families")
    assert r_fam.status_code == 200
    families = r_fam.json()
    # find active family
    me = parent_session.get(f"{API}/auth/me").json()
    active_fid = me.get("active_family_id")
    active_fam = next((f for f in families if f["id"] == active_fid), None)
    assert active_fam, "no active family found"
    assert new_id in active_fam.get("student_ids", []), \
        "active family.student_ids missing the new student"

    # Verify the student profile fields via the intake endpoint
    assert match[0].get("name") == "Test Kid"
    r_intake = parent_session.get(f"{API}/students/{new_id}/intake")
    assert r_intake.status_code == 200, r_intake.text
    prof = r_intake.json()
    assert prof.get("grade") == "3", f"grade not persisted: {prof}"
    assert prof.get("reading_level") == "grade-3", f"reading_level not persisted: {prof}"


def test_created_student_can_login(parent_session, created_emails):
    email = f"newkid_{uuid.uuid4().hex[:8]}@demo.com"
    created_emails.append(email)
    r = parent_session.post(f"{API}/students/link", json={
        "student_email": email,
        "student_name": "Loginable Kid",
        "student_password": "demo1234",
        **CONSENT,
    })
    assert r.status_code == 200, r.text
    # Now login as the kid
    s2 = requests.Session()
    lr = s2.post(f"{API}/auth/login", json={"email": email, "password": "demo1234"})
    assert lr.status_code == 200, lr.text
    me = s2.get(f"{API}/auth/me").json()
    assert me.get("role") == "student", f"expected role=student, got {me}"


# ---------- LINK EXISTING (regression) ----------
def test_link_existing_student(parent_session, created_emails):
    # Register a fresh student directly
    email = f"newkid_existing_{uuid.uuid4().hex[:8]}@demo.com"
    created_emails.append(email)
    reg = requests.post(f"{API}/auth/register", json={
        "name": "Existing Kid",
        "email": email,
        "password": "demo1234",
        "role": "student",
        "accept_terms": True,
    })
    assert reg.status_code == 200, reg.text

    # Link with only email + consent (no name/password)
    r = parent_session.post(f"{API}/students/link", json={
        "student_email": email,
        **CONSENT,
    })
    assert r.status_code == 200, r.text


# ---------- ERROR PATHS ----------
def test_missing_consent_rolls_back_created_student(parent_session, created_emails):
    email = f"newkid_noconsent_{uuid.uuid4().hex[:8]}@demo.com"
    created_emails.append(email)
    r = parent_session.post(f"{API}/students/link", json={
        "student_email": email,
        "student_name": "Rollback Kid",
        "student_password": "demo1234",
        "guardian_name": "Test Parent",
        "guardian_relationship": "parent",
        "child_under_13": True,
        "consent_given": False,  # missing consent
    })
    assert r.status_code == 400, r.text
    assert "consent" in r.text.lower()

    # Verify no orphan — try to login as that student
    s2 = requests.Session()
    lr = s2.post(f"{API}/auth/login", json={"email": email, "password": "demo1234"})
    assert lr.status_code != 200, \
        "orphan student was NOT rolled back — login succeeded when it should not"


def test_weak_password_rejected(parent_session, created_emails):
    email = f"newkid_weak_{uuid.uuid4().hex[:8]}@demo.com"
    created_emails.append(email)
    r = parent_session.post(f"{API}/students/link", json={
        "student_email": email,
        "student_name": "X",
        "student_password": "abc",
        **CONSENT,
    })
    assert r.status_code == 400, r.text
    assert "6 characters" in r.text or "Password must be at least 6" in r.text


def test_parent_email_conflict_returns_409(parent_session):
    r = parent_session.post(f"{API}/students/link", json={
        "student_email": PARENT_EMAIL,  # parent@demo.com is a parent, not student
        "student_name": "Fake",
        "student_password": "demo1234",
        **CONSENT,
    })
    assert r.status_code == 409, r.text
    assert "parent" in r.text.lower() or "own email" in r.text.lower()


def test_unknown_email_no_create_fields_returns_helpful_404(parent_session):
    email = f"newkid_unknown_{uuid.uuid4().hex[:8]}@demo.com"
    r = parent_session.post(f"{API}/students/link", json={
        "student_email": email,
        **CONSENT,
        # No student_name / student_password
    })
    assert r.status_code == 404, r.text
    body = r.text.lower()
    # Must not be the old bare message
    assert "name and password" in body or "create" in body, \
        f"404 message doesn't guide to create path: {r.text}"


# ---------- Audit log verification via API (best-effort) ----------
def test_audit_action_created_via_relogin(parent_session, created_emails):
    # We already created several kids above. We don't have a public audit
    # endpoint, so we just verify the flow succeeded end-to-end via /students.
    r = parent_session.get(f"{API}/students")
    assert r.status_code == 200
    kids = r.json()
    created = [k for k in kids if k.get("email", "").startswith("newkid_")]
    assert len(created) >= 1, "no newkid_* students found from prior tests"

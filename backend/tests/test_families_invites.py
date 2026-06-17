"""
Iter 15 — Co-Parent / Family Group system tests.

Covers:
- Auto-migration: every parent has a Personal Family in /auth/me
- /api/families list/get/create/update/active
- Invite create/preview (public)/accept (email guard)
- Role enforcement (owner/co_parent/viewer write blocks)
- Ownership transfer + member removal (reassigns authored content)
- Leave / Delete-family preconditions
- Cancel invite
- Multi-family game-packs visibility (regression with iter 14)
- Regression: streak, moments, students, missions still work
"""
import os
import uuid
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

PARENT_EMAIL = "parent@demo.com"
PARENT_PASS = "demo1234"
COPARENT_EMAIL = "coparent@demo.com"
COPARENT_PASS = "demo1234"
STUDENT_EMAIL = "student@demo.com"
STUDENT_PASS = "demo1234"


def _new_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(s, email, password):
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    return r.json()


def _register(s, email, password, name="Throwaway", role="parent"):
    r = s.post(
        f"{API}/auth/register",
        json={
            "email": email,
            "password": password,
            "name": name,
            "role": role,
            "accept_terms": True,
        },
    )
    if r.status_code in (200, 201):
        return r.json()
    # Already exists -> login
    return _login(s, email, password)


@pytest.fixture(scope="module")
def parent():
    s = _new_session()
    _login(s, PARENT_EMAIL, PARENT_PASS)
    return s


@pytest.fixture(scope="module")
def coparent():
    s = _new_session()
    _login(s, COPARENT_EMAIL, COPARENT_PASS)
    return s


@pytest.fixture(scope="module")
def parent_me(parent, main_family_id):
    """Always refresh after main_family_id set to active."""
    return parent.get(f"{API}/auth/me").json()


@pytest.fixture(scope="module")
def main_family_id(parent):
    """Always pick the demo family (the one with students). Ensure it's active.
    Cleans up stale TEST_ families from previous broken runs.
    """
    fams = parent.get(f"{API}/families").json()
    demo = next((f for f in fams if f.get("student_ids")), fams[0])
    parent.put(f"{API}/families/{demo['id']}/active")
    # Cleanup any stale empty TEST_ families from previous interrupted runs
    for f in fams:
        if (
            f["name"].startswith("TEST_")
            and not f.get("student_ids")
            and len(f.get("members", [])) == 1
            and f["id"] != demo["id"]
        ):
            parent.delete(f"{API}/families/{f['id']}")
    return demo["id"]


# ---------------- Auto-migration / /auth/me ----------------
class TestAuthMeFamilies:
    def test_me_has_families_field(self, parent_me):
        assert "families" in parent_me
        assert isinstance(parent_me["families"], list)
        assert len(parent_me["families"]) >= 1
        assert parent_me["active_family_id"]
        assert parent_me["active_family_role"] == "owner"
        # Legacy field preserved
        assert isinstance(parent_me.get("linked_student_ids"), list)
        assert len(parent_me["linked_student_ids"]) >= 1

    def test_me_personal_family_name(self, parent_me):
        names = [f["name"] for f in parent_me["families"]]
        assert any("Demo Parent" in n or "Family" in n for n in names)


# ---------------- Families list / get / create / update / active ----------------
class TestFamiliesCRUD:
    def test_list_families(self, parent):
        r = parent.get(f"{API}/families")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) >= 1
        assert "members" in data[0] and "name" in data[0]

    def test_get_family_enriched_members(self, parent, main_family_id):
        r = parent.get(f"{API}/families/{main_family_id}")
        assert r.status_code == 200
        fam = r.json()
        assert fam["id"] == main_family_id
        assert len(fam["members"]) >= 1
        m0 = fam["members"][0]
        assert "name" in m0 and "email" in m0 and "role" in m0

    def test_get_family_non_member_forbidden(self, main_family_id):
        # create throwaway parent
        s = _new_session()
        email = f"throw_{uuid.uuid4().hex[:8]}@demo.com"
        _register(s, email, "demo1234", name="Throw1", role="parent")
        r = s.get(f"{API}/families/{main_family_id}")
        assert r.status_code == 403

    def test_create_family_sets_active(self, parent):
        name = f"TEST_fam_{uuid.uuid4().hex[:6]}"
        r = parent.post(f"{API}/families", json={"name": name})
        assert r.status_code == 200
        fam = r.json()
        assert fam["name"] == name
        # active swapped
        me = parent.get(f"{API}/auth/me").json()
        assert me["active_family_id"] == fam["id"]
        # cleanup: switch back, delete
        # delete only if empty (no students, only owner) — yes it's new
        TestFamiliesCRUD._created_fam = fam["id"]

    def test_rename_family(self, parent):
        fid = TestFamiliesCRUD._created_fam
        new = f"TEST_renamed_{uuid.uuid4().hex[:4]}"
        r = parent.put(f"{API}/families/{fid}", json={"name": new})
        assert r.status_code == 200
        assert r.json()["name"] == new

    def test_set_active_back_to_main(self, parent, main_family_id):
        r = parent.put(f"{API}/families/{main_family_id}/active")
        assert r.status_code == 200
        me = parent.get(f"{API}/auth/me").json()
        assert me["active_family_id"] == main_family_id

    def test_set_active_non_member_forbidden(self):
        s = _new_session()
        email = f"throw_{uuid.uuid4().hex[:8]}@demo.com"
        _register(s, email, "demo1234", name="Throw2", role="parent")
        # Try to switch into demo family
        r = s.put(f"{API}/families/{TestFamiliesCRUD._created_fam}/active")
        assert r.status_code == 403

    def test_rename_by_non_member_forbidden(self):
        s = _new_session()
        email = f"throw_{uuid.uuid4().hex[:8]}@demo.com"
        _register(s, email, "demo1234", name="Throw3", role="parent")
        r = s.put(
            f"{API}/families/{TestFamiliesCRUD._created_fam}",
            json={"name": "hack"},
        )
        assert r.status_code == 403

    def test_delete_empty_family(self, parent, main_family_id):
        fid = TestFamiliesCRUD._created_fam
        # ensure main is active
        parent.put(f"{API}/families/{main_family_id}/active")
        r = parent.delete(f"{API}/families/{fid}")
        assert r.status_code in (200, 204), f"delete failed: {r.status_code} {r.text}"


# ---------------- Invites ----------------
class TestInvites:
    def test_create_invite_returns_token_and_url(self, parent, main_family_id):
        # The demo coparent is already a member; use throwaway email
        email = f"invitee_{uuid.uuid4().hex[:8]}@demo.com"
        r = parent.post(
            f"{API}/families/{main_family_id}/invites",
            json={"email": email, "role": "co_parent"},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data and data["token"]
        assert "invite_url" in data
        assert "expires_at" in data
        assert "id" in data
        TestInvites._invite = {"email": email, **data}

    def test_duplicate_invite_rejected(self, parent, main_family_id):
        email = TestInvites._invite["email"]
        r = parent.post(
            f"{API}/families/{main_family_id}/invites",
            json={"email": email, "role": "co_parent"},
        )
        assert r.status_code == 400
        assert "pending" in r.text.lower() or "exists" in r.text.lower()

    def test_invite_preview_public(self):
        token = TestInvites._invite["token"]
        s = _new_session()  # no auth
        r = s.get(f"{API}/invites/preview", params={"token": token})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "pending"
        assert body["role"] == "co_parent"
        assert body["family_name"]
        assert body["invited_by_name"]
        assert body["email"] == TestInvites._invite["email"]
        assert body["expires_at"]

    def test_invite_accept_email_mismatch_forbidden(self, coparent):
        # coparent@demo.com logs in but invite is for some random invitee — should 403
        token = TestInvites._invite["token"]
        r = coparent.post(f"{API}/invites/accept", json={"token": token})
        assert r.status_code == 403

    def test_invite_accept_email_match_success(self, parent, main_family_id):
        # Register a new parent with the invited email and accept
        email = TestInvites._invite["email"]
        s = _new_session()
        _register(s, email, "demo1234", name="Invitee One", role="parent")
        r = s.post(f"{API}/invites/accept", json={"token": TestInvites._invite["token"]})
        assert r.status_code == 200, r.text
        me = s.get(f"{API}/auth/me").json()
        assert any(f["id"] == main_family_id for f in me["families"])
        # Auto-set as active
        assert me["active_family_id"] == main_family_id
        # students visible (joined family has 1 student)
        sr = s.get(f"{API}/students")
        assert sr.status_code == 200
        assert len(sr.json()) >= 1
        TestInvites._joined_user_id = me["id"]
        TestInvites._joined_session = s
        # Cleanup: parent removes them
        rem = parent.delete(f"{API}/families/{main_family_id}/members/{me['id']}")
        assert rem.status_code == 200

    def test_cancel_invite(self, parent, main_family_id):
        # Create a new invite & cancel it
        email = f"cancel_{uuid.uuid4().hex[:6]}@demo.com"
        r = parent.post(
            f"{API}/families/{main_family_id}/invites",
            json={"email": email, "role": "viewer"},
        )
        assert r.status_code == 200
        inv = r.json()
        d = parent.delete(f"{API}/invites/{inv['id']}")
        assert d.status_code in (200, 204)
        # preview should show cancelled
        s = _new_session()
        pr = s.get(f"{API}/invites/preview", params={"token": inv["token"]})
        assert pr.status_code == 200
        assert pr.json()["status"] == "cancelled"


# ---------------- Role enforcement ----------------
class TestRoles:
    def test_viewer_cannot_create_mission(self, parent, main_family_id):
        # Invite + accept a brand new parent then demote to viewer
        email = f"viewer_{uuid.uuid4().hex[:8]}@demo.com"
        inv = parent.post(
            f"{API}/families/{main_family_id}/invites",
            json={"email": email, "role": "co_parent"},
        ).json()
        s = _new_session()
        _register(s, email, "demo1234", name="Viewer One", role="parent")
        ar = s.post(f"{API}/invites/accept", json={"token": inv["token"]})
        assert ar.status_code == 200
        viewer_id = s.get(f"{API}/auth/me").json()["id"]
        # Demote
        rd = parent.put(
            f"{API}/families/{main_family_id}/members/{viewer_id}",
            json={"role": "viewer"},
        )
        assert rd.status_code == 200
        # As viewer, try to create a mission
        students = s.get(f"{API}/students").json()
        student_id = students[0]["id"]
        mc = s.post(
            f"{API}/missions",
            json={
                "student_id": student_id,
                "title": "TEST viewer mission",
                "points": 5,
                "due_date": "2030-12-31",
            },
        )
        assert mc.status_code == 403
        # game pack create as viewer
        gp = s.post(
            f"{API}/game-packs",
            json={
                "game_type": "word_match",
                "name": "TEST viewer pack",
                "content": {"pairs": [{"word": "a", "meaning": "b"}, {"word": "c", "meaning": "d"}, {"word": "e", "meaning": "f"}]},
            },
        )
        assert gp.status_code == 403
        # Cleanup
        parent.delete(f"{API}/families/{main_family_id}/members/{viewer_id}")
        TestRoles._viewer_email = email

    def test_coparent_can_create_mission(self, parent, main_family_id):
        # Use a fresh invite as co_parent
        email = f"copwriter_{uuid.uuid4().hex[:8]}@demo.com"
        inv = parent.post(
            f"{API}/families/{main_family_id}/invites",
            json={"email": email, "role": "co_parent"},
        ).json()
        s = _new_session()
        _register(s, email, "demo1234", name="CoWriter", role="parent")
        s.post(f"{API}/invites/accept", json={"token": inv["token"]})
        students = s.get(f"{API}/students").json()
        student_id = students[0]["id"]
        mc = s.post(
            f"{API}/missions",
            json={
                "student_id": student_id,
                "title": "TEST coparent mission",
                "points": 5,
                "due_date": "2030-12-31",
            },
        )
        assert mc.status_code in (200, 201), mc.text
        # cleanup mission
        try:
            parent.delete(f"{API}/missions/{mc.json()['id']}")
        except Exception:
            pass
        uid = s.get(f"{API}/auth/me").json()["id"]
        parent.delete(f"{API}/families/{main_family_id}/members/{uid}")


# ---------------- Family lifecycle ----------------
class TestFamilyLifecycle:
    def test_owner_cannot_leave(self, parent, main_family_id):
        r = parent.post(f"{API}/families/{main_family_id}/leave")
        assert r.status_code == 400
        assert "owner" in r.text.lower()

    def test_delete_family_with_students_forbidden(self, parent, main_family_id):
        r = parent.delete(f"{API}/families/{main_family_id}")
        assert r.status_code == 400

    def test_owner_cannot_remove_self(self, parent, parent_me, main_family_id):
        r = parent.delete(
            f"{API}/families/{main_family_id}/members/{parent_me['id']}"
        )
        # 400 per spec; allow 403 too
        assert r.status_code in (400, 403)

    def test_transfer_ownership_and_old_owner_cannot_delete(
        self, parent, parent_me, main_family_id
    ):
        # invite & accept a new parent, promote to owner, verify old owner is demoted
        email = f"newowner_{uuid.uuid4().hex[:8]}@demo.com"
        inv = parent.post(
            f"{API}/families/{main_family_id}/invites",
            json={"email": email, "role": "co_parent"},
        ).json()
        s = _new_session()
        _register(s, email, "demo1234", name="NewOwner", role="parent")
        s.post(f"{API}/invites/accept", json={"token": inv["token"]})
        new_uid = s.get(f"{API}/auth/me").json()["id"]
        # transfer
        rt = parent.put(
            f"{API}/families/{main_family_id}/members/{new_uid}",
            json={"role": "owner"},
        )
        assert rt.status_code == 200
        # Old owner now co_parent
        me = parent.get(f"{API}/auth/me").json()
        target = next(f for f in me["families"] if f["id"] == main_family_id)
        assert target["role"] == "co_parent"
        # Old owner cannot delete
        dr = parent.delete(f"{API}/families/{main_family_id}")
        assert dr.status_code == 403
        # Transfer back
        rt2 = s.put(
            f"{API}/families/{main_family_id}/members/{parent_me['id']}",
            json={"role": "owner"},
        )
        assert rt2.status_code == 200
        # Cleanup: remove the temp user
        parent.delete(f"{API}/families/{main_family_id}/members/{new_uid}")


# ---------------- Multi-family game packs ----------------
class TestMultiFamilyPacks:
    def test_packs_in_active_family(self, parent, main_family_id):
        # Create a fresh family, switch into it, create a pack
        fname = f"TEST_secondfam_{uuid.uuid4().hex[:5]}"
        f2 = parent.post(f"{API}/families", json={"name": fname}).json()
        f2id = f2["id"]
        # active should now be f2
        me = parent.get(f"{API}/auth/me").json()
        assert me["active_family_id"] == f2id
        # create pack
        pc = parent.post(
            f"{API}/game-packs",
            json={
                "game_type": "word_match",
                "name": f"TEST_multifam_pack_{uuid.uuid4().hex[:4]}",
                "content": {
                    "pairs": [
                        {"word": "alpha", "meaning": "1"},
                        {"word": "beta", "meaning": "2"},
                        {"word": "gamma", "meaning": "3"},
                        {"word": "delta", "meaning": "4"},
                        {"word": "eps", "meaning": "5"},
                    ]
                },
            },
        )
        assert pc.status_code in (200, 201), pc.text
        pack_id = pc.json()["id"]
        # list -> should contain pack
        lr = parent.get(f"{API}/game-packs")
        assert lr.status_code == 200
        ids = [p["id"] for p in lr.json()]
        assert pack_id in ids
        # Switch back, list should STILL show pack (multi-family aggregation)
        parent.put(f"{API}/families/{main_family_id}/active")
        lr2 = parent.get(f"{API}/game-packs")
        ids2 = [p["id"] for p in lr2.json()]
        assert pack_id in ids2, "Pack should be visible across all families parent belongs to"
        # cleanup
        parent.delete(f"{API}/game-packs/{pack_id}")
        parent.delete(f"{API}/families/{f2id}")


# ---------------- Regression: existing endpoints ----------------
class TestRegression:
    def test_students_endpoint(self, parent):
        r = parent.get(f"{API}/students")
        assert r.status_code == 200
        assert len(r.json()) >= 1

    def test_missions_list(self, parent):
        r = parent.get(f"{API}/missions")
        assert r.status_code == 200

    def test_streak(self, parent):
        students = parent.get(f"{API}/students").json()
        sid = students[0]["id"]
        r = parent.get(f"{API}/streak/{sid}")
        assert r.status_code == 200

    def test_moments(self, parent):
        r = parent.get(f"{API}/moments")
        assert r.status_code == 200

    def test_audit(self, parent):
        r = parent.get(f"{API}/audit")
        assert r.status_code == 200

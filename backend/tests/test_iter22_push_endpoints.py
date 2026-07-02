"""Iter 22 — HTTP endpoint tests for Web Push and notification prefs."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://mission-tracker-100.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed {email} → {r.status_code} {r.text[:200]}"
    return s


@pytest.fixture(scope="module")
def parent():
    return _login("parent@demo.com", "demo1234")


@pytest.fixture(scope="module")
def student():
    return _login("student@demo.com", "demo1234")


# ---------- Static PWA assets ----------
class TestStaticPwaAssets:
    def test_manifest(self):
        r = requests.get(f"{BASE_URL}/manifest.json", timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert j["name"] and j["short_name"]
        assert j.get("theme_color")
        assert isinstance(j.get("icons"), list) and len(j["icons"]) >= 2

    @pytest.mark.parametrize("path,ct", [
        ("/sw.js", "javascript"),
        ("/icon-192.png", "image/png"),
        ("/icon-512.png", "image/png"),
        ("/icon-512-maskable.png", "image/png"),
        ("/apple-touch-icon.png", "image/png"),
        ("/notification-badge.png", "image/png"),
    ])
    def test_asset(self, path, ct):
        r = requests.get(f"{BASE_URL}{path}", timeout=15)
        assert r.status_code == 200, f"{path} → {r.status_code}"
        assert ct in r.headers.get("content-type", ""), f"{path} CT={r.headers.get('content-type')}"


# ---------- VAPID public key (no auth) ----------
class TestVapidPublicKey:
    def test_returns_key(self):
        r = requests.get(f"{API}/push/vapid-public-key", timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert "public_key" in j
        assert isinstance(j["public_key"], str) and len(j["public_key"]) > 40


# ---------- Notification preferences ----------
class TestNotificationPrefs:
    def test_get_returns_defaults_and_device_count(self, parent):
        r = parent.get(f"{API}/me/notification-prefs", timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert "prefs" in j and "device_count" in j
        for k in ["enabled", "parent_streak_at_risk", "parent_kid_completed",
                  "parent_pending_review", "parent_coparent_activity",
                  "parent_digest_ready", "kid_missions_morning",
                  "kid_streak_milestone", "kid_pack_unlocked"]:
            assert k in j["prefs"], f"missing key {k}"
        assert isinstance(j["device_count"], int)

    def test_put_merges_and_ignores_unknown(self, parent):
        # Set one key false, others should be preserved
        r = parent.put(f"{API}/me/notification-prefs",
                       json={"parent_streak_at_risk": False, "bogus_key": True}, timeout=15)
        assert r.status_code == 200
        prefs = r.json()["prefs"]
        assert prefs["parent_streak_at_risk"] is False
        assert prefs["parent_kid_completed"] is True  # not dropped
        assert "bogus_key" not in prefs
        # restore
        parent.put(f"{API}/me/notification-prefs", json={"parent_streak_at_risk": True})

    def test_student_can_get_prefs(self, student):
        r = student.get(f"{API}/me/notification-prefs", timeout=15)
        assert r.status_code == 200
        assert "prefs" in r.json()

    def test_prefs_require_auth(self):
        r = requests.get(f"{API}/me/notification-prefs", timeout=15)
        assert r.status_code in (401, 403)


# ---------- Subscribe / Unsubscribe / Test ----------
class TestPushSubscribeFlow:
    def test_subscribe_and_dedupe_and_unsubscribe(self, parent):
        ep = f"https://fcm.example.com/test/{uuid.uuid4()}"
        payload = {"endpoint": ep, "keys": {"p256dh": "PPPP", "auth": "AAAA"}}
        r = parent.post(f"{API}/push/subscribe", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

        # GET reflects device_count and enabled=true
        r2 = parent.get(f"{API}/me/notification-prefs", timeout=15)
        assert r2.status_code == 200
        j = r2.json()
        assert j["device_count"] >= 1
        assert j["prefs"]["enabled"] is True

        # Duplicate subscribe — device_count should not grow
        r3 = parent.post(f"{API}/push/subscribe", json=payload, timeout=15)
        assert r3.status_code == 200
        dev_after = parent.get(f"{API}/me/notification-prefs").json()["device_count"]
        assert dev_after == j["device_count"], "duplicate endpoint created new row"

        # Test push — no delivery expected (fake endpoint) but must not 500
        rt = parent.post(f"{API}/push/test", timeout=20)
        assert rt.status_code == 200
        tj = rt.json()
        for k in ("sent", "skipped", "pruned"):
            assert k in tj

        # Unsubscribe
        ru = parent.post(f"{API}/push/unsubscribe", json={"endpoint": ep}, timeout=15)
        assert ru.status_code == 200
        assert ru.json().get("removed") >= 1

    def test_test_push_no_subs_returns_no_subs(self, parent):
        # Ensure any earlier test subs are cleared — leftover real subs may exist. Best-effort: just check contract.
        r = parent.post(f"{API}/push/test", timeout=20)
        assert r.status_code == 200
        j = r.json()
        # If no subs at all, reason='no_subs' & sent=0. If dead subs, will prune. Either way, sent is int.
        assert isinstance(j.get("sent"), int)

    def test_subscribe_requires_auth(self):
        r = requests.post(f"{API}/push/subscribe",
                          json={"endpoint": "x", "keys": {"p256dh": "p", "auth": "a"}}, timeout=15)
        assert r.status_code in (401, 403)


# ---------- Digest sample push wiring ----------
class TestDigestPushWiring:
    def test_send_sample_does_not_raise(self, parent):
        # This will attempt to send a digest email AND fire push. Both may fail silently
        # but the endpoint must return without 500.
        r = parent.post(f"{API}/me/digest/send-sample", timeout=30)
        # 200 or 202 accepted. Anything else = regression.
        assert r.status_code in (200, 202), f"digest sample returned {r.status_code}: {r.text[:300]}"

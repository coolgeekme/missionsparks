"""Web Push notifications — Iter 22.

VAPID-signed Web Push (RFC 8291). No 3rd-party service (OneSignal/Firebase),
just the standard browser push gateways (FCM for Chrome/Android, APNs for
Safari/iOS 16.4+, Mozilla autopush for Firefox).

Storage: `db.push_subscriptions` — one row per browser/device per user.
    { id, user_id, endpoint, keys.p256dh, keys.auth, user_agent, created_at, last_seen }
Notification prefs on user doc:
    user.notification_prefs = {enabled, parent_streak_at_risk, parent_kid_completed, ...}
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from typing import Optional, Any

from pywebpush import WebPushException, webpush  # type: ignore

logger = logging.getLogger(__name__)

# Wired at startup by server.on_event("startup")
_db = None


def configure(db) -> None:
    global _db
    _db = db


def _vapid_private_key() -> str:
    # Multi-line PEM comes in as one line with literal '\n' — decode it.
    raw = os.environ.get("VAPID_PRIVATE_KEY", "")
    return raw.replace("\\n", "\n")


def _vapid_claims() -> dict:
    return {"sub": os.environ.get("VAPID_CONTACT", "mailto:hello@example.com")}


# All 8 opt-in preferences we ship in Iter 22.
DEFAULT_NOTIFICATION_PREFS = {
    "enabled": False,             # Master toggle for the user (auto-flipped ON on first successful subscribe)
    # Parent-facing:
    "parent_streak_at_risk": True,
    "parent_kid_completed": True,
    "parent_pending_review": True,
    "parent_coparent_activity": True,
    "parent_digest_ready": True,
    # Kid-facing:
    "kid_missions_morning": True,
    "kid_streak_milestone": True,
    "kid_pack_unlocked": True,
}


def normalize_notification_prefs(raw: Optional[dict]) -> dict:
    """Merge stored prefs over defaults; ignore unknown keys."""
    prefs = dict(DEFAULT_NOTIFICATION_PREFS)
    if isinstance(raw, dict):
        for k, v in raw.items():
            if k in prefs and isinstance(v, bool):
                prefs[k] = v
    return prefs


async def get_user_prefs(user_id: str) -> dict:
    if _db is None:
        return dict(DEFAULT_NOTIFICATION_PREFS)
    u = await _db.users.find_one({"id": user_id}, {"_id": 0, "notification_prefs": 1})
    return normalize_notification_prefs((u or {}).get("notification_prefs"))


async def upsert_subscription(user_id: str, endpoint: str, p256dh: str, auth: str,
                              user_agent: Optional[str] = None) -> None:
    if _db is None:
        return
    now = datetime.now(timezone.utc).isoformat()
    await _db.push_subscriptions.update_one(
        {"endpoint": endpoint},
        {
            "$set": {
                "user_id": user_id,
                "endpoint": endpoint,
                "keys": {"p256dh": p256dh, "auth": auth},
                "user_agent": (user_agent or "")[:200],
                "last_seen": now,
            },
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )
    # First subscribe auto-flips the master toggle ON.
    await _db.users.update_one(
        {"id": user_id, "notification_prefs.enabled": {"$ne": True}},
        {"$set": {"notification_prefs.enabled": True}},
    )


async def remove_subscription(endpoint: str) -> int:
    if _db is None or not endpoint:
        return 0
    res = await _db.push_subscriptions.delete_one({"endpoint": endpoint})
    return res.deleted_count


def _send_one_sync(sub_doc: dict, payload: dict) -> tuple[bool, Optional[int]]:
    """Sync webpush call — must run in a thread to avoid blocking the loop."""
    try:
        webpush(
            subscription_info={"endpoint": sub_doc["endpoint"], "keys": sub_doc["keys"]},
            data=json.dumps(payload),
            vapid_private_key=_vapid_private_key(),
            vapid_claims=_vapid_claims(),
            ttl=60 * 60 * 24,  # 24h
        )
        return True, None
    except WebPushException as ex:
        code = ex.response.status_code if getattr(ex, "response", None) is not None else None
        # 404 / 410 mean the subscription is dead — caller will prune.
        return False, code


async def send_push_to_user(
    user_id: str,
    *,
    pref_key: Optional[str],
    title: str,
    body: str,
    url: str = "/",
    tag: Optional[str] = None,
    require_interaction: bool = False,
) -> dict:
    """Send a push to every subscribed device of a user. Skips if user has
    disabled the master switch or the specific pref_key. Auto-prunes 404/410
    subscriptions. Never raises — logs and returns a summary dict."""
    if _db is None:
        return {"sent": 0, "skipped": 0, "pruned": 0, "reason": "not_configured"}
    prefs = await get_user_prefs(user_id)
    if not prefs.get("enabled"):
        return {"sent": 0, "skipped": 0, "pruned": 0, "reason": "master_off"}
    if pref_key and not prefs.get(pref_key, True):
        return {"sent": 0, "skipped": 0, "pruned": 0, "reason": f"pref_off:{pref_key}"}
    subs = await _db.push_subscriptions.find({"user_id": user_id}, {"_id": 0}).to_list(50)
    if not subs:
        return {"sent": 0, "skipped": 0, "pruned": 0, "reason": "no_subs"}
    payload = {
        "title": title[:100],
        "body": body[:240],
        "url": url,
        "tag": tag or "missionsparks",
        "requireInteraction": bool(require_interaction),
        "timestamp": int(datetime.now(timezone.utc).timestamp() * 1000),
    }
    sent = pruned = failed = 0
    dead_endpoints: list[str] = []
    for s in subs:
        ok, code = await asyncio.to_thread(_send_one_sync, s, payload)
        if ok:
            sent += 1
        elif code in (404, 410):
            dead_endpoints.append(s["endpoint"])
        else:
            failed += 1
            logger.warning("Push failed for user %s code=%s tag=%s", user_id, code, tag)
    if dead_endpoints:
        r = await _db.push_subscriptions.delete_many({"endpoint": {"$in": dead_endpoints}})
        pruned = r.deleted_count
    return {"sent": sent, "skipped": 0, "pruned": pruned, "failed": failed}


async def send_test_push(user_id: str) -> dict:
    """Fire a canned test notification — used by the /account 'Send a test' button."""
    return await send_push_to_user(
        user_id,
        pref_key=None,  # bypass per-topic checks (still honors master toggle)
        title="MissionSparks 🚀",
        body="Notifications are working — you'll see updates about your kid's missions here.",
        url="/parent",
        tag="test",
    )

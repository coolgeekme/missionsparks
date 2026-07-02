"""Push notification service tests (Iter 22).

We can't do a full E2E push (requires a real browser + FCM/APNs), so we mock
`webpush()` and verify:
  - subscription upsert/removal
  - preference-gated dispatch (master toggle + per-topic keys)
  - 404/410 pruning
  - test-push bypass of per-topic (but not master)
"""
from __future__ import annotations

import asyncio
import os
import pathlib
import sys
import uuid
from unittest.mock import patch

import pytest
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(pathlib.Path(__file__).resolve().parents[1] / ".env")

sys.path.insert(0, "/app/backend")
import push_service as ps  # noqa: E402


@pytest.fixture
def db():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    d = client[os.environ["DB_NAME"]]
    ps.configure(d)
    return d


def _run(coro):
    return asyncio.run(coro)


async def _seed_user(db, user_id: str, prefs=None):
    doc = {"id": user_id, "email": f"{user_id}@x", "role": "parent", "name": "T"}
    if prefs is not None:
        doc["notification_prefs"] = prefs
    await db.users.insert_one(doc)


async def _cleanup(db, user_id: str):
    await db.users.delete_many({"id": user_id})
    await db.push_subscriptions.delete_many({"user_id": user_id})


def test_upsert_flips_master_toggle_and_dedupes(db):
    uid = f"pushtest-{uuid.uuid4()}"

    async def _run_test():
        try:
            await _seed_user(db, uid)
            await ps.upsert_subscription(uid, "https://x.example/e1", "k1", "a1", user_agent="Chrome/PW")
            await ps.upsert_subscription(uid, "https://x.example/e1", "k1", "a1", user_agent="Chrome/PW")
            assert await db.push_subscriptions.count_documents({"user_id": uid}) == 1
            u = await db.users.find_one({"id": uid}, {"_id": 0, "notification_prefs": 1})
            assert u["notification_prefs"]["enabled"] is True
        finally:
            await _cleanup(db, uid)
    _run(_run_test())


def test_send_respects_master_off(db):
    uid = f"pushtest-{uuid.uuid4()}"

    async def _run_test():
        try:
            await _seed_user(db, uid, prefs={"enabled": False, "parent_pending_review": True})
            await db.push_subscriptions.insert_one({
                "user_id": uid, "endpoint": "https://x/1",
                "keys": {"p256dh": "p", "auth": "a"},
            })
            with patch("push_service._send_one_sync") as m:
                res = await ps.send_push_to_user(uid, pref_key="parent_pending_review",
                                                  title="t", body="b")
            m.assert_not_called()
            assert res["reason"] == "master_off"
            assert res["sent"] == 0
        finally:
            await _cleanup(db, uid)
    _run(_run_test())


def test_send_respects_specific_pref_off(db):
    uid = f"pushtest-{uuid.uuid4()}"

    async def _run_test():
        try:
            await _seed_user(db, uid, prefs={"enabled": True, "parent_streak_at_risk": False})
            await db.push_subscriptions.insert_one({
                "user_id": uid, "endpoint": "https://x/2",
                "keys": {"p256dh": "p", "auth": "a"},
            })
            with patch("push_service._send_one_sync") as m:
                res = await ps.send_push_to_user(uid, pref_key="parent_streak_at_risk",
                                                  title="t", body="b")
            m.assert_not_called()
            assert res["reason"] == "pref_off:parent_streak_at_risk"
        finally:
            await _cleanup(db, uid)
    _run(_run_test())


def test_send_dispatches_and_counts_sent(db):
    uid = f"pushtest-{uuid.uuid4()}"

    async def _run_test():
        try:
            await _seed_user(db, uid, prefs={"enabled": True})
            for i in range(3):
                await db.push_subscriptions.insert_one({
                    "user_id": uid, "endpoint": f"https://x/e{i}",
                    "keys": {"p256dh": "p", "auth": "a"},
                })
            with patch("push_service._send_one_sync", return_value=(True, None)) as m:
                res = await ps.send_push_to_user(uid, pref_key="parent_kid_completed",
                                                  title="Hi", body="b")
            assert m.call_count == 3
            assert res["sent"] == 3
            assert res["pruned"] == 0
        finally:
            await _cleanup(db, uid)
    _run(_run_test())


def test_send_prunes_gone_endpoints(db):
    uid = f"pushtest-{uuid.uuid4()}"

    async def _run_test():
        try:
            await _seed_user(db, uid, prefs={"enabled": True})
            for i in range(3):
                await db.push_subscriptions.insert_one({
                    "user_id": uid, "endpoint": f"https://x/dead{i}",
                    "keys": {"p256dh": "p", "auth": "a"},
                })
            # 2 endpoints return 410, 1 returns success
            calls = [(False, 410), (True, None), (False, 404)]
            def side(*_, **__):
                return calls.pop(0)
            with patch("push_service._send_one_sync", side_effect=side):
                res = await ps.send_push_to_user(uid, pref_key=None,
                                                  title="Hi", body="b")
            assert res["sent"] == 1
            assert res["pruned"] == 2
            remaining = await db.push_subscriptions.count_documents({"user_id": uid})
            assert remaining == 1
        finally:
            await _cleanup(db, uid)
    _run(_run_test())


def test_test_push_bypasses_topic_but_not_master(db):
    uid = f"pushtest-{uuid.uuid4()}"

    async def _run_test():
        try:
            # Master OFF — test push must still refuse
            await _seed_user(db, uid, prefs={"enabled": False})
            res = await ps.send_test_push(uid)
            assert res["sent"] == 0

            # Master ON but every topic OFF — test push still delivers
            all_off = {k: False for k in ps.DEFAULT_NOTIFICATION_PREFS if k != "enabled"}
            all_off["enabled"] = True
            await db.users.update_one({"id": uid}, {"$set": {"notification_prefs": all_off}})
            await db.push_subscriptions.insert_one({
                "user_id": uid, "endpoint": "https://x/t",
                "keys": {"p256dh": "p", "auth": "a"},
            })
            with patch("push_service._send_one_sync", return_value=(True, None)) as m:
                res = await ps.send_test_push(uid)
            m.assert_called_once()
            assert res["sent"] == 1
        finally:
            await _cleanup(db, uid)
    _run(_run_test())


def test_normalize_prefs_ignores_unknown_keys(db):
    prefs = ps.normalize_notification_prefs({
        "enabled": True,
        "parent_streak_at_risk": False,
        "bogus_key": True,
        "not_a_bool": "yes",
    })
    assert prefs["enabled"] is True
    assert prefs["parent_streak_at_risk"] is False
    assert "bogus_key" not in prefs
    # Defaults preserved for the untouched ones
    assert prefs["parent_kid_completed"] is True

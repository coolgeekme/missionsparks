"""Streak service / freeze / weekend-mode regression tests.

Covers the Iter 20 streak refactor:
 - The "kind day off" auto-freeze is gone — only explicit parent freezes count.
 - Weekends are skippable only when family.streak_weekend_mode == 'weekdays_only'.
 - Freeze cap = 4 per kid per calendar month.
"""
from __future__ import annotations

import asyncio
import os
import pathlib
import sys
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(pathlib.Path(__file__).resolve().parents[1] / ".env")

sys.path.insert(0, "/app/backend")
import streak_service as ss  # noqa: E402


@pytest.fixture
def db():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    return client[os.environ["DB_NAME"]]


def _run(coro):
    return asyncio.run(coro)


async def _seed_completion(db, student_id: str, when: datetime):
    await db.mission_logs.insert_one({
        "id": str(uuid.uuid4()),
        "student_id": student_id,
        "mission_id": str(uuid.uuid4()),
        "status": "completed",
        "timestamp": when.isoformat(),
    })


async def _cleanup(db, student_id: str):
    await db.mission_logs.delete_many({"student_id": student_id})
    await db.streak_freezes.delete_many({"student_id": student_id})
    await db.families.delete_many({"student_ids": student_id})


def test_no_auto_freeze_breaks_streak_on_real_miss(db):
    """Previously a kid who missed yesterday but completed the day before still
    showed a 'streak'. With Iter 20 the streak must drop to 0."""
    sid = f"streak-test-{uuid.uuid4()}"

    async def _run_test():
        try:
            now = datetime.now(timezone.utc)
            # Completed 3 days ago and 2 days ago, then MISSED yesterday + today.
            await _seed_completion(db, sid, now - timedelta(days=2, hours=4))
            await _seed_completion(db, sid, now - timedelta(days=3, hours=2))
            snap = await ss.compute_streak(db, sid)
            assert snap.current_streak == 0, snap
            assert snap.longest_streak == 2
            assert snap.freezes_used_in_run == 0
        finally:
            await _cleanup(db, sid)
    _run(_run_test())


def test_streak_continues_if_completed_today(db):
    sid = f"streak-test-{uuid.uuid4()}"

    async def _run_test():
        try:
            # Anchor at noon UTC today + noon UTC yesterday so time-of-day never
            # straddles a day boundary (flakiness fix).
            today = datetime.now(timezone.utc).date()
            noon_today = datetime.combine(today, datetime.min.time(), tzinfo=timezone.utc) + timedelta(hours=12)
            noon_yest = noon_today - timedelta(days=1)
            await _seed_completion(db, sid, noon_today)
            await _seed_completion(db, sid, noon_yest)
            snap = await ss.compute_streak(db, sid)
            assert snap.current_streak == 2
            assert snap.completed_today is True
        finally:
            await _cleanup(db, sid)
    _run(_run_test())


def test_freeze_bridges_a_missed_day(db):
    """Completed today, missed yesterday but freeze granted → streak = today + day-before-yesterday."""
    sid = f"streak-test-{uuid.uuid4()}"

    async def _run_test():
        try:
            today = datetime.now(timezone.utc).date()
            noon_today = datetime.combine(today, datetime.min.time(), tzinfo=timezone.utc) + timedelta(hours=12)
            await _seed_completion(db, sid, noon_today)                             # today
            await _seed_completion(db, sid, noon_today - timedelta(days=2))         # 2 days ago
            # Freeze yesterday
            yesterday = (today - timedelta(days=1)).isoformat()
            await db.streak_freezes.insert_one({
                "id": str(uuid.uuid4()),
                "student_id": sid,
                "date": yesterday,
                "granted_by_user_id": "test-parent",
                "created_at": noon_today.isoformat(),
            })
            snap = await ss.compute_streak(db, sid)
            assert snap.current_streak == 2, snap
            assert snap.freezes_used_in_run == 1
        finally:
            await _cleanup(db, sid)
    _run(_run_test())


def test_freeze_alone_does_not_create_streak(db):
    """A freeze with NO completions ever shouldn't create a phantom streak."""
    sid = f"streak-test-{uuid.uuid4()}"

    async def _run_test():
        try:
            yesterday = (datetime.now(timezone.utc).date() - timedelta(days=1)).isoformat()
            await db.streak_freezes.insert_one({
                "id": str(uuid.uuid4()),
                "student_id": sid,
                "date": yesterday,
                "granted_by_user_id": "test-parent",
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            snap = await ss.compute_streak(db, sid)
            assert snap.current_streak == 0
            assert snap.freezes_used_in_run == 0
        finally:
            await _cleanup(db, sid)
    _run(_run_test())


def test_weekend_mode_weekdays_only_skips_saturday_sunday(db):
    """If family.streak_weekend_mode == 'weekdays_only', a kid who completed
    every weekday last week shouldn't lose streak because of Sat/Sun."""
    sid = f"streak-test-{uuid.uuid4()}"

    async def _run_test():
        try:
            # Set up a family with weekday-only mode
            await db.families.insert_one({
                "id": str(uuid.uuid4()),
                "name": "TestFam",
                "student_ids": [sid],
                "members": [],
                "streak_weekend_mode": "weekdays_only",
            })
            now = datetime.now(timezone.utc)
            # Find last week's mon-fri based on today
            today = now.date()
            # Seed completions for the last 5 *weekdays* leading up to today (inclusive if weekday)
            d = today
            count = 0
            while count < 5:
                if d.weekday() < 5:  # Mon-Fri
                    await _seed_completion(
                        db, sid,
                        datetime.combine(d, datetime.min.time(), tzinfo=timezone.utc) + timedelta(hours=12),
                    )
                    count += 1
                d -= timedelta(days=1)
            snap = await ss.compute_streak(db, sid)
            # Whether today is itself a weekend or weekday, the streak should be at
            # least 5 (the 5 weekdays we seeded), since weekends are skipped.
            assert snap.current_streak >= 5, snap
            assert snap.weekend_mode == "weekdays_only"
        finally:
            await _cleanup(db, sid)
    _run(_run_test())


def test_freeze_quota_helper(db):
    sid = f"streak-test-{uuid.uuid4()}"

    async def _run_test():
        try:
            today = datetime.now(timezone.utc).date()
            today_iso = today.isoformat()
            month_prefix = today_iso[:7]
            # Seed 3 freezes ALL in the current month — pick the middle of the month
            # so we don't accidentally cross a month boundary.
            year = today.year
            month = today.month
            for i in range(3):
                day = f"{year:04d}-{month:02d}-{(i + 5):02d}"
                await db.streak_freezes.insert_one({
                    "id": str(uuid.uuid4()), "student_id": sid, "date": day,
                    "granted_by_user_id": "test", "created_at": today_iso,
                })
            # Seed 1 freeze in a different month (previous month) — should NOT count.
            prev_month = month - 1 if month > 1 else 12
            prev_year = year if month > 1 else year - 1
            await db.streak_freezes.insert_one({
                "id": str(uuid.uuid4()), "student_id": sid,
                "date": f"{prev_year:04d}-{prev_month:02d}-15",
                "granted_by_user_id": "test", "created_at": today_iso,
            })
            n = await ss.freezes_this_month(db, sid)
            assert n == 3, f"expected 3 this month, got {n}"
            snap = await ss.compute_streak(db, sid)
            assert snap.freezes_granted_this_month == 3
            assert snap.freezes_remaining_month == 1
        finally:
            await _cleanup(db, sid)
    _run(_run_test())


def test_streak_response_back_compat_has_completed_key(db):
    """Existing FE code reads `week[i].completed`. Keep it."""
    sid = f"streak-test-{uuid.uuid4()}"

    async def _run_test():
        try:
            await _seed_completion(db, sid, datetime.now(timezone.utc) - timedelta(hours=1))
            snap = await ss.compute_streak(db, sid)
            assert len(snap.week) == 7
            for d in snap.week:
                assert "completed" in d, d
                assert "kind" in d, d
        finally:
            await _cleanup(db, sid)
    _run(_run_test())

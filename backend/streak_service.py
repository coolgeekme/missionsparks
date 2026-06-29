"""Single source of truth for kid spark-streak computation.

Used by both server.py (`/api/streak`, home dashboard tiles) and digest_service.py
(parent email digests). Keeping ONE function avoids the bug where the dashboard
and the email showed different streaks for the same kid.

Streak rules (Iter 20):
- A day counts as "completed" if there's >=1 mission_log with status='completed' on that date (UTC).
- Streak runs backward from today (or yesterday if today's not complete yet).
- Days are "skipped" without breaking the streak when:
    * the family's `streak_weekend_mode` is `weekdays_only` and the day is Sat/Sun, OR
    * a `streak_freeze` was granted for that exact date (parent-granted, 4/month cap).
- NO auto-freezes. Previous "kind day off" behavior is removed — explicit freezes only.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import List, Optional


WEEKEND_MODE_ALL = "all_days"
WEEKEND_MODE_WEEKDAYS = "weekdays_only"


def _date_from_iso(ts: str) -> str:
    """YYYY-MM-DD from any ISO timestamp. Defensive."""
    if not ts:
        return ""
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00")).date().isoformat()
    except Exception:
        return ts[:10]


@dataclass
class StreakSnapshot:
    current_streak: int = 0
    longest_streak: int = 0
    completed_today: bool = False
    completed_today_count: int = 0
    missions_today_count: int = 0
    last_completed_date: Optional[str] = None
    week: List[dict] = field(default_factory=list)
    freezes_used_in_run: int = 0           # how many freeze-days are currently propping the streak up
    freezes_remaining_month: int = 0       # 4 - used this calendar month
    freezes_granted_this_month: int = 0
    weekend_mode: str = WEEKEND_MODE_ALL


MAX_FREEZES_PER_MONTH = 4


def _is_skippable_weekend(d: date, weekend_mode: str) -> bool:
    return weekend_mode == WEEKEND_MODE_WEEKDAYS and d.weekday() >= 5  # Sat=5, Sun=6


async def _family_weekend_mode_for(db, student_id: str) -> str:
    """Pick the family setting; default to all_days if missing."""
    fam = await db.families.find_one(
        {"student_ids": student_id}, {"_id": 0, "streak_weekend_mode": 1},
    )
    if not fam:
        return WEEKEND_MODE_ALL
    mode = fam.get("streak_weekend_mode")
    return mode if mode in (WEEKEND_MODE_ALL, WEEKEND_MODE_WEEKDAYS) else WEEKEND_MODE_ALL


async def compute_streak(db, student_id: str) -> StreakSnapshot:
    """Canonical streak compute. Reads from mission_logs + streak_freezes + families."""
    # 1) Pull all completed-mission dates
    logs = await db.mission_logs.find(
        {"student_id": student_id, "status": "completed"}, {"_id": 0, "timestamp": 1, "mission_id": 1},
    ).to_list(5000)
    completed_dates = sorted({_date_from_iso(lg["timestamp"]) for lg in logs if lg.get("timestamp")})
    date_set = set(completed_dates)

    # 2) Pull family weekend setting + freezes
    weekend_mode = await _family_weekend_mode_for(db, student_id)
    freeze_docs = await db.streak_freezes.find(
        {"student_id": student_id}, {"_id": 0, "date": 1, "created_at": 1},
    ).to_list(500)
    freeze_dates = {f["date"] for f in freeze_docs if f.get("date")}

    today = datetime.now(timezone.utc).date()
    today_iso = today.isoformat()

    # 3) Longest streak across all history.
    #    Two adjacent completed-days count as +1 (already correct);
    #    a freeze-only day in the middle of two completions ALSO joins them.
    all_streak_days = sorted(date_set | freeze_dates)
    longest = 0
    cur = 0
    prev: Optional[date] = None
    for d_iso in all_streak_days:
        try:
            dt = datetime.fromisoformat(d_iso).date()
        except Exception:
            continue
        if prev is not None and (dt - prev).days == 1:
            cur += 1
        else:
            cur = 1
        # Don't count a day where the kid did NOTHING but the family also doesn't
        # care about (e.g. all-day was a freeze, no completion) toward "longest" —
        # it's a continuation aid, not an achievement.
        if d_iso in date_set:
            longest = max(longest, cur)
        prev = dt

    # 4) Current streak: walk backward from anchor.
    #    Anchor = today if today is completed/frozen/weekend-skipped, else yesterday.
    def _day_status(d: date) -> str:
        iso = d.isoformat()
        if iso in date_set:
            return "completed"
        if iso in freeze_dates:
            return "freeze"
        if _is_skippable_weekend(d, weekend_mode):
            return "weekend"
        return "miss"

    # Choose the anchor: today if it counts (completed) — else step back through
    # weekend/freeze pads to find the most recent completion.
    anchor = today
    if _day_status(today) == "miss":
        anchor = today - timedelta(days=1)

    current = 0
    freezes_used = 0
    cursor = anchor
    # We allow up to a week of consecutive weekend/freeze skips just in case — the
    # loop terminates the moment we hit a "miss" or reach a completion-less stretch.
    while True:
        status = _day_status(cursor)
        if status == "completed":
            current += 1
            cursor -= timedelta(days=1)
        elif status == "weekend":
            cursor -= timedelta(days=1)
        elif status == "freeze":
            # A freeze keeps the streak alive ONLY if there's an earlier completion
            # to extend. We treat it as a 0-gain day, like a weekend.
            freezes_used += 1
            cursor -= timedelta(days=1)
        else:
            break

    # If we never hit a "completed" day at all, current must be 0.
    if current == 0:
        freezes_used = 0  # nothing to prop up

    # 5) Today's mission counts (used for "X of Y done today" UI)
    todays_mission_docs = await db.missions.find(
        {"student_id": student_id, "due_date": today_iso}, {"_id": 0, "id": 1},
    ).to_list(1000)
    todays_mission_ids = {m["id"] for m in todays_mission_docs}
    completed_today_mids = {
        lg["mission_id"]
        for lg in logs
        if lg.get("mission_id") and _date_from_iso(lg.get("timestamp", "")) == today_iso
    }
    completed_today_count = len(todays_mission_ids & completed_today_mids)
    missions_today_count = len(todays_mission_ids)

    # 6) Week trail (7 days ending today)
    week = []
    for i in range(6, -1, -1):
        d = today - timedelta(days=i)
        d_iso = d.isoformat()
        if d_iso in date_set:
            kind = "completed"
        elif d_iso in freeze_dates:
            kind = "freeze"
        elif _is_skippable_weekend(d, weekend_mode):
            kind = "weekend"
        else:
            kind = "missed" if d < today else "pending"
        week.append({
            "date": d_iso,
            "kind": kind,
            "completed": kind == "completed",  # back-compat for FE that reads `.completed`
            "is_today": d_iso == today_iso,
        })

    # 7) Freeze quota — by calendar month UTC
    month_prefix = today_iso[:7] + "-"
    granted_this_month = sum(1 for d_iso in freeze_dates if d_iso.startswith(month_prefix))
    remaining = max(0, MAX_FREEZES_PER_MONTH - granted_this_month)

    return StreakSnapshot(
        current_streak=current,
        longest_streak=longest,
        completed_today=(today_iso in date_set),
        completed_today_count=completed_today_count,
        missions_today_count=missions_today_count,
        last_completed_date=(completed_dates[-1] if completed_dates else None),
        week=week,
        freezes_used_in_run=freezes_used,
        freezes_remaining_month=remaining,
        freezes_granted_this_month=granted_this_month,
        weekend_mode=weekend_mode,
    )


async def freezes_this_month(db, student_id: str) -> int:
    """Quick count for quota checks."""
    today = datetime.now(timezone.utc).date()
    month_prefix = today.isoformat()[:7] + "-"
    return await db.streak_freezes.count_documents(
        {"student_id": student_id, "date": {"$regex": f"^{month_prefix}"}},
    )

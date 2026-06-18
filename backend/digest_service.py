"""Family digest email — periodic kid-activity summary + curated ADHD resources.

The scheduler (in server.py) ticks hourly and calls dispatch_due_digests().
For each parent who has opted in and whose next_due_at has passed, we build
their email, send via Resend, and stamp last_sent_at + next_due_at.

`_ai_chat` is injected lazily at runtime to avoid a circular import.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import pytz

from digest_articles import CURATED_ARTICLES, article_by_id, pick_article_for_parent
from email_service import _from_address, _configure_if_needed, _escape

import resend  # type: ignore

logger = logging.getLogger(__name__)

# Injected at server startup to avoid circular imports
_db = None
_ai_chat = None


def configure(db, ai_chat_fn):
    """Wire dependencies from server.py."""
    global _db, _ai_chat
    _db = db
    _ai_chat = ai_chat_fn


# ---------- Preferences helpers ----------
DEFAULT_PREFS = {
    "enabled": False,
    "cadence": "daily",  # 'daily' or 'weekly'
    "preferred_hour": 19,  # 0-23 local
    "preferred_minute": 0,
    "preferred_weekday": 6,  # 0=Mon, 6=Sun
    "tz": "America/Los_Angeles",
    "last_sent_at": None,
    "next_due_at": None,
    "seen_article_ids": [],
}


def normalize_prefs(p: Optional[dict]) -> dict:
    out = {**DEFAULT_PREFS, **(p or {})}
    if out["cadence"] not in ("daily", "weekly"):
        out["cadence"] = "daily"
    try:
        out["preferred_hour"] = max(0, min(23, int(out["preferred_hour"])))
        out["preferred_minute"] = max(0, min(59, int(out["preferred_minute"])))
        out["preferred_weekday"] = max(0, min(6, int(out["preferred_weekday"])))
    except (TypeError, ValueError):
        out["preferred_hour"] = 19
        out["preferred_minute"] = 0
        out["preferred_weekday"] = 6
    try:
        pytz.timezone(out["tz"])
    except Exception:  # noqa: BLE001
        out["tz"] = "America/Los_Angeles"
    if out["seen_article_ids"] is None:
        out["seen_article_ids"] = []
    return out


def compute_next_due(prefs: dict, now_utc: Optional[datetime] = None) -> datetime:
    """Compute when this parent's next digest should fire (UTC)."""
    now_utc = now_utc or datetime.now(timezone.utc)
    tz = pytz.timezone(prefs["tz"])
    local_now = now_utc.astimezone(tz)
    target = local_now.replace(
        hour=prefs["preferred_hour"], minute=prefs["preferred_minute"], second=0, microsecond=0,
    )
    if prefs["cadence"] == "daily":
        if target <= local_now:
            target = target + timedelta(days=1)
    else:  # weekly
        delta_days = (prefs["preferred_weekday"] - local_now.weekday()) % 7
        target = target + timedelta(days=delta_days)
        if target <= local_now:
            target = target + timedelta(days=7)
    return target.astimezone(timezone.utc)


# ---------- Content builder ----------
async def _compute_streak_for(student_id: str) -> dict:
    # Mirror server._compute_streak's contract but inlined to avoid circular import.
    if _db is None:
        return {"current_streak": 0, "longest_streak": 0}
    logs = await _db.mission_logs.find(
        {"student_id": student_id, "completed": True},
        {"_id": 0, "completed_at": 1},
    ).sort("completed_at", -1).to_list(2000)
    dates = sorted({l["completed_at"][:10] for l in logs if l.get("completed_at")}, reverse=True)
    if not dates:
        return {"current_streak": 0, "longest_streak": 0}
    today = datetime.now(timezone.utc).date()
    current = 0
    d = today
    date_set = set(dates)
    while d.isoformat() in date_set:
        current += 1
        d = d - timedelta(days=1)
    if current == 0 and (today - timedelta(days=1)).isoformat() in date_set:
        # Allow grace if last completion was yesterday
        d = today - timedelta(days=1)
        while d.isoformat() in date_set:
            current += 1
            d = d - timedelta(days=1)
    # Longest run
    sorted_asc = sorted(dates)
    longest = run = 1
    for i in range(1, len(sorted_asc)):
        prev = datetime.fromisoformat(sorted_asc[i - 1]).date()
        cur = datetime.fromisoformat(sorted_asc[i]).date()
        if (cur - prev).days == 1:
            run += 1
            longest = max(longest, run)
        else:
            run = 1
    return {"current_streak": current, "longest_streak": longest}


async def _student_window_summary(student_id: str, hours_back: int) -> dict:
    """Returns a per-student snapshot of activity in the given window."""
    if _db is None:
        return {}
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=hours_back)).isoformat()
    missions_total = await _db.missions.count_documents({"student_id": student_id})
    logs = await _db.mission_logs.find(
        {"student_id": student_id, "completed_at": {"$gte": cutoff}},
        {"_id": 0, "game_score": 1, "game_key": 1, "completed_at": 1},
    ).to_list(500)
    moments = await _db.moments.find(
        {"student_id": student_id, "timestamp": {"$gte": cutoff}},
        {"_id": 0, "text": 1, "emotion": 1, "timestamp": 1, "moment_type": 1},
    ).sort("timestamp", -1).to_list(50)
    games_played = [l for l in logs if l.get("game_key")]
    top_game = None
    if games_played:
        top = max(games_played, key=lambda x: x.get("game_score") or 0)
        top_game = {"game_key": top["game_key"], "score": top.get("game_score") or 0}
    return {
        "missions_completed": len(logs),
        "missions_total": missions_total,
        "games_played": len(games_played),
        "top_game": top_game,
        "moments": moments[:3],
        "streak": await _compute_streak_for(student_id),
    }


async def _weekly_tips_for_student(student_id: str, profile: Optional[dict]) -> list[dict]:
    """Returns 3 off-app personalized tips. Cached for 7 days per student."""
    if _db is None:
        return []
    cached = await _db.digest_weekly_tips.find_one(
        {"student_id": student_id}, {"_id": 0},
    )
    if cached:
        gen_at = datetime.fromisoformat(cached["generated_at"])
        if datetime.now(timezone.utc) - gen_at < timedelta(days=7):
            return cached.get("tips", [])
    # Generate fresh
    interests = (profile or {}).get("interests") or []
    sensitivities = (profile or {}).get("sensitivities") or []
    motivators = (profile or {}).get("motivators") or []
    grade = (profile or {}).get("grade") or "elementary"
    reading_level = (profile or {}).get("reading_level") or ""
    prompt = (
        "You are a warm, evidence-informed coach helping a parent of a child with ADHD-friendly support needs. "
        "Suggest exactly 3 SHORT, SPECIFIC, OFF-APP activities the family can do together this week to support "
        "the child's focus, regulation, or self-esteem. Each tip must be: (a) doable in under 30 minutes, "
        "(b) low-prep, (c) tied to ADHD research (executive function, dopamine regulation, body-doubling, "
        "co-regulation, mastery loops), and (d) tied to the child's interests when possible.\n\n"
        "Return ONLY valid JSON: a list of 3 objects with keys: title (<= 7 words), why (1 sentence on the "
        "underlying mechanism), how (1-2 sentences on doing it). No preamble, no markdown.\n\n"
        f"Child grade: {grade}\nReading level: {reading_level}\n"
        f"Interests: {', '.join(interests) or '(none specified)'}\n"
        f"Motivators that work: {', '.join(motivators) or '(none specified)'}\n"
        f"Sensitivities to avoid: {', '.join(sensitivities) or '(none)'}\n"
    )
    tips: list[dict] = []
    if _ai_chat is not None:
        try:
            raw = await _ai_chat(
                system_message="You output strict JSON with no commentary.",
                user_text=prompt,
            )
            # Strip code fences if any
            raw = raw.strip()
            if raw.startswith("```"):
                raw = raw.strip("`")
                if raw.lower().startswith("json"):
                    raw = raw[4:]
                raw = raw.strip()
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                for it in parsed[:3]:
                    if isinstance(it, dict) and it.get("title") and it.get("how"):
                        tips.append({
                            "title": str(it["title"])[:80],
                            "why": str(it.get("why", ""))[:200],
                            "how": str(it["how"])[:240],
                        })
        except Exception as e:  # noqa: BLE001
            logger.warning("Tip generation failed for student %s: %s", student_id, e)
    if not tips:
        # Static evidence-backed fallback
        tips = _FALLBACK_TIPS
    now_iso = datetime.now(timezone.utc).isoformat()
    await _db.digest_weekly_tips.update_one(
        {"student_id": student_id},
        {"$set": {"student_id": student_id, "tips": tips, "generated_at": now_iso}},
        upsert=True,
    )
    return tips


_FALLBACK_TIPS = [
    {
        "title": "20-minute movement snack before homework",
        "why": "Aerobic movement primes dopamine + focus circuits for up to 2 hours.",
        "how": "Pick anything that gets a sweat going — backyard dance party, brisk walk, bike loop. No screens, no instructions.",
    },
    {
        "title": "Body-double the hardest task",
        "why": "ADHD brains regulate better with quiet co-presence, not directives.",
        "how": "Sit next to your child while they work on the toughest task for 10 minutes. Don't talk, don't correct — just be there.",
    },
    {
        "title": "Two-minute bedtime brain dump",
        "why": "Externalizing tomorrow's worries shortens sleep latency.",
        "how": "Right before brushing teeth, ask 'what's one thing you're thinking about for tomorrow?' Write it on a sticky together.",
    },
]


# ---------- Email rendering ----------
def _section(title: str, body_html: str) -> str:
    return f"""
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 24px 0;">
      <tr><td style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.12em;color:#A0AEC0;padding:0 0 6px 0;">{_escape(title)}</td></tr>
      <tr><td style="font-size:15px;line-height:1.5;color:#0B132B;font-weight:500;">{body_html}</td></tr>
    </table>
    """


def _kid_card_html(name: str, snap: dict) -> str:
    streak = snap.get("streak") or {}
    cs = streak.get("current_streak", 0)
    longest = streak.get("longest_streak", 0)
    missions = snap.get("missions_completed", 0)
    total_missions = snap.get("missions_total", 0)
    games = snap.get("games_played", 0)
    top = snap.get("top_game")
    moments = snap.get("moments") or []

    cards = []
    cards.append(f"<strong style='color:#0B132B;'>{cs}-day spark streak</strong> ⚡ &nbsp;<span style='color:#A0AEC0;'>(longest: {longest} days)</span>")
    if missions or total_missions:
        cards.append(f"{missions} mission{'s' if missions != 1 else ''} completed")
    if games:
        line = f"{games} mini-game{'s' if games != 1 else ''} played"
        if top:
            line += f" — top score {top['score']} on {_escape(top['game_key'])}"
        cards.append(line)
    bullets = "".join([f"<li style='margin:4px 0;'>{c}</li>" for c in cards])

    moments_html = ""
    if moments:
        items = "".join([
            f"<li style='margin:6px 0;color:#4A5568;'><em>“{_escape((m.get('text') or '')[:140])}”</em> "
            f"<span style='color:#A0AEC0;font-size:12px;'>({_escape(m.get('moment_type') or m.get('emotion') or 'moment')})</span></li>"
            for m in moments if m.get("text")
        ])
        if items:
            moments_html = f"<p style='margin:12px 0 4px;font-weight:700;color:#0B132B;'>Recent moments</p><ul style='margin:0;padding-left:18px;'>{items}</ul>"

    return f"""
    <table role='presentation' cellpadding='0' cellspacing='0' border='0' width='100%' style='background:#F8FAFC;border-radius:18px;border:2px solid #E2E8F0;margin:0 0 16px 0;'>
      <tr><td style='padding:18px 22px;'>
        <p style='margin:0 0 6px 0;font-size:20px;font-weight:900;color:#0B132B;'>{_escape(name)}</p>
        <ul style='margin:0;padding-left:18px;color:#0B132B;'>{bullets}</ul>
        {moments_html}
      </td></tr>
    </table>
    """


def _tips_html(tips: list[dict]) -> str:
    if not tips:
        return ""
    items = "".join([
        f"<li style='margin:10px 0;'>"
        f"<strong style='color:#0B132B;'>{_escape(t.get('title',''))}</strong><br/>"
        f"<span style='color:#4A5568;font-size:13px;font-style:italic;'>{_escape(t.get('why',''))}</span><br/>"
        f"<span style='color:#0B132B;'>{_escape(t.get('how',''))}</span>"
        f"</li>"
        for t in tips
    ])
    return f"<ul style='margin:0;padding-left:20px;'>{items}</ul>"


def _article_html(article: dict) -> str:
    return (
        f"<table role='presentation' cellpadding='0' cellspacing='0' border='0' width='100%' "
        f"style='background:#FFF5E6;border-radius:18px;border:2px solid #FFD166;'>"
        f"<tr><td style='padding:16px 20px;'>"
        f"<p style='margin:0;font-size:11px;text-transform:uppercase;letter-spacing:0.12em;font-weight:800;color:#876200;'>📰 Worth a read · {_escape(article['source'])}</p>"
        f"<p style='margin:8px 0 6px;font-size:17px;font-weight:900;color:#0B132B;'>"
        f"<a href='{_escape(article['url'])}' style='color:#0B132B;text-decoration:underline;'>{_escape(article['title'])}</a>"
        f"</p>"
        f"<p style='margin:0;font-size:13px;color:#4A5568;font-weight:600;line-height:1.45;'>{_escape(article['blurb'])}</p>"
        f"</td></tr></table>"
    )


def _digest_html(*, parent_name: str, period_label: str, kid_cards: list[str],
                 tips_html: str, article_html: str, app_url: str,
                 preferences_url: str) -> str:
    return f"""\
<!DOCTYPE html>
<html><body style='margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#0B132B;'>
<table role='presentation' width='100%' cellpadding='0' cellspacing='0' border='0' style='padding:24px 12px;'>
  <tr><td align='center'>
    <table role='presentation' cellpadding='0' cellspacing='0' border='0' width='600' style='max-width:600px;background:#ffffff;border-radius:24px;border:2px solid #E2E8F0;overflow:hidden;'>
      <tr><td style='padding:28px 28px 4px;'>
        <table role='presentation' cellpadding='0' cellspacing='0' border='0'>
          <tr>
            <td style='background:#4361EE;border-radius:14px;width:44px;height:44px;text-align:center;vertical-align:middle;color:#fff;font-size:20px;font-weight:900;line-height:44px;'>⚡</td>
            <td style='padding-left:12px;font-size:20px;font-weight:900;color:#0B132B;'>MissionSparks</td>
          </tr>
        </table>
      </td></tr>
      <tr><td style='padding:12px 28px 0 28px;'>
        <p style='margin:0;font-size:12px;text-transform:uppercase;letter-spacing:0.12em;color:#A0AEC0;font-weight:800;'>{_escape(period_label)}</p>
        <h1 style='margin:4px 0 16px;font-size:26px;font-weight:900;color:#0B132B;line-height:1.2;'>Hey {_escape(parent_name)}, here&#39;s the latest</h1>
      </td></tr>
      <tr><td style='padding:0 28px;'>
        {''.join(kid_cards) if kid_cards else "<p style='color:#A0AEC0;font-weight:600;'>No kid activity to report yet.</p>"}
      </td></tr>
      <tr><td style='padding:8px 28px 0;'>
        {_section('Try this off-app', tips_html) if tips_html else ''}
      </td></tr>
      <tr><td style='padding:0 28px;'>
        {article_html}
      </td></tr>
      <tr><td align='center' style='padding:24px 28px 8px;'>
        <a href='{_escape(app_url)}' style='display:inline-block;background:#4361EE;color:#fff;text-decoration:none;font-weight:800;padding:12px 22px;border-radius:14px;box-shadow:0 4px 0 0 #3A53CC;font-size:15px;'>Open MissionSparks</a>
      </td></tr>
      <tr><td style='padding:8px 28px 24px;border-top:1px solid #E2E8F0;'>
        <p style='font-size:11px;color:#A0AEC0;font-weight:600;text-align:center;margin:16px 0 0;'>
          You&#39;re getting this because you opted in to family digests.
          <a href='{_escape(preferences_url)}' style='color:#4361EE;text-decoration:underline;'>Manage preferences</a>.
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>"""


def _digest_text(parent_name: str, period_label: str, kid_blocks: list[str],
                 tips: list[dict], article: dict, app_url: str, preferences_url: str) -> str:
    parts = [f"MissionSparks — {period_label}", f"\nHey {parent_name},\n"]
    if kid_blocks:
        parts.extend(kid_blocks)
    else:
        parts.append("No kid activity to report yet.")
    if tips:
        parts.append("\nTry this off-app:")
        for t in tips:
            parts.append(f"- {t['title']}: {t['how']}")
    parts.append(f"\nWorth a read ({article['source']}): {article['title']}\n{article['url']}\n{article['blurb']}")
    parts.append(f"\nOpen MissionSparks: {app_url}")
    parts.append(f"Manage preferences: {preferences_url}")
    return "\n".join(parts)


def _text_kid_block(name: str, snap: dict) -> str:
    s = snap.get("streak") or {}
    lines = [f"\n— {name} —", f"Spark streak: {s.get('current_streak', 0)} days (longest {s.get('longest_streak', 0)})"]
    if snap.get("missions_completed"):
        lines.append(f"Missions completed: {snap['missions_completed']}")
    if snap.get("games_played"):
        top = snap.get("top_game")
        suf = f" — top score {top['score']} on {top['game_key']}" if top else ""
        lines.append(f"Mini-games played: {snap['games_played']}{suf}")
    for m in (snap.get("moments") or []):
        if m.get("text"):
            lines.append(f"Moment: \"{m['text'][:120]}\"")
    return "\n".join(lines)


# ---------- Send pipeline ----------
async def _build_and_send(parent_user: dict, *, force: bool = False) -> dict:
    """Build the digest body for this parent, send it, and update prefs.
    Returns {'sent': bool, 'email_id': str|None, 'reason': str}."""
    if _db is None:
        return {"sent": False, "reason": "db not configured"}
    prefs = normalize_prefs(parent_user.get("digest_preferences"))
    if not prefs["enabled"] and not force:
        return {"sent": False, "reason": "opted-out"}

    # Aggregate accessible students for this parent (any family they belong to)
    fams_cursor = _db.families.find({"members.user_id": parent_user["id"]}, {"_id": 0, "student_ids": 1})
    student_ids = set()
    async for f in fams_cursor:
        student_ids.update(f.get("student_ids") or [])
    if not student_ids:
        return {"sent": False, "reason": "no students"}

    hours_back = 24 if prefs["cadence"] == "daily" else 24 * 7
    period_label = "Your daily MissionSparks digest" if prefs["cadence"] == "daily" else "Your weekly MissionSparks digest"

    students = await _db.users.find(
        {"id": {"$in": list(student_ids)}}, {"_id": 0, "id": 1, "name": 1, "student_profile": 1},
    ).to_list(20)

    kid_cards_html: list[str] = []
    kid_blocks_text: list[str] = []
    for s in students:
        snap = await _student_window_summary(s["id"], hours_back)
        kid_cards_html.append(_kid_card_html(s["name"], snap))
        kid_blocks_text.append(_text_kid_block(s["name"], snap))

    # Pick weekly tips — generate from the first student's profile (combined later)
    tips: list[dict] = []
    if students:
        prof = students[0].get("student_profile") or {}
        tips = await _weekly_tips_for_student(students[0]["id"], prof)

    article = pick_article_for_parent(prefs.get("seen_article_ids") or [])

    app_url = (os.environ.get("PUBLIC_APP_URL") or "https://missionsparks.com").rstrip("/")
    preferences_url = f"{app_url}/account"

    html = _digest_html(
        parent_name=parent_user.get("name") or "there",
        period_label=period_label,
        kid_cards=kid_cards_html,
        tips_html=_tips_html(tips),
        article_html=_article_html(article),
        app_url=app_url,
        preferences_url=preferences_url,
    )
    text = _digest_text(
        parent_name=parent_user.get("name") or "there",
        period_label=period_label,
        kid_blocks=kid_blocks_text,
        tips=tips,
        article=article,
        app_url=app_url,
        preferences_url=preferences_url,
    )

    subject = "Your daily MissionSparks digest 🌅" if prefs["cadence"] == "daily" else "Your weekly MissionSparks digest ⚡"

    email_id: Optional[str] = None
    if _configure_if_needed():
        try:
            params = {
                "from": _from_address(),
                "to": [parent_user["email"]],
                "subject": subject,
                "html": html,
                "text": text,
            }
            resp = await asyncio.to_thread(resend.Emails.send, params)
            email_id = resp.get("id") if isinstance(resp, dict) else None
        except Exception as e:  # noqa: BLE001
            logger.warning("Digest send failed for %s: %s", parent_user["email"], e)

    # Update prefs even on failure: rotate article + update next_due so we
    # don't spam the user retrying. last_sent_at only on success.
    now = datetime.now(timezone.utc)
    new_seen = (prefs.get("seen_article_ids") or []) + [article["id"]]
    if len(new_seen) >= len(CURATED_ARTICLES):
        new_seen = []  # rotate back to start
    next_due = compute_next_due(prefs, now_utc=now)
    updates = {
        "digest_preferences.seen_article_ids": new_seen,
        "digest_preferences.next_due_at": next_due.isoformat(),
    }
    if email_id:
        updates["digest_preferences.last_sent_at"] = now.isoformat()
        updates["digest_preferences.last_email_message_id"] = email_id
    await _db.users.update_one({"id": parent_user["id"]}, {"$set": updates})

    return {"sent": bool(email_id), "email_id": email_id, "reason": "ok" if email_id else "resend failed"}


async def send_sample_to(parent_user: dict) -> dict:
    """User-triggered immediate digest send. Bypasses enabled gate."""
    return await _build_and_send(parent_user, force=True)


async def dispatch_due_digests() -> int:
    """Called by APScheduler hourly. Sends digests for everyone whose
    next_due_at has passed. Returns number of digests successfully sent."""
    if _db is None:
        return 0
    now_iso = datetime.now(timezone.utc).isoformat()
    cursor = _db.users.find(
        {
            "role": "parent",
            "digest_preferences.enabled": True,
            "$or": [
                {"digest_preferences.next_due_at": {"$lte": now_iso}},
                {"digest_preferences.next_due_at": None},
                {"digest_preferences.next_due_at": {"$exists": False}},
            ],
        },
        {"_id": 0},
    )
    sent = 0
    async for u in cursor:
        try:
            res = await _build_and_send(u)
            if res.get("sent"):
                sent += 1
        except Exception as e:  # noqa: BLE001
            logger.exception("Digest dispatch error for %s: %s", u.get("email"), e)
    return sent

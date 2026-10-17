from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import uuid
import asyncio
import secrets
import logging
from email_service import send_family_invite_email
import digest_service
import push_service
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Response, Request
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field, ConfigDict

from emergentintegrations.llm.chat import LlmChat, UserMessage
import json
import re

from research_data import (
    CITATIONS,
    SKILL_EVIDENCE,
    STRATEGY_EVIDENCE,
    MOMENT_TYPE_EVIDENCE,
    TRIGGER_EVIDENCE,
    GAME_EVIDENCE,
    AI_TAG_EVIDENCE,
    all_known_tags,
)


# ---------- DB ----------
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

# ---------- JWT ----------
JWT_ALGORITHM = "HS256"
JWT_SECRET = os.environ["JWT_SECRET"]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_short_token(user_id: str, email: str, hours: int = 4) -> str:
    """Shorter-lived session for kids logging in via Home Page PIN."""
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(hours=hours),
        "type": "access",
        "src": "home_pin",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def set_auth_cookie(response: Response, token: str, max_age: int = 60 * 60 * 24 * 7) -> None:
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=max_age,
        path="/",
    )


# ---------- Models ----------
Role = Literal["parent", "student"]


class UserPublic(BaseModel):
    id: str
    role: Role
    name: str
    email: EmailStr
    linked_student_ids: List[str] = []
    profile_notes: str = ""
    discard_audio: bool = True  # privacy-by-default: drop audio after transcription
    terms_accepted_at: Optional[str] = None
    # Family group context (Iter 15)
    families: List[dict] = []  # [{id, name, role: 'owner'|'co_parent'|'viewer'}]
    active_family_id: Optional[str] = None
    active_family_role: Optional[str] = None
    # Home dashboard context (Iter 18)
    home_pin_set: bool = False


class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: Role
    accept_terms: bool = False


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class Skill(BaseModel):
    id: str
    name: str
    category: Literal["Reading", "Executive Function"]
    description: str
    evidence_refs: List[str] = []  # citation ids


class Strategy(BaseModel):
    id: str
    name: str
    description: str
    emoji: str = "✨"
    evidence_refs: List[str] = []  # citation ids


class Citation(BaseModel):
    id: str
    key: str
    title: str
    authors: str
    year: int
    source: str
    source_type: Literal["peer_reviewed", "org", "book", "guideline"]
    url: Optional[str] = None
    summary: str
    tags: List[str] = []


class MissionStep(BaseModel):
    text: str
    done: bool = False


class MissionRecurrence(BaseModel):
    pattern: Literal["none", "daily", "weekdays", "weekends", "weekly"] = "none"
    end_date: Optional[str] = None  # ISO; defaults to +30 days at creation


class MissionCreate(BaseModel):
    student_id: str
    title: str
    description: Optional[str] = ""
    steps: List[str] = []
    estimated_minutes: int = 10
    due_date: str  # ISO date string YYYY-MM-DD
    skill_ids: List[str] = []
    strategy_ids: List[str] = []
    recurrence: Optional[MissionRecurrence] = None
    # Verification (Iter 21):
    #   "trust"        — kid self-completes, streak instant (default)
    #   "parent_pin"   — parent enters their 4-digit verify PIN at completion time
    #   "photo"        — kid attaches a photo of their work; auto-completes
    #   "async_review" — kid marks "ready"; parent approves later; streak on approval
    verification: Literal["trust", "parent_pin", "photo", "async_review"] = "trust"
    # For async_review: hours after "ready" before an unreviewed log auto-approves.
    # 0 disables the safety net. Default 24h so parents can't accidentally break streaks.
    auto_approve_hours: int = 24


class MissionUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    steps: Optional[List[str]] = None
    estimated_minutes: Optional[int] = None
    due_date: Optional[str] = None
    skill_ids: Optional[List[str]] = None
    strategy_ids: Optional[List[str]] = None
    verification: Optional[Literal["trust", "parent_pin", "photo", "async_review"]] = None
    auto_approve_hours: Optional[int] = None
    # Recurring-mission edit scope:
    #   "this" (default) — only this occurrence
    #   "future"         — this + all future occurrences in the series (uncompleted only)
    #   "series"         — every occurrence in the series (uncompleted only)
    # History (completed instances) is never modified — per product spec.
    scope: Optional[Literal["this", "future", "series"]] = "this"


class MissionDuplicateRequest(BaseModel):
    due_date: str  # ISO


# ---------- Reading practice ----------
class ReadingPassageRequest(BaseModel):
    student_id: str
    topic_hint: Optional[str] = None  # parent can nudge: "dinosaurs", "soccer", etc.
    level_override: Optional[str] = None  # "below" | "on" | "above" — overrides profile

class ReadingQuestion(BaseModel):
    id: str
    text: str
    type: str  # "literal" | "inferential" | "vocabulary"
    answer_key: str  # what a strong answer looks like (used for feedback)

class ReadingPassage(BaseModel):
    id: str
    student_id: str
    parent_id: str
    title: str
    topic: str
    level: str  # "below" | "on" | "above"
    grade_target: str  # e.g. "2nd grade", "3rd grade"
    word_count: int
    body: str
    questions: List[ReadingQuestion] = []
    citations: List[str] = []  # citation ids backing the design
    created_at: str

class ReadingAnswerSubmission(BaseModel):
    answers: dict  # {question_id: answer_text}

class ReadingFeedback(BaseModel):
    per_question: List[dict]  # [{question_id, correct: bool, feedback: str}]
    overall: str
    score: int  # 0-N correct
    total: int


class WritingPromptRequest(BaseModel):
    student_id: str
    topic_hint: Optional[str] = None
    level_override: Optional[str] = None

class WritingPiece(BaseModel):
    id: str
    student_id: str
    parent_id: str
    prompt: str
    scaffold: List[str] = []  # paragraph frame steps
    sentence_starters: List[str] = []
    topic: str
    level: str
    citations: List[str] = []
    draft: str = ""
    feedback: str = ""
    submitted_at: Optional[str] = None
    created_at: str

class WritingSubmission(BaseModel):
    draft: str


class Mission(BaseModel):
    id: str
    student_id: str
    title: str
    description: str = ""
    steps: List[str] = []
    estimated_minutes: int = 10
    due_date: str
    skill_ids: List[str] = []
    strategy_ids: List[str] = []
    created_by_user_id: str
    created_at: str
    recurrence_pattern: Optional[str] = None
    recurrence_parent_id: Optional[str] = None
    mission_type: str = "standard"  # "standard" | "reading_passage" | "writing_prompt"
    linked_passage_id: Optional[str] = None
    linked_writing_id: Optional[str] = None
    verification: str = "trust"
    auto_approve_hours: int = 24


class PracticeMissionRequest(BaseModel):
    student_id: str
    due_date: str
    kind: Literal["reading", "writing"]
    topic_hint: Optional[str] = None
    level_override: Optional[str] = None
    estimated_minutes: int = 15


# ---------- Mission Log ----------
class MissionLogCreate(BaseModel):
    status: Literal["not_started", "in_progress", "completed", "skipped"]
    used_strategies: bool = False
    difficulty_rating: Optional[Literal["easy", "medium", "hard"]] = None
    feeling: Optional[Literal["bad", "okay", "good"]] = None
    note: Optional[str] = ""
    clue_captures: List[str] = []
    # Verification (Iter 21):
    #   Kid passes a short-lived parent-PIN verification token here when completing a
    #   mission that requires "parent_pin" verification. Backend consumes the token
    #   (single-use, 2min TTL) and refuses the log otherwise.
    parent_verify_token: Optional[str] = None
    # For "photo"-verified missions: base64 (data URL or raw) of a small JPEG.
    photo_data: Optional[str] = None


class MissionLog(BaseModel):
    id: str
    mission_id: str
    student_id: str
    status: str
    used_strategies: bool = False
    difficulty_rating: Optional[str] = None
    feeling: Optional[str] = None
    note: str = ""
    clue_captures: List[str] = []
    game_played: bool = False
    game_key: Optional[str] = None
    game_score: Optional[int] = None
    timestamp: str
    # Verification (Iter 21)
    verification: str = "trust"                         # mirror of mission.verification at log time
    verification_status: str = "not_required"           # not_required | pending | approved | rejected
    verified_by_user_id: Optional[str] = None
    verified_at: Optional[str] = None
    photo_id: Optional[str] = None                      # id in db.mission_photos
    rejected_reason: Optional[str] = None
    auto_approved: bool = False


class LinkStudentRequest(BaseModel):
    student_email: EmailStr
    # COPPA-related consent (collected on link)
    guardian_name: Optional[str] = None
    guardian_relationship: Optional[str] = None
    child_under_13: Optional[bool] = None
    consent_given: Optional[bool] = None
    # Iter 24 — new-kid create-and-link flow. When the given email doesn't
    # match any existing user AND these fields are set, we create the student
    # account inline and then link. If the email DOES exist, we link the
    # existing one (unchanged behavior).
    student_name: Optional[str] = None
    student_password: Optional[str] = None
    grade: Optional[str] = None
    reading_level: Optional[str] = None


class AccountPrefsUpdate(BaseModel):
    discard_audio: Optional[bool] = None


# ---------- Student profile (Phase 1: parent intake) ----------
class StudentProfile(BaseModel):
    """Structured intake captured by parents about their child. Drives AI mission
    drafting and persists alongside the user document so updates are atomic."""
    # Basics
    grade: Optional[str] = None
    reading_level: Optional[str] = None  # "below", "on", "above"
    school: Optional[str] = None

    # ADHD
    diagnosed: Optional[bool] = None
    adhd_subtype: Optional[str] = None  # "combined", "inattentive", "hyperactive", "uncertain"
    diagnosis_year: Optional[int] = None
    on_medication: Optional[bool] = None

    # Custom domains (free-form lists kept short)
    interests: List[str] = []
    sensitivities: List[str] = []
    peak_hours: List[str] = []  # any of: "early_morning", "morning", "afternoon", "evening"
    common_triggers: List[str] = []
    strengths: List[str] = []
    motivators: List[str] = []

    # NICHQ Vanderbilt parent screen — 18 items, 0–3 scale (never/occasionally/often/very often)
    vanderbilt_inattention: List[int] = []  # 9 items, indices 0-8
    vanderbilt_hyperactivity: List[int] = []  # 9 items, indices 0-8
    vanderbilt_taken_at: Optional[str] = None

    # AI interview output (synthesized summary)
    interview_summary: Optional[str] = None
    interview_completed_at: Optional[str] = None

    # Free notes
    parent_notes: Optional[str] = None

    # Kid Studio unlock: minimum current-streak (Sparks) the kid must have to
    # unlock game-pack authoring. Default 7 days.
    game_studio_unlock_streak: int = 7

    updated_at: Optional[str] = None


class InterviewMessage(BaseModel):
    role: str  # "assistant" | "parent"
    content: str
    ts: Optional[str] = None


class InterviewSession(BaseModel):
    id: str
    student_id: str
    parent_id: str
    status: str  # "active" | "completed"
    messages: List[InterviewMessage] = []
    created_at: str
    updated_at: str


class InterviewReplyRequest(BaseModel):
    content: str


# ---------- App ----------
app = FastAPI(title="MissionSparks API")
api = APIRouter(prefix="/api")


logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("missionsparks")


async def _user_to_public(u: dict) -> "UserPublic":
    families_list: List[dict] = []
    active_id: Optional[str] = u.get("active_family_id")
    active_role: Optional[str] = None
    if u["role"] == "parent":
        cursor = db.families.find({"members.user_id": u["id"]}, {"_id": 0, "id": 1, "name": 1, "members": 1})
        async for fam in cursor:
            m = next((mm for mm in fam.get("members", []) if mm["user_id"] == u["id"]), None)
            role = (m or {}).get("role") or "co_parent"
            families_list.append({"id": fam["id"], "name": fam["name"], "role": role})
            if fam["id"] == active_id:
                active_role = role
        # If active_family_id missing/stale, fall back to first
        if families_list and (not active_id or not active_role):
            active_id = families_list[0]["id"]
            active_role = families_list[0]["role"]
    return UserPublic(
        id=u["id"],
        role=u["role"],
        name=u["name"],
        email=u["email"],
        linked_student_ids=u.get("linked_student_ids", []),
        profile_notes=u.get("profile_notes", ""),
        discard_audio=u.get("discard_audio", True),
        terms_accepted_at=u.get("terms_accepted_at"),
        families=families_list,
        active_family_id=active_id,
        active_family_role=active_role,
        home_pin_set=bool(u.get("home_pin_hash")),
    )


# ---------- Family Group System (Iter 15) ----------
FAMILY_ROLES = ("owner", "co_parent", "viewer")
INVITE_TTL_DAYS = 14


class FamilyMember(BaseModel):
    user_id: str
    role: Literal["owner", "co_parent", "viewer"]
    joined_at: str
    invited_by_user_id: Optional[str] = None


class Family(BaseModel):
    id: str
    name: str
    slug: Optional[str] = None
    owner_user_id: str
    created_at: str
    members: List[FamilyMember] = []
    student_ids: List[str] = []
    home_dashboard_enabled: bool = False


class FamilyCreate(BaseModel):
    name: str


class FamilyUpdate(BaseModel):
    name: Optional[str] = None


class FamilyInviteCreate(BaseModel):
    email: EmailStr
    role: Literal["co_parent", "viewer"] = "co_parent"


class FamilyInvitePublic(BaseModel):
    id: str
    family_id: str
    family_name: str
    email: str
    role: str
    invited_by_name: Optional[str] = None
    expires_at: str
    status: str


class MemberRoleUpdate(BaseModel):
    role: Literal["owner", "co_parent", "viewer"]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _user_role_in_family(user: dict, family_id: str) -> Optional[str]:
    fam = await db.families.find_one(
        {"id": family_id, "members.user_id": user["id"]},
        {"_id": 0, "members": 1},
    )
    if not fam:
        return None
    m = next((m for m in fam["members"] if m["user_id"] == user["id"]), None)
    return m["role"] if m else None


async def _user_role_for_student(user: dict, student_id: str) -> Optional[str]:
    """Returns 'owner'|'co_parent'|'viewer' if user belongs to any family that
    contains this student, else None. Picks highest privilege if member of
    multiple families containing the student."""
    cursor = db.families.find(
        {"student_ids": student_id, "members.user_id": user["id"]},
        {"_id": 0, "members": 1},
    )
    rank = {"owner": 3, "co_parent": 2, "viewer": 1}
    best = None
    async for fam in cursor:
        m = next((m for m in fam["members"] if m["user_id"] == user["id"]), None)
        if m and (best is None or rank[m["role"]] > rank[best]):
            best = m["role"]
    return best


async def _accessible_student_ids(user: dict) -> List[str]:
    """Every student the user can access via any family they belong to."""
    if user["role"] == "student":
        return [user["id"]]
    cursor = db.families.find({"members.user_id": user["id"]}, {"_id": 0, "student_ids": 1})
    ids: set = set()
    async for fam in cursor:
        ids.update(fam.get("student_ids") or [])
    return list(ids)


async def _accessible_family_ids(user: dict) -> List[str]:
    cursor = db.families.find({"members.user_id": user["id"]}, {"_id": 0, "id": 1})
    return [f["id"] async for f in cursor]


async def _families_containing_student(student_id: str) -> List[dict]:
    return await db.families.find({"student_ids": student_id}, {"_id": 0}).to_list(50)


async def _sync_user_linked_students(user_id: str) -> None:
    """Keep the legacy linked_student_ids field on the user in sync with their
    family memberships (used by older code paths and tests)."""
    cursor = db.families.find({"members.user_id": user_id}, {"_id": 0, "student_ids": 1})
    ids: set = set()
    async for fam in cursor:
        ids.update(fam.get("student_ids") or [])
    await db.users.update_one({"id": user_id}, {"$set": {"linked_student_ids": list(ids)}})


async def _ensure_personal_family(parent_user: dict) -> str:
    """If parent has no family, create one (auto-migration). Returns active_family_id."""
    existing = await db.families.find_one({"members.user_id": parent_user["id"]}, {"_id": 0, "id": 1, "slug": 1})
    if existing:
        if not parent_user.get("active_family_id"):
            await db.users.update_one({"id": parent_user["id"]}, {"$set": {"active_family_id": existing["id"]}})
        # Backfill slug if missing
        if not existing.get("slug"):
            slug = await _generate_unique_slug(f"{parent_user.get('name') or 'My'} Family")
            await db.families.update_one({"id": existing["id"]}, {"$set": {"slug": slug}})
        return existing["id"]
    fid = str(uuid.uuid4())
    now = _now_iso()
    name = f"{parent_user.get('name') or 'My'} Family"
    slug = await _generate_unique_slug(name)
    fam = {
        "id": fid,
        "name": name,
        "slug": slug,
        "owner_user_id": parent_user["id"],
        "created_at": now,
        "members": [{
            "user_id": parent_user["id"],
            "role": "owner",
            "joined_at": now,
            "invited_by_user_id": None,
        }],
        "student_ids": list(parent_user.get("linked_student_ids", [])),
        "home_dashboard_enabled": False,
    }
    await db.families.insert_one(dict(fam))
    await db.users.update_one({"id": parent_user["id"]}, {"$set": {"active_family_id": fid}})
    return fid


def _slugify(name: str) -> str:
    s = (name or "").lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return (s[:50]) or "family"


async def _generate_unique_slug(name: str) -> str:
    base = _slugify(name)
    candidate = base
    i = 2
    while await db.families.find_one({"slug": candidate}, {"_id": 0, "id": 1}):
        candidate = f"{base}-{i}"
        i += 1
        if i > 1000:
            candidate = f"{base}-{uuid.uuid4().hex[:6]}"
            break
    return candidate


async def _migrate_existing_parents() -> None:
    """One-time idempotent migration: ensure every parent has at least one family."""
    cursor = db.users.find({"role": "parent"}, {"_id": 0})
    async for p in cursor:
        await _ensure_personal_family(p)


def _assert_family_write_role(role: Optional[str]) -> None:
    if role is None:
        raise HTTPException(status_code=403, detail="Not a member of this family")
    if role == "viewer":
        raise HTTPException(status_code=403, detail="Viewers can read but not modify family data.")


def _assert_family_owner(role: Optional[str]) -> None:
    if role != "owner":
        raise HTTPException(status_code=403, detail="Only the family owner can do this.")


def _strip_id(d: Optional[dict]) -> Optional[dict]:
    if d and "_id" in d:
        d = {k: v for k, v in d.items() if k != "_id"}
    return d


# ---------- Audit log ----------
async def _audit(user: dict, action: str, target_type: Optional[str] = None,
                 target_id: Optional[str] = None, meta: Optional[dict] = None) -> None:
    try:
        await db.audit_log.insert_one({
            "id": str(uuid.uuid4()),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "user_id": user.get("id"),
            "user_email": user.get("email"),
            "user_role": user.get("role"),
            "action": action,
            "target_type": target_type,
            "target_id": target_id,
            "meta": meta or {},
        })
    except Exception:
        logger.exception("Failed to write audit entry %s", action)


# ---------- Auth dep ----------
async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def require_role(role: Role):
    async def dep(user: dict = Depends(get_current_user)):
        if user["role"] != role:
            raise HTTPException(status_code=403, detail=f"{role} role required")
        return user

    return dep


# ---------- Auth routes ----------
@api.post("/auth/register", response_model=UserPublic)
async def register(req: RegisterRequest, response: Response):
    email = req.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    if not req.accept_terms:
        raise HTTPException(status_code=400, detail="You must accept the Terms of Service and Privacy Policy to register.")
    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": user_id,
        "name": req.name,
        "email": email,
        "password_hash": hash_password(req.password),
        "role": req.role,
        "linked_student_ids": [],
        "discard_audio": True,
        "terms_accepted_at": now,
        "created_at": now,
    }
    await db.users.insert_one(doc)
    token = create_access_token(user_id, email)
    set_auth_cookie(response, token)
    await _audit(doc, "auth.register", target_type="user", target_id=user_id)
    if doc["role"] == "parent":
        await _ensure_personal_family(doc)
        doc = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    return await _user_to_public(doc)


@api.post("/auth/login", response_model=UserPublic)
async def login(req: LoginRequest, response: Response):
    email = req.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(user["id"], email)
    set_auth_cookie(response, token)
    await _audit(user, "auth.login", target_type="user", target_id=user["id"])
    if user["role"] == "parent":
        await _ensure_personal_family(user)
        user = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
    return await _user_to_public(user)


@api.post("/auth/logout")
async def logout(response: Response, request: Request):
    # best-effort audit
    try:
        u = await get_current_user(request)
        await _audit(u, "auth.logout")
    except Exception:
        pass
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


@api.get("/auth/me", response_model=UserPublic)
async def me(user: dict = Depends(get_current_user)):
    return await _user_to_public(user)


# ---------- Skills & Strategies ----------
@api.get("/skills", response_model=List[Skill])
async def list_skills(user: dict = Depends(get_current_user)):
    return await db.skills.find({}, {"_id": 0}).to_list(1000)


@api.get("/strategies", response_model=List[Strategy])
async def list_strategies(user: dict = Depends(get_current_user)):
    return await db.strategies.find({}, {"_id": 0}).to_list(1000)


# ---------- Student profile (Phase 1 intake) ----------
@api.get("/students/{student_id}/intake", response_model=StudentProfile)
async def get_student_intake(student_id: str, user: dict = Depends(require_role("parent"))):
    await _assert_parent_owns_student(user, student_id)
    s = await db.users.find_one({"id": student_id}, {"_id": 0, "password_hash": 0})
    if not s:
        raise HTTPException(status_code=404, detail="Student not found")
    return StudentProfile(**(s.get("student_profile") or {}))


@api.put("/students/{student_id}/intake", response_model=StudentProfile)
async def set_student_intake(student_id: str, profile: StudentProfile,
                              user: dict = Depends(require_role("parent"))):
    await _assert_parent_owns_student(user, student_id)
    data = profile.model_dump(exclude_none=False)
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.users.update_one({"id": student_id}, {"$set": {"student_profile": data}})
    await _audit(user, "intake.update", target_type="student", target_id=student_id)
    return StudentProfile(**data)


# ---------- AI Interview (text-only, parent-led) ----------
INTERVIEW_SYSTEM_PROMPT = (
    "You are MissionSparks' onboarding coach. You're having a warm, conversational "
    "chat with a parent to learn enough about their child to make daily learning "
    "missions actually feel personalized.\n\n"
    "Rules:\n"
    "- Ask ONE short, focused question at a time. No bullet lists, no preamble.\n"
    "- Build naturally on the parent's previous answers — use what they said.\n"
    "- Warm, second-person ('you', 'your child'), zero clinical jargon, no emoji.\n"
    "- Cover (in roughly this order, skipping anything they've already told you):\n"
    "    1) What their child is genuinely interested in or excited by\n"
    "    2) What they're working on academically right now (and what's hard)\n"
    "    3) Time of day when their child is at their best\n"
    "    4) What tends to derail a learning session\n"
    "    5) What encouragement style actually works for this kid\n"
    "    6) Any sensory or environmental sensitivities to plan around\n"
    "- After about 6-8 exchanges (your messages count + their messages count), "
    "  if you have enough useful detail, FINISH the interview by responding with the "
    "  exact token <<<WRAP_UP>>> on its own line, followed by a single warm sign-off "
    "  sentence. Do not ask more questions after WRAP_UP.\n"
    "- If the parent gives a very short answer, gently probe once for specifics — "
    "  but only once per topic, then move on.\n"
)


async def _ai_chat_with_history(system_message: str, messages: List[dict]) -> str:
    """Multi-turn chat: collapses prior turns into a single transcript prompt
    sent alongside the system message. Stateless and simple."""
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="AI is not configured.")
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"missionsparks-iv-{uuid.uuid4()}",
        system_message=system_message,
    ).with_model(AI_MODEL_PROVIDER, AI_MODEL_NAME)
    transcript = "\n".join(
        f"{'Coach' if m['role'] == 'assistant' else 'Parent'}: {m['content']}"
        for m in messages
    )
    user_text = (
        "Conversation so far:\n"
        f"{transcript}\n\n"
        "Send the next message. Reply with only what the Coach should say next — "
        "no labels, no quotation marks."
    )
    try:
        return (await chat.send_message(UserMessage(text=user_text))).strip()
    except Exception as e:
        logger.exception("Interview AI call failed")
        raise HTTPException(status_code=502, detail=f"AI service error: {e}") from e


@api.post("/students/{student_id}/interview", response_model=InterviewSession)
async def start_interview(student_id: str, user: dict = Depends(require_role("parent"))):
    await _assert_parent_owns_student(user, student_id)
    student = await db.users.find_one({"id": student_id}, {"_id": 0, "password_hash": 0})
    name = student.get("name", "your child")
    # Resume an active session if one already exists
    active = await db.interview_sessions.find_one(
        {"student_id": student_id, "parent_id": user["id"], "status": "active"},
        {"_id": 0},
    )
    if active:
        return InterviewSession(**active)

    opener = (
        f"Hi! I'd love to learn a little about {name} so the missions we draft "
        "actually fit them. To start with — what's something they're genuinely "
        "into right now? Could be a topic, a character, a game, a hobby — anything."
    )
    now = datetime.now(timezone.utc).isoformat()
    session = {
        "id": str(uuid.uuid4()),
        "student_id": student_id,
        "parent_id": user["id"],
        "status": "active",
        "messages": [{"role": "assistant", "content": opener, "ts": now}],
        "created_at": now,
        "updated_at": now,
    }
    await db.interview_sessions.insert_one(session)
    await _audit(user, "interview.start", target_type="student", target_id=student_id, meta={"session_id": session["id"]})
    return InterviewSession(**session)


@api.post("/interviews/{session_id}/reply", response_model=InterviewSession)
async def interview_reply(session_id: str, req: InterviewReplyRequest,
                          user: dict = Depends(require_role("parent"))):
    sess = await db.interview_sessions.find_one({"id": session_id}, {"_id": 0})
    if not sess:
        raise HTTPException(status_code=404, detail="Interview session not found")
    if sess["parent_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not your interview session")
    if sess["status"] != "active":
        raise HTTPException(status_code=409, detail="Interview already finished")
    if not req.content.strip():
        raise HTTPException(status_code=400, detail="Reply cannot be empty")

    now = datetime.now(timezone.utc).isoformat()
    sess["messages"].append({"role": "parent", "content": req.content.strip()[:2000], "ts": now})

    # Persist the parent's turn BEFORE calling the LLM so a transient AI failure
    # does not silently drop their message.
    await db.interview_sessions.update_one(
        {"id": session_id},
        {"$set": {"messages": sess["messages"], "updated_at": now}},
    )

    ai_reply = await _ai_chat_with_history(INTERVIEW_SYSTEM_PROMPT, sess["messages"])
    sess["messages"].append({"role": "assistant", "content": ai_reply, "ts": now})
    sess["updated_at"] = now
    # If the model signaled wrap-up, auto-complete; caller still POSTs /finish to synthesize the profile.
    if "<<<WRAP_UP>>>" in ai_reply:
        sess["status"] = "completed"
    await db.interview_sessions.update_one(
        {"id": session_id},
        {"$set": {"messages": sess["messages"], "updated_at": now, "status": sess["status"]}},
    )
    return InterviewSession(**sess)


@api.post("/interviews/{session_id}/finish", response_model=StudentProfile)
async def finish_interview(session_id: str, user: dict = Depends(require_role("parent"))):
    sess = await db.interview_sessions.find_one({"id": session_id}, {"_id": 0})
    if not sess:
        raise HTTPException(status_code=404, detail="Interview session not found")
    if sess["parent_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not your interview session")

    # Synthesize the conversation into structured fields
    transcript = "\n".join(
        f"{'Coach' if m['role'] == 'assistant' else 'Parent'}: {m['content']}"
        for m in sess["messages"]
    )
    synth_sys = (
        "You convert a parent–coach interview about a child into a structured JSON profile. "
        "Be conservative — only include fields the parent actually mentioned. "
        "Use short, kid-friendly lowercase tag-style strings for list items "
        "(e.g. 'minecraft', 'dinosaurs', 'noise', 'small rewards'). "
        "Do not invent details. Reply with STRICT JSON only — no prose, no code fences."
    )
    synth_user = (
        f"INTERVIEW TRANSCRIPT:\n{transcript}\n\n"
        'Return a JSON object with this exact shape (omit a field by setting [] or ""): '
        '{ "interests": [str], "sensitivities": [str], "peak_hours": [str from: '
        '"early_morning","morning","afternoon","evening"], '
        '"common_triggers": [str], "strengths": [str], "motivators": [str], '
        '"summary": "1-2 sentence plain-English summary of this child for an AI mission drafter" }'
    )
    raw = await _ai_chat(synth_sys, synth_user)
    data = _extract_json(raw) or {}

    student = await db.users.find_one({"id": sess["student_id"]}, {"_id": 0, "password_hash": 0})
    profile = dict(student.get("student_profile") or {})

    def merge_list(key: str):
        new_items = [str(x).strip() for x in (data.get(key) or []) if str(x).strip()]
        existing = profile.get(key) or []
        seen = set()
        out = []
        for item in existing + new_items:
            k = item.lower()
            if k not in seen:
                seen.add(k)
                out.append(item)
        profile[key] = out[:20]  # cap

    for k in ("interests", "sensitivities", "peak_hours", "common_triggers", "strengths", "motivators"):
        merge_list(k)
    summary = (data.get("summary") or "").strip()
    if summary:
        profile["interview_summary"] = summary
    now = datetime.now(timezone.utc).isoformat()
    profile["interview_completed_at"] = now
    profile["updated_at"] = now

    await db.users.update_one({"id": sess["student_id"]}, {"$set": {"student_profile": profile}})
    await db.interview_sessions.update_one(
        {"id": session_id},
        {"$set": {"status": "completed", "updated_at": now}},
    )
    await _audit(user, "interview.finish", target_type="student", target_id=sess["student_id"],
                 meta={"session_id": session_id, "turns": len(sess["messages"])})
    return StudentProfile(**profile)


@api.get("/students/{student_id}/interview/active", response_model=Optional[InterviewSession])
async def get_active_interview(student_id: str, user: dict = Depends(require_role("parent"))):
    await _assert_parent_owns_student(user, student_id)
    sess = await db.interview_sessions.find_one(
        {"student_id": student_id, "parent_id": user["id"], "status": "active"},
        {"_id": 0},
    )
    return InterviewSession(**sess) if sess else None


# ---------- Research / citations ----------
@api.get("/citations", response_model=List[Citation])
async def list_citations(user: dict = Depends(get_current_user)):
    """All citations in the research library. Parent/student both allowed
    (student UI does not surface them, but the endpoint is read-only and safe)."""
    return await db.citations.find({}, {"_id": 0}).sort("year", -1).to_list(2000)


@api.get("/citations/{citation_id}", response_model=Citation)
async def get_citation(citation_id: str, user: dict = Depends(get_current_user)):
    c = await db.citations.find_one({"id": citation_id}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Citation not found")
    return c


@api.get("/games/catalog")
async def games_catalog(user: dict = Depends(get_current_user)):
    """Mini-game registry with research backing for each game."""
    games = [
        {"key": "word_match", "label": "Word Match", "emoji": "📝", "category": "Reading",
         "description": "Match words to definitions to grow vocabulary in context."},
        {"key": "memory_cards", "label": "Memory Cards", "emoji": "🃏", "category": "Working Memory",
         "description": "Flip pairs from memory — short working-memory training reps."},
        {"key": "reaction_tap", "label": "Reaction Tap", "emoji": "⚡", "category": "Attention",
         "description": "Tap the target when it appears — sustained-attention training."},
        {"key": "breathing_bubble", "label": "Breathing Bubble", "emoji": "🫧", "category": "Self-Regulation",
         "description": "Inhale and exhale with the bubble — diaphragmatic breathing practice."},
        {"key": "dot_connect", "label": "Dot Connect", "emoji": "🔗", "category": "Planning",
         "description": "Connect dots in order — sequencing and planning practice."},
        {"key": "sentence_builder", "label": "Sentence Builder", "emoji": "🧩", "category": "Reading",
         "description": "Arrange words into a sentence — syntax and comprehension practice."},
    ]
    keys = await _citation_id_lookup()
    for g in games:
        g["evidence_refs"] = [keys[k] for k in GAME_EVIDENCE.get(g["key"], []) if k in keys]
    return games


async def _citation_id_lookup() -> dict:
    """Map citation `key` → mongo `id`."""
    rows = await db.citations.find({}, {"_id": 0, "id": 1, "key": 1}).to_list(2000)
    return {r["key"]: r["id"] for r in rows if r.get("key") and r.get("id")}


async def _resolve_evidence_for_mission(skill_ids: List[str], strategy_ids: List[str],
                                         evidence_tags: List[str]) -> List[str]:
    """Combine evidence_refs from selected skills/strategies + AI tag mapping,
    de-duplicated, capped at 6 citations."""
    refs: List[str] = []

    if skill_ids:
        sk = await db.skills.find({"id": {"$in": skill_ids}}, {"_id": 0, "evidence_refs": 1}).to_list(50)
        for s in sk:
            refs.extend(s.get("evidence_refs") or [])
    if strategy_ids:
        st = await db.strategies.find({"id": {"$in": strategy_ids}}, {"_id": 0, "evidence_refs": 1}).to_list(50)
        for s in st:
            refs.extend(s.get("evidence_refs") or [])

    if evidence_tags:
        keys = await _citation_id_lookup()
        for tag in evidence_tags:
            for citation_key in AI_TAG_EVIDENCE.get(tag, []):
                cid = keys.get(citation_key)
                if cid:
                    refs.append(cid)

    # de-dupe while keeping order
    seen = set()
    deduped: List[str] = []
    for r in refs:
        if r and r not in seen:
            seen.add(r)
            deduped.append(r)
    return deduped[:6]


# ---------- Parent: students ----------
@api.post("/students/link", response_model=UserPublic)
async def link_student(req: LinkStudentRequest, user: dict = Depends(require_role("parent"))):
    student_email = req.student_email.lower().strip()
    student = await db.users.find_one({"email": student_email, "role": "student"})
    created_now = False
    if not student:
        # Iter 24 — auto-create the student account when the caller supplied
        # a name + password. Requires consent to be present (checked below).
        clashing = await db.users.find_one({"email": student_email})
        if clashing and clashing.get("role") != "student":
            raise HTTPException(
                status_code=409,
                detail="That email belongs to a parent account. Kids need their own email.",
            )
        if not req.student_name or not req.student_password:
            raise HTTPException(
                status_code=404,
                detail="No student with that email — to CREATE a new kid, also send a name and password.",
            )
        if len(req.student_password) < 6:
            raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")
        # Build the student user doc
        student_id = str(uuid.uuid4())
        now_iso = datetime.now(timezone.utc).isoformat()
        student_profile = {}
        if req.grade:
            student_profile["grade"] = req.grade.strip()
        if req.reading_level:
            student_profile["reading_level"] = req.reading_level.strip()
        student = {
            "id": student_id,
            "email": student_email,
            "name": req.student_name.strip()[:80],
            "role": "student",
            "password_hash": hash_password(req.student_password),
            "created_at": now_iso,
            "linked_student_ids": [],
            "student_profile": student_profile,
        }
        await db.users.insert_one(student)
        created_now = True

    if not req.consent_given or not req.guardian_name or not req.guardian_relationship:
        # If we just created the student, roll it back so we don't leave orphans.
        if created_now:
            await db.users.delete_one({"id": student["id"]})
        raise HTTPException(
            status_code=400,
            detail="Parental consent is required. Please complete the consent form (your name, relationship, age check, and agreement).",
        )
    consent = {
        "id": str(uuid.uuid4()),
        "parent_user_id": user["id"],
        "student_user_id": student["id"],
        "guardian_name": req.guardian_name.strip(),
        "guardian_relationship": req.guardian_relationship.strip(),
        "child_under_13": bool(req.child_under_13),
        "consent_given_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.consents.update_one(
        {"parent_user_id": user["id"], "student_user_id": student["id"]},
        {"$set": consent},
        upsert=True,
    )
    linked = set(user.get("linked_student_ids", []))
    linked.add(student["id"])
    await db.users.update_one({"id": user["id"]}, {"$set": {"linked_student_ids": list(linked)}})
    # Add student to user's active family (auto-create if needed)
    active_fid = user.get("active_family_id") or await _ensure_personal_family(user)
    await db.families.update_one(
        {"id": active_fid},
        {"$addToSet": {"student_ids": student["id"]}},
    )
    # Resync legacy linked_student_ids for ALL members of that family
    fam = await db.families.find_one({"id": active_fid}, {"_id": 0, "members": 1})
    for m in (fam or {}).get("members", []):
        await _sync_user_linked_students(m["user_id"])
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
    await _audit(
        user,
        "students.create_and_link" if created_now else "students.link",
        target_type="student",
        target_id=student["id"],
        meta={"under_13": consent["child_under_13"], "created_now": created_now},
    )
    return await _user_to_public(updated)


@api.get("/students", response_model=List[UserPublic])
async def list_my_students(user: dict = Depends(require_role("parent"))):
    ids = await _accessible_student_ids(user)
    if not ids:
        return []
    students = await db.users.find({"id": {"$in": ids}}, {"_id": 0, "password_hash": 0}).to_list(1000)
    return [await _user_to_public(s) for s in students]


class StudentProfileUpdate(BaseModel):
    profile_notes: str = ""


@api.put("/students/{student_id}/profile", response_model=UserPublic)
async def update_student_profile(
    student_id: str,
    req: StudentProfileUpdate,
    user: dict = Depends(require_role("parent")),
):
    await _assert_parent_owns_student(user, student_id)
    await db.users.update_one(
        {"id": student_id, "role": "student"},
        {"$set": {"profile_notes": req.profile_notes or ""}},
    )
    s = await db.users.find_one({"id": student_id}, {"_id": 0, "password_hash": 0})
    await _audit(user, "student.profile_update", target_type="student", target_id=student_id)
    return await _user_to_public(s)


# ---------- Account preferences / right-to-delete / export / audit ----------
@api.get("/account/consents")
async def list_consents(user: dict = Depends(require_role("parent"))):
    return await db.consents.find({"parent_user_id": user["id"]}, {"_id": 0}).to_list(100)


@api.put("/account/preferences", response_model=UserPublic)
async def update_preferences(req: AccountPrefsUpdate, user: dict = Depends(get_current_user)):
    updates: dict = {}
    if req.discard_audio is not None:
        updates["discard_audio"] = bool(req.discard_audio)
    if updates:
        await db.users.update_one({"id": user["id"]}, {"$set": updates})
        await _audit(user, "account.preferences_update", meta=updates)
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
    return await _user_to_public(fresh)


@api.get("/account/export")
async def export_my_data(user: dict = Depends(get_current_user)):
    user_id = user["id"]
    out: dict = {"account": {k: v for k, v in user.items() if k != "password_hash"}}
    out["consents"] = await db.consents.find(
        {"$or": [{"parent_user_id": user_id}, {"student_user_id": user_id}]}, {"_id": 0}
    ).to_list(1000)
    if user["role"] == "student":
        out["missions"] = await db.missions.find({"student_id": user_id}, {"_id": 0}).to_list(2000)
        out["mission_logs"] = await db.mission_logs.find({"student_id": user_id}, {"_id": 0}).to_list(5000)
        out["moments"] = await db.moments.find({"student_id": user_id}, {"_id": 0}).to_list(5000)
    else:
        linked = user.get("linked_student_ids", [])
        out["linked_students"] = await db.users.find(
            {"id": {"$in": linked}}, {"_id": 0, "password_hash": 0}
        ).to_list(100)
        out["moments_logged_by_me"] = await db.moments.find(
            {"logged_by_user_id": user_id}, {"_id": 0}
        ).to_list(5000)
    out["audit"] = await db.audit_log.find({"user_id": user_id}, {"_id": 0}).sort("timestamp", -1).to_list(2000)
    await _audit(user, "account.export")
    return out


@api.delete("/account/me")
async def delete_my_account(response: Response, user: dict = Depends(get_current_user)):
    user_id = user["id"]
    role = user["role"]
    if role == "student":
        await db.missions.delete_many({"student_id": user_id})
        await db.mission_logs.delete_many({"student_id": user_id})
        await db.moments.delete_many({"student_id": user_id})
        await db.users.update_many(
            {"linked_student_ids": user_id},
            {"$pull": {"linked_student_ids": user_id}},
        )
    else:
        await db.moments.delete_many({"logged_by_user_id": user_id})
    await db.consents.delete_many({"$or": [{"parent_user_id": user_id}, {"student_user_id": user_id}]})
    await db.users.delete_one({"id": user_id})
    await _audit({"id": None, "email": user.get("email"), "role": role}, "account.delete",
                 target_type="user", target_id=user_id)
    response.delete_cookie("access_token", path="/")
    return {"ok": True, "deleted_user_id": user_id}


@api.get("/audit")
async def list_audit(
    student_id: Optional[str] = None,
    limit: int = 200,
    user: dict = Depends(get_current_user),
):
    limit = max(1, min(500, int(limit or 200)))
    if user["role"] == "student":
        return await db.audit_log.find({"user_id": user["id"]}, {"_id": 0}).sort("timestamp", -1).to_list(limit)
    linked = await _accessible_student_ids(user)
    if student_id:
        if student_id not in linked:
            raise HTTPException(status_code=403, detail="Not your student")
        q = {"$or": [
            {"user_id": user["id"], "target_id": student_id},
            {"user_id": student_id},
            {"target_id": student_id},
        ]}
    else:
        q = {"$or": [
            {"user_id": user["id"]},
            {"user_id": {"$in": linked}},
            {"target_id": {"$in": linked + [user["id"]]}},
        ]}
    return await db.audit_log.find(q, {"_id": 0}).sort("timestamp", -1).to_list(limit)


# ---------- Family group endpoints (Iter 15) ----------
@api.get("/families", response_model=List[Family])
async def list_my_families(user: dict = Depends(require_role("parent"))):
    rows = await db.families.find(
        {"members.user_id": user["id"]}, {"_id": 0},
    ).sort("created_at", 1).to_list(50)
    return rows


@api.get("/families/{family_id}")
async def get_family(family_id: str, user: dict = Depends(require_role("parent"))):
    role = await _user_role_in_family(user, family_id)
    if role is None:
        raise HTTPException(status_code=403, detail="Not a member of this family")
    fam = await db.families.find_one({"id": family_id}, {"_id": 0})
    if not fam:
        raise HTTPException(status_code=404, detail="Family not found")
    # Enrich member rows with name/email/avatar (best-effort)
    member_ids = [m["user_id"] for m in fam.get("members", [])]
    members_meta = await db.users.find(
        {"id": {"$in": member_ids}}, {"_id": 0, "id": 1, "name": 1, "email": 1},
    ).to_list(50)
    by_id = {u["id"]: u for u in members_meta}
    enriched_members = []
    for m in fam.get("members", []):
        u = by_id.get(m["user_id"], {})
        enriched_members.append({
            **m,
            "name": u.get("name"),
            "email": u.get("email"),
        })
    fam["members"] = enriched_members
    return fam


@api.post("/families", response_model=Family)
async def create_family(req: FamilyCreate, user: dict = Depends(require_role("parent"))):
    name = (req.name or "").strip()[:80]
    if not name:
        raise HTTPException(status_code=400, detail="Family name is required.")
    now = _now_iso()
    fid = str(uuid.uuid4())
    slug = await _generate_unique_slug(name)
    fam = {
        "id": fid,
        "name": name,
        "slug": slug,
        "owner_user_id": user["id"],
        "created_at": now,
        "members": [{
            "user_id": user["id"],
            "role": "owner",
            "joined_at": now,
            "invited_by_user_id": None,
        }],
        "student_ids": [],
        "home_dashboard_enabled": False,
    }
    await db.families.insert_one(dict(fam))
    await db.users.update_one({"id": user["id"]}, {"$set": {"active_family_id": fid}})
    await _audit(user, "family.create", target_type="family", target_id=fid,
                 meta={"name": name})
    return fam


@api.put("/families/{family_id}", response_model=Family)
async def update_family(family_id: str, req: FamilyUpdate, user: dict = Depends(require_role("parent"))):
    role = await _user_role_in_family(user, family_id)
    _assert_family_write_role(role)
    updates = {}
    if req.name is not None:
        n = req.name.strip()[:80]
        if not n:
            raise HTTPException(status_code=400, detail="Name cannot be empty.")
        updates["name"] = n
    if updates:
        await db.families.update_one({"id": family_id}, {"$set": updates})
        await _audit(user, "family.update", target_type="family", target_id=family_id, meta=updates)
    fam = await db.families.find_one({"id": family_id}, {"_id": 0})
    return fam


@api.delete("/families/{family_id}")
async def delete_family(family_id: str, user: dict = Depends(require_role("parent"))):
    role = await _user_role_in_family(user, family_id)
    _assert_family_owner(role)
    fam = await db.families.find_one({"id": family_id}, {"_id": 0})
    if not fam:
        raise HTTPException(status_code=404, detail="Family not found")
    # Don't delete if this would orphan students. Owner must remove students first.
    if fam.get("student_ids"):
        raise HTTPException(status_code=400, detail="Remove all students from this family before deleting it.")
    # Cascade-cancel pending invites
    await db.family_invites.delete_many({"family_id": family_id})
    member_ids = [m["user_id"] for m in fam.get("members", [])]
    await db.families.delete_one({"id": family_id})
    # Resync linked_student_ids and active_family for all members
    for mid in member_ids:
        await _sync_user_linked_students(mid)
        u = await db.users.find_one({"id": mid}, {"_id": 0, "active_family_id": 1})
        if u and u.get("active_family_id") == family_id:
            other = await db.families.find_one({"members.user_id": mid}, {"_id": 0, "id": 1})
            await db.users.update_one(
                {"id": mid},
                {"$set": {"active_family_id": (other or {}).get("id")}},
            )
    await _audit(user, "family.delete", target_type="family", target_id=family_id)
    return {"ok": True}


@api.put("/families/{family_id}/active")
async def set_active_family(family_id: str, user: dict = Depends(require_role("parent"))):
    role = await _user_role_in_family(user, family_id)
    if role is None:
        raise HTTPException(status_code=403, detail="Not a member of this family")
    await db.users.update_one({"id": user["id"]}, {"$set": {"active_family_id": family_id}})
    return {"ok": True, "active_family_id": family_id}


# ---------- Family Home Dashboard (Iter 18) ----------
class HomeDashboardToggle(BaseModel):
    enabled: bool


class HomePinSet(BaseModel):
    pin: str  # 4 digits


class HomePinLogin(BaseModel):
    student_id: str
    pin: str


@api.put("/families/{family_id}/home-dashboard")
async def update_home_dashboard(family_id: str, req: HomeDashboardToggle,
                                 user: dict = Depends(require_role("parent"))):
    role = await _user_role_in_family(user, family_id)
    _assert_family_write_role(role)
    await db.families.update_one(
        {"id": family_id}, {"$set": {"home_dashboard_enabled": bool(req.enabled)}},
    )
    fam = await db.families.find_one({"id": family_id}, {"_id": 0})
    if not fam.get("slug"):
        slug = await _generate_unique_slug(fam["name"])
        await db.families.update_one({"id": family_id}, {"$set": {"slug": slug}})
        fam["slug"] = slug
    await _audit(user, "family.home_dashboard_toggle", target_type="family",
                 target_id=family_id, meta={"enabled": bool(req.enabled)})
    return {"ok": True, "enabled": fam.get("home_dashboard_enabled", False), "slug": fam.get("slug")}


@api.put("/students/{student_id}/home-pin")
async def set_student_home_pin(student_id: str, req: HomePinSet,
                                user: dict = Depends(require_role("parent"))):
    await _assert_parent_owns_student(user, student_id)
    pin = (req.pin or "").strip()
    if not (pin.isdigit() and len(pin) == 4):
        raise HTTPException(status_code=400, detail="PIN must be exactly 4 digits.")
    await db.users.update_one(
        {"id": student_id},
        {"$set": {"home_pin_hash": hash_password(pin)}},
    )
    # Clear any active lockouts for this student
    await db.home_pin_attempts.delete_many({"student_id": student_id})
    await _audit(user, "student.home_pin_set", target_type="student", target_id=student_id)
    return {"ok": True}


@api.delete("/students/{student_id}/home-pin")
async def clear_student_home_pin(student_id: str, user: dict = Depends(require_role("parent"))):
    await _assert_parent_owns_student(user, student_id)
    await db.users.update_one({"id": student_id}, {"$unset": {"home_pin_hash": ""}})
    await db.home_pin_attempts.delete_many({"student_id": student_id})
    await _audit(user, "student.home_pin_clear", target_type="student", target_id=student_id)
    return {"ok": True}


# ---------- Streak Freezes (Iter 20) ----------
class StreakFreezeCreate(BaseModel):
    date: str  # YYYY-MM-DD (UTC) — the day to skip
    reason: Optional[str] = None


class StreakFreeze(BaseModel):
    id: str
    student_id: str
    date: str
    granted_by_user_id: str
    granted_by_name: Optional[str] = None
    reason: Optional[str] = None
    created_at: str


def _validate_freeze_date(d: str) -> str:
    if not d or len(d) != 10:
        raise HTTPException(status_code=400, detail="Date must be YYYY-MM-DD.")
    try:
        parsed = datetime.fromisoformat(d).date()
    except Exception:
        raise HTTPException(status_code=400, detail="Date must be a valid YYYY-MM-DD.") from None
    today = datetime.now(timezone.utc).date()
    if parsed > today:
        raise HTTPException(status_code=400, detail="You can't freeze a future date.")
    # Max 60 days back — keep history sane
    if (today - parsed).days > 60:
        raise HTTPException(status_code=400, detail="Freezes can only cover the last 60 days.")
    return parsed.isoformat()


@api.post("/students/{student_id}/freezes", response_model=StreakFreeze)
async def grant_streak_freeze(student_id: str, req: StreakFreezeCreate,
                              user: dict = Depends(require_role("parent"))):
    await _assert_parent_owns_student(user, student_id)
    d = _validate_freeze_date(req.date)
    # Idempotent: refuse if a freeze already exists for this day
    existing = await db.streak_freezes.find_one(
        {"student_id": student_id, "date": d}, {"_id": 0},
    )
    if existing:
        raise HTTPException(status_code=409, detail="This date already has a freeze.")
    # If the kid already completed a mission that day, no freeze needed
    day_start = f"{d}T00:00:00+00:00"
    day_end = f"{d}T23:59:59.999999+00:00"
    completed = await db.mission_logs.find_one(
        {"student_id": student_id, "status": "completed",
         "timestamp": {"$gte": day_start, "$lte": day_end}},
        {"_id": 0, "id": 1},
    )
    if completed:
        raise HTTPException(status_code=400, detail="Kid already completed a mission that day — no freeze needed.")
    # Quota: 4 per calendar month UTC
    granted = await _freezes_this_month(db, student_id)
    if granted >= MAX_FREEZES_PER_MONTH:
        raise HTTPException(
            status_code=400,
            detail=f"Out of freezes — limit is {MAX_FREEZES_PER_MONTH} per kid per month.",
        )
    fid = str(uuid.uuid4())
    doc = {
        "id": fid,
        "student_id": student_id,
        "date": d,
        "granted_by_user_id": user["id"],
        "granted_by_name": user.get("name"),
        "reason": (req.reason or "").strip()[:240] or None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.streak_freezes.insert_one(doc)
    await _audit(user, "streak.freeze_grant", target_type="student", target_id=student_id,
                 meta={"date": d, "freeze_id": fid})
    # Notify OTHER parents of the same kid (Iter 22 co-parent activity)
    try:
        other_parents = await _linked_parent_ids(student_id)
        kid = await db.users.find_one({"id": student_id}, {"_id": 0, "name": 1})
        for pid in other_parents:
            if pid == user["id"]:
                continue
            await push_service.send_push_to_user(
                pid,
                pref_key="parent_coparent_activity",
                title=f"❄️ {user.get('name') or 'A co-parent'} granted a freeze",
                body=f"{(kid or {}).get('name', 'The kid')} — {d}{': ' + req.reason if req.reason else ''}",
                url="/parent",
                tag=f"coparent-freeze-{fid}",
            )
    except Exception as e:  # noqa: BLE001
        logger.warning("Coparent freeze push failed: %s", e)
    return StreakFreeze(**{k: v for k, v in doc.items() if k != "_id"})


@api.get("/students/{student_id}/freezes")
async def list_streak_freezes(student_id: str, user: dict = Depends(get_current_user)):
    if user["role"] == "student":
        if user["id"] != student_id:
            raise HTTPException(status_code=403, detail="Not your kid")
    else:
        await _assert_parent_owns_student(user, student_id, write=False)
    today = datetime.now(timezone.utc).date()
    month_prefix = today.isoformat()[:7] + "-"
    freezes = await db.streak_freezes.find(
        {"student_id": student_id}, {"_id": 0},
    ).sort("date", -1).to_list(200)
    granted_this_month = sum(1 for f in freezes if (f.get("date") or "").startswith(month_prefix))
    return {
        "freezes": freezes,
        "granted_this_month": granted_this_month,
        "remaining_this_month": max(0, MAX_FREEZES_PER_MONTH - granted_this_month),
        "monthly_cap": MAX_FREEZES_PER_MONTH,
    }


@api.delete("/students/{student_id}/freezes/{freeze_id}")
async def revoke_streak_freeze(student_id: str, freeze_id: str,
                                user: dict = Depends(require_role("parent"))):
    await _assert_parent_owns_student(user, student_id)
    res = await db.streak_freezes.delete_one({"id": freeze_id, "student_id": student_id})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="Freeze not found.")
    await _audit(user, "streak.freeze_revoke", target_type="student", target_id=student_id,
                 meta={"freeze_id": freeze_id})
    return {"ok": True}


# ---------- Family weekend-mode toggle (Iter 20) ----------
class WeekendModeUpdate(BaseModel):
    mode: str  # "all_days" | "weekdays_only"


# ---------- Push notifications (Iter 22) ----------
class PushKeys(BaseModel):
    p256dh: str
    auth: str


class PushSubscribeReq(BaseModel):
    endpoint: str
    keys: PushKeys


class PushUnsubscribeReq(BaseModel):
    endpoint: str


class NotificationPrefsUpdate(BaseModel):
    enabled: Optional[bool] = None
    parent_streak_at_risk: Optional[bool] = None
    parent_kid_completed: Optional[bool] = None
    parent_pending_review: Optional[bool] = None
    parent_coparent_activity: Optional[bool] = None
    parent_digest_ready: Optional[bool] = None
    kid_missions_morning: Optional[bool] = None
    kid_streak_milestone: Optional[bool] = None
    kid_pack_unlocked: Optional[bool] = None


@api.get("/push/vapid-public-key")
async def get_vapid_public_key():
    """Public — the frontend needs this to subscribe. Safe to expose."""
    return {"public_key": os.environ.get("VAPID_PUBLIC_KEY", "")}


@api.post("/push/subscribe")
async def push_subscribe(req: PushSubscribeReq, request: Request,
                          user: dict = Depends(get_current_user)):
    ua = request.headers.get("User-Agent", "")[:200]
    await push_service.upsert_subscription(
        user["id"], req.endpoint, req.keys.p256dh, req.keys.auth, user_agent=ua,
    )
    await _audit(user, "push.subscribe", target_type="user", target_id=user["id"])
    return {"ok": True}


@api.post("/push/unsubscribe")
async def push_unsubscribe(req: PushUnsubscribeReq, user: dict = Depends(get_current_user)):
    n = await push_service.remove_subscription(req.endpoint)
    await _audit(user, "push.unsubscribe", target_type="user", target_id=user["id"])
    return {"ok": True, "removed": n}


@api.get("/me/notification-prefs")
async def get_my_notification_prefs(user: dict = Depends(get_current_user)):
    prefs = await push_service.get_user_prefs(user["id"])
    sub_count = await db.push_subscriptions.count_documents({"user_id": user["id"]})
    return {"prefs": prefs, "device_count": sub_count}


@api.put("/me/notification-prefs")
async def update_my_notification_prefs(req: NotificationPrefsUpdate,
                                        user: dict = Depends(get_current_user)):
    current = await push_service.get_user_prefs(user["id"])
    for k, v in req.model_dump(exclude_none=True).items():
        current[k] = bool(v)
    await db.users.update_one({"id": user["id"]}, {"$set": {"notification_prefs": current}})
    await _audit(user, "push.prefs_update", target_type="user", target_id=user["id"], meta=current)
    return {"prefs": current}


@api.post("/push/test")
async def push_test(user: dict = Depends(get_current_user)):
    return await push_service.send_test_push(user["id"])


# ---------- Weekly fresh mini-game packs (Iter 23) ----------
FRESH_PACK_GAME_KEYS = {"word-match", "memory-cards", "sentence-builder"}


def _iso_week_key() -> str:
    """YYYY-Www — the same for 7 days, so caching per (student, key, week) rotates weekly."""
    d = datetime.now(timezone.utc)
    iso = d.isocalendar()
    return f"{iso[0]}-W{iso[1]:02d}"


async def _generate_fresh_pack_content(game_key: str, student: dict) -> Optional[dict]:
    """Ask Claude for a fresh content payload tailored to the kid's reading
    level + interests. Returns the shape each game component expects, or None
    on failure (caller falls back to expanded default pool)."""
    prof = student.get("student_profile") or {}
    grade = prof.get("grade") or "3"
    reading = prof.get("reading_level") or ""
    interests = ", ".join(prof.get("interests") or []) or "(none)"
    if game_key == "word-match":
        user_text = (
            f"Generate 12 vocabulary pairs for a grade-{grade} kid (reading level: {reading}). "
            f"Kid's interests: {interests}. Return ONLY a JSON object like "
            '{"pairs":[{"word":"...","meaning":"..."}, ...]} with exactly 12 items. '
            "Words should be varied difficulty, age-appropriate, and where possible tied to interests. "
            "Meanings must be one short sentence in kid-friendly language."
        )
    elif game_key == "memory-cards":
        user_text = (
            f"Pick 8 emoji characters for a memory-match game themed around this kid's interests: {interests}. "
            "Return ONLY JSON like " '{"items":["🚀","🦊",...]} with exactly 8 items. '
            "Use popular emojis kids recognize; avoid political/religious/adult ones."
        )
    elif game_key == "sentence-builder":
        user_text = (
            f"Generate 6 short kid-friendly sentences for grade-{grade} (reading level: {reading}). "
            f"Weave in this kid's interests when possible: {interests}. "
            "Each sentence must be 5-7 words, no punctuation except one period at the end. "
            "Return ONLY JSON like " '{"sentences":["...","..."]} with exactly 6 items.'
        )
    else:
        return None
    try:
        raw = await _ai_chat(
            system_message="You output strict JSON only. No preamble, no markdown fences, no commentary.",
            user_text=user_text,
        )
        raw = (raw or "").strip()
        if raw.startswith("```"):
            raw = raw.strip("`")
            if raw.lower().startswith("json"):
                raw = raw[4:]
            raw = raw.strip()
        data = json.loads(raw)
    except Exception as e:  # noqa: BLE001
        logger.warning("fresh-pack AI gen failed for %s: %s", game_key, e)
        return None
    # Validate shape
    if game_key == "word-match":
        pairs = data.get("pairs") if isinstance(data, dict) else None
        if not isinstance(pairs, list) or not pairs:
            return None
        clean = [
            {"word": str(p["word"])[:40], "meaning": str(p["meaning"])[:120]}
            for p in pairs if isinstance(p, dict) and p.get("word") and p.get("meaning")
        ][:12]
        return {"pairs": clean} if len(clean) >= 4 else None
    if game_key == "memory-cards":
        items = data.get("items") if isinstance(data, dict) else None
        if not isinstance(items, list) or not items:
            return None
        clean = [str(x)[:8] for x in items if isinstance(x, str) and x.strip()][:8]
        return {"items": clean} if len(clean) >= 6 else None
    if game_key == "sentence-builder":
        sentences = data.get("sentences") if isinstance(data, dict) else None
        if not isinstance(sentences, list) or not sentences:
            return None
        clean = [
            str(s).strip().rstrip(".").rstrip("!").rstrip("?")
            for s in sentences if isinstance(s, str) and len(s.split()) >= 3 and len(s.split()) <= 10
        ][:6]
        return {"sentences": clean} if len(clean) >= 3 else None
    return None


@api.get("/games/fresh-pack/{game_key}")
async def get_fresh_pack(game_key: str, user: dict = Depends(require_role("student"))):
    """Weekly AI-generated content override for the given mini-game. Cached in
    db.weekly_fresh_packs per (student_id, game_key, iso_week). Falls back
    silently to null so client uses its expanded default pool."""
    if game_key not in FRESH_PACK_GAME_KEYS:
        raise HTTPException(status_code=400, detail="No fresh pack available for this game.")
    week = _iso_week_key()
    cached = await db.weekly_fresh_packs.find_one(
        {"student_id": user["id"], "game_key": game_key, "week": week},
        {"_id": 0},
    )
    if cached:
        return {"week": week, "game_key": game_key, "content": cached.get("content"), "cached": True}
    student = await db.users.find_one({"id": user["id"]}, {"_id": 0, "student_profile": 1})
    content = await _generate_fresh_pack_content(game_key, student or {})
    if content:
        await db.weekly_fresh_packs.update_one(
            {"student_id": user["id"], "game_key": game_key, "week": week},
            {"$set": {
                "student_id": user["id"], "game_key": game_key, "week": week,
                "content": content, "created_at": datetime.now(timezone.utc).isoformat(),
            }},
            upsert=True,
        )
    return {"week": week, "game_key": game_key, "content": content, "cached": False}


@api.put("/families/{family_id}/streak-weekend-mode")
async def set_family_weekend_mode(family_id: str, req: WeekendModeUpdate,
                                   user: dict = Depends(require_role("parent"))):
    if req.mode not in (WEEKEND_MODE_ALL, WEEKEND_MODE_WEEKDAYS):
        raise HTTPException(status_code=400, detail="Mode must be all_days or weekdays_only.")
    fam = await db.families.find_one({"id": family_id}, {"_id": 0})
    if not fam:
        raise HTTPException(status_code=404, detail="Family not found.")
    role = await _user_role_in_family(user, family_id)
    _assert_family_write_role(role)
    await db.families.update_one({"id": family_id}, {"$set": {"streak_weekend_mode": req.mode}})
    await _audit(user, "family.streak_weekend_mode", target_type="family",
                 target_id=family_id, meta={"mode": req.mode})
    return {"ok": True, "mode": req.mode}


@api.get("/home/{slug}")
async def public_home_dashboard(slug: str):
    """Public — by family slug. Returns family name + kid tiles.
    Each tile includes whether the kid has a PIN set, current spark streak,
    open missions today, top interest, and custom avatar (emoji + color)."""
    fam = await db.families.find_one(
        {"slug": slug, "home_dashboard_enabled": True}, {"_id": 0},
    )
    if not fam:
        raise HTTPException(status_code=404, detail="Home dashboard not available.")
    students = await db.users.find(
        {"id": {"$in": fam.get("student_ids", [])}, "role": "student"},
        {"_id": 0, "id": 1, "name": 1, "home_pin_hash": 1, "student_profile": 1,
         "avatar_emoji": 1, "avatar_color": 1},
    ).to_list(20)
    # Parallelize streak computation across kids (was N+1 sequential)
    async def _safe_streak(sid):
        try:
            return await _compute_streak(sid)
        except Exception:
            return None
    streak_results = await asyncio.gather(*[_safe_streak(s["id"]) for s in students])
    kids = []
    for s, sr in zip(students, streak_results):
        prof = s.get("student_profile") or {}
        if sr is not None:
            streak_current = sr.current_streak
            missions_today = sr.missions_today_count
            completed_today = sr.completed_today_count
        else:
            streak_current, missions_today, completed_today = 0, 0, 0
        open_today = max(0, missions_today - completed_today)
        interests = prof.get("interests") or []
        kids.append({
            "id": s["id"],
            "name": s["name"],
            "has_pin": bool(s.get("home_pin_hash")),
            "grade": prof.get("grade"),
            "streak_current": streak_current,
            "open_missions_today": open_today,
            "missions_today_count": missions_today,
            "interest_tag": (interests[0] if interests else None),
            "avatar_emoji": s.get("avatar_emoji"),
            "avatar_color": s.get("avatar_color"),
        })
    return {"family_name": fam["name"], "slug": fam["slug"], "kids": kids}


# ---------- Spark of the Day (Iter 19) ----------
SPARK_KINDS = ("fun_fact", "riddle", "affirmation", "science_nugget")


def _next_spark_kind(prev: Optional[str]) -> str:
    if not prev or prev not in SPARK_KINDS:
        return SPARK_KINDS[0]
    return SPARK_KINDS[(SPARK_KINDS.index(prev) + 1) % len(SPARK_KINDS)]


async def _generate_spark(family_doc: dict, kind: str) -> dict:
    """Generate a one-liner Spark of the Day via Claude. Age-targets the
    youngest kid; weaves in one kid's interest when available. Falls back to
    a static line if the LLM is unreachable so the home page never breaks."""
    students = await db.users.find(
        {"id": {"$in": family_doc.get("student_ids", [])}, "role": "student"},
        {"_id": 0, "name": 1, "student_profile": 1},
    ).to_list(20)
    interests, grades, names = [], [], []
    for s in students:
        prof = s.get("student_profile") or {}
        names.append(s.get("name") or "")
        interests.extend(prof.get("interests") or [])
        g = prof.get("grade")
        if g:
            try: grades.append(int(str(g).strip()))
            except Exception: pass
    youngest_grade = min(grades) if grades else 3
    interest = (interests[0] if interests else "").strip()
    label = {
        "fun_fact": "a delightful one-sentence FUN FACT",
        "riddle": "a short, kid-safe RIDDLE (one or two sentences, with the answer in parentheses at the end like '(Answer: ...)')",
        "affirmation": "a warm, encouraging ONE-LINE AFFIRMATION for kids who sometimes struggle to focus",
        "science_nugget": "a single-sentence cool SCIENCE NUGGET",
    }[kind]
    interest_clause = f" The family includes a kid who loves {interest}." if interest else ""
    user_text = (
        f"Write {label} for grade-{youngest_grade} kids. {interest_clause} "
        "Output ONLY the single line, no preamble, no quotes, no emojis at the start."
    )
    text = ""
    used_fallback = False
    try:
        text = await _ai_chat(
            "You write tiny, joyful daily snippets for an ADHD-friendly kids' learning app. "
            "Keep every output to ONE short line (max ~22 words). Age-appropriate. No emojis at the start. "
            "Never reveal you are an AI. Never include URLs.",
            user_text,
        )
        text = (text or "").strip().strip('"').strip("'")
        if len(text) > 240:
            text = text[:237] + "..."
    except Exception:
        text = ""
    if not text:
        fallback = {
            "fun_fact": "Octopuses have three hearts and can taste with their arms.",
            "riddle": "I have hands but cannot clap. What am I? (Answer: a clock.)",
            "affirmation": "Small steps still count — you're doing great.",
            "science_nugget": "Your brain uses about 20% of your body's energy.",
        }
        text = fallback[kind]
        used_fallback = True
    return {"kind": kind, "content": text, "used_fallback": used_fallback}


@api.get("/home/{slug}/spark")
async def public_home_spark(slug: str):
    """Public — returns today's Spark for this family. Cached 24h."""
    fam = await db.families.find_one(
        {"slug": slug, "home_dashboard_enabled": True},
        {"_id": 0, "id": 1, "student_ids": 1},
    )
    if not fam:
        raise HTTPException(status_code=404, detail="Home dashboard not available.")
    today_iso = datetime.now(timezone.utc).date().isoformat()
    cached = await db.home_sparks.find_one(
        {"family_id": fam["id"], "date": today_iso}, {"_id": 0},
    )
    if cached:
        return {"date": today_iso, "kind": cached["kind"], "content": cached["content"]}
    # Pick the next kind in the rotation (based on yesterday's row)
    last = await db.home_sparks.find(
        {"family_id": fam["id"]}, {"_id": 0, "kind": 1, "date": 1},
    ).sort("date", -1).limit(1).to_list(1)
    prev_kind = last[0]["kind"] if last else None
    kind = _next_spark_kind(prev_kind)
    generated = await _generate_spark(fam, kind)
    # Don't cache static fallback — we want to retry the AI on the next page load.
    if not generated.get("used_fallback"):
        await db.home_sparks.update_one(
            {"family_id": fam["id"], "date": today_iso},
            {"$set": {"kind": generated["kind"], "content": generated["content"],
                      "family_id": fam["id"], "date": today_iso,
                      "created_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True,
        )
    return {"date": today_iso, "kind": generated["kind"], "content": generated["content"]}


# ---------- Custom tile avatars (Iter 19) ----------
AVATAR_EMOJI_PALETTE = [
    "🚀", "🦖", "🦄", "🐱", "🐶", "🐼", "🦊", "🐸", "🌟", "🦋", "🐙", "🦁",
    "🐯", "🐵", "🐧", "🐨", "🦉", "🐢", "🦕", "🍕", "🍩", "⚡", "🌈", "🎨",
]
AVATAR_COLOR_PALETTE = [
    "indigo", "emerald", "pink", "amber", "violet", "teal", "rose", "sky",
]


class AvatarUpdate(BaseModel):
    emoji: Optional[str] = None
    color: Optional[str] = None


@api.put("/me/avatar")
async def update_my_avatar(req: AvatarUpdate, user: dict = Depends(require_role("student"))):
    updates = {}
    if req.emoji is not None:
        if req.emoji and req.emoji not in AVATAR_EMOJI_PALETTE:
            raise HTTPException(status_code=400, detail="Pick an emoji from the palette.")
        updates["avatar_emoji"] = req.emoji or None
    if req.color is not None:
        if req.color and req.color not in AVATAR_COLOR_PALETTE:
            raise HTTPException(status_code=400, detail="Pick a color from the palette.")
        updates["avatar_color"] = req.color or None
    if not updates:
        return {"ok": True, "emoji": user.get("avatar_emoji"), "color": user.get("avatar_color")}
    await db.users.update_one({"id": user["id"]}, {"$set": updates})
    await _audit(user, "student.avatar_update", target_type="user", target_id=user["id"], meta=updates)
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0, "avatar_emoji": 1, "avatar_color": 1})
    return {"ok": True, "emoji": fresh.get("avatar_emoji"), "color": fresh.get("avatar_color")}


@api.get("/me/avatar")
async def get_my_avatar(user: dict = Depends(get_current_user)):
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0, "avatar_emoji": 1, "avatar_color": 1})
    return {
        "emoji": (fresh or {}).get("avatar_emoji"),
        "color": (fresh or {}).get("avatar_color"),
        "emoji_palette": AVATAR_EMOJI_PALETTE,
        "color_palette": AVATAR_COLOR_PALETTE,
    }


@api.post("/home/{slug}/login")
async def public_home_login(slug: str, req: HomePinLogin, response: Response):
    """PIN-based kid login from the family home page. 5-strike lockout per
    student-IP combo (10 min). Issues a 4-hour student session cookie."""
    fam = await db.families.find_one(
        {"slug": slug, "home_dashboard_enabled": True}, {"_id": 0, "id": 1, "student_ids": 1},
    )
    if not fam:
        raise HTTPException(status_code=404, detail="Home dashboard not available.")
    if req.student_id not in (fam.get("student_ids") or []):
        raise HTTPException(status_code=403, detail="Kid not in this family.")
    student = await db.users.find_one(
        {"id": req.student_id, "role": "student"},
        {"_id": 0, "id": 1, "email": 1, "home_pin_hash": 1, "name": 1},
    )
    if not student or not student.get("home_pin_hash"):
        raise HTTPException(status_code=400, detail="This kid doesn't have a PIN set yet. Ask a grown-up.")

    # Lockout check
    now = datetime.now(timezone.utc)
    attempt_row = await db.home_pin_attempts.find_one(
        {"student_id": req.student_id}, {"_id": 0},
    )
    if attempt_row and attempt_row.get("locked_until"):
        locked_until = datetime.fromisoformat(attempt_row["locked_until"])
        if locked_until > now:
            secs = int((locked_until - now).total_seconds())
            raise HTTPException(
                status_code=429,
                detail=f"Too many tries. Try again in {secs // 60}m {secs % 60}s.",
            )

    if not verify_password((req.pin or "").strip(), student["home_pin_hash"]):
        # Increment fails
        fails = (attempt_row or {}).get("fails", 0) + 1
        update = {"fails": fails, "last_fail_at": now.isoformat(), "student_id": req.student_id}
        if fails >= 5:
            update["locked_until"] = (now + timedelta(minutes=10)).isoformat()
            update["fails"] = 0  # reset counter after lock
        await db.home_pin_attempts.update_one(
            {"student_id": req.student_id}, {"$set": update}, upsert=True,
        )
        remaining = max(0, 5 - fails)
        if fails >= 5:
            raise HTTPException(status_code=429, detail="Too many tries. Locked out for 10 minutes.")
        raise HTTPException(status_code=403, detail=f"Wrong PIN. {remaining} tries left.")

    # Success: clear attempts, issue 4h session
    await db.home_pin_attempts.delete_one({"student_id": req.student_id})
    token = create_short_token(student["id"], student["email"], hours=4)
    set_auth_cookie(response, token, max_age=60 * 60 * 4)
    await _audit(student, "auth.home_pin_login", target_type="user", target_id=student["id"],
                 meta={"slug": slug})
    return {"ok": True, "student_id": student["id"], "name": student["name"]}


@api.post("/families/{family_id}/leave")
async def leave_family(family_id: str, user: dict = Depends(require_role("parent"))):
    role = await _user_role_in_family(user, family_id)
    if role is None:
        raise HTTPException(status_code=404, detail="Not a member of this family")
    if role == "owner":
        raise HTTPException(status_code=400, detail="Owner cannot leave. Transfer ownership first or delete the family.")
    await db.families.update_one(
        {"id": family_id},
        {"$pull": {"members": {"user_id": user["id"]}}},
    )
    await _sync_user_linked_students(user["id"])
    # If this was active, switch to another
    if user.get("active_family_id") == family_id:
        other = await db.families.find_one({"members.user_id": user["id"]}, {"_id": 0, "id": 1})
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"active_family_id": (other or {}).get("id")}},
        )
    await _audit(user, "family.leave", target_type="family", target_id=family_id)
    return {"ok": True}


@api.put("/families/{family_id}/members/{user_id}")
async def update_family_member(family_id: str, user_id: str, req: MemberRoleUpdate,
                                user: dict = Depends(require_role("parent"))):
    """Owner-only. If promoting another member to 'owner', the current owner
    is demoted to 'co_parent' (single-owner invariant)."""
    role = await _user_role_in_family(user, family_id)
    _assert_family_owner(role)
    fam = await db.families.find_one({"id": family_id}, {"_id": 0})
    if not fam:
        raise HTTPException(status_code=404, detail="Family not found")
    target = next((m for m in fam.get("members", []) if m["user_id"] == user_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Member not found")
    if req.role == "owner" and user_id != user["id"]:
        # transfer ownership
        await db.families.update_one(
            {"id": family_id, "members.user_id": user["id"]},
            {"$set": {"members.$.role": "co_parent"}},
        )
        await db.families.update_one(
            {"id": family_id, "members.user_id": user_id},
            {"$set": {"members.$.role": "owner"}},
        )
        await db.families.update_one({"id": family_id}, {"$set": {"owner_user_id": user_id}})
        await _audit(user, "family.transfer_ownership", target_type="family", target_id=family_id,
                     meta={"to": user_id})
    else:
        await db.families.update_one(
            {"id": family_id, "members.user_id": user_id},
            {"$set": {"members.$.role": req.role}},
        )
        await _audit(user, "family.member_role_change", target_type="user", target_id=user_id,
                     meta={"family_id": family_id, "role": req.role})
    fresh = await db.families.find_one({"id": family_id}, {"_id": 0})
    return fresh


@api.delete("/families/{family_id}/members/{user_id}")
async def remove_family_member(family_id: str, user_id: str,
                                user: dict = Depends(require_role("parent"))):
    """Owner removes a member. Reassigns any audit-bearing data on their behalf
    to the family owner. Owner cannot remove themselves; use /leave."""
    # Self-remove guard first (gives a clear 400 even if caller is owner)
    if user_id == user["id"]:
        raise HTTPException(status_code=400, detail="Owner cannot remove themselves. Transfer ownership first.")
    role = await _user_role_in_family(user, family_id)
    _assert_family_owner(role)
    fam = await db.families.find_one({"id": family_id}, {"_id": 0})
    if not fam or not any(m["user_id"] == user_id for m in fam.get("members", [])):
        raise HTTPException(status_code=404, detail="Member not found")
    await db.families.update_one(
        {"id": family_id},
        {"$pull": {"members": {"user_id": user_id}}},
    )
    # Reassign authored resources to the owner (per product spec)
    student_ids = fam.get("student_ids") or []
    owner_id = user["id"]
    if student_ids:
        await db.missions.update_many(
            {"student_id": {"$in": student_ids}, "created_by_user_id": user_id},
            {"$set": {"created_by_user_id": owner_id}},
        )
        await db.moments.update_many(
            {"student_id": {"$in": student_ids}, "logged_by_user_id": user_id},
            {"$set": {"logged_by_user_id": owner_id}},
        )
    await _sync_user_linked_students(user_id)
    # If the removed user had this as active, switch
    removed_user = await db.users.find_one({"id": user_id}, {"_id": 0, "active_family_id": 1})
    if removed_user and removed_user.get("active_family_id") == family_id:
        other = await db.families.find_one({"members.user_id": user_id}, {"_id": 0, "id": 1})
        await db.users.update_one(
            {"id": user_id},
            {"$set": {"active_family_id": (other or {}).get("id")}},
        )
    await _audit(user, "family.member_remove", target_type="user", target_id=user_id,
                 meta={"family_id": family_id})
    fresh = await db.families.find_one({"id": family_id}, {"_id": 0})
    return fresh


# ---------- Family invites ----------
@api.post("/families/{family_id}/invites")
async def create_family_invite(family_id: str, req: FamilyInviteCreate,
                                user: dict = Depends(require_role("parent"))):
    role = await _user_role_in_family(user, family_id)
    _assert_family_write_role(role)
    # Only owners can invite owners (not allowed via this endpoint) — viewer/co_parent allowed via co_parent+ role
    email = req.email.lower().strip()
    fam = await db.families.find_one({"id": family_id}, {"_id": 0})
    if not fam:
        raise HTTPException(status_code=404, detail="Family not found")
    # Already a member?
    existing_user = await db.users.find_one({"email": email}, {"_id": 0, "id": 1, "role": 1})
    if existing_user:
        already = any(m["user_id"] == existing_user["id"] for m in fam.get("members", []))
        if already:
            raise HTTPException(status_code=400, detail="That person is already a member.")
        if existing_user.get("role") != "parent":
            raise HTTPException(status_code=400, detail="Co-parents must have a parent account.")
    # Pending invite to same email already?
    dup = await db.family_invites.find_one(
        {"family_id": family_id, "email": email, "status": "pending"},
        {"_id": 0, "id": 1},
    )
    if dup:
        raise HTTPException(status_code=400, detail="A pending invite already exists for that email.")
    token = secrets.token_urlsafe(24)
    now = datetime.now(timezone.utc)
    invite = {
        "id": str(uuid.uuid4()),
        "family_id": family_id,
        "family_name": fam["name"],
        "email": email,
        "role": req.role,
        "token": token,
        "invited_by_user_id": user["id"],
        "invited_by_name": user.get("name"),
        "status": "pending",
        "created_at": now.isoformat(),
        "expires_at": (now + timedelta(days=INVITE_TTL_DAYS)).isoformat(),
        "accepted_at": None,
    }
    await db.family_invites.insert_one(dict(invite))
    await _audit(user, "family.invite_create", target_type="family", target_id=family_id,
                 meta={"email": email, "role": req.role})
    # Build invite URL using public app origin
    origin = os.environ.get("PUBLIC_APP_URL") or os.environ.get("FRONTEND_URL") or ""
    invite_url = f"{origin.rstrip('/')}/invite/accept?token={token}" if origin else f"/invite/accept?token={token}"
    # Best-effort send via Resend (never raises — invite link still works in-app).
    expires_human = (now + timedelta(days=INVITE_TTL_DAYS)).strftime("%b %d, %Y")
    email_id = await send_family_invite_email(
        to=email,
        family_name=fam["name"],
        role=req.role,
        inviter_name=user.get("name"),
        invite_url=invite_url,
        expires_at_human=expires_human,
    )
    if email_id:
        await db.family_invites.update_one(
            {"id": invite["id"]},
            {"$set": {"email_message_id": email_id, "email_sent_at": _now_iso()}},
        )
    out = {k: v for k, v in invite.items() if k != "_id"}
    out["invite_url"] = invite_url
    out["email_sent"] = bool(email_id)
    return out


@api.get("/families/{family_id}/invites")
async def list_family_invites(family_id: str, user: dict = Depends(require_role("parent"))):
    role = await _user_role_in_family(user, family_id)
    if role is None:
        raise HTTPException(status_code=403, detail="Not a member of this family")
    rows = await db.family_invites.find(
        {"family_id": family_id, "status": "pending"},
        {"_id": 0, "token": 0},
    ).sort("created_at", -1).to_list(100)
    return rows


@api.delete("/invites/{invite_id}")
async def cancel_invite(invite_id: str, user: dict = Depends(require_role("parent"))):
    inv = await db.family_invites.find_one({"id": invite_id}, {"_id": 0})
    if not inv:
        raise HTTPException(status_code=404, detail="Invite not found")
    role = await _user_role_in_family(user, inv["family_id"])
    _assert_family_write_role(role)
    await db.family_invites.update_one(
        {"id": invite_id},
        {"$set": {"status": "cancelled", "cancelled_at": _now_iso()}},
    )
    await _audit(user, "family.invite_cancel", target_type="family", target_id=inv["family_id"])
    return {"ok": True}


@api.get("/invites/preview")
async def preview_invite(token: str):
    """Public preview: doesn't require auth; just returns family + role + status."""
    inv = await db.family_invites.find_one({"token": token}, {"_id": 0})
    if not inv:
        raise HTTPException(status_code=404, detail="Invite not found or expired")
    if inv["status"] != "pending":
        return {"status": inv["status"], "family_name": inv.get("family_name"), "role": inv.get("role")}
    if inv["expires_at"] < _now_iso():
        await db.family_invites.update_one({"id": inv["id"]}, {"$set": {"status": "expired"}})
        return {"status": "expired", "family_name": inv.get("family_name"), "role": inv.get("role")}
    return {
        "status": "pending",
        "family_name": inv["family_name"],
        "role": inv["role"],
        "email": inv["email"],
        "invited_by_name": inv.get("invited_by_name"),
        "expires_at": inv["expires_at"],
    }


class InviteAccept(BaseModel):
    token: str


@api.post("/invites/accept")
async def accept_invite(req: InviteAccept, user: dict = Depends(require_role("parent"))):
    inv = await db.family_invites.find_one({"token": req.token}, {"_id": 0})
    if not inv:
        raise HTTPException(status_code=404, detail="Invite not found")
    if inv["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Invite is {inv['status']}")
    if inv["expires_at"] < _now_iso():
        await db.family_invites.update_one({"id": inv["id"]}, {"$set": {"status": "expired"}})
        raise HTTPException(status_code=400, detail="Invite has expired.")
    # The accepting user's email must match the invited email
    if user["email"].lower() != inv["email"].lower():
        raise HTTPException(
            status_code=403,
            detail=f"This invite is for {inv['email']}. Sign in with that account first.",
        )
    # Add member
    now = _now_iso()
    fam = await db.families.find_one({"id": inv["family_id"]}, {"_id": 0})
    if not fam:
        raise HTTPException(status_code=404, detail="Family no longer exists.")
    if any(m["user_id"] == user["id"] for m in fam.get("members", [])):
        await db.family_invites.update_one({"id": inv["id"]}, {"$set": {"status": "accepted", "accepted_at": now}})
        return {"ok": True, "family_id": inv["family_id"], "already_member": True}
    await db.families.update_one(
        {"id": inv["family_id"]},
        {"$push": {"members": {
            "user_id": user["id"],
            "role": inv["role"],
            "joined_at": now,
            "invited_by_user_id": inv.get("invited_by_user_id"),
        }}},
    )
    await db.family_invites.update_one(
        {"id": inv["id"]},
        {"$set": {"status": "accepted", "accepted_at": now, "accepted_by_user_id": user["id"]}},
    )
    # Sync legacy linked_student_ids
    await _sync_user_linked_students(user["id"])
    # Set this as active family
    await db.users.update_one({"id": user["id"]}, {"$set": {"active_family_id": inv["family_id"]}})
    await _audit(user, "family.invite_accept", target_type="family", target_id=inv["family_id"])
    return {"ok": True, "family_id": inv["family_id"], "role": inv["role"]}


# ---------- Missions ----------
async def _assert_parent_owns_student(parent: dict, student_id: str, write: bool = True):
    """Family-group authz: parent must be a member of a family containing the
    student. If write=True, viewer role is rejected. Falls back to legacy
    linked_student_ids for pre-migration data."""
    role = await _user_role_for_student(parent, student_id)
    if role:
        if write and role == "viewer":
            raise HTTPException(status_code=403, detail="Viewers can read but not modify family data.")
        return
    # Legacy fallback (pre-migration)
    if student_id in parent.get("linked_student_ids", []):
        return
    raise HTTPException(status_code=403, detail="You are not linked to this student")


def _recurrence_dates(start_iso: str, pattern: str, end_iso: Optional[str]) -> List[str]:
    """Return all dates after `start_iso` (exclusive) up through `end_iso`
    that match the given recurrence pattern. Defaults to a 30-day window."""
    from datetime import date, timedelta
    # Normalize to YYYY-MM-DD so callers can pass a date or a datetime ISO.
    start_str = (start_iso or "").split("T")[0][:10]
    try:
        start = date.fromisoformat(start_str)
    except ValueError:
        return []
    if end_iso:
        end_str = (end_iso or "").split("T")[0][:10]
        try:
            end = date.fromisoformat(end_str)
        except ValueError:
            end = start + timedelta(days=30)
    else:
        end = start + timedelta(days=30)
    end = min(end, start + timedelta(days=180))  # hard cap: 6 months
    out: List[str] = []
    d = start + timedelta(days=1)
    while d <= end:
        wd = d.weekday()  # 0=Mon, 6=Sun
        ok = (
            (pattern == "daily")
            or (pattern == "weekdays" and wd < 5)
            or (pattern == "weekends" and wd >= 5)
            or (pattern == "weekly" and wd == start.weekday())
        )
        if ok:
            out.append(d.isoformat())
        d += timedelta(days=1)
    return out


@api.post("/missions", response_model=Mission)
async def create_mission(req: MissionCreate, user: dict = Depends(require_role("parent"))):
    await _assert_parent_owns_student(user, req.student_id)
    mission_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()
    pattern = (req.recurrence.pattern if req.recurrence else "none") or "none"

    base = {
        "id": mission_id,
        "student_id": req.student_id,
        "title": req.title,
        "description": req.description or "",
        "steps": req.steps,
        "estimated_minutes": req.estimated_minutes,
        "due_date": req.due_date,
        "skill_ids": req.skill_ids,
        "strategy_ids": req.strategy_ids,
        "created_by_user_id": user["id"],
        "created_at": now_iso,
        "recurrence_pattern": pattern if pattern != "none" else None,
        "recurrence_parent_id": None,
        "verification": req.verification,
        "auto_approve_hours": max(0, min(req.auto_approve_hours, 168)),
    }
    await db.missions.insert_one(dict(base))

    # Eagerly spawn recurring instances for the next 30 days (or until end_date)
    if pattern != "none":
        future = _recurrence_dates(
            req.due_date, pattern, req.recurrence.end_date if req.recurrence else None
        )
        for d in future:
            inst = dict(base)
            inst["id"] = str(uuid.uuid4())
            inst["due_date"] = d
            inst["created_at"] = now_iso
            inst["recurrence_parent_id"] = mission_id
            await db.missions.insert_one(inst)

    out = await db.missions.find_one({"id": mission_id}, {"_id": 0})
    # Co-parent activity notification (Iter 22) — ping OTHER parents linked to this kid.
    try:
        other_parents = await _linked_parent_ids(req.student_id)
        for pid in other_parents:
            if pid == user["id"]:
                continue
            await push_service.send_push_to_user(
                pid,
                pref_key="parent_coparent_activity",
                title=f"📝 {user.get('name') or 'A co-parent'} added a mission",
                body=f"'{req.title}' for {req.due_date}",
                url="/parent",
                tag=f"coparent-mission-{mission_id}",
            )
    except Exception as e:  # noqa: BLE001
        logger.warning("Coparent mission push failed: %s", e)
    return out


@api.post("/missions/practice", response_model=Mission)
async def create_practice_mission(req: PracticeMissionRequest,
                                   user: dict = Depends(require_role("parent"))):
    """Generate a reading passage or writing prompt AND create a mission that
    links to it. Kid clicking the mission card jumps straight into the practice."""
    await _assert_parent_owns_student(user, req.student_id)
    mission_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()

    if req.kind == "reading":
        passage = await generate_reading_passage(
            ReadingPassageRequest(
                student_id=req.student_id,
                topic_hint=req.topic_hint,
                level_override=req.level_override,
            ),
            user=user,
        )
        title = f"📖 Read: {passage.title}"
        doc = {
            "id": mission_id,
            "student_id": req.student_id,
            "title": title,
            "description": f"Read the passage and answer {len(passage.questions)} questions.",
            "steps": [],
            "estimated_minutes": req.estimated_minutes,
            "due_date": req.due_date,
            "skill_ids": [],
            "strategy_ids": [],
            "created_by_user_id": user["id"],
            "created_at": now_iso,
            "recurrence_pattern": None,
            "recurrence_parent_id": None,
            "mission_type": "reading_passage",
            "linked_passage_id": passage.id,
            "linked_writing_id": None,
        }
        try:
            await db.missions.insert_one(dict(doc))
        except Exception:
            # Roll back the orphaned passage so the user can retry cleanly
            await db.reading_passages.delete_one({"id": passage.id})
            raise
    else:  # writing
        piece = await generate_writing_prompt(
            WritingPromptRequest(
                student_id=req.student_id,
                topic_hint=req.topic_hint,
                level_override=req.level_override,
            ),
            user=user,
        )
        title_text = (piece.prompt[:60] + "…") if len(piece.prompt) > 60 else piece.prompt
        doc = {
            "id": mission_id,
            "student_id": req.student_id,
            "title": f"✍️ Write: {title_text}",
            "description": "Use the scaffold and sentence starters to write your piece.",
            "steps": [],
            "estimated_minutes": req.estimated_minutes,
            "due_date": req.due_date,
            "skill_ids": [],
            "strategy_ids": [],
            "created_by_user_id": user["id"],
            "created_at": now_iso,
            "recurrence_pattern": None,
            "recurrence_parent_id": None,
            "mission_type": "writing_prompt",
            "linked_passage_id": None,
            "linked_writing_id": piece.id,
        }
        try:
            await db.missions.insert_one(dict(doc))
        except Exception:
            await db.writing_pieces.delete_one({"id": piece.id})
            raise
    return doc


@api.post("/missions/{mission_id}/duplicate", response_model=Mission)
async def duplicate_mission(mission_id: str, req: MissionDuplicateRequest,
                             user: dict = Depends(require_role("parent"))):
    src = await db.missions.find_one({"id": mission_id}, {"_id": 0})
    if not src:
        raise HTTPException(status_code=404, detail="Mission not found")
    await _assert_parent_owns_student(user, src["student_id"])
    new_id = str(uuid.uuid4())
    dup = {
        **src,
        "id": new_id,
        "due_date": req.due_date,
        "created_by_user_id": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        # A duplicate is a fresh one-off — drop any recurrence linkage.
        "recurrence_pattern": None,
        "recurrence_parent_id": None,
    }
    dup.pop("_id", None)
    await db.missions.insert_one(dup)
    return dup


@api.get("/missions", response_model=List[Mission])
async def list_missions(
    student_id: Optional[str] = None,
    due_date: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    query = {}
    if user["role"] == "student":
        query["student_id"] = user["id"]
    else:
        if student_id:
            await _assert_parent_owns_student(user, student_id)
            query["student_id"] = student_id
        else:
            query["student_id"] = {"$in": await _accessible_student_ids(user)}
    if due_date:
        query["due_date"] = due_date
    missions = await db.missions.find(query, {"_id": 0}).sort("due_date", 1).to_list(1000)
    return missions


@api.get("/missions/{mission_id}", response_model=Mission)
async def get_mission(mission_id: str, user: dict = Depends(get_current_user)):
    mission = await db.missions.find_one({"id": mission_id}, {"_id": 0})
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")
    if user["role"] == "student" and mission["student_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not your mission")
    if user["role"] == "parent":
        await _assert_parent_owns_student(user, mission["student_id"], write=False)
    return mission


@api.put("/missions/{mission_id}", response_model=Mission)
async def update_mission(mission_id: str, req: MissionUpdate, user: dict = Depends(require_role("parent"))):
    mission = await db.missions.find_one({"id": mission_id}, {"_id": 0})
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")
    await _assert_parent_owns_student(user, mission["student_id"])
    payload = req.model_dump()
    scope = payload.pop("scope", "this") or "this"
    updates = {k: v for k, v in payload.items() if v is not None}
    if not updates:
        return mission

    # Find the series this mission belongs to (parent OR child of a recurrence)
    series_id = mission.get("recurrence_parent_id") or mission_id

    if scope == "this":
        await db.missions.update_one({"id": mission_id}, {"$set": updates})
    else:
        # "future"  — this and later occurrences in the series, uncompleted only
        # "series"  — every occurrence in the series, uncompleted only
        # "Uncompleted" means: no mission_log row with status='completed' exists for that mission.
        # Build the candidate query.
        q = {
            "$or": [
                {"id": series_id},
                {"recurrence_parent_id": series_id},
            ],
            "student_id": mission["student_id"],
        }
        if scope == "future":
            q["due_date"] = {"$gte": mission["due_date"]}
        candidates = await db.missions.find(q, {"_id": 0, "id": 1, "due_date": 1}).to_list(2000)
        cand_ids = [c["id"] for c in candidates]
        # Filter out those with a completed log
        completed_ids = set()
        if cand_ids:
            logs = await db.mission_logs.find(
                {"mission_id": {"$in": cand_ids}, "status": "completed"},
                {"_id": 0, "mission_id": 1},
            ).to_list(2000)
            completed_ids = {l["mission_id"] for l in logs}
        # Only update uncompleted (history is sacred — per user choice 5b)
        target_ids = [cid for cid in cand_ids if cid not in completed_ids]
        # When changing `due_date` for a whole series at once we'd collide. Don't
        # allow `due_date` to be applied across scopes other than "this".
        bulk_updates = {k: v for k, v in updates.items() if k != "due_date"}
        if bulk_updates and target_ids:
            await db.missions.update_many(
                {"id": {"$in": target_ids}},
                {"$set": bulk_updates},
            )
    fresh = await db.missions.find_one({"id": mission_id}, {"_id": 0})
    return fresh


@api.delete("/missions/{mission_id}")
async def delete_mission(mission_id: str, user: dict = Depends(require_role("parent"))):
    mission = await db.missions.find_one({"id": mission_id}, {"_id": 0})
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")
    await _assert_parent_owns_student(user, mission["student_id"])
    await db.missions.delete_one({"id": mission_id})
    await db.mission_logs.delete_many({"mission_id": mission_id})
    return {"ok": True}


# ---------- Mission logs ----------
_MAX_PHOTO_BYTES = 2_000_000  # 2 MB after base64 decoding
_IMAGE_MAGIC = {
    b"\xff\xd8\xff": "image/jpeg",
    b"\x89PNG\r\n\x1a\n": "image/png",
    b"RIFF": "image/webp",  # webp has 'RIFF....WEBP' — sniff first 4 chars
}


def _sniff_image_type(raw: bytes) -> Optional[str]:
    if raw.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if raw.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
        return "image/webp"
    return None


def _decode_photo_payload(data: str) -> tuple[bytes, str]:
    """Accept a data URL ('data:image/jpeg;base64,...') or raw base64 for a JPEG/PNG/WebP.
    Returns (raw_bytes, content_type). Rejects if too large, too small, or magic
    bytes don't match a real image. Trust-nothing on client-declared MIME."""
    if not data or not isinstance(data, str):
        raise HTTPException(status_code=400, detail="Photo data is empty.")
    b64 = data
    declared_ct: Optional[str] = None
    if data.startswith("data:"):
        try:
            head, b64 = data.split(",", 1)
            declared_ct = head.split(";", 1)[0][5:] or None
        except Exception:
            raise HTTPException(status_code=400, detail="Malformed photo data URL.") from None
    try:
        raw = base64.b64decode(b64, validate=True)
    except Exception:
        raise HTTPException(status_code=400, detail="Photo is not valid base64.") from None
    if len(raw) > _MAX_PHOTO_BYTES:
        raise HTTPException(status_code=413, detail="Photo is too large — please compress under 2 MB.")
    if len(raw) < 200:
        raise HTTPException(status_code=400, detail="Photo is too small to be real.")
    sniffed = _sniff_image_type(raw)
    if not sniffed:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, or WebP photos.")
    # If the client declared a MIME, insist it match what we actually see.
    if declared_ct and declared_ct != sniffed:
        raise HTTPException(status_code=400, detail="Photo bytes don't match the declared image type.")
    return raw, sniffed


async def _consume_parent_verify_token(token: str, mission_student_id: str) -> str:
    """Look up a single-use, short-lived parent-PIN verification token.
    Deletes on success. Returns the verifying parent's user_id or raises 403."""
    if not token:
        raise HTTPException(status_code=403, detail="This mission needs a grown-up's PIN.")
    now = datetime.now(timezone.utc)
    doc = await db.parent_verify_tokens.find_one_and_delete({"token": token})
    if not doc:
        raise HTTPException(status_code=403, detail="This PIN prompt has expired — ask the grown-up to try again.")
    try:
        exp = datetime.fromisoformat(doc["expires_at"])
    except Exception:
        exp = now  # treat as expired
    if now > exp:
        raise HTTPException(status_code=403, detail="This PIN prompt has expired — ask the grown-up to try again.")
    if doc.get("student_id") != mission_student_id:
        raise HTTPException(status_code=403, detail="That PIN wasn't for this student.")
    return doc["parent_id"]


@api.post("/missions/{mission_id}/log", response_model=MissionLog)
async def create_log(mission_id: str, req: MissionLogCreate, user: dict = Depends(require_role("student"))):
    mission = await db.missions.find_one({"id": mission_id}, {"_id": 0})
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")
    if mission["student_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not your mission")

    verification = mission.get("verification", "trust")
    is_completion = req.status == "completed"
    now_iso = datetime.now(timezone.utc).isoformat()

    # By default the log's declared status is what the kid submitted.
    log_status = req.status
    verification_status = "not_required"
    verified_by = None
    verified_at = None
    photo_id = None

    # ---- verification gating on completion ----
    if is_completion:
        if verification == "trust":
            verification_status = "not_required"
        elif verification == "parent_pin":
            verified_by = await _consume_parent_verify_token(req.parent_verify_token or "", mission["student_id"])
            verification_status = "approved"
            verified_at = now_iso
        elif verification == "photo":
            if not req.photo_data:
                raise HTTPException(status_code=400, detail="This mission needs a photo before it counts.")
            raw, ctype = _decode_photo_payload(req.photo_data)
            photo_id = str(uuid.uuid4())
            await db.mission_photos.insert_one({
                "id": photo_id,
                "mission_id": mission_id,
                "student_id": user["id"],
                "content_type": ctype,
                "size_bytes": len(raw),
                "data": raw,  # stored as bson binary
                "created_at": now_iso,
            })
            verification_status = "approved"
            verified_at = now_iso
        elif verification == "async_review":
            # Kid marks "ready" — log is pending until parent approves. Streak does
            # NOT count until status flips to 'completed'.
            log_status = "pending_review"
            verification_status = "pending"
        else:
            raise HTTPException(status_code=400, detail=f"Unknown verification mode: {verification}")

    log_id = str(uuid.uuid4())
    doc = {
        "id": log_id,
        "mission_id": mission_id,
        "student_id": user["id"],
        "status": log_status,
        "used_strategies": req.used_strategies,
        "difficulty_rating": req.difficulty_rating,
        "feeling": req.feeling,
        "note": req.note or "",
        "clue_captures": [c.strip() for c in (req.clue_captures or []) if c and c.strip()],
        "game_played": False,
        "game_key": None,
        "game_score": None,
        "timestamp": now_iso,
        "verification": verification,
        "verification_status": verification_status,
        "verified_by_user_id": verified_by,
        "verified_at": verified_at,
        "photo_id": photo_id,
        "rejected_reason": None,
        "auto_approved": False,
    }
    await db.mission_logs.insert_one(doc)
    doc.pop("_id", None)

    # ---- Push notification triggers (Iter 22) ----
    if is_completion:
        try:
            await _fire_completion_pushes(mission, doc, user)
        except Exception as e:  # noqa: BLE001
            logger.warning("Push trigger failed for log %s: %s", log_id, e)

    return MissionLog(**doc)


async def _linked_parent_ids(student_id: str) -> list[str]:
    """All parent user_ids who have this student linked (owners + co-parents)."""
    parents = await db.users.find(
        {"role": "parent", "linked_student_ids": student_id},
        {"_id": 0, "id": 1},
    ).to_list(50)
    return [p["id"] for p in parents]


async def _fire_completion_pushes(mission: dict, log_doc: dict, kid: dict) -> None:
    """Called after a mission_log is inserted. Fires:
      - parent_pending_review    (async_review submissions)
      - parent_kid_completed     (kid finished ALL of today's missions)
      - kid_streak_milestone     (streak hits 3/5/7/10/14/21/30/50/100 days)
    Each is gated by the recipient's notification prefs (see push_service)."""
    parent_ids = await _linked_parent_ids(mission["student_id"])

    # 1) async_review pending → notify every parent
    if log_doc.get("verification_status") == "pending":
        for pid in parent_ids:
            await push_service.send_push_to_user(
                pid,
                pref_key="parent_pending_review",
                title=f"🎯 {kid.get('name', 'Your kid')} needs your review",
                body=f"'{mission.get('title', 'Mission')}' — tap to approve or send back",
                url="/parent",
                tag=f"pending-{log_doc['id']}",
                require_interaction=True,
            )

    # 2) Kid just wrapped up ALL of today's missions (only for completed status, not pending)
    if log_doc.get("status") == "completed":
        try:
            snap = await _compute_streak_snapshot(db, mission["student_id"])
            if (snap.missions_today_count > 0
                    and snap.completed_today_count == snap.missions_today_count):
                for pid in parent_ids:
                    await push_service.send_push_to_user(
                        pid,
                        pref_key="parent_kid_completed",
                        title=f"🎉 {kid.get('name', 'Your kid')} finished today",
                        body=f"All {snap.missions_today_count} of today's missions — nice!",
                        url="/parent",
                        tag=f"all-done-{mission['student_id']}-{snap.missions_today_count}",
                    )
            # 3) Streak milestone celebration — notify the KID on their device
            milestones = {3, 5, 7, 10, 14, 21, 30, 50, 100}
            if snap.current_streak in milestones and snap.completed_today:
                await push_service.send_push_to_user(
                    mission["student_id"],
                    pref_key="kid_streak_milestone",
                    title=f"🔥 {snap.current_streak}-day streak!",
                    body="Amazing work — keep the sparks flying.",
                    url="/student",
                    tag=f"streak-{snap.current_streak}",
                )
            # 4) Kid Studio unlock — first time the streak crosses the family's threshold.
            fresh = await db.users.find_one(
                {"id": mission["student_id"]},
                {"_id": 0, "student_profile": 1, "studio_unlocked_at": 1},
            ) or {}
            threshold = int((fresh.get("student_profile") or {}).get("game_studio_unlock_streak", 7))
            if (snap.current_streak >= threshold
                    and not fresh.get("studio_unlocked_at")):
                await db.users.update_one(
                    {"id": mission["student_id"]},
                    {"$set": {"studio_unlocked_at": datetime.now(timezone.utc).isoformat()}},
                )
                await push_service.send_push_to_user(
                    mission["student_id"],
                    pref_key="kid_pack_unlocked",
                    title="🎨 Kid Studio unlocked!",
                    body="You unlocked the Studio — build your own game pack now.",
                    url="/student/studio",
                    tag="studio-unlock",
                    require_interaction=True,
                )
        except Exception as e:  # noqa: BLE001
            logger.warning("Streak-based push notify failed: %s", e)


# ---------- Parent verify-PIN (Iter 21) ----------
class VerifyPinSet(BaseModel):
    pin: str


class VerifyPinPromptRequest(BaseModel):
    pin: str


@api.get("/me/verify-pin")
async def get_my_verify_pin_status(user: dict = Depends(require_role("parent"))):
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0, "parent_verify_pin_hash": 1})
    return {"is_set": bool((fresh or {}).get("parent_verify_pin_hash"))}


@api.put("/me/verify-pin")
async def set_my_verify_pin(req: VerifyPinSet, user: dict = Depends(require_role("parent"))):
    if not req.pin or not req.pin.isdigit() or len(req.pin) != 4:
        raise HTTPException(status_code=400, detail="Verify PIN must be exactly 4 digits.")
    hashed = hash_password(req.pin)
    await db.users.update_one({"id": user["id"]}, {"$set": {"parent_verify_pin_hash": hashed}})
    await _audit(user, "parent.verify_pin_set", target_type="user", target_id=user["id"])
    return {"ok": True, "is_set": True}


@api.delete("/me/verify-pin")
async def clear_my_verify_pin(user: dict = Depends(require_role("parent"))):
    await db.users.update_one({"id": user["id"]}, {"$unset": {"parent_verify_pin_hash": ""}})
    await _audit(user, "parent.verify_pin_clear", target_type="user", target_id=user["id"])
    return {"ok": True, "is_set": False}


@api.post("/missions/{mission_id}/verify-pin")
async def prompt_verify_pin(mission_id: str, req: VerifyPinPromptRequest,
                             user: dict = Depends(require_role("student"))):
    """Kid enters a parent's 4-digit verify PIN on THEIR device. Backend checks
    against every parent linked to this student. On match, issues a single-use
    token valid for 2 minutes that the kid can then attach to their next log."""
    mission = await db.missions.find_one({"id": mission_id}, {"_id": 0})
    if not mission or mission["student_id"] != user["id"]:
        raise HTTPException(status_code=404, detail="Mission not found")
    if not req.pin or not req.pin.isdigit() or len(req.pin) != 4:
        raise HTTPException(status_code=400, detail="PIN must be 4 digits.")
    # Rate-limit: 5 failed attempts per student per 10 minutes
    ten_min_ago = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    recent_fails = await db.parent_verify_attempts.count_documents(
        {"student_id": user["id"], "success": False, "at": {"$gte": ten_min_ago}},
    )
    if recent_fails >= 5:
        raise HTTPException(status_code=429, detail="Too many tries — wait a bit and ask a grown-up.")
    # Find parents linked to this kid
    parents = await db.users.find(
        {"role": "parent", "linked_student_ids": user["id"], "parent_verify_pin_hash": {"$exists": True}},
        {"_id": 0, "id": 1, "parent_verify_pin_hash": 1},
    ).to_list(20)
    matched_parent = None
    for p in parents:
        try:
            if verify_password(req.pin, p["parent_verify_pin_hash"]):
                matched_parent = p
                break
        except Exception:
            continue
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.parent_verify_attempts.insert_one({
        "student_id": user["id"],
        "mission_id": mission_id,
        "success": bool(matched_parent),
        "at": now_iso,
    })
    if not matched_parent:
        remaining = max(0, 5 - recent_fails - 1)
        raise HTTPException(status_code=403, detail=f"That's not the right PIN. {remaining} tries left.")
    token = secrets.token_urlsafe(24)
    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=2)).isoformat()
    await db.parent_verify_tokens.insert_one({
        "token": token,
        "parent_id": matched_parent["id"],
        "student_id": user["id"],
        "mission_id": mission_id,
        "expires_at": expires_at,
        "created_at": now_iso,
    })
    return {"ok": True, "token": token, "expires_at": expires_at}


# ---------- Async-review approve/reject ----------
class LogRejectBody(BaseModel):
    reason: Optional[str] = None


async def _load_log_for_parent(log_id: str, user: dict) -> dict:
    log = await db.mission_logs.find_one({"id": log_id}, {"_id": 0})
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")
    await _assert_parent_owns_student(user, log["student_id"], write=False)
    return log


@api.post("/logs/{log_id}/approve", response_model=MissionLog)
async def approve_log(log_id: str, user: dict = Depends(require_role("parent"))):
    log = await _load_log_for_parent(log_id, user)
    if log.get("verification_status") != "pending":
        raise HTTPException(status_code=400, detail="This log isn't waiting for review.")
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.mission_logs.update_one(
        {"id": log_id},
        {"$set": {
            "status": "completed",
            "verification_status": "approved",
            "verified_by_user_id": user["id"],
            "verified_at": now_iso,
        }},
    )
    await _audit(user, "log.approve", target_type="mission_log", target_id=log_id)
    fresh = await db.mission_logs.find_one({"id": log_id}, {"_id": 0})
    return MissionLog(**fresh)


@api.post("/logs/{log_id}/reject", response_model=MissionLog)
async def reject_log(log_id: str, req: LogRejectBody, user: dict = Depends(require_role("parent"))):
    log = await _load_log_for_parent(log_id, user)
    if log.get("verification_status") != "pending":
        raise HTTPException(status_code=400, detail="This log isn't waiting for review.")
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.mission_logs.update_one(
        {"id": log_id},
        {"$set": {
            "status": "rejected",
            "verification_status": "rejected",
            "verified_by_user_id": user["id"],
            "verified_at": now_iso,
            "rejected_reason": (req.reason or "").strip()[:240] or None,
        }},
    )
    await _audit(user, "log.reject", target_type="mission_log", target_id=log_id,
                 meta={"reason": req.reason or ""})
    fresh = await db.mission_logs.find_one({"id": log_id}, {"_id": 0})
    return MissionLog(**fresh)


@api.get("/pending-reviews", response_model=List[dict])
async def list_pending_reviews(user: dict = Depends(require_role("parent"))):
    kid_ids = await _accessible_student_ids(user)
    if not kid_ids:
        return []
    logs = await db.mission_logs.find(
        {"student_id": {"$in": kid_ids}, "verification_status": "pending"},
        {"_id": 0},
    ).sort("timestamp", -1).to_list(200)
    if not logs:
        return []
    mission_ids = list({l["mission_id"] for l in logs})
    kid_ids_used = list({l["student_id"] for l in logs})
    missions = {
        m["id"]: m for m in await db.missions.find(
            {"id": {"$in": mission_ids}}, {"_id": 0},
        ).to_list(500)
    }
    kids = {
        u["id"]: u for u in await db.users.find(
            {"id": {"$in": kid_ids_used}}, {"_id": 0, "id": 1, "name": 1},
        ).to_list(500)
    }
    now = datetime.now(timezone.utc)
    out = []
    for lg in logs:
        m = missions.get(lg["mission_id"]) or {}
        auto_hrs = m.get("auto_approve_hours") or 0
        try:
            ts = datetime.fromisoformat(lg["timestamp"])
        except Exception:
            ts = now
        auto_at = None
        hrs_remaining = None
        if auto_hrs and auto_hrs > 0:
            auto_at_dt = ts + timedelta(hours=auto_hrs)
            auto_at = auto_at_dt.isoformat()
            hrs_remaining = max(0, int((auto_at_dt - now).total_seconds() // 3600))
        out.append({
            "log_id": lg["id"],
            "mission_id": lg["mission_id"],
            "mission_title": m.get("title") or "Mission",
            "student_id": lg["student_id"],
            "student_name": (kids.get(lg["student_id"]) or {}).get("name"),
            "note": lg.get("note") or "",
            "feeling": lg.get("feeling"),
            "difficulty_rating": lg.get("difficulty_rating"),
            "submitted_at": lg["timestamp"],
            "auto_approve_at": auto_at,
            "hours_until_auto_approve": hrs_remaining,
            "photo_id": lg.get("photo_id"),
        })
    return out


@api.get("/logs/{log_id}/photo")
async def get_log_photo(log_id: str, user: dict = Depends(get_current_user)):
    log = await db.mission_logs.find_one({"id": log_id}, {"_id": 0})
    if not log or not log.get("photo_id"):
        raise HTTPException(status_code=404, detail="No photo on this log.")
    # Auth: kid owns it, or parent has access to that kid
    if user["role"] == "student":
        if user["id"] != log["student_id"]:
            raise HTTPException(status_code=403, detail="Not your log")
    else:
        await _assert_parent_owns_student(user, log["student_id"], write=False)
    photo = await db.mission_photos.find_one({"id": log["photo_id"]}, {"_id": 0})
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found.")
    from fastapi.responses import Response as FastResponse  # local import to avoid noise at top
    return FastResponse(
        content=bytes(photo["data"]),
        media_type=photo.get("content_type") or "image/jpeg",
        headers={
            # Photos are immutable — safe to cache in the parent's browser for a day
            "Cache-Control": "private, max-age=86400, immutable",
            "ETag": f'"{log["photo_id"]}"',
        },
    )


class GamePlayRequest(BaseModel):
    game_key: str
    score: Optional[int] = None


@api.post("/logs/{log_id}/game", response_model=MissionLog)
async def mark_game_played(log_id: str, req: GamePlayRequest, user: dict = Depends(require_role("student"))):
    log = await db.mission_logs.find_one({"id": log_id}, {"_id": 0})
    if not log:
        raise HTTPException(status_code=404, detail="Mission log not found")
    if log["student_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not your log")
    if log.get("game_played"):
        raise HTTPException(status_code=409, detail="A game has already been played for this mission.")
    await db.mission_logs.update_one(
        {"id": log_id},
        {"$set": {"game_played": True, "game_key": req.game_key, "game_score": req.score}},
    )
    log = await db.mission_logs.find_one({"id": log_id}, {"_id": 0})
    return MissionLog(**log)


@api.get("/logs", response_model=List[MissionLog])
async def list_logs(
    student_id: Optional[str] = None,
    mission_id: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    query = {}
    if user["role"] == "student":
        query["student_id"] = user["id"]
    else:
        if student_id:
            await _assert_parent_owns_student(user, student_id)
            query["student_id"] = student_id
        else:
            query["student_id"] = {"$in": await _accessible_student_ids(user)}
    if mission_id:
        query["mission_id"] = mission_id
    logs = await db.mission_logs.find(query, {"_id": 0}).sort("timestamp", -1).to_list(1000)
    return logs


# ---------- Streak ----------
from streak_service import (  # noqa: E402
    compute_streak as _compute_streak_snapshot,
    freezes_this_month as _freezes_this_month,
    MAX_FREEZES_PER_MONTH,
    WEEKEND_MODE_ALL,
    WEEKEND_MODE_WEEKDAYS,
)


class StreakWeekDay(BaseModel):
    date: str
    kind: str  # completed | freeze | weekend | missed | pending
    is_today: bool


class StreakResponse(BaseModel):
    current_streak: int
    longest_streak: int
    completed_today: bool
    completed_today_count: int
    missions_today_count: int
    last_completed_date: Optional[str] = None
    week: List[dict] = []
    freezes_used_in_run: int = 0
    freezes_remaining_month: int = 0
    freezes_granted_this_month: int = 0
    weekend_mode: str = WEEKEND_MODE_ALL
    # backwards-compat alias
    freeze_used_in_run: bool = False


async def _compute_streak(student_id: str) -> StreakResponse:
    snap = await _compute_streak_snapshot(db, student_id)
    return StreakResponse(
        current_streak=snap.current_streak,
        longest_streak=snap.longest_streak,
        completed_today=snap.completed_today,
        completed_today_count=snap.completed_today_count,
        missions_today_count=snap.missions_today_count,
        last_completed_date=snap.last_completed_date,
        week=snap.week,
        freezes_used_in_run=snap.freezes_used_in_run,
        freezes_remaining_month=snap.freezes_remaining_month,
        freezes_granted_this_month=snap.freezes_granted_this_month,
        weekend_mode=snap.weekend_mode,
        freeze_used_in_run=(snap.freezes_used_in_run > 0),
    )


@api.get("/streak", response_model=StreakResponse)
async def get_my_streak(user: dict = Depends(get_current_user)):
    if user["role"] != "student":
        raise HTTPException(status_code=403, detail="Only students have a streak. Use /api/streak/{student_id} as a parent.")
    return await _compute_streak(user["id"])


@api.get("/streak/{student_id}", response_model=StreakResponse)
async def get_student_streak(student_id: str, user: dict = Depends(get_current_user)):
    if user["role"] == "student":
        if user["id"] != student_id:
            raise HTTPException(status_code=403, detail="Not your streak")
    else:
        await _assert_parent_owns_student(user, student_id)
    return await _compute_streak(student_id)


# ---------- Family Games: custom game packs ----------
GAME_PACK_TYPES = ("word_match", "memory_cards", "sentence_builder")
GAME_PACK_TYPE_LABEL = {
    "word_match": "Word Match",
    "memory_cards": "Memory Cards",
    "sentence_builder": "Sentence Builder",
}


class GamePackCreate(BaseModel):
    """Parent or kid pack submission."""
    name: str
    game_type: Literal["word_match", "memory_cards", "sentence_builder"]
    content: dict
    # Parent-only: who this pack should be visible to once approved. Empty = all linked students.
    share_with_student_ids: List[str] = []
    # Kid-only: optional sibling list to share with (parent can edit on approval).
    requested_share_with_student_ids: List[str] = []


class GamePackApprove(BaseModel):
    share_with_student_ids: Optional[List[str]] = None


class GamePackReject(BaseModel):
    reason: Optional[str] = None


class GamePack(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str
    name: str
    game_type: str
    content: dict
    created_by_user_id: str
    created_by_role: Role
    creator_name: Optional[str] = None
    student_id: Optional[str] = None  # owner-student if pack was created by a kid
    family_parent_id: str  # parent who owns the family this pack belongs to
    status: Literal["pending", "approved", "rejected"]
    rejection_reason: Optional[str] = None
    share_with_student_ids: List[str] = []
    created_at: str
    reviewed_at: Optional[str] = None


def _validate_pack_content(game_type: str, content: dict) -> dict:
    """Normalize and validate game-pack content. Returns sanitized content
    or raises 400."""
    if not isinstance(content, dict):
        raise HTTPException(status_code=400, detail="content must be an object")

    if game_type == "word_match":
        pairs = content.get("pairs") or []
        if not isinstance(pairs, list) or not (4 <= len(pairs) <= 12):
            raise HTTPException(status_code=400, detail="Word Match needs 4–12 word/meaning pairs.")
        cleaned = []
        for p in pairs:
            if not isinstance(p, dict):
                raise HTTPException(status_code=400, detail="Each pair must have a word and meaning.")
            w = str(p.get("word", "")).strip()[:60]
            m = str(p.get("meaning", "")).strip()[:160]
            if not w or not m:
                raise HTTPException(status_code=400, detail="Every pair needs both a word and a meaning.")
            cleaned.append({"word": w, "meaning": m})
        return {"pairs": cleaned}

    if game_type == "memory_cards":
        items = content.get("items") or []
        if not isinstance(items, list) or not (4 <= len(items) <= 8):
            raise HTTPException(status_code=400, detail="Memory Cards needs 4–8 unique items.")
        cleaned = []
        seen = set()
        for it in items:
            s = str(it).strip()[:8]  # emoji or short char
            if not s:
                raise HTTPException(status_code=400, detail="Memory item cannot be blank.")
            if s in seen:
                raise HTTPException(status_code=400, detail=f"Memory items must be unique. '{s}' is repeated.")
            seen.add(s)
            cleaned.append(s)
        return {"items": cleaned}

    if game_type == "sentence_builder":
        sentences = content.get("sentences") or []
        if not isinstance(sentences, list) or not (1 <= len(sentences) <= 5):
            raise HTTPException(status_code=400, detail="Sentence Builder needs 1–5 sentences.")
        cleaned = []
        for s in sentences:
            t = str(s).strip()
            words = [w for w in t.split() if w]
            if not (3 <= len(words) <= 12):
                raise HTTPException(status_code=400, detail="Each sentence must have 3–12 words.")
            cleaned.append(" ".join(words))
        return {"sentences": cleaned}

    raise HTTPException(status_code=400, detail=f"Unsupported game_type: {game_type}")


async def _family_id_of_student(student_id: str) -> Optional[str]:
    """Returns the family.id this student belongs to (first match if multiple)."""
    fam = await db.families.find_one({"student_ids": student_id}, {"_id": 0, "id": 1})
    return fam["id"] if fam else None


async def _parent_id_of_student(student_id: str) -> Optional[str]:
    """Legacy: returns owner-user-id of the first family containing this student.
    Kept for backward compat with tests; family_id is the preferred key."""
    fam = await db.families.find_one({"student_ids": student_id}, {"_id": 0, "owner_user_id": 1})
    if fam:
        return fam.get("owner_user_id")
    # Fallback to legacy pre-migration link
    parent = await db.users.find_one(
        {"role": "parent", "linked_student_ids": student_id}, {"_id": 0, "id": 1}
    )
    return parent["id"] if parent else None


async def _student_ids_in_family(family_id: str) -> List[str]:
    fam = await db.families.find_one({"id": family_id}, {"_id": 0, "student_ids": 1})
    return list((fam or {}).get("student_ids") or [])


@api.get("/game-packs", response_model=List[GamePack])
async def list_game_packs(user: dict = Depends(get_current_user)):
    """Parent: every pack in any family they belong to (regardless of status).
       Student: approved packs in their family that are visible to them, plus
       their own packs (any status — so the Waiting chip shows)."""
    if user["role"] == "parent":
        fam_ids = await _accessible_family_ids(user)
        if not fam_ids:
            return []
        rows = await db.game_packs.find(
            {"$or": [{"family_id": {"$in": fam_ids}}, {"family_parent_id": user["id"]}]},
            {"_id": 0},
        ).sort("created_at", -1).to_list(500)
        return rows

    # student
    family_id = await _family_id_of_student(user["id"])
    if not family_id:
        return []
    rows = await db.game_packs.find(
        {
            "family_id": family_id,
            "$or": [
                # Student always sees their own packs (any status — so the Waiting chip shows)
                {"created_by_user_id": user["id"]},
                # Approved packs explicitly shared with this student
                {"status": "approved", "share_with_student_ids": user["id"]},
                # Approved parent-authored packs with no share-list go to all kids
                {"status": "approved", "created_by_role": "parent", "share_with_student_ids": []},
            ],
        },
        {"_id": 0},
    ).sort("created_at", -1).to_list(500)
    return rows


@api.get("/game-packs/{pack_id}", response_model=GamePack)
async def get_game_pack(pack_id: str, user: dict = Depends(get_current_user)):
    p = await db.game_packs.find_one({"id": pack_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Pack not found")
    pack_fid = p.get("family_id")
    if user["role"] == "parent":
        fam_ids = set(await _accessible_family_ids(user))
        if pack_fid not in fam_ids and p.get("family_parent_id") != user["id"]:
            raise HTTPException(status_code=403, detail="Not your family's pack")
        return p
    # student: must belong to same family
    student_fid = await _family_id_of_student(user["id"])
    if pack_fid and pack_fid != student_fid:
        raise HTTPException(status_code=403, detail="Not your family's pack")
    # creator-student can always read their own pack regardless of status
    if p["created_by_user_id"] == user["id"]:
        return p
    # otherwise must be approved AND visible
    if p["status"] != "approved":
        raise HTTPException(status_code=403, detail="Pack not available")
    visible = (
        user["id"] in (p.get("share_with_student_ids") or [])
        or (p["created_by_role"] == "parent" and not (p.get("share_with_student_ids") or []))
    )
    if not visible:
        raise HTTPException(status_code=403, detail="Pack not shared with you")
    return p


@api.post("/game-packs", response_model=GamePack)
async def create_game_pack_parent(req: GamePackCreate, user: dict = Depends(require_role("parent"))):
    """Parent-authored pack — instantly approved. Created in the active family."""
    if req.game_type not in GAME_PACK_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported game_type")
    family_id = user.get("active_family_id") or await _ensure_personal_family(user)
    role = await _user_role_in_family(user, family_id)
    _assert_family_write_role(role)
    content = _validate_pack_content(req.game_type, req.content)
    name = req.name.strip()[:80] or GAME_PACK_TYPE_LABEL[req.game_type]
    family_students = set(await _student_ids_in_family(family_id))
    share = [sid for sid in (req.share_with_student_ids or []) if sid in family_students]
    now = datetime.now(timezone.utc).isoformat()
    pack = {
        "id": str(uuid.uuid4()),
        "name": name,
        "game_type": req.game_type,
        "content": content,
        "created_by_user_id": user["id"],
        "created_by_role": "parent",
        "creator_name": user.get("name") or "Parent",
        "student_id": None,
        "family_id": family_id,
        "family_parent_id": user["id"],  # legacy
        "status": "approved",
        "rejection_reason": None,
        "share_with_student_ids": share,
        "created_at": now,
        "reviewed_at": now,
    }
    await db.game_packs.insert_one(dict(pack))
    await _audit(user, "game_pack.create", target_type="game_pack", target_id=pack["id"],
                 meta={"game_type": req.game_type, "by": "parent"})
    return pack


@api.post("/game-packs/student-submit", response_model=GamePack)
async def create_game_pack_student(req: GamePackCreate, user: dict = Depends(require_role("student"))):
    """Kid Studio: child submits a pack; parent must approve before siblings see it."""
    if req.game_type not in GAME_PACK_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported game_type")
    family_id = await _family_id_of_student(user["id"])
    if not family_id:
        raise HTTPException(status_code=400, detail="You need to be linked to a family to share games.")
    parent_id = await _parent_id_of_student(user["id"])
    # Streak gate
    streak = await _compute_streak(user["id"])
    threshold = int(((await db.users.find_one({"id": user["id"]}, {"_id": 0, "student_profile": 1}) or {})
                     .get("student_profile") or {}).get("game_studio_unlock_streak", 7))
    if streak.current_streak < threshold:
        raise HTTPException(
            status_code=403,
            detail=f"Kid Studio unlocks at a {threshold}-day spark streak. You're at {streak.current_streak}.",
        )
    content = _validate_pack_content(req.game_type, req.content)
    name = req.name.strip()[:80] or GAME_PACK_TYPE_LABEL[req.game_type]
    # Requested siblings (parent can rewrite on approval) — siblings in the same family
    siblings = set(await _student_ids_in_family(family_id)) - {user["id"]}
    requested = [sid for sid in (req.requested_share_with_student_ids or []) if sid in siblings]
    now = datetime.now(timezone.utc).isoformat()
    pack = {
        "id": str(uuid.uuid4()),
        "name": name,
        "game_type": req.game_type,
        "content": content,
        "created_by_user_id": user["id"],
        "created_by_role": "student",
        "creator_name": user.get("name") or "Student",
        "student_id": user["id"],
        "family_id": family_id,
        "family_parent_id": parent_id,  # legacy
        "status": "pending",
        "rejection_reason": None,
        "share_with_student_ids": requested,
        "created_at": now,
        "reviewed_at": None,
    }
    await db.game_packs.insert_one(dict(pack))
    await _audit(user, "game_pack.submit", target_type="game_pack", target_id=pack["id"],
                 meta={"game_type": req.game_type})
    return pack


@api.put("/game-packs/{pack_id}", response_model=GamePack)
async def update_game_pack(pack_id: str, req: GamePackCreate, user: dict = Depends(require_role("parent"))):
    """Parent edits a pack in any family they belong to (write role required).
    Kid-submitted packs cannot be edited via this endpoint."""
    p = await db.game_packs.find_one({"id": pack_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Pack not found")
    pack_fid = p.get("family_id")
    role = await _user_role_in_family(user, pack_fid) if pack_fid else None
    if role is None and p.get("family_parent_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Not your family's pack")
    if role:
        _assert_family_write_role(role)
    if p["created_by_role"] == "student":
        raise HTTPException(status_code=400, detail="Kid-authored packs can be approved or rejected, not edited.")
    content = _validate_pack_content(req.game_type, req.content)
    family_students = set(await _student_ids_in_family(pack_fid)) if pack_fid else set()
    share = [sid for sid in (req.share_with_student_ids or []) if sid in family_students]
    updates = {
        "name": req.name.strip()[:80] or p["name"],
        "game_type": req.game_type,
        "content": content,
        "share_with_student_ids": share,
    }
    await db.game_packs.update_one({"id": pack_id}, {"$set": updates})
    fresh = await db.game_packs.find_one({"id": pack_id}, {"_id": 0})
    return fresh


@api.put("/game-packs/{pack_id}/approve", response_model=GamePack)
async def approve_game_pack(pack_id: str, req: GamePackApprove,
                             user: dict = Depends(require_role("parent"))):
    p = await db.game_packs.find_one({"id": pack_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Pack not found")
    pack_fid = p.get("family_id")
    role = await _user_role_in_family(user, pack_fid) if pack_fid else None
    if role is None and p.get("family_parent_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Not your family's pack")
    if role:
        _assert_family_write_role(role)
    if p["status"] == "approved":
        return p
    family_students = set(await _student_ids_in_family(pack_fid)) if pack_fid else set()
    if req.share_with_student_ids is not None:
        share = [sid for sid in req.share_with_student_ids if sid in family_students]
    else:
        share = [sid for sid in (p.get("share_with_student_ids") or []) if sid in family_students]
    now = datetime.now(timezone.utc).isoformat()
    await db.game_packs.update_one(
        {"id": pack_id},
        {"$set": {
            "status": "approved",
            "share_with_student_ids": share,
            "rejection_reason": None,
            "reviewed_at": now,
        }},
    )
    fresh = await db.game_packs.find_one({"id": pack_id}, {"_id": 0})
    await _audit(user, "game_pack.approve", target_type="game_pack", target_id=pack_id)
    return fresh


@api.put("/game-packs/{pack_id}/reject", response_model=GamePack)
async def reject_game_pack(pack_id: str, req: GamePackReject,
                            user: dict = Depends(require_role("parent"))):
    p = await db.game_packs.find_one({"id": pack_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Pack not found")
    pack_fid = p.get("family_id")
    role = await _user_role_in_family(user, pack_fid) if pack_fid else None
    if role is None and p.get("family_parent_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Not your family's pack")
    if role:
        _assert_family_write_role(role)
    now = datetime.now(timezone.utc).isoformat()
    reason = (req.reason or "").strip()[:280] or None
    await db.game_packs.update_one(
        {"id": pack_id},
        {"$set": {"status": "rejected", "rejection_reason": reason, "reviewed_at": now}},
    )
    fresh = await db.game_packs.find_one({"id": pack_id}, {"_id": 0})
    await _audit(user, "game_pack.reject", target_type="game_pack", target_id=pack_id,
                 meta={"reason": reason} if reason else None)
    return fresh


@api.delete("/game-packs/{pack_id}")
async def delete_game_pack(pack_id: str, user: dict = Depends(get_current_user)):
    p = await db.game_packs.find_one({"id": pack_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Pack not found")
    if user["role"] == "parent":
        pack_fid = p.get("family_id")
        role = await _user_role_in_family(user, pack_fid) if pack_fid else None
        if role is None and p.get("family_parent_id") != user["id"]:
            raise HTTPException(status_code=403, detail="Not your family's pack")
        if role:
            _assert_family_write_role(role)
    else:
        # students can only delete their own pending or rejected packs
        if p["created_by_user_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="Not your pack")
        if p["status"] == "approved":
            raise HTTPException(status_code=400, detail="Ask a parent to remove an approved pack.")
    await db.game_packs.delete_one({"id": pack_id})
    await _audit(user, "game_pack.delete", target_type="game_pack", target_id=pack_id)
    return {"ok": True}


@api.get("/me/studio-status")
async def my_studio_status(user: dict = Depends(require_role("student"))):
    """Tells the student whether Kid Studio is unlocked, and the threshold."""
    streak = await _compute_streak(user["id"])
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0, "student_profile": 1})
    threshold = int(((fresh or {}).get("student_profile") or {}).get("game_studio_unlock_streak", 7))
    family_id = await _family_id_of_student(user["id"])
    siblings: List[dict] = []
    if family_id:
        sib_ids = [sid for sid in await _student_ids_in_family(family_id) if sid != user["id"]]
        if sib_ids:
            rows = await db.users.find({"id": {"$in": sib_ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(20)
            siblings = rows
    return {
        "current_streak": streak.current_streak,
        "unlock_threshold": threshold,
        "unlocked": streak.current_streak >= threshold,
        "siblings": siblings,
    }


# ---------- Parent Digest preferences + send ----------
class DigestPreferences(BaseModel):
    enabled: bool = False
    cadence: Literal["daily", "weekly"] = "daily"
    preferred_hour: int = 19
    preferred_minute: int = 0
    preferred_weekday: int = 6  # 0=Mon, 6=Sun
    tz: str = "America/Los_Angeles"


@api.get("/me/digest-preferences")
async def get_digest_prefs(user: dict = Depends(require_role("parent"))):
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0, "digest_preferences": 1})
    prefs = digest_service.normalize_prefs((fresh or {}).get("digest_preferences"))
    return {
        "enabled": prefs["enabled"],
        "cadence": prefs["cadence"],
        "preferred_hour": prefs["preferred_hour"],
        "preferred_minute": prefs["preferred_minute"],
        "preferred_weekday": prefs["preferred_weekday"],
        "tz": prefs["tz"],
        "last_sent_at": prefs.get("last_sent_at"),
        "next_due_at": prefs.get("next_due_at"),
    }


@api.put("/me/digest-preferences")
async def update_digest_prefs(req: DigestPreferences, user: dict = Depends(require_role("parent"))):
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0, "digest_preferences": 1})
    current = digest_service.normalize_prefs((fresh or {}).get("digest_preferences"))
    merged = {**current, **req.model_dump()}
    merged = digest_service.normalize_prefs(merged)
    # Always recompute next_due when prefs change so the scheduler picks the right slot
    now = datetime.now(timezone.utc)
    next_due = digest_service.compute_next_due(merged, now_utc=now) if merged["enabled"] else None
    if next_due:
        merged["next_due_at"] = next_due.isoformat()
    else:
        merged["next_due_at"] = None
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"digest_preferences": merged}},
    )
    await _audit(user, "digest.preferences_update", target_type="user", target_id=user["id"],
                 meta={"enabled": merged["enabled"], "cadence": merged["cadence"]})
    return merged


@api.post("/me/digest/send-sample")
async def send_sample_digest(user: dict = Depends(require_role("parent"))):
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
    result = await digest_service.send_sample_to(fresh)
    await _audit(user, "digest.send_sample", target_type="user", target_id=user["id"],
                 meta={"sent": result.get("sent")})
    return result


# ---------- AI Mission Drafting ----------
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
AI_MODEL_PROVIDER = "anthropic"
AI_MODEL_NAME = "claude-sonnet-4-5-20250929"


class AIDraftRequest(BaseModel):
    student_id: str
    prompt: str = ""


class AIDayDraftRequest(BaseModel):
    student_id: str
    count: int = 3
    prompt: str = ""


class AIDraftedMission(BaseModel):
    title: str
    description: str = ""
    steps: List[str] = []
    estimated_minutes: int = 15
    skill_ids: List[str] = []
    strategy_ids: List[str] = []
    skill_names: List[str] = []
    strategy_names: List[str] = []
    evidence_tags: List[str] = []
    evidence_refs: List[str] = []  # citation ids
    rationale: str = ""  # 1-2 sentences: why this mission for THIS child


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9 ]", " ", (s or "").lower()).strip()


def _match_ids(names: List[str], pool: List[dict]) -> List[str]:
    """Fuzzy-match AI-supplied names against existing skill/strategy pool, returning ids."""
    out: List[str] = []
    norm_pool = [(_norm(p["name"]), p["id"]) for p in pool]
    for n in names or []:
        target = _norm(n)
        if not target:
            continue
        # exact
        match = next((pid for nm, pid in norm_pool if nm == target), None)
        # substring either way
        if not match:
            match = next((pid for nm, pid in norm_pool if target in nm or nm in target), None)
        # token overlap
        if not match:
            t_tokens = set(target.split())
            best = (0, None)
            for nm, pid in norm_pool:
                overlap = len(t_tokens & set(nm.split()))
                if overlap > best[0]:
                    best = (overlap, pid)
            if best[0] >= 2:
                match = best[1]
        if match and match not in out:
            out.append(match)
    return out


def _extract_json(text: str):
    """Strip code fences and parse JSON from an LLM response."""
    if text is None:
        return None
    s = text.strip()
    # strip ```json ... ``` or ``` ... ```
    fence = re.match(r"^```(?:json)?\s*(.*?)\s*```$", s, re.DOTALL)
    if fence:
        s = fence.group(1).strip()
    # find first { or [ to last } or ]
    try:
        return json.loads(s)
    except Exception:
        pass
    start = min([i for i in [s.find("{"), s.find("[")] if i != -1] or [-1])
    end = max(s.rfind("}"), s.rfind("]"))
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(s[start : end + 1])
        except Exception:
            return None
    return None


async def _ai_chat(system_message: str, user_text: str) -> str:
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="AI is not configured. Set EMERGENT_LLM_KEY in backend/.env.")
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"missionsparks-{uuid.uuid4()}",
        system_message=system_message,
    ).with_model(AI_MODEL_PROVIDER, AI_MODEL_NAME)
    try:
        return await chat.send_message(UserMessage(text=user_text))
    except Exception as e:
        logger.exception("AI call failed")
        raise HTTPException(status_code=502, detail=f"AI service error: {e}") from e


def _system_prompt(skills: List[dict], strategies: List[dict]) -> str:
    skill_lines = "\n".join([f"- {s['name']} ({s['category']}): {s['description']}" for s in skills])
    strat_lines = "\n".join([f"- {s['name']} {s.get('emoji','')}: {s['description']}" for s in strategies])
    evidence_tags = ", ".join(all_known_tags())
    return (
        "You are MissionSparks' assistant. You help a busy parent draft small, kid-friendly daily "
        "learning 'missions' for their child. Missions focus on Reading and Executive Function. "
        "Each mission must be tiny, doable in 5-25 minutes, and broken into 2-5 concrete steps a child can check off. "
        "Use warm, encouraging, second-person language ('you'). Avoid jargon and emoji.\n\n"
        "STEPS — strict rules:\n"
        "- Each step must be a SHORT, PHYSICAL action the child does in their space "
        "  (e.g. 'pick up 5 things off the floor', 'set a 5-min timer', 'do 10 jumping jacks').\n"
        "- DO NOT ask the child to 'write it down', 'jot it on paper', 'make a list on paper', "
        "  'draw a chart', or any pencil-and-paper note-taking UNLESS the mission targets a "
        "  Reading skill AND uses the 'Underline clues' or 'Jot a clue' strategy. "
        "  For Executive Function / chores / movement missions, use 'say it out loud', 'remember', "
        "  'estimate in your head', or 'tell a grown-up' instead.\n"
        "- Do not invent objects or tools the child may not have (no journals, planners, sticker charts, dice, etc.).\n"
        "- Do not assume a printed book is present — the child may be reading on a screen or "
        "  listening to an audiobook. Use 'read the page' / 'pause the audio' phrasing.\n\n"
        "Pick skill_names and strategy_names ONLY from the lists below — copy the names exactly.\n\n"
        f"AVAILABLE SKILLS:\n{skill_lines}\n\n"
        f"AVAILABLE STRATEGIES:\n{strat_lines}\n\n"
        "Every mission you draft MUST also include an 'evidence_tags' array of 1–3 tags chosen "
        "ONLY from this controlled vocabulary, identifying the research areas the mission is grounded in:\n"
        f"  {evidence_tags}\n\n"
        "Pick the tags that most directly justify the chosen skills/strategies (e.g. a chunked "
        "planning task = 'task_chunking', 'executive_function'; a re-read for evidence = "
        "'annotation', 'reading_fluency'). Do not invent tags.\n\n"
        "Also include a 'rationale' field — 1 to 2 short sentences, addressed to the parent "
        "(use 'your child' or their child's name if you know it), explaining WHY this mission "
        "fits THIS child specifically. Name 1–2 concrete profile factors (an interest, a peak hour, "
        "a motivator, a strength, a known trigger you're avoiding) AND 1 research angle "
        "(e.g. 'short chunks fit working-memory limits' or 'movement before reading aids attention'). "
        "Keep it warm, plain-English, no jargon, no citations or paper authors — those are surfaced separately.\n\n"
        "Always respond with STRICT JSON only — no prose, no code fences."
    )


def _student_context(student: dict) -> str:
    """Build the AI-mission prompt context from the structured StudentProfile
    (and the legacy parent profile_notes for backward compat)."""
    name = student.get("name", "the child")
    profile = student.get("student_profile") or {}
    legacy_notes = (student.get("profile_notes") or "").strip()

    bits: List[str] = [f"Student: {name}."]
    if profile.get("grade"):
        bits.append(f"Grade: {profile['grade']}.")
    if profile.get("reading_level"):
        bits.append(f"Reading level: {profile['reading_level']} grade-level.")
    if profile.get("adhd_subtype"):
        sub = profile["adhd_subtype"]
        if sub != "uncertain":
            bits.append(f"ADHD subtype: {sub}.")
    if profile.get("interests"):
        bits.append("Interests: " + ", ".join(profile["interests"][:8]) + ".")
    if profile.get("strengths"):
        bits.append("Strengths: " + ", ".join(profile["strengths"][:6]) + ".")
    if profile.get("motivators"):
        bits.append("Motivators that work: " + ", ".join(profile["motivators"][:6]) + ".")
    if profile.get("sensitivities"):
        bits.append("Sensitivities to plan around: " + ", ".join(profile["sensitivities"][:6]) + ".")
    if profile.get("common_triggers"):
        bits.append("Common triggers: " + ", ".join(profile["common_triggers"][:6]) + ".")
    if profile.get("peak_hours"):
        bits.append("Best times of day: " + ", ".join(profile["peak_hours"]) + ".")
    if profile.get("interview_summary"):
        bits.append("Coach summary: " + profile["interview_summary"])
    if profile.get("parent_notes"):
        bits.append("Parent notes: " + profile["parent_notes"])
    if legacy_notes and not profile.get("parent_notes"):
        bits.append("Parent notes: " + legacy_notes)

    if len(bits) == 1:
        bits.append("(No profile filled in yet — keep it broadly appropriate for an upper-elementary learner.)")
    return " ".join(bits) + "\n"


@api.post("/ai/draft-mission", response_model=AIDraftedMission)
async def ai_draft_mission(req: AIDraftRequest, user: dict = Depends(require_role("parent"))):
    await _assert_parent_owns_student(user, req.student_id)
    student = await db.users.find_one({"id": req.student_id}, {"_id": 0, "password_hash": 0})
    skills = await db.skills.find({}, {"_id": 0}).to_list(1000)
    strategies = await db.strategies.find({}, {"_id": 0}).to_list(1000)

    user_text = (
        _student_context(student)
        + f"Parent idea/topic: {req.prompt or '(none — surprise me with something useful for today)'}\n\n"
        + "Return JSON with this exact shape:\n"
        + '{ "title": str, "description": str, "steps": [str, ...] (2-5 items), '
        + '"estimated_minutes": int (5-25), '
        + '"skill_names": [str, ...] (1-2 items, copied exactly from AVAILABLE SKILLS), '
        + '"strategy_names": [str, ...] (1-2 items, copied exactly from AVAILABLE STRATEGIES), '
        + '"evidence_tags": [str, ...] (1-3 items, copied exactly from the controlled vocabulary), '
        + '"rationale": str (1-2 sentences explaining why this fits this child) }'
    )

    raw = await _ai_chat(_system_prompt(skills, strategies), user_text)
    data = _extract_json(raw) or {}
    title = (data.get("title") or "").strip() or "Today's mission"
    description = (data.get("description") or "").strip()
    steps_raw = data.get("steps") or []
    steps = [str(s).strip() for s in steps_raw if str(s).strip()][:5]
    try:
        minutes = int(data.get("estimated_minutes") or 15)
    except Exception:
        minutes = 15
    minutes = max(5, min(60, minutes))
    skill_names = [str(x).strip() for x in (data.get("skill_names") or []) if str(x).strip()]
    strategy_names = [str(x).strip() for x in (data.get("strategy_names") or []) if str(x).strip()]
    skill_ids = _match_ids(skill_names, skills)
    strategy_ids = _match_ids(strategy_names, strategies)
    evidence_tags = [str(x).strip() for x in (data.get("evidence_tags") or []) if str(x).strip()]
    evidence_refs = await _resolve_evidence_for_mission(skill_ids, strategy_ids, evidence_tags)
    rationale = (data.get("rationale") or "").strip()[:600]
    return AIDraftedMission(
        title=title,
        description=description,
        steps=steps,
        estimated_minutes=minutes,
        skill_ids=skill_ids,
        strategy_ids=strategy_ids,
        skill_names=skill_names,
        strategy_names=strategy_names,
        evidence_tags=evidence_tags,
        evidence_refs=evidence_refs,
        rationale=rationale,
    )


@api.post("/ai/draft-day", response_model=List[AIDraftedMission])
async def ai_draft_day(req: AIDayDraftRequest, user: dict = Depends(require_role("parent"))):
    await _assert_parent_owns_student(user, req.student_id)
    student = await db.users.find_one({"id": req.student_id}, {"_id": 0, "password_hash": 0})
    skills = await db.skills.find({}, {"_id": 0}).to_list(1000)
    strategies = await db.strategies.find({}, {"_id": 0}).to_list(1000)

    n = max(1, min(5, int(req.count or 3)))
    user_text = (
        _student_context(student)
        + f"Parent guidance (optional): {req.prompt or '(none)'}\n\n"
        + f"Draft {n} small, varied missions for today. Mix Reading and Executive Function skills. "
        + "Total time across all missions should feel doable in a single afternoon (roughly 30-60 minutes combined).\n\n"
        + 'Return a JSON ARRAY of mission objects, each shaped like: '
        + '{ "title": str, "description": str, "steps": [str, ...] (2-5 items), '
        + '"estimated_minutes": int (5-25), '
        + '"skill_names": [str, ...] (1-2, copied exactly), '
        + '"strategy_names": [str, ...] (1-2, copied exactly), '
        + '"evidence_tags": [str, ...] (1-3, copied exactly from the controlled vocabulary), '
        + '"rationale": str (1-2 sentences explaining why this fits this child) }'
    )

    raw = await _ai_chat(_system_prompt(skills, strategies), user_text)
    data = _extract_json(raw)
    items = data if isinstance(data, list) else (data.get("missions") if isinstance(data, dict) else None) or []

    out: List[AIDraftedMission] = []
    for d in items[:n]:
        if not isinstance(d, dict):
            continue
        title = (d.get("title") or "").strip() or "Mission"
        steps = [str(s).strip() for s in (d.get("steps") or []) if str(s).strip()][:5]
        try:
            minutes = int(d.get("estimated_minutes") or 15)
        except Exception:
            minutes = 15
        minutes = max(5, min(60, minutes))
        sk_names = [str(x).strip() for x in (d.get("skill_names") or []) if str(x).strip()]
        st_names = [str(x).strip() for x in (d.get("strategy_names") or []) if str(x).strip()]
        sk_ids = _match_ids(sk_names, skills)
        st_ids = _match_ids(st_names, strategies)
        ev_tags = [str(x).strip() for x in (d.get("evidence_tags") or []) if str(x).strip()]
        ev_refs = await _resolve_evidence_for_mission(sk_ids, st_ids, ev_tags)
        rationale = (d.get("rationale") or "").strip()[:600]
        out.append(AIDraftedMission(
            title=title,
            description=(d.get("description") or "").strip(),
            steps=steps,
            estimated_minutes=minutes,
            skill_ids=sk_ids,
            strategy_ids=st_ids,
            skill_names=sk_names,
            strategy_names=st_names,
            evidence_tags=ev_tags,
            evidence_refs=ev_refs,
            rationale=rationale,
        ))
    return out


# ---------- Reading & Writing practice ----------
GRADE_TO_TARGET = {
    "K": "kindergarten", "1": "1st grade", "2": "2nd grade", "3": "3rd grade",
    "4": "4th grade", "5": "5th grade", "6": "6th grade", "7": "7th grade",
    "8": "8th grade", "9": "9th grade", "10": "10th grade", "11": "11th grade", "12": "12th grade",
}


def _resolve_reading_target(student_profile: dict, level_override: Optional[str]) -> tuple[str, str]:
    """Returns (level, grade_target). level ∈ {below, on, above}."""
    grade = (student_profile.get("grade") or "3").strip()
    base = GRADE_TO_TARGET.get(grade, "3rd grade")
    level = (level_override or student_profile.get("reading_level") or "on").lower()
    if level == "below" and grade.isdigit() and int(grade) >= 1:
        target = GRADE_TO_TARGET.get(str(int(grade) - 1), base)
    elif level == "above" and grade.isdigit() and int(grade) <= 11:
        target = GRADE_TO_TARGET.get(str(int(grade) + 1), base)
    else:
        target = base
    return level, target


async def _citation_keys_to_ids(keys: List[str]) -> List[str]:
    lookup = await _citation_id_lookup()
    return [lookup[k] for k in keys if k in lookup]


@api.post("/reading/passage", response_model=ReadingPassage)
async def generate_reading_passage(req: ReadingPassageRequest,
                                   user: dict = Depends(require_role("parent"))):
    await _assert_parent_owns_student(user, req.student_id)
    student = await db.users.find_one({"id": req.student_id}, {"_id": 0, "password_hash": 0})
    profile = student.get("student_profile") or {}
    level, grade_target = _resolve_reading_target(profile, req.level_override)
    interests = profile.get("interests") or []
    topic_hint = (req.topic_hint or (interests[0] if interests else "")).strip()

    name = student.get("name", "the reader")
    system = (
        "You write short, kid-friendly nonfiction or simple narrative passages used in a "
        "reading-comprehension practice app for children with ADHD. The reader's name is "
        f"{name}. Match the target reading level EXACTLY — short sentences for younger "
        "levels, mostly common words. Keep total length between 120 and 200 words. "
        "Content must be safe for kids (no violence, no scary themes, no romance). "
        "Then write 4 comprehension questions: 2 literal (answers stated directly in the "
        "text), 1 inferential (answer requires connecting clues), 1 vocabulary-in-context. "
        "Reply with STRICT JSON only — no prose, no code fences."
    )
    user_text = (
        f"Target reading level: {grade_target} ({level} the student's grade).\n"
        f"Topic preference: {topic_hint or 'pick something genuinely interesting to a kid this age'}.\n\n"
        'Return this exact JSON shape:\n'
        '{ "title": str, "topic": str, "body": str (the passage, 120-200 words), '
        '"questions": [ { "text": str, "type": "literal"|"inferential"|"vocabulary", '
        '"answer_key": str (a clear correct answer or set of acceptable answers) } ] }'
    )
    raw = await _ai_chat(system, user_text)
    data = _extract_json(raw) or {}
    body = (data.get("body") or "").strip()
    questions = []
    for q in (data.get("questions") or [])[:5]:
        if not isinstance(q, dict):
            continue
        qtype = (q.get("type") or "literal").lower()
        if qtype not in ("literal", "inferential", "vocabulary"):
            qtype = "literal"
        questions.append(ReadingQuestion(
            id=str(uuid.uuid4()),
            text=(q.get("text") or "").strip(),
            type=qtype,
            answer_key=(q.get("answer_key") or "").strip(),
        ))

    citations = await _citation_keys_to_ids([
        "nrp_2000", "cain_oakhill_1999_inference", "raphael_1986_qar", "stahl_1986_vocab",
    ])
    doc = ReadingPassage(
        id=str(uuid.uuid4()),
        student_id=req.student_id,
        parent_id=user["id"],
        title=(data.get("title") or "Reading practice").strip(),
        topic=(data.get("topic") or topic_hint or "general").strip(),
        level=level,
        grade_target=grade_target,
        word_count=len(body.split()),
        body=body,
        questions=questions,
        citations=citations,
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    await db.reading_passages.insert_one(doc.model_dump())
    return doc


@api.post("/reading/passage/{passage_id}/answer", response_model=ReadingFeedback)
async def submit_reading_answers(passage_id: str, sub: ReadingAnswerSubmission,
                                  user: dict = Depends(get_current_user)):
    p = await db.reading_passages.find_one({"id": passage_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Passage not found")
    # Either the parent who owns the student, or the student themselves
    if user["id"] != p["parent_id"] and user["id"] != p["student_id"]:
        raise HTTPException(status_code=403, detail="Not your passage")

    qs = p["questions"]
    grade_text = "\n".join(
        f"Q{i+1} ({q['type']}): {q['text']}\n"
        f"  Looking for: {q['answer_key']}\n"
        f"  Reader answered: {sub.answers.get(q['id'], '').strip() or '(no answer)'}"
        for i, q in enumerate(qs)
    )
    system = (
        "You're a warm, playful tutor giving feedback to a child on reading-comprehension answers. "
        "For each question decide if the reader got the gist (use loose grading — partial credit if "
        "they show understanding). Be kind and specific. One sentence of feedback per question. "
        "Then a 1-sentence overall encouragement. Use 1-2 fun emojis total to keep it kid-friendly. "
        "Reply with STRICT JSON only."
    )
    user_text = (
        f"Passage:\n{p['body']}\n\nAnswers to grade:\n{grade_text}\n\n"
        'Return JSON: { "per_question": [{"question_id": str, "correct": bool, "feedback": str}], '
        '"overall": str }'
    )
    raw = await _ai_chat(system, user_text)
    data = _extract_json(raw) or {}
    per_q = []
    for q, item in zip(qs, (data.get("per_question") or [])):
        if not isinstance(item, dict):
            item = {}
        per_q.append({
            "question_id": q["id"],
            "correct": bool(item.get("correct", False)),
            "feedback": (item.get("feedback") or "").strip(),
        })
    score = sum(1 for pq in per_q if pq["correct"])
    feedback = ReadingFeedback(
        per_question=per_q,
        overall=(data.get("overall") or "").strip(),
        score=score,
        total=len(qs),
    )
    await db.reading_passages.update_one(
        {"id": passage_id},
        {"$set": {"answers": sub.answers, "feedback": feedback.model_dump(),
                  "completed_at": datetime.now(timezone.utc).isoformat(), "score": score, "total": len(qs)}},
    )
    return feedback


@api.post("/writing/prompt", response_model=WritingPiece)
async def generate_writing_prompt(req: WritingPromptRequest,
                                  user: dict = Depends(require_role("parent"))):
    await _assert_parent_owns_student(user, req.student_id)
    student = await db.users.find_one({"id": req.student_id}, {"_id": 0, "password_hash": 0})
    profile = student.get("student_profile") or {}
    level, grade_target = _resolve_reading_target(profile, req.level_override)
    interests = profile.get("interests") or []
    topic_hint = (req.topic_hint or (interests[0] if interests else "")).strip()

    name = student.get("name", "the writer")
    system = (
        "You design tiny, kid-friendly writing prompts for a child with ADHD who needs "
        f"scaffolding for multi-paragraph writing. The writer's name is {name}. "
        "The output is a writing prompt, a paragraph scaffold (3-5 short steps the kid "
        "follows in order), and 3-5 sentence starters they can copy and finish. "
        f"Target grade for vocabulary and complexity: {grade_target}. "
        "Topic should feel exciting, not school-y. No essays, no 5-paragraph templates. "
        "Reply with STRICT JSON only."
    )
    user_text = (
        f"Topic preference: {topic_hint or 'pick something kid-engaging'}.\n\n"
        'Return JSON: { "prompt": str (1-2 sentence kid-facing writing prompt), '
        '"topic": str, "scaffold": [str, ...] (3-5 short steps), '
        '"sentence_starters": [str, ...] (3-5 starters ending in "...") }'
    )
    raw = await _ai_chat(system, user_text)
    data = _extract_json(raw) or {}
    citations = await _citation_keys_to_ids([
        "mueller_oppenheimer_2014_notes", "marzano_2001_annotation", "diamond_2013_ef",
    ])
    doc = WritingPiece(
        id=str(uuid.uuid4()),
        student_id=req.student_id,
        parent_id=user["id"],
        prompt=(data.get("prompt") or "").strip(),
        topic=(data.get("topic") or topic_hint or "general").strip(),
        level=level,
        scaffold=[str(s).strip() for s in (data.get("scaffold") or []) if str(s).strip()][:6],
        sentence_starters=[str(s).strip() for s in (data.get("sentence_starters") or []) if str(s).strip()][:6],
        citations=citations,
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    await db.writing_pieces.insert_one(doc.model_dump())
    return doc


@api.post("/writing/piece/{piece_id}/submit", response_model=WritingPiece)
async def submit_writing(piece_id: str, sub: WritingSubmission,
                          user: dict = Depends(get_current_user)):
    p = await db.writing_pieces.find_one({"id": piece_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Writing piece not found")
    if user["id"] != p["parent_id"] and user["id"] != p["student_id"]:
        raise HTTPException(status_code=403, detail="Not your writing")
    if not sub.draft.strip():
        raise HTTPException(status_code=400, detail="Draft cannot be empty")

    system = (
        "You're a warm, playful writing coach giving feedback to a child with ADHD on their "
        "writing. Be specific and kind — call out one concrete thing that worked, and one "
        "thing to try next time. Do NOT correct spelling or grammar unless it makes the "
        "meaning unclear. No grading. 2-3 sentences total. 1-2 fun emojis ok."
    )
    user_text = f"Prompt: {p['prompt']}\n\nThe child wrote:\n{sub.draft}\n\nReply with feedback only, no headers."
    feedback = await _ai_chat(system, user_text)

    now = datetime.now(timezone.utc).isoformat()
    await db.writing_pieces.update_one(
        {"id": piece_id},
        {"$set": {"draft": sub.draft.strip(), "feedback": feedback.strip(), "submitted_at": now}},
    )
    p.update({"draft": sub.draft.strip(), "feedback": feedback.strip(), "submitted_at": now})
    return WritingPiece(**p)


@api.get("/students/{student_id}/portfolio")
async def student_portfolio(student_id: str, user: dict = Depends(get_current_user)):
    # Parent (owner) or student themselves
    if user["role"] == "parent":
        await _assert_parent_owns_student(user, student_id)
    elif user["id"] != student_id:
        raise HTTPException(status_code=403, detail="Not your portfolio")
    reading = await db.reading_passages.find(
        {"student_id": student_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    writing = await db.writing_pieces.find(
        {"student_id": student_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    return {"reading": reading, "writing": writing}


@api.get("/reading/passage/{passage_id}")
async def get_reading_passage(passage_id: str, user: dict = Depends(get_current_user)):
    p = await db.reading_passages.find_one({"id": passage_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Not found")
    if user["id"] != p["parent_id"] and user["id"] != p["student_id"]:
        raise HTTPException(status_code=403, detail="Not yours")
    return p


@api.get("/writing/piece/{piece_id}")
async def get_writing_piece(piece_id: str, user: dict = Depends(get_current_user)):
    p = await db.writing_pieces.find_one({"id": piece_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Not found")
    if user["id"] != p["parent_id"] and user["id"] != p["student_id"]:
        raise HTTPException(status_code=403, detail="Not yours")
    return p


# ---------- Moments (ADHD behavior + trigger tracking) ----------
MOMENT_CATALOG = {
    "moment_types": [
        # Challenging
        {"key": "meltdown", "label": "Meltdown", "emoji": "😤", "category": "challenging"},
        {"key": "impulsive", "label": "Impulsive action", "emoji": "⚡", "category": "challenging"},
        {"key": "distracted", "label": "Easily distracted", "emoji": "🦋", "category": "challenging"},
        {"key": "hyperactive", "label": "Hyperactive", "emoji": "🏃", "category": "challenging"},
        {"key": "withdrawn", "label": "Withdrawn / shut down", "emoji": "🐚", "category": "challenging"},
        {"key": "anxious", "label": "Anxious", "emoji": "😟", "category": "challenging"},
        {"key": "frustrated", "label": "Frustrated", "emoji": "😣", "category": "challenging"},
        {"key": "refusal", "label": "Refusing task", "emoji": "✋", "category": "challenging"},
        # Positive / regulated
        {"key": "regulated", "label": "Calm & regulated", "emoji": "😊", "category": "positive"},
        {"key": "hyperfocus", "label": "Deep focus", "emoji": "🎯", "category": "positive"},
        {"key": "proud", "label": "Proud / confident", "emoji": "🌟", "category": "positive"},
        {"key": "creative", "label": "Creative flow", "emoji": "🎨", "category": "positive"},
        # Neutral / transition
        {"key": "transition", "label": "Transition struggle", "emoji": "🔁", "category": "neutral"},
        {"key": "tired", "label": "Tired", "emoji": "😴", "category": "neutral"},
    ],
    "triggers": [
        {"key": "hunger", "label": "Hunger", "emoji": "🍎"},
        {"key": "tiredness", "label": "Tiredness", "emoji": "😴"},
        {"key": "sensory_overload", "label": "Sensory overload", "emoji": "🔊"},
        {"key": "transition", "label": "Transition between tasks", "emoji": "🔁"},
        {"key": "task_frustration", "label": "Task too hard", "emoji": "😣"},
        {"key": "time_pressure", "label": "Time pressure", "emoji": "⏰"},
        {"key": "temperature", "label": "Hot / cold", "emoji": "🥶"},
        {"key": "boredom", "label": "Boredom", "emoji": "😑"},
        {"key": "peer_conflict", "label": "Conflict with sibling/peer", "emoji": "🥊"},
        {"key": "math", "label": "Math", "emoji": "🧮"},
        {"key": "reading", "label": "Reading", "emoji": "📖"},
        {"key": "screen_ended", "label": "Screen time ended", "emoji": "📺"},
        {"key": "medication", "label": "Medication wearing off", "emoji": "💊"},
        {"key": "sleep_deficit", "label": "Poor sleep last night", "emoji": "🌙"},
        {"key": "social_demand", "label": "Social demands", "emoji": "👥"},
        {"key": "unexpected_change", "label": "Unexpected change", "emoji": "🌀"},
        {"key": "loud_noise", "label": "Loud environment", "emoji": "🔔"},
        {"key": "homework", "label": "Homework", "emoji": "📝"},
    ],
}


# Bare quick-capture valence → a sensible default catalog type (used by /capture)
VALENCE_DEFAULT_MOMENT_TYPE = {
    "positive": "regulated",   # Calm & regulated
    "negative": "frustrated",  # Frustrated
}


class MomentCreate(BaseModel):
    student_id: Optional[str] = None
    timestamp: Optional[str] = None  # ISO; defaults to now
    moment_type: Optional[str] = None  # key from catalog OR free-text custom
    valence: Optional[str] = None  # quick capture: "positive" | "negative"
    intensity: Optional[int] = Field(None, ge=1, le=5)
    duration_minutes: Optional[int] = None
    triggers: List[str] = []  # keys or custom strings
    context_note: str = ""
    antecedent: str = ""
    response: str = ""
    outcome: str = ""
    mission_id: Optional[str] = None
    notes: str = ""
    # Optional voice attachment (data URL or raw base64)
    audio_data: Optional[str] = None
    audio_mime: Optional[str] = None
    transcript: Optional[str] = None


class Moment(BaseModel):
    id: str
    student_id: str
    logged_by_user_id: str
    logged_by_role: str
    timestamp: str
    moment_type: str
    intensity: int
    duration_minutes: Optional[int] = None
    triggers: List[str] = []
    context_note: str = ""
    antecedent: str = ""
    response: str = ""
    outcome: str = ""
    mission_id: Optional[str] = None
    notes: str = ""
    audio_data: Optional[str] = None
    audio_mime: Optional[str] = None
    transcript: Optional[str] = None


@api.get("/moments/catalog")
async def moments_catalog(user: dict = Depends(get_current_user)):
    keys = await _citation_id_lookup()
    # Hydrate each catalog entry with evidence_refs
    out = {
        "moment_types": [],
        "triggers": [],
    }
    for t in MOMENT_CATALOG["moment_types"]:
        refs = [keys[k] for k in MOMENT_TYPE_EVIDENCE.get(t["key"], []) if k in keys]
        out["moment_types"].append({**t, "evidence_refs": refs})
    for t in MOMENT_CATALOG["triggers"]:
        refs = [keys[k] for k in TRIGGER_EVIDENCE.get(t["key"], []) if k in keys]
        out["triggers"].append({**t, "evidence_refs": refs})
    return out


async def _student_id_for(user: dict, supplied: Optional[str]) -> str:
    """Resolve the student_id the current user is allowed to act on."""
    if user["role"] == "student":
        return user["id"]
    if not supplied:
        raise HTTPException(status_code=400, detail="student_id is required for parent")
    if supplied not in await _accessible_student_ids(user):
        raise HTTPException(status_code=403, detail="You are not linked to this student")
    return supplied


@api.post("/moments", response_model=Moment)
async def create_moment(req: MomentCreate, user: dict = Depends(get_current_user)):
    student_id = await _student_id_for(user, req.student_id)
    ts = req.timestamp or datetime.now(timezone.utc).isoformat()
    triggers = [t.strip() for t in (req.triggers or []) if t and t.strip()][:20]
    # Resolve moment_type: explicit key wins; otherwise map a bare valence shortcut
    moment_type = (req.moment_type or "").strip()
    valence = (req.valence or "").strip().lower()
    if not moment_type and valence in VALENCE_DEFAULT_MOMENT_TYPE:
        moment_type = VALENCE_DEFAULT_MOMENT_TYPE[valence]
    if not moment_type:
        raise HTTPException(status_code=400, detail="moment_type or valence (positive/negative) is required")
    intensity = int(req.intensity) if req.intensity else 3
    # Honor user-level "discard audio" preference at write time
    audio_data = req.audio_data
    audio_mime = req.audio_mime
    if user.get("discard_audio", True):
        audio_data = None
        audio_mime = None
    if audio_data and len(audio_data) > 7_000_000:
        raise HTTPException(status_code=413, detail="Audio recording too large (max ~5MB).")
    moment_id = str(uuid.uuid4())
    doc = {
        "id": moment_id,
        "student_id": student_id,
        "logged_by_user_id": user["id"],
        "logged_by_role": user["role"],
        "timestamp": ts,
        "moment_type": moment_type,
        "intensity": intensity,
        "duration_minutes": req.duration_minutes,
        "triggers": triggers,
        "context_note": (req.context_note or "").strip(),
        "antecedent": (req.antecedent or "").strip(),
        "response": (req.response or "").strip(),
        "outcome": (req.outcome or "").strip(),
        "mission_id": req.mission_id,
        "notes": (req.notes or "").strip(),
        "audio_data": audio_data,
        "audio_mime": (audio_mime or "").strip() or None,
        "transcript": (req.transcript or "").strip() or None,
    }
    await db.moments.insert_one(doc)
    doc.pop("_id", None)
    await _audit(user, "moment.create", target_type="student", target_id=student_id,
                 meta={"moment_type": doc["moment_type"], "has_audio": bool(audio_data)})
    return Moment(**doc)


@api.get("/moments", response_model=List[Moment])
async def list_moments(
    student_id: Optional[str] = None,
    moment_type: Optional[str] = None,
    trigger: Optional[str] = None,
    limit: int = 500,
    user: dict = Depends(get_current_user),
):
    query: dict = {}
    if user["role"] == "student":
        query["student_id"] = user["id"]
    else:
        if student_id:
            await _assert_parent_owns_student(user, student_id, write=False)
            query["student_id"] = student_id
        else:
            query["student_id"] = {"$in": await _accessible_student_ids(user)}
    if moment_type:
        query["moment_type"] = moment_type
    if trigger:
        query["triggers"] = trigger
    moments = await db.moments.find(query, {"_id": 0}).sort("timestamp", -1).to_list(min(max(limit, 1), 2000))
    return moments


@api.delete("/moments/{moment_id}")
async def delete_moment(moment_id: str, user: dict = Depends(get_current_user)):
    m = await db.moments.find_one({"id": moment_id}, {"_id": 0})
    if not m:
        raise HTTPException(status_code=404, detail="Moment not found")
    if user["role"] == "student":
        if m["student_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="Not yours")
    else:
        if m["student_id"] not in await _accessible_student_ids(user):
            raise HTTPException(status_code=403, detail="Not your student")
    await db.moments.delete_one({"id": moment_id})
    await _audit(user, "moment.delete", target_type="student", target_id=m["student_id"], meta={"moment_id": moment_id})
    return {"ok": True}


class MomentUpdate(BaseModel):
    moment_type: Optional[str] = None
    intensity: Optional[int] = Field(None, ge=1, le=5)
    duration_minutes: Optional[int] = None
    triggers: Optional[List[str]] = None
    context_note: Optional[str] = None
    antecedent: Optional[str] = None
    response: Optional[str] = None
    outcome: Optional[str] = None
    notes: Optional[str] = None
    timestamp: Optional[str] = None


@api.put("/moments/{moment_id}", response_model=Moment)
async def update_moment(moment_id: str, req: MomentUpdate, user: dict = Depends(get_current_user)):
    m = await db.moments.find_one({"id": moment_id}, {"_id": 0})
    if not m:
        raise HTTPException(status_code=404, detail="Moment not found")
    if user["role"] == "student":
        if m["student_id"] != user["id"]:
            raise HTTPException(status_code=403, detail="Not yours")
    else:
        if m["student_id"] not in await _accessible_student_ids(user):
            raise HTTPException(status_code=403, detail="Not your student")
    data = req.model_dump(exclude_unset=True)
    updates: dict = {}
    if "moment_type" in data and data["moment_type"] is not None:
        updates["moment_type"] = data["moment_type"].strip()
    if "intensity" in data and data["intensity"] is not None:
        updates["intensity"] = int(data["intensity"])
    if "duration_minutes" in data:
        updates["duration_minutes"] = data["duration_minutes"]
    if "timestamp" in data and data["timestamp"] is not None:
        updates["timestamp"] = data["timestamp"]
    if "triggers" in data and data["triggers"] is not None:
        updates["triggers"] = [t.strip() for t in data["triggers"] if t and t.strip()][:20]
    for f in ["context_note", "antecedent", "response", "outcome", "notes"]:
        if f in data and data[f] is not None:
            updates[f] = data[f].strip()
    if updates:
        await db.moments.update_one({"id": moment_id}, {"$set": updates})
    fresh = await db.moments.find_one({"id": moment_id}, {"_id": 0})
    await _audit(user, "moment.update", target_type="student", target_id=m["student_id"],
                 meta={"moment_id": moment_id, "fields": list(updates.keys())})
    return Moment(**fresh)


class MomentInsights(BaseModel):
    total: int
    counts_by_type: dict
    counts_by_trigger: dict
    by_hour: List[int]  # 24 ints
    by_dow: List[int]  # 7 ints (0=Mon)
    daily_counts: List[dict]  # [{date, count}] last `days`
    avg_intensity_by_type: dict
    trigger_to_type: dict  # {trigger: {type: count}}
    top_triggers: List[dict]
    top_types: List[dict]
    # Trends (frequency + severity over time, and valence correlation)
    daily_intensity: List[dict] = []   # [{date, avg, count}] — avg is None when no data that day
    weekly_counts: List[dict] = []     # [{week, count}] — week = Monday ISO date
    weekly_intensity: List[dict] = []  # [{week, avg, count}]
    trigger_to_category: dict = {}     # {trigger: {challenging, positive, neutral, other}}


@api.get("/moments/insights", response_model=MomentInsights)
async def moments_insights(
    student_id: Optional[str] = None,
    days: int = 30,
    user: dict = Depends(get_current_user),
):
    query: dict = {}
    if user["role"] == "student":
        query["student_id"] = user["id"]
    else:
        if student_id:
            await _assert_parent_owns_student(user, student_id, write=False)
            query["student_id"] = student_id
        else:
            query["student_id"] = {"$in": await _accessible_student_ids(user)}

    cutoff = datetime.now(timezone.utc) - timedelta(days=max(1, min(days, 180)))
    query["timestamp"] = {"$gte": cutoff.isoformat()}

    moments = await db.moments.find(query, {"_id": 0}).to_list(5000)

    type_category = {t["key"]: t["category"] for t in MOMENT_CATALOG["moment_types"]}

    counts_by_type: dict = {}
    counts_by_trigger: dict = {}
    by_hour = [0] * 24
    by_dow = [0] * 7
    sums_intensity: dict = {}
    n_intensity: dict = {}
    trigger_to_type: dict = {}
    trigger_to_category: dict = {}
    daily_buckets: dict = {}
    daily_intensity_sum: dict = {}
    daily_intensity_n: dict = {}
    weekly_count: dict = {}
    weekly_intensity_sum: dict = {}
    weekly_intensity_n: dict = {}

    for m in moments:
        t = m.get("moment_type", "other")
        intensity = int(m.get("intensity", 0))
        counts_by_type[t] = counts_by_type.get(t, 0) + 1
        sums_intensity[t] = sums_intensity.get(t, 0) + intensity
        n_intensity[t] = n_intensity.get(t, 0) + 1
        try:
            dt = datetime.fromisoformat(m["timestamp"].replace("Z", "+00:00"))
            by_hour[dt.hour] += 1
            by_dow[dt.weekday()] += 1
            d = dt.date().isoformat()
            daily_buckets[d] = daily_buckets.get(d, 0) + 1
            daily_intensity_sum[d] = daily_intensity_sum.get(d, 0) + intensity
            daily_intensity_n[d] = daily_intensity_n.get(d, 0) + 1
            wk = (dt - timedelta(days=dt.weekday())).date().isoformat()  # Monday of ISO week
            weekly_count[wk] = weekly_count.get(wk, 0) + 1
            weekly_intensity_sum[wk] = weekly_intensity_sum.get(wk, 0) + intensity
            weekly_intensity_n[wk] = weekly_intensity_n.get(wk, 0) + 1
        except Exception:
            pass
        cat = type_category.get(t, "other")
        for tg in m.get("triggers", []) or []:
            counts_by_trigger[tg] = counts_by_trigger.get(tg, 0) + 1
            trigger_to_type.setdefault(tg, {})
            trigger_to_type[tg][t] = trigger_to_type[tg].get(t, 0) + 1
            tc = trigger_to_category.setdefault(tg, {})
            tc[cat] = tc.get(cat, 0) + 1

    avg_intensity_by_type = {
        k: round(sums_intensity[k] / max(1, n_intensity[k]), 2) for k in sums_intensity
    }

    # daily counts + severity for last N days
    today = datetime.now(timezone.utc).date()
    daily_counts = []
    daily_intensity = []
    for i in range(max(1, min(days, 180)) - 1, -1, -1):
        d = (today - timedelta(days=i)).isoformat()
        daily_counts.append({"date": d, "count": daily_buckets.get(d, 0)})
        n = daily_intensity_n.get(d, 0)
        daily_intensity.append({
            "date": d,
            "avg": round(daily_intensity_sum.get(d, 0) / n, 1) if n else None,
            "count": n,
        })
    weekly_counts = [{"week": wk, "count": weekly_count[wk]} for wk in sorted(weekly_count)]
    weekly_intensity = [
        {"week": wk, "avg": round(weekly_intensity_sum[wk] / max(1, weekly_intensity_n[wk]), 1),
         "count": weekly_intensity_n[wk]}
        for wk in sorted(weekly_intensity_n)
    ]

    top_triggers = sorted(
        [{"key": k, "count": v} for k, v in counts_by_trigger.items()],
        key=lambda x: x["count"],
        reverse=True,
    )[:8]
    top_types = sorted(
        [{"key": k, "count": v} for k, v in counts_by_type.items()],
        key=lambda x: x["count"],
        reverse=True,
    )[:8]

    return MomentInsights(
        total=len(moments),
        counts_by_type=counts_by_type,
        counts_by_trigger=counts_by_trigger,
        by_hour=by_hour,
        by_dow=by_dow,
        daily_counts=daily_counts,
        avg_intensity_by_type=avg_intensity_by_type,
        trigger_to_type=trigger_to_type,
        top_triggers=top_triggers,
        top_types=top_types,
        daily_intensity=daily_intensity,
        weekly_counts=weekly_counts,
        weekly_intensity=weekly_intensity,
        trigger_to_category=trigger_to_category,
    )


from fastapi.responses import StreamingResponse  # noqa: E402
from fastapi import UploadFile, File  # noqa: E402
from emergentintegrations.llm.openai import OpenAISpeechToText  # noqa: E402
import csv  # noqa: E402
import io  # noqa: E402
import base64  # noqa: E402


# ---------- Voice → Moment extraction ----------
class ParsedMoment(BaseModel):
    transcript: str
    audio_data: str  # base64 of original upload
    audio_mime: str
    parsed: dict  # {moment_type, intensity, triggers, context_note, antecedent, response, outcome, notes}


def _moment_extraction_system_prompt() -> str:
    types = "\n".join(
        f"- key: {t['key']} | label: {t['label']} | category: {t['category']}"
        for t in MOMENT_CATALOG["moment_types"]
    )
    trigs = "\n".join(
        f"- key: {t['key']} | label: {t['label']}"
        for t in MOMENT_CATALOG["triggers"]
    )
    return (
        "You are MissionSparks' helper. A parent or kid will narrate a 'moment' — a behavior or "
        "feeling that just happened — and you must extract a structured record from their narration.\n\n"
        "Pick moment_type from this catalog (use the KEY, not the label):\n"
        f"{types}\n\n"
        "Pick triggers (zero or more) from this catalog (use the KEYS):\n"
        f"{trigs}\n\n"
        "Other fields are free-text snippets pulled directly from the narration:\n"
        "  - context_note: where/what activity was happening\n"
        "  - antecedent: what happened right BEFORE the moment\n"
        "  - response: what the parent/kid tried in response\n"
        "  - outcome: did it help? what changed?\n"
        "  - notes: anything else worth keeping (parent voice, exact quote, etc.)\n\n"
        "Intensity is 1 (very mild) through 5 (very intense). Infer from emotional language. "
        "If unsure, default to 3.\n\n"
        "If the narration doesn't fit any catalog moment_type, default to the closest match. "
        "Leave string fields as empty strings and arrays empty if the narration doesn't mention them. "
        "Never invent details the parent didn't say.\n\n"
        "Respond with STRICT JSON only, no prose, no code fences."
    )


@api.post("/audio/transcribe")
async def audio_transcribe(
    audio: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    """Simple Whisper transcription — used by Writing Practice for voice dictation."""
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="AI is not configured.")
    raw = await audio.read()
    if not raw:
        raise HTTPException(status_code=400, detail="No audio data received.")
    if len(raw) > 24 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Audio file too large (max 24MB).")
    mime = audio.content_type or "audio/webm"
    ext = "webm"
    for k, v in (("wav", "wav"), ("mp4", "m4a"), ("m4a", "m4a"), ("mp3", "mp3"), ("mpeg", "mp3"), ("ogg", "ogg")):
        if k in mime:
            ext = v
            break
    try:
        stt = OpenAISpeechToText(api_key=EMERGENT_LLM_KEY)
        buf = io.BytesIO(raw)
        buf.name = f"writing.{ext}"
        stt_resp = await stt.transcribe(file=buf, model="whisper-1", response_format="json", language="en")
        transcript = (getattr(stt_resp, "text", "") or "").strip()
    except Exception as e:
        logger.exception("Whisper transcription failed")
        raise HTTPException(status_code=502, detail=f"Transcription failed: {e}") from e
    if not transcript:
        raise HTTPException(status_code=422, detail="Could not understand the recording. Try again in a quieter spot.")
    return {"transcript": transcript}


@api.post("/moments/parse-audio", response_model=ParsedMoment)
async def moments_parse_audio(
    audio: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    """Accept a short audio clip, transcribe with Whisper, and extract Moment fields with Claude."""
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="AI is not configured. Set EMERGENT_LLM_KEY in backend/.env.")

    raw = await audio.read()
    if not raw:
        raise HTTPException(status_code=400, detail="No audio data received.")
    if len(raw) > 24 * 1024 * 1024:  # 24MB, Whisper's hard limit is 25MB
        raise HTTPException(status_code=413, detail="Audio file too large (max 24MB).")

    mime = audio.content_type or "audio/webm"
    audio_b64 = base64.b64encode(raw).decode("ascii")

    # 1. Transcribe with Whisper
    try:
        stt = OpenAISpeechToText(api_key=EMERGENT_LLM_KEY)
        # Filename must end with a recognized extension; pick one based on MIME.
        ext = "webm"
        if "wav" in mime:
            ext = "wav"
        elif "mp4" in mime or "m4a" in mime:
            ext = "m4a"
        elif "mpeg" in mime or "mp3" in mime:
            ext = "mp3"
        elif "ogg" in mime:
            ext = "ogg"
        buf = io.BytesIO(raw)
        buf.name = f"moment.{ext}"
        stt_resp = await stt.transcribe(file=buf, model="whisper-1", response_format="json", language="en")
        transcript = (getattr(stt_resp, "text", "") or "").strip()
    except Exception as e:
        logger.exception("Whisper transcription failed")
        raise HTTPException(status_code=502, detail=f"Transcription failed: {e}") from e

    if not transcript:
        raise HTTPException(status_code=422, detail="Could not understand the recording. Try again in a quieter spot.")

    # Honor data-minimization preference — drop the audio bytes from the response.
    if user.get("discard_audio", True):
        audio_b64 = ""
        mime = ""

    # 2. Extract structured fields with Claude
    raw_ai = await _ai_chat(
        _moment_extraction_system_prompt(),
        (
            f"Parent/kid narration (transcribed):\n\"\"\"{transcript}\"\"\"\n\n"
            "Return JSON with EXACTLY these keys:\n"
            "{\n"
            '  "moment_type": <one catalog key>,\n'
            '  "intensity": <int 1-5>,\n'
            '  "triggers": [<catalog keys>],\n'
            '  "context_note": <string>,\n'
            '  "antecedent": <string>,\n'
            '  "response": <string>,\n'
            '  "outcome": <string>,\n'
            '  "notes": <string>\n'
            "}"
        ),
    )
    data = _extract_json(raw_ai) or {}

    valid_type_keys = {t["key"] for t in MOMENT_CATALOG["moment_types"]}
    valid_trig_keys = {t["key"] for t in MOMENT_CATALOG["triggers"]}

    moment_type = (data.get("moment_type") or "").strip()
    if moment_type not in valid_type_keys:
        # fallback: try fuzzy by label
        target = _norm(moment_type)
        for t in MOMENT_CATALOG["moment_types"]:
            if target and (target in _norm(t["label"]) or _norm(t["label"]) in target):
                moment_type = t["key"]
                break
        if moment_type not in valid_type_keys:
            moment_type = "frustrated"  # safest neutral default

    try:
        intensity = int(data.get("intensity") or 3)
    except Exception:
        intensity = 3
    intensity = max(1, min(5, intensity))

    triggers_raw = data.get("triggers") or []
    triggers_clean: List[str] = []
    for tg in triggers_raw:
        s = str(tg or "").strip()
        if s in valid_trig_keys and s not in triggers_clean:
            triggers_clean.append(s)
        else:
            target = _norm(s)
            for tc in MOMENT_CATALOG["triggers"]:
                if target and (target in _norm(tc["label"]) or _norm(tc["label"]) in target):
                    if tc["key"] not in triggers_clean:
                        triggers_clean.append(tc["key"])
                    break

    parsed = {
        "moment_type": moment_type,
        "intensity": intensity,
        "triggers": triggers_clean[:10],
        "context_note": str(data.get("context_note") or "").strip(),
        "antecedent": str(data.get("antecedent") or "").strip(),
        "response": str(data.get("response") or "").strip(),
        "outcome": str(data.get("outcome") or "").strip(),
        "notes": str(data.get("notes") or "").strip(),
    }

    return ParsedMoment(
        transcript=transcript,
        audio_data=audio_b64,
        audio_mime=mime,
        parsed=parsed,
    )


@api.get("/moments/export.csv")
async def moments_export(
    student_id: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    query: dict = {}
    if user["role"] == "student":
        query["student_id"] = user["id"]
    else:
        if student_id:
            await _assert_parent_owns_student(user, student_id, write=False)
            query["student_id"] = student_id
        else:
            query["student_id"] = {"$in": await _accessible_student_ids(user)}
    moments = await db.moments.find(query, {"_id": 0}).sort("timestamp", -1).to_list(5000)

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow([
        "timestamp", "moment_type", "intensity", "duration_minutes",
        "triggers", "context_note", "antecedent", "response", "outcome",
        "logged_by_role", "notes", "transcript",
    ])
    for m in moments:
        w.writerow([
            m.get("timestamp", ""),
            m.get("moment_type", ""),
            m.get("intensity", ""),
            m.get("duration_minutes", "") if m.get("duration_minutes") is not None else "",
            "; ".join(m.get("triggers", []) or []),
            m.get("context_note", ""),
            m.get("antecedent", ""),
            m.get("response", ""),
            m.get("outcome", ""),
            m.get("logged_by_role", ""),
            m.get("notes", ""),
            m.get("transcript", "") or "",
        ])
    buf.seek(0)
    filename = f"moments_{datetime.now(timezone.utc).date().isoformat()}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ---------- Health ----------
@api.get("/")
async def root():
    return {"app": "MissionSparks", "status": "ok"}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- Seed ----------
DEFAULT_SKILLS = [
    {"name": "Reading: text evidence", "category": "Reading", "description": "Find clues in the text that prove your answer."},
    {"name": "Reading: main idea", "category": "Reading", "description": "Spot what the whole passage is mostly about."},
    {"name": "Reading: vocabulary in context", "category": "Reading", "description": "Use surrounding words to figure out a new word."},
    {"name": "Reading: inference", "category": "Reading", "description": "Read between the lines to guess what the author means."},
    {"name": "EF: planning", "category": "Executive Function", "description": "Break big tasks into small, doable steps."},
    {"name": "EF: time management", "category": "Executive Function", "description": "Estimate how long things take and stick to a timer."},
    {"name": "EF: working memory", "category": "Executive Function", "description": "Hold info in your head while you work."},
    {"name": "EF: focus", "category": "Executive Function", "description": "Stay on one task and notice when you drift."},
]

DEFAULT_STRATEGIES = [
    {"name": "Slow down mode", "emoji": "🐢", "description": "Take a breath, re-read, and move at turtle pace."},
    {"name": "Underline clues", "emoji": "✏️", "description": "Mark up a paper book with clues that help you answer."},
    {"name": "Jot a clue", "emoji": "📝", "description": "For digital or audio books — type the clue you found or paraphrase what you heard."},
    {"name": "Chunk it", "emoji": "🧩", "description": "Break the task into smaller pieces and check each off."},
    {"name": "Picture it", "emoji": "🎨", "description": "Make a mental picture of what you're reading."},
    {"name": "Timer challenge", "emoji": "⏱️", "description": "Set a kind timer and try to focus until it dings."},
    {"name": "Body break", "emoji": "🤸", "description": "Stand up, stretch, wiggle out the wiggles, then return."},
    {"name": "Ask a question", "emoji": "❓", "description": "If stuck, ask one clear question before guessing."},
    {"name": "Re-read", "emoji": "🔁", "description": "Read the tricky part one more time, more slowly."},
]


@app.on_event("startup")
async def on_startup():
    await db.users.create_index("email", unique=True)
    await db.missions.create_index([("student_id", 1), ("due_date", 1)])
    await db.mission_logs.create_index([("student_id", 1), ("timestamp", -1)])
    await db.citations.create_index("key", unique=True)

    # Seed citations (idempotent by `key`)
    citation_key_to_id: dict = {}
    for c in CITATIONS:
        existing = await db.citations.find_one({"key": c["key"]}, {"_id": 0, "id": 1})
        if existing:
            citation_key_to_id[c["key"]] = existing["id"]
            # Idempotent update of mutable fields
            await db.citations.update_one(
                {"key": c["key"]},
                {"$set": {k: v for k, v in c.items() if k != "key"}},
            )
        else:
            cid = str(uuid.uuid4())
            doc = {"id": cid, **c}
            await db.citations.insert_one(doc)
            citation_key_to_id[c["key"]] = cid

    def _ev_for(name: str, mapping: dict) -> List[str]:
        return [citation_key_to_id[k] for k in mapping.get(name, []) if k in citation_key_to_id]

    # Seed skills/strategies
    if await db.skills.count_documents({}) == 0:
        for s in DEFAULT_SKILLS:
            await db.skills.insert_one({
                "id": str(uuid.uuid4()),
                **s,
                "evidence_refs": _ev_for(s["name"], SKILL_EVIDENCE),
            })
    else:
        # Patch any skill missing evidence_refs (covers existing DBs)
        for s in DEFAULT_SKILLS:
            await db.skills.update_one(
                {"name": s["name"]},
                {"$set": {"evidence_refs": _ev_for(s["name"], SKILL_EVIDENCE)}},
            )

    if await db.strategies.count_documents({}) == 0:
        for s in DEFAULT_STRATEGIES:
            await db.strategies.insert_one({
                "id": str(uuid.uuid4()),
                **s,
                "evidence_refs": _ev_for(s["name"], STRATEGY_EVIDENCE),
            })
    else:
        # Upsert any new strategies added after initial seed (idempotent by name)
        existing = {s["name"] for s in await db.strategies.find({}, {"_id": 0, "name": 1}).to_list(1000)}
        for s in DEFAULT_STRATEGIES:
            if s["name"] not in existing:
                await db.strategies.insert_one({
                    "id": str(uuid.uuid4()),
                    **s,
                    "evidence_refs": _ev_for(s["name"], STRATEGY_EVIDENCE),
                })
            else:
                await db.strategies.update_one(
                    {"name": s["name"]},
                    {"$set": {"evidence_refs": _ev_for(s["name"], STRATEGY_EVIDENCE)}},
                )

    # Seed demo accounts
    parent_email = os.environ.get("DEMO_PARENT_EMAIL", "parent@demo.com").lower()
    parent_pw = os.environ.get("DEMO_PARENT_PASSWORD", "demo1234")
    student_email = os.environ.get("DEMO_STUDENT_EMAIL", "student@demo.com").lower()
    student_pw = os.environ.get("DEMO_STUDENT_PASSWORD", "demo1234")

    student = await db.users.find_one({"email": student_email})
    if not student:
        student_id = str(uuid.uuid4())
        student = {
            "id": student_id,
            "name": "Enzo",
            "email": student_email,
            "password_hash": hash_password(student_pw),
            "role": "student",
            "linked_student_ids": [],
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.users.insert_one(student)
    else:
        if not verify_password(student_pw, student["password_hash"]):
            await db.users.update_one({"id": student["id"]}, {"$set": {"password_hash": hash_password(student_pw)}})

    parent = await db.users.find_one({"email": parent_email})
    if not parent:
        parent_id = str(uuid.uuid4())
        parent = {
            "id": parent_id,
            "name": "Demo Parent",
            "email": parent_email,
            "password_hash": hash_password(parent_pw),
            "role": "parent",
            "linked_student_ids": [student["id"]],
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.users.insert_one(parent)
    else:
        updates = {}
        if not verify_password(parent_pw, parent["password_hash"]):
            updates["password_hash"] = hash_password(parent_pw)
        if student["id"] not in parent.get("linked_student_ids", []):
            updates["linked_student_ids"] = list(set(parent.get("linked_student_ids", []) + [student["id"]]))
        if updates:
            await db.users.update_one({"id": parent["id"]}, {"$set": updates})

    # Seed a couple of demo missions for today if none exist
    today = datetime.now(timezone.utc).date().isoformat()
    existing = await db.missions.count_documents({"student_id": student["id"], "due_date": today})
    if existing == 0:
        skills = await db.skills.find({}, {"_id": 0}).to_list(100)
        strategies = await db.strategies.find({}, {"_id": 0}).to_list(100)
        skill_map = {s["name"]: s["id"] for s in skills}
        strat_map = {s["name"]: s["id"] for s in strategies}
        parent_doc = await db.users.find_one({"email": parent_email})
        demo_missions = [
            {
                "id": str(uuid.uuid4()),
                "student_id": student["id"],
                "title": "Read Chapter 3 of The Wild Robot",
                "description": "Read carefully and look for clues about how Roz changes.",
                "steps": [
                    "Get cozy with the book",
                    "Read chapter 3 out loud or in your head",
                    "Underline two clues about Roz",
                    "Tell me one thing you noticed",
                ],
                "estimated_minutes": 20,
                "due_date": today,
                "skill_ids": [skill_map.get("Reading: text evidence", ""), skill_map.get("Reading: inference", "")],
                "strategy_ids": [strat_map.get("Underline clues", ""), strat_map.get("Slow down mode", "")],
                "created_by_user_id": parent_doc["id"],
                "created_at": datetime.now(timezone.utc).isoformat(),
            },
            {
                "id": str(uuid.uuid4()),
                "student_id": student["id"],
                "title": "Plan your afternoon",
                "description": "Practice planning by mapping out the next 2 hours.",
                "steps": [
                    "Write 3 things you want to do",
                    "Guess how many minutes each will take",
                    "Pick the order",
                    "Set a kind timer for the first one",
                ],
                "estimated_minutes": 10,
                "due_date": today,
                "skill_ids": [skill_map.get("EF: planning", ""), skill_map.get("EF: time management", "")],
                "strategy_ids": [strat_map.get("Chunk it", ""), strat_map.get("Timer challenge", "")],
                "created_by_user_id": parent_doc["id"],
                "created_at": datetime.now(timezone.utc).isoformat(),
            },
        ]
        for m in demo_missions:
            await db.missions.insert_one(m)

    logger.info("MissionSparks startup complete. Demo parent=%s / student=%s", parent_email, student_email)

    # Family-group migration: ensure every existing parent has at least one family (Iter 15).
    await _migrate_existing_parents()
    # Iter 18: backfill slugs on existing families that don't have one
    async for fam in db.families.find({"slug": {"$in": [None, ""]}}, {"_id": 0, "id": 1, "name": 1}):
        s = await _generate_unique_slug(fam.get("name") or "family")
        await db.families.update_one({"id": fam["id"]}, {"$set": {"slug": s, "home_dashboard_enabled": False}})
    await db.family_invites.create_index("token", unique=True)
    await db.family_invites.create_index([("family_id", 1), ("status", 1)])
    await db.families.create_index("members.user_id")
    await db.families.create_index("slug", unique=True, sparse=True)

    # Parent digest scheduler (Iter 17). Hourly tick; sends to anyone whose
    # next_due_at has elapsed.
    digest_service.configure(db, _ai_chat)
    push_service.configure(db)
    try:
        from apscheduler.schedulers.asyncio import AsyncIOScheduler  # noqa: WPS433
        scheduler = AsyncIOScheduler(timezone="UTC")

        async def _digest_tick():
            try:
                n = await digest_service.dispatch_due_digests()
                if n:
                    logger.info("Digest dispatch sent %s emails.", n)
            except Exception as e:  # noqa: BLE001
                logger.exception("Digest tick failed: %s", e)

        async def _auto_approve_tick():
            """Iter 21: auto-approve any pending_review logs whose parent-set
            grace window has expired. Runs every 10 min."""
            try:
                pending = await db.mission_logs.find(
                    {"verification_status": "pending"}, {"_id": 0},
                ).to_list(500)
                if not pending:
                    return
                mids = list({p["mission_id"] for p in pending})
                missions = {
                    m["id"]: m for m in await db.missions.find(
                        {"id": {"$in": mids}}, {"_id": 0, "id": 1, "auto_approve_hours": 1},
                    ).to_list(1000)
                }
                now = datetime.now(timezone.utc)
                approved = 0
                for lg in pending:
                    m = missions.get(lg["mission_id"]) or {}
                    hrs = m.get("auto_approve_hours") or 0
                    if hrs <= 0:
                        continue
                    try:
                        ts = datetime.fromisoformat(lg["timestamp"])
                    except Exception:
                        continue
                    if now < ts + timedelta(hours=hrs):
                        continue
                    await db.mission_logs.update_one(
                        {"id": lg["id"]},
                        {"$set": {
                            "status": "completed",
                            "verification_status": "approved",
                            "verified_at": now.isoformat(),
                            "auto_approved": True,
                        }},
                    )
                    approved += 1
                if approved:
                    logger.info("Auto-approved %s pending mission logs.", approved)
            except Exception as e:  # noqa: BLE001
                logger.exception("Auto-approve tick failed: %s", e)

        async def _streak_at_risk_tick():
            """Iter 22 — every hour, find kids who:
              - haven't completed any mission TODAY,
              - have missions due today,
              - have a current streak of 2+ days (so it's worth saving),
              - and it's between 4pm and 9pm UTC (a nudge window).
            Notify every linked parent (opt-in). Fires once per kid per day."""
            try:
                now = datetime.now(timezone.utc)
                if not (16 <= now.hour <= 21):
                    return
                today = now.date().isoformat()
                # De-dup: skip kids already notified today
                already_notified = {
                    d["student_id"]
                    for d in await db.push_streak_risk_sent.find(
                        {"date": today}, {"_id": 0, "student_id": 1}
                    ).to_list(5000)
                }
                # Load kids with missions today
                kids_with_missions = await db.missions.distinct("student_id", {"due_date": today})
                for kid_id in kids_with_missions:
                    if kid_id in already_notified:
                        continue
                    snap = await _compute_streak_snapshot(db, kid_id)
                    if snap.current_streak < 2:
                        continue
                    if snap.completed_today_count > 0:
                        continue
                    kid = await db.users.find_one({"id": kid_id}, {"_id": 0, "name": 1})
                    parent_ids = await _linked_parent_ids(kid_id)
                    hours_left = 24 - now.hour
                    for pid in parent_ids:
                        await push_service.send_push_to_user(
                            pid,
                            pref_key="parent_streak_at_risk",
                            title=f"⚠️ {(kid or {}).get('name', 'Your kid')}'s streak is at risk",
                            body=f"{snap.current_streak}-day streak — {hours_left}h left today. Grant a freeze or tap them to jump in.",
                            url="/parent",
                            tag=f"streak-risk-{kid_id}-{today}",
                            require_interaction=True,
                        )
                    await db.push_streak_risk_sent.insert_one({
                        "student_id": kid_id, "date": today,
                        "sent_at": now.isoformat(),
                    })
            except Exception as e:  # noqa: BLE001
                logger.exception("Streak-at-risk tick failed: %s", e)

        async def _morning_missions_tick():
            """Iter 22 — at 07:00 UTC daily, ping every kid who has missions today."""
            try:
                now = datetime.now(timezone.utc)
                if now.hour != 7:  # cron is hourly at :10 but we gate to a specific hour
                    return
                today = now.date().isoformat()
                already = {
                    d["student_id"]
                    for d in await db.push_morning_sent.find(
                        {"date": today}, {"_id": 0, "student_id": 1}
                    ).to_list(5000)
                }
                kids_with_missions = await db.missions.aggregate([
                    {"$match": {"due_date": today}},
                    {"$group": {"_id": "$student_id", "count": {"$sum": 1}}},
                ]).to_list(5000)
                for row in kids_with_missions:
                    kid_id = row["_id"]
                    if kid_id in already:
                        continue
                    n = row["count"]
                    await push_service.send_push_to_user(
                        kid_id,
                        pref_key="kid_missions_morning",
                        title=f"🚀 Good morning!",
                        body=f"{n} mission{'s' if n != 1 else ''} waiting for you today.",
                        url="/student",
                        tag=f"morning-{kid_id}-{today}",
                    )
                    await db.push_morning_sent.insert_one({
                        "student_id": kid_id, "date": today,
                        "sent_at": now.isoformat(),
                    })
            except Exception as e:  # noqa: BLE001
                logger.exception("Morning missions tick failed: %s", e)

        scheduler.add_job(_digest_tick, "cron", minute=5, id="digest_tick", replace_existing=True)
        scheduler.add_job(_auto_approve_tick, "cron", minute="*/10", id="auto_approve_tick", replace_existing=True)
        scheduler.add_job(_streak_at_risk_tick, "cron", minute=15, id="streak_risk_tick", replace_existing=True)
        scheduler.add_job(_morning_missions_tick, "cron", minute=10, id="morning_missions_tick", replace_existing=True)
        scheduler.start()
        app.state.digest_scheduler = scheduler
        logger.info("Digest scheduler started (hourly at :05).")
    except Exception as e:  # noqa: BLE001
        logger.exception("Failed to start digest scheduler: %s", e)


@app.on_event("shutdown")
async def on_shutdown():
    sched = getattr(app.state, "digest_scheduler", None)
    if sched:
        try:
            sched.shutdown(wait=False)
        except Exception:  # noqa: BLE001
            pass
    client.close()

from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import uuid
import logging
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


def set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=60 * 60 * 24 * 7,
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


class MissionCreate(BaseModel):
    student_id: str
    title: str
    description: Optional[str] = ""
    steps: List[str] = []
    estimated_minutes: int = 10
    due_date: str  # ISO date string YYYY-MM-DD
    skill_ids: List[str] = []
    strategy_ids: List[str] = []


class MissionUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    steps: Optional[List[str]] = None
    estimated_minutes: Optional[int] = None
    due_date: Optional[str] = None
    skill_ids: Optional[List[str]] = None
    strategy_ids: Optional[List[str]] = None


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


class MissionLogCreate(BaseModel):
    status: Literal["not_started", "in_progress", "completed", "skipped"]
    used_strategies: bool = False
    difficulty_rating: Optional[Literal["easy", "medium", "hard"]] = None
    feeling: Optional[Literal["bad", "okay", "good"]] = None
    note: Optional[str] = ""
    clue_captures: List[str] = []


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


class LinkStudentRequest(BaseModel):
    student_email: EmailStr
    # COPPA-related consent (collected on link)
    guardian_name: Optional[str] = None
    guardian_relationship: Optional[str] = None
    child_under_13: Optional[bool] = None
    consent_given: Optional[bool] = None


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


def _user_to_public(u: dict) -> "UserPublic":
    return UserPublic(
        id=u["id"],
        role=u["role"],
        name=u["name"],
        email=u["email"],
        linked_student_ids=u.get("linked_student_ids", []),
        profile_notes=u.get("profile_notes", ""),
        discard_audio=u.get("discard_audio", True),
        terms_accepted_at=u.get("terms_accepted_at"),
    )


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


# ---------- Public (no-auth) routes for landing page ----------
class WaitlistRequest(BaseModel):
    email: EmailStr
    role: Optional[str] = None  # "parent" | "therapist" | "teacher" | "other"
    source: Optional[str] = None  # e.g. "landing_hero", "landing_footer"


@api.get("/public/stats")
async def public_stats():
    """Aggregate counts safe to expose to a logged-out visitor on the landing page."""
    citations = await db.citations.count_documents({})
    waitlist = await db.waitlist.count_documents({})
    # Skill + strategy counts are stable seed data; safe to expose.
    skills = await db.skills.count_documents({})
    strategies = await db.strategies.count_documents({})
    return {
        "citations": citations,
        "skills": skills,
        "strategies": strategies,
        "waitlist": waitlist,
    }


@api.post("/public/waitlist")
async def join_waitlist(req: WaitlistRequest):
    email = req.email.lower().strip()
    existing = await db.waitlist.find_one({"email": email})
    if existing:
        return {"ok": True, "already_on_waitlist": True}
    await db.waitlist.insert_one({
        "id": str(uuid.uuid4()),
        "email": email,
        "role": (req.role or "").strip().lower()[:32] or None,
        "source": (req.source or "").strip()[:64] or None,
        "joined_at": datetime.now(timezone.utc).isoformat(),
    })
    logger.info("Waitlist signup: %s (role=%s, source=%s)", email, req.role, req.source)
    return {"ok": True, "already_on_waitlist": False}


@api.get("/waitlist")
async def list_waitlist(user: dict = Depends(require_role("parent"))):
    """Parent-gated for now; in a real launch this would be admin-only."""
    rows = await db.waitlist.find({}, {"_id": 0}).sort("joined_at", -1).to_list(2000)
    return {"count": len(rows), "items": rows}


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
    return _user_to_public(doc)


@api.post("/auth/login", response_model=UserPublic)
async def login(req: LoginRequest, response: Response):
    email = req.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(user["id"], email)
    set_auth_cookie(response, token)
    await _audit(user, "auth.login", target_type="user", target_id=user["id"])
    return _user_to_public(user)


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
    return _user_to_public(user)


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
    if not student:
        raise HTTPException(status_code=404, detail="Student with that email not found")
    if not req.consent_given or not req.guardian_name or not req.guardian_relationship:
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
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
    await _audit(user, "students.link", target_type="student", target_id=student["id"],
                 meta={"under_13": consent["child_under_13"]})
    return _user_to_public(updated)


@api.get("/students", response_model=List[UserPublic])
async def list_my_students(user: dict = Depends(require_role("parent"))):
    ids = user.get("linked_student_ids", [])
    if not ids:
        return []
    students = await db.users.find({"id": {"$in": ids}}, {"_id": 0, "password_hash": 0}).to_list(1000)
    return [_user_to_public(s) for s in students]


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
    return _user_to_public(s)


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
    return _user_to_public(fresh)


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
    linked = user.get("linked_student_ids", [])
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


# ---------- Missions ----------
async def _assert_parent_owns_student(parent: dict, student_id: str):
    if student_id not in parent.get("linked_student_ids", []):
        raise HTTPException(status_code=403, detail="You are not linked to this student")


@api.post("/missions", response_model=Mission)
async def create_mission(req: MissionCreate, user: dict = Depends(require_role("parent"))):
    await _assert_parent_owns_student(user, req.student_id)
    mission_id = str(uuid.uuid4())
    doc = {
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
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.missions.insert_one(doc)
    doc.pop("_id", None)
    return Mission(**doc)


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
            query["student_id"] = {"$in": user.get("linked_student_ids", [])}
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
    if user["role"] == "parent" and mission["student_id"] not in user.get("linked_student_ids", []):
        raise HTTPException(status_code=403, detail="Not your student's mission")
    return mission


@api.put("/missions/{mission_id}", response_model=Mission)
async def update_mission(mission_id: str, req: MissionUpdate, user: dict = Depends(require_role("parent"))):
    mission = await db.missions.find_one({"id": mission_id}, {"_id": 0})
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")
    await _assert_parent_owns_student(user, mission["student_id"])
    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    if updates:
        await db.missions.update_one({"id": mission_id}, {"$set": updates})
    mission = await db.missions.find_one({"id": mission_id}, {"_id": 0})
    return mission


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
@api.post("/missions/{mission_id}/log", response_model=MissionLog)
async def create_log(mission_id: str, req: MissionLogCreate, user: dict = Depends(require_role("student"))):
    mission = await db.missions.find_one({"id": mission_id}, {"_id": 0})
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")
    if mission["student_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Not your mission")
    log_id = str(uuid.uuid4())
    doc = {
        "id": log_id,
        "mission_id": mission_id,
        "student_id": user["id"],
        "status": req.status,
        "used_strategies": req.used_strategies,
        "difficulty_rating": req.difficulty_rating,
        "feeling": req.feeling,
        "note": req.note or "",
        "clue_captures": [c.strip() for c in (req.clue_captures or []) if c and c.strip()],
        "game_played": False,
        "game_key": None,
        "game_score": None,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    await db.mission_logs.insert_one(doc)
    doc.pop("_id", None)
    return MissionLog(**doc)


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
            query["student_id"] = {"$in": user.get("linked_student_ids", [])}
    if mission_id:
        query["mission_id"] = mission_id
    logs = await db.mission_logs.find(query, {"_id": 0}).sort("timestamp", -1).to_list(1000)
    return logs


# ---------- Streak ----------
class StreakResponse(BaseModel):
    current_streak: int
    longest_streak: int
    completed_today: bool
    completed_today_count: int
    missions_today_count: int
    last_completed_date: Optional[str] = None
    week: List[dict] = []
    freeze_used_in_run: bool = False  # "kind day off" applied to keep current streak alive


def _date_from_iso(ts: str) -> str:
    """Return YYYY-MM-DD from an ISO timestamp."""
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00")).date().isoformat()
    except Exception:
        return ts[:10] if ts else ""


async def _compute_streak(student_id: str) -> StreakResponse:
    logs = await db.mission_logs.find(
        {"student_id": student_id, "status": "completed"}, {"_id": 0, "timestamp": 1}
    ).to_list(5000)
    completed_dates = sorted({_date_from_iso(lg["timestamp"]) for lg in logs if lg.get("timestamp")})

    today = datetime.now(timezone.utc).date()
    today_iso = today.isoformat()

    # longest streak across all days
    longest = 0
    cur = 0
    prev = None
    for d in completed_dates:
        try:
            dt = datetime.fromisoformat(d).date()
        except Exception:
            continue
        if prev is not None and (dt - prev).days == 1:
            cur += 1
        else:
            cur = 1
        longest = max(longest, cur)
        prev = dt

    # current streak — count consecutive days ending today or yesterday, forgiving ONE missed day
    # per run (the "kind day off"). This avoids shame when an ADHD-leaning kid misses a single day.
    date_set = set(completed_dates)
    current = 0
    freeze_total = 1
    freeze_used_in_run = False
    anchor = today if today_iso in date_set else (today - timedelta(days=1))
    cursor = anchor
    while True:
        if cursor.isoformat() in date_set:
            current += 1
            cursor = cursor - timedelta(days=1)
        else:
            if freeze_total > 0 and current > 0:
                freeze_total -= 1
                freeze_used_in_run = True
                cursor = cursor - timedelta(days=1)
            else:
                break

    # today's mission counts
    todays_missions = await db.missions.count_documents({"student_id": student_id, "due_date": today_iso})
    completed_today_logs = await db.mission_logs.find(
        {"student_id": student_id, "status": "completed"}, {"_id": 0, "mission_id": 1, "timestamp": 1}
    ).to_list(2000)
    todays_mission_ids = {
        m["id"]
        for m in await db.missions.find(
            {"student_id": student_id, "due_date": today_iso}, {"_id": 0, "id": 1}
        ).to_list(1000)
    }
    completed_today_mids = {lg["mission_id"] for lg in completed_today_logs if _date_from_iso(lg["timestamp"]) == today_iso}
    completed_today_count = len(todays_mission_ids & completed_today_mids)

    # week trail: 7 days ending today
    week = []
    for i in range(6, -1, -1):
        d = (today - timedelta(days=i)).isoformat()
        week.append({"date": d, "completed": d in date_set, "is_today": d == today_iso})

    return StreakResponse(
        current_streak=current,
        longest_streak=longest,
        completed_today=today_iso in date_set,
        completed_today_count=completed_today_count,
        missions_today_count=todays_missions,
        last_completed_date=(completed_dates[-1] if completed_dates else None),
        week=week,
        freeze_used_in_run=freeze_used_in_run,
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


class MomentCreate(BaseModel):
    student_id: Optional[str] = None
    timestamp: Optional[str] = None  # ISO; defaults to now
    moment_type: str  # key from catalog OR free-text custom
    intensity: int = Field(ge=1, le=5)
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


def _student_id_for(user: dict, supplied: Optional[str]) -> str:
    """Resolve the student_id the current user is allowed to act on."""
    if user["role"] == "student":
        return user["id"]
    if not supplied:
        raise HTTPException(status_code=400, detail="student_id is required for parent")
    if supplied not in user.get("linked_student_ids", []):
        raise HTTPException(status_code=403, detail="You are not linked to this student")
    return supplied


@api.post("/moments", response_model=Moment)
async def create_moment(req: MomentCreate, user: dict = Depends(get_current_user)):
    student_id = _student_id_for(user, req.student_id)
    ts = req.timestamp or datetime.now(timezone.utc).isoformat()
    triggers = [t.strip() for t in (req.triggers or []) if t and t.strip()][:20]
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
        "moment_type": req.moment_type.strip(),
        "intensity": int(req.intensity),
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
            if student_id not in user.get("linked_student_ids", []):
                raise HTTPException(status_code=403, detail="You are not linked to this student")
            query["student_id"] = student_id
        else:
            query["student_id"] = {"$in": user.get("linked_student_ids", [])}
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
        if m["student_id"] not in user.get("linked_student_ids", []):
            raise HTTPException(status_code=403, detail="Not your student")
    await db.moments.delete_one({"id": moment_id})
    await _audit(user, "moment.delete", target_type="student", target_id=m["student_id"], meta={"moment_id": moment_id})
    return {"ok": True}


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
            if student_id not in user.get("linked_student_ids", []):
                raise HTTPException(status_code=403, detail="You are not linked to this student")
            query["student_id"] = student_id
        else:
            query["student_id"] = {"$in": user.get("linked_student_ids", [])}

    cutoff = datetime.now(timezone.utc) - timedelta(days=max(1, min(days, 180)))
    query["timestamp"] = {"$gte": cutoff.isoformat()}

    moments = await db.moments.find(query, {"_id": 0}).to_list(5000)

    counts_by_type: dict = {}
    counts_by_trigger: dict = {}
    by_hour = [0] * 24
    by_dow = [0] * 7
    sums_intensity: dict = {}
    n_intensity: dict = {}
    trigger_to_type: dict = {}
    daily_buckets: dict = {}

    for m in moments:
        t = m.get("moment_type", "other")
        counts_by_type[t] = counts_by_type.get(t, 0) + 1
        sums_intensity[t] = sums_intensity.get(t, 0) + int(m.get("intensity", 0))
        n_intensity[t] = n_intensity.get(t, 0) + 1
        try:
            dt = datetime.fromisoformat(m["timestamp"].replace("Z", "+00:00"))
            by_hour[dt.hour] += 1
            by_dow[dt.weekday()] += 1
            d = dt.date().isoformat()
            daily_buckets[d] = daily_buckets.get(d, 0) + 1
        except Exception:
            pass
        for tg in m.get("triggers", []) or []:
            counts_by_trigger[tg] = counts_by_trigger.get(tg, 0) + 1
            trigger_to_type.setdefault(tg, {})
            trigger_to_type[tg][t] = trigger_to_type[tg].get(t, 0) + 1

    avg_intensity_by_type = {
        k: round(sums_intensity[k] / max(1, n_intensity[k]), 2) for k in sums_intensity
    }

    # daily counts for last N days
    today = datetime.now(timezone.utc).date()
    daily_counts = []
    for i in range(max(1, min(days, 180)) - 1, -1, -1):
        d = (today - timedelta(days=i)).isoformat()
        daily_counts.append({"date": d, "count": daily_buckets.get(d, 0)})

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
            if student_id not in user.get("linked_student_ids", []):
                raise HTTPException(status_code=403, detail="You are not linked to this student")
            query["student_id"] = student_id
        else:
            query["student_id"] = {"$in": user.get("linked_student_ids", [])}
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


@app.on_event("shutdown")
async def on_shutdown():
    client.close()

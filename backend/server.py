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


class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: Role


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class Skill(BaseModel):
    id: str
    name: str
    category: Literal["Reading", "Executive Function"]
    description: str


class Strategy(BaseModel):
    id: str
    name: str
    description: str
    emoji: str = "✨"


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


# ---------- App ----------
app = FastAPI(title="MissionBoard API")
api = APIRouter(prefix="/api")


logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("missionboard")


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
    user_id = str(uuid.uuid4())
    doc = {
        "id": user_id,
        "name": req.name,
        "email": email,
        "password_hash": hash_password(req.password),
        "role": req.role,
        "linked_student_ids": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    token = create_access_token(user_id, email)
    set_auth_cookie(response, token)
    return UserPublic(
        id=user_id,
        role=req.role,
        name=req.name,
        email=email,
        linked_student_ids=[],
        profile_notes="",
    )


@api.post("/auth/login", response_model=UserPublic)
async def login(req: LoginRequest, response: Response):
    email = req.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(user["id"], email)
    set_auth_cookie(response, token)
    return UserPublic(
        id=user["id"],
        role=user["role"],
        name=user["name"],
        email=email,
        linked_student_ids=user.get("linked_student_ids", []),
        profile_notes=user.get("profile_notes", ""),
    )


@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


@api.get("/auth/me", response_model=UserPublic)
async def me(user: dict = Depends(get_current_user)):
    return UserPublic(
        id=user["id"],
        role=user["role"],
        name=user["name"],
        email=user["email"],
        linked_student_ids=user.get("linked_student_ids", []),
        profile_notes=user.get("profile_notes", ""),
    )


# ---------- Skills & Strategies ----------
@api.get("/skills", response_model=List[Skill])
async def list_skills(user: dict = Depends(get_current_user)):
    return await db.skills.find({}, {"_id": 0}).to_list(1000)


@api.get("/strategies", response_model=List[Strategy])
async def list_strategies(user: dict = Depends(get_current_user)):
    return await db.strategies.find({}, {"_id": 0}).to_list(1000)


# ---------- Parent: students ----------
@api.post("/students/link", response_model=UserPublic)
async def link_student(req: LinkStudentRequest, user: dict = Depends(require_role("parent"))):
    student_email = req.student_email.lower().strip()
    student = await db.users.find_one({"email": student_email, "role": "student"})
    if not student:
        raise HTTPException(status_code=404, detail="Student with that email not found")
    linked = set(user.get("linked_student_ids", []))
    linked.add(student["id"])
    await db.users.update_one({"id": user["id"]}, {"$set": {"linked_student_ids": list(linked)}})
    return UserPublic(
        id=user["id"],
        role=user["role"],
        name=user["name"],
        email=user["email"],
        linked_student_ids=list(linked),
        profile_notes=user.get("profile_notes", ""),
    )


@api.get("/students", response_model=List[UserPublic])
async def list_my_students(user: dict = Depends(require_role("parent"))):
    ids = user.get("linked_student_ids", [])
    if not ids:
        return []
    students = await db.users.find({"id": {"$in": ids}}, {"_id": 0, "password_hash": 0}).to_list(1000)
    return [
        UserPublic(
            id=s["id"],
            role=s["role"],
            name=s["name"],
            email=s["email"],
            linked_student_ids=s.get("linked_student_ids", []),
            profile_notes=s.get("profile_notes", ""),
        )
        for s in students
    ]


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
    return UserPublic(
        id=s["id"],
        role=s["role"],
        name=s["name"],
        email=s["email"],
        linked_student_ids=s.get("linked_student_ids", []),
        profile_notes=s.get("profile_notes", ""),
    )


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
    week: List[dict] = []  # [{date: 'YYYY-MM-DD', completed: bool, is_today: bool}, ... 7 days ending today]


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

    # current streak — count consecutive days ending today or yesterday
    date_set = set(completed_dates)
    current = 0
    anchor = today if today_iso in date_set else (today - timedelta(days=1))
    while anchor.isoformat() in date_set:
        current += 1
        anchor = anchor - timedelta(days=1)

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
        session_id=f"missionboard-{uuid.uuid4()}",
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
    return (
        "You are MissionBoard's assistant. You help a busy parent draft small, kid-friendly daily "
        "learning 'missions' for their child. Missions focus on Reading and Executive Function. "
        "Each mission must be tiny, doable in 5-25 minutes, and broken into 2-5 concrete steps a child can check off. "
        "Use warm, encouraging, second-person language ('you'). Avoid jargon and emoji.\n\n"
        "Pick skill_names and strategy_names ONLY from the lists below — copy the names exactly.\n\n"
        f"AVAILABLE SKILLS:\n{skill_lines}\n\n"
        f"AVAILABLE STRATEGIES:\n{strat_lines}\n\n"
        "Always respond with STRICT JSON only — no prose, no code fences."
    )


def _student_context(student: dict) -> str:
    notes = (student.get("profile_notes") or "").strip()
    name = student.get("name", "the child")
    if notes:
        return f"Student: {name}.\nProfile notes from parent: {notes}\n"
    return f"Student: {name}. (No profile notes provided — keep it broadly appropriate for an upper-elementary learner.)\n"


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
        + '"strategy_names": [str, ...] (1-2 items, copied exactly from AVAILABLE STRATEGIES) }'
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
    return AIDraftedMission(
        title=title,
        description=description,
        steps=steps,
        estimated_minutes=minutes,
        skill_ids=_match_ids(skill_names, skills),
        strategy_ids=_match_ids(strategy_names, strategies),
        skill_names=skill_names,
        strategy_names=strategy_names,
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
        + '"strategy_names": [str, ...] (1-2, copied exactly) }'
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
        out.append(AIDraftedMission(
            title=title,
            description=(d.get("description") or "").strip(),
            steps=steps,
            estimated_minutes=minutes,
            skill_ids=_match_ids(sk_names, skills),
            strategy_ids=_match_ids(st_names, strategies),
            skill_names=sk_names,
            strategy_names=st_names,
        ))
    return out


# ---------- Health ----------
@api.get("/")
async def root():
    return {"app": "MissionBoard", "status": "ok"}


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

    # Seed skills/strategies
    if await db.skills.count_documents({}) == 0:
        for s in DEFAULT_SKILLS:
            await db.skills.insert_one({"id": str(uuid.uuid4()), **s})
    if await db.strategies.count_documents({}) == 0:
        for s in DEFAULT_STRATEGIES:
            await db.strategies.insert_one({"id": str(uuid.uuid4()), **s})
    else:
        # Upsert any new strategies added after initial seed (idempotent by name)
        existing = {s["name"] for s in await db.strategies.find({}, {"_id": 0, "name": 1}).to_list(1000)}
        for s in DEFAULT_STRATEGIES:
            if s["name"] not in existing:
                await db.strategies.insert_one({"id": str(uuid.uuid4()), **s})

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

    logger.info("MissionBoard startup complete. Demo parent=%s / student=%s", parent_email, student_email)


@app.on_event("shutdown")
async def on_shutdown():
    client.close()

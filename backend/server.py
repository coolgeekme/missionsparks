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


class MissionLog(BaseModel):
    id: str
    mission_id: str
    student_id: str
    status: str
    used_strategies: bool = False
    difficulty_rating: Optional[str] = None
    feeling: Optional[str] = None
    note: str = ""
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
        )
        for s in students
    ]


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
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    await db.mission_logs.insert_one(doc)
    doc.pop("_id", None)
    return MissionLog(**doc)


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
    {"name": "Underline clues", "emoji": "✏️", "description": "Mark up the text with clues that help you answer."},
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

"""Fresh mini-game pack endpoint tests (Iter 23)."""
from __future__ import annotations

import asyncio
import os
import pathlib
import sys
import uuid

import pytest
import requests
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(pathlib.Path(__file__).resolve().parents[1] / ".env")

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") + "/api"


@pytest.fixture(scope="module")
def student_cookie():
    s = requests.Session()
    r = s.post(f"{BASE}/auth/login", json={"email": "student@demo.com", "password": "demo1234"})
    r.raise_for_status()
    return s


@pytest.fixture(scope="module")
def parent_cookie():
    s = requests.Session()
    r = s.post(f"{BASE}/auth/login", json={"email": "parent@demo.com", "password": "demo1234"})
    r.raise_for_status()
    return s


def test_fresh_pack_bad_game_key_returns_400(student_cookie):
    r = student_cookie.get(f"{BASE}/games/fresh-pack/nonexistent-game")
    assert r.status_code == 400
    assert "fresh pack" in r.json()["detail"].lower()


def test_fresh_pack_parent_forbidden(parent_cookie):
    """/games/fresh-pack is student-only."""
    r = parent_cookie.get(f"{BASE}/games/fresh-pack/word-match")
    assert r.status_code == 403


def test_fresh_pack_shape_word_match(student_cookie):
    r = student_cookie.get(f"{BASE}/games/fresh-pack/word-match")
    assert r.status_code == 200
    body = r.json()
    assert body["game_key"] == "word-match"
    assert body["week"].startswith("20")
    # content may be null if AI failed — that's acceptable per contract, but on
    # this env AI is configured so it should be present.
    if body["content"]:
        pairs = body["content"]["pairs"]
        assert isinstance(pairs, list) and len(pairs) >= 4
        for p in pairs:
            assert "word" in p and "meaning" in p
            assert len(p["word"]) <= 40
            assert len(p["meaning"]) <= 120


def test_fresh_pack_shape_memory_cards(student_cookie):
    r = student_cookie.get(f"{BASE}/games/fresh-pack/memory-cards")
    assert r.status_code == 200
    body = r.json()
    if body["content"]:
        items = body["content"]["items"]
        assert isinstance(items, list) and 6 <= len(items) <= 8


def test_fresh_pack_shape_sentence_builder(student_cookie):
    r = student_cookie.get(f"{BASE}/games/fresh-pack/sentence-builder")
    assert r.status_code == 200
    body = r.json()
    if body["content"]:
        sents = body["content"]["sentences"]
        assert isinstance(sents, list) and 3 <= len(sents) <= 6
        for s in sents:
            assert 3 <= len(s.split()) <= 10


def test_fresh_pack_is_cached_within_a_week(student_cookie):
    r1 = student_cookie.get(f"{BASE}/games/fresh-pack/word-match")
    r2 = student_cookie.get(f"{BASE}/games/fresh-pack/word-match")
    assert r1.status_code == r2.status_code == 200
    # After the first call, the second must report cached=True with identical content.
    if r1.json()["content"]:  # only meaningful if AI generation didn't fail
        assert r2.json()["cached"] is True
        assert r1.json()["content"] == r2.json()["content"]


def test_fresh_pack_regenerates_next_week():
    """Simulate a week change by manually inserting an old-week cache doc and
    confirming the endpoint generates fresh content for the current week."""

    async def _run():
        client = AsyncIOMotorClient(os.environ["MONGO_URL"])
        db = client[os.environ["DB_NAME"]]
        # Find Enzo's user id
        student = await db.users.find_one({"email": "student@demo.com"}, {"_id": 0, "id": 1})
        assert student is not None
        old_week = "2020-W01"
        # Seed an old-week doc so we know it's not accidentally used.
        await db.weekly_fresh_packs.update_one(
            {"student_id": student["id"], "game_key": "word-match", "week": old_week},
            {"$set": {"student_id": student["id"], "game_key": "word-match",
                      "week": old_week, "content": {"pairs": [{"word": "old", "meaning": "old"}]}}},
            upsert=True,
        )
        client.close()

    asyncio.run(_run())
    s = requests.Session()
    s.post(f"{BASE}/auth/login", json={"email": "student@demo.com", "password": "demo1234"}).raise_for_status()
    r = s.get(f"{BASE}/games/fresh-pack/word-match")
    assert r.status_code == 200
    body = r.json()
    assert body["week"] != "2020-W01"  # current week
    if body["content"]:
        # Must not be the seeded old-week payload
        assert body["content"]["pairs"] != [{"word": "old", "meaning": "old"}]

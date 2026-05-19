# MissionBoard — PRD

## Original problem
A kid-friendly app for parents to assign small daily learning "missions" to their student child (Reading + Executive Function), and for the student to complete them and log a quick reflection. Two roles: Parent and Student.

## Architecture
- Backend: FastAPI single-file (`/app/backend/server.py`) + MongoDB (Motor). JWT auth via httpOnly cookie (samesite=none, secure). UUID string IDs. _id excluded everywhere.
- Frontend: React 19 + react-router 7 + Tailwind + shadcn UI. Fonts Fredoka/Nunito. Duolingo-style tactile buttons.
- Routes: `/login`, `/register`, `/parent`, `/parent/missions/new`, `/parent/missions/:id/edit`, `/parent/logs`, `/student`, `/student/missions/:id`.

## User personas
- **Parent**: creates/edits/deletes missions for linked students, views reflection logs.
- **Student**: sees today's missions, checks off steps, submits reflection (feeling/difficulty/used-strategies/note).

## Core requirements (V1 — implemented)
- Email/password JWT auth with role selection at signup
- Parent links student by email; many students supported
- Pre-seeded Skills (Reading + Executive Function) and Strategies (with emoji)
- Mission CRUD (Parent): title, description, steps[], estimatedMinutes, dueDate, skillIds, strategyIds
- Student dashboard: today's missions, progress bar, per-mission strategy chips
- Mission detail: checkable steps, strategy cards, reflection form (feeling, difficulty, used_strategies, note)
- Parent Logs page: timeline of student reflections
- Demo accounts auto-seeded: parent@demo.com / demo1234 (linked to Enzo) and student@demo.com / demo1234, plus 2 demo missions for today.

## Implemented (2026-02)
- Full V1 feature set above. 18/18 backend tests pass. Critical frontend flows verified by testing agent.

## Backlog (next phases)
**V1.1**
- P0: Daily/weekly reflection journal (separate from per-mission log)
- P0: Confidence trend graph (recharts) on Parent dashboard
- P1: Parent notes/encouragements attached to a MissionLog

**V1.2**
- P1: Teacher/Tutor role + invite flow
- P1: Skill mastery visualization (per-skill progress over time)

**Tech debt / nice-to-haves**
- Tighten CORS (FRONTEND_URL explicit) once domain is fixed
- Replace `@app.on_event` with FastAPI lifespan
- Swap native date input for shadcn Calendar/Popover in MissionForm
- Convert reflection "used strategies" toggle to a true `<Checkbox>` for a11y

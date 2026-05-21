# MissionBoard — PRD

## Original problem
A kid-friendly app for parents to assign small daily learning "missions" to their student child (Reading + Executive Function), and for the student to complete them, log a quick reflection, and self-track behavior moments. Voice-first capture for parents and kids. AI helps draft missions + parse spoken moments. Insights surface ADHD-relevant patterns.

## Architecture
- Backend: FastAPI single-file (`/app/backend/server.py`, ~1500 lines) + MongoDB (Motor). JWT auth via httpOnly cookie. UUID string IDs, _id excluded. Whisper + Claude Sonnet 4.5 via Emergent Universal LLM key.
- Frontend: React 19 + react-router 7 + Tailwind + shadcn + recharts. Fonts Fredoka/Nunito. Duolingo-style tactile UI.

## User personas
- **Parent**: creates/edits missions, reviews reflections, logs Moments by typing or speaking, watches Insights, exports CSV for therapists.
- **Student (ADHD-leaning)**: sees today's missions, completes them, reflects, plays one mini-game per completion, self-checks-in by speaking or tapping.

## Core requirements — Implemented
### Iter 1 — V1 MVP (2026-02)
Auth (JWT cookies, parent/student roles), missions CRUD with skills+strategies, mission logs with reflection, parent logs view, demo accounts auto-seeded, parent/student dashboards, kid-friendly playful UI.

### Iter 2 — AI mission drafting
- `POST /api/ai/draft-mission` & `POST /api/ai/draft-day` (Claude Sonnet 4.5)
- Student profile notes used for personalization
- "Draft with AI" on Mission Form, "AI draft day" on Parent Dashboard

### Iter 3 — Streak
- `GET /api/streak` + `GET /api/streak/{student_id}`
- Flame card on Student Dashboard with 7-day trail
- Streak chip on Mission Detail success + Parent Dashboard

### Iter 4 — Mini-games, timer, clue captures
- 6 games (Word Match, Memory Cards, Reaction Tap, Breathing Bubble, Dot Connect, Sentence Builder), one unlocked per completed mission
- Count-up MissionTimer with kind target bar
- New "Jot a clue" strategy + clue_captures field on every mission for digital/audio books
- `POST /api/logs/{id}/game` saves game played + score

### Iter 5 — Behavior tracking ("Moments")
- 14 moment types (challenging/positive/neutral) + 18 triggers in catalog
- `POST/GET/DELETE /api/moments`, `GET /api/moments/insights`, `GET /api/moments/export.csv`
- MomentsTracker timeline + filters, MomentsInsights with 5 recharts views + co-occurrence table
- StudentCheckIn two-step flow (kid self-log)
- CSV export ready for therapist hand-off

### Iter 6 — Voice-based Moment capture
- `POST /api/moments/parse-audio` — Whisper transcribes → Claude extracts catalog-constrained Moment fields
- audio_data (base64), audio_mime, transcript stored on each Moment, played back on moment cards
- Mic button on Parent Moments page ("Speak it") and Student check-in ("Talk it out")
- Auto-prefills the form for parent review before save

## Compliance & privacy backlog (P0 before any paid launch)
**Current posture: consumer wellness app. NOT HIPAA-covered today. NO BAA in place with any vendor.**

### Hard blockers before therapist/clinical sales (P0)
- ⚠️ **No BAA in place** with OpenAI (Whisper), Anthropic (Claude), or MongoDB. Audio recordings + transcripts + behavior data currently transit and persist on consumer-tier LLM endpoints. Do NOT market to therapists or schools as a clinical tool until BAAs are signed (OpenAI/Anthropic enterprise tier; MongoDB Atlas dedicated cluster).
- COPPA compliance: kids <13 are users. Need verifiable parental consent flow at signup, posted privacy policy, no behavioral ads, data-minimization audit.
- Privacy Policy + Terms of Service drafts (link from Login/Register).
- Right-to-delete endpoint (`DELETE /api/account/me`) cascading to all owned data.
- Audit log of who accessed which student's records (Moments + logs).
- Toggle on Moment creation: "Don't keep the audio recording after transcription" (data-minimization knob).

### Nice-to-have (P1)
- Encryption-at-rest config doc for production MongoDB Atlas.
- Per-student data export (zip with CSV + JSON + audio clips) on demand.
- FERPA-aware "school mode" if schools adopt.
- GDPR/UK-GDPR readiness if EU/UK users.
- Refactor server.py (~1500 lines) into `routers/` modules.

## Roadmap (deferred)
**V1.1**: daily/weekly reflection journal separate from per-mission log; parent encouragement notes on logs; confidence trend graph.
**V1.2**: teacher/tutor role with invite flow; skill mastery visualization over time.
**V2**: streak freezes / "kind day off"; behavior-pattern email digest for parents; AI-suggested intervention plan based on Moments insights; in-app share link to therapist (read-only).

## Test credentials
parent@demo.com / demo1234 (linked to Enzo)
student@demo.com / demo1234

## Test coverage
- 71/71 non-AI backend tests pass (auth, missions, logs, streak, games, moments, voice).
- AI suite (mission drafting + voice parse) hits live Claude + Whisper — verified at smoke and integration level.
- Frontend agent verified all flows except real-mic record→upload (headless browser limitation).

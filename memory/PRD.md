# MissionSparks — PRD

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

### Iter 7 — P0 compliance sprint
- **COPPA consent** at student link-time (guardian name, relationship, under-13 flag, agreement) — stored in `db.consents`. Linking without consent → 400.
- **Privacy Policy** (`/privacy`) + **Terms of Service** (`/terms`) — plain-English drafts, public routes, linked from Login + Register + Account.
- **Account settings** page (`/account`) with: "Discard audio after transcription" toggle (default ON), JSON data export, activity-log link, "Delete my account" (typed-confirmation gate).
- **`DELETE /api/account/me`** — cascade delete: student wipes their missions, mission_logs, moments, removes self from parents' linked_student_ids; parent wipes their logged moments + consents (linked students retained). Clears the auth cookie.
- **`GET /api/account/export`** — full JSON dump for portability.
- **Audit log**: `_audit()` helper writes timestamped entries on auth/login/logout/register, students.link, student.profile_update, moment.create, moment.delete, account.preferences_update, account.export, account.delete. Exposed via `GET /api/audit` (student sees own; parent sees own + linked students; optional student_id filter with linked-only enforcement). Surfaced at `/parent/audit`.
- **`PUT /api/account/preferences`** — `discard_audio` flag honored by both `POST /api/moments/parse-audio` (response) and `POST /api/moments` (persistence). Default ON.
- **Register** requires `accept_terms=true`; sets `terms_accepted_at`.

## Compliance & privacy backlog (P0 → some done)
**Current posture: consumer wellness app. NOT HIPAA-covered. NO BAA in place with any vendor.**

### ✅ Done this sprint
- COPPA consent capture at student link-time
- Privacy Policy + Terms of Service drafts (need a real attorney review before launch)
- Right-to-delete cascade endpoint
- Audit log + parent-facing activity view
- Data export endpoint (JSON)
- Discard-audio data-minimization toggle (privacy-by-default)
- Terms-of-service acceptance gate at registration

### Iter 8 — Research-backed evidence library (2026-02)
- New `Citation` collection with 31 curated peer-reviewed papers, CDC/AAP/NIMH/CHADD guidance, and reading-research guidelines.
- `/api/citations` + `/api/citations/{id}` (read-only, auth-gated) and `/api/games/catalog` with evidence_refs per game.
- `evidence_refs` added to Skills, Strategies, Moment types, Triggers, Games, and AI-drafted missions.
- AI mission drafting prompt now requires `evidence_tags` from a controlled vocabulary; backend resolves tags → citation ids. Transitive citations also collected from chosen skills/strategies.
- New parent-only Research page (`/parent/research`) with search, source-type filter (peer-reviewed / org / guideline), and topic tag filter.
- `<EvidenceBadge>` popover component surfaces citations next to every clinical chip in Parent Dashboard, Mission Form, and Moments tracker.
- Privacy: evidence badges are **not** shown to the student role (parent/therapist surface only).
- 14 new pytest cases (`test_research.py`) — all passing.
- E2E (testing agent iter8): 100% pass on all 8 acceptance criteria.

### Still open
- ⚠️ **Sign BAAs with OpenAI (Whisper) + Anthropic (Claude) + MongoDB Atlas dedicated** before any therapist or clinical-track sale.
- Legal review of Privacy Policy + Terms by a privacy attorney (drafts are templates).
- Production hardening: MongoDB encryption-at-rest config, rate limiting, password-reset flow, brute-force throttling.
- Per-student data export (zip with CSV + JSON + audio clips) on demand.
- FERPA-aware "school mode" if schools adopt.
- GDPR/UK-GDPR readiness if EU/UK users.
- Refactor server.py (~1800 lines) into `routers/` modules — increasingly urgent after iter8.
- App rename from "MissionBoard" → **MissionSparks** completed in iter9 (Feb 2026). Streak UI rebranded to "Sparks" ⚡ (API field name kept as `streak` to avoid breaking changes).

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

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

### Iter 9 — Public landing + waitlist (2026-02)
- New public landing page at `/` with hero, features, research-credibility band, how-it-works, privacy section, waitlist, and footer.
- Logged-out visitors see Landing; logged-in users get redirected to their dashboard.
- New `/changelog` public page with 8 release entries (v0.2 → v0.9, vertical timeline).
- Dynamic citation/skills/strategies/waitlist counters on the landing page via new `/api/public/stats` (no-auth).
- `/api/public/waitlist` POST (no-auth, idempotent on email) + `/api/waitlist` GET (parent-gated for now).
- 11 new backend pytest cases (`test_landing_waitlist.py`) — all passing.
- E2E (testing agent iter9): 100% pass on all 11 acceptance criteria, zero issues found.

### Iter 10–13 — Research library, AI-led intake, Reading + Writing practice (2026-02)
- Research-backed citation DB seeded + UI badges + `/research` library page.
- Phase 1 structured parent intake form & AI-led text interview via `/api/intake/interview/{start,reply}`.
- "Why this mission?" rationale tooltips on AI drafts.
- Recurring missions (daily/weekdays/weekends/weekly), mission duplication, visible Edit buttons.
- AI-generated Reading Passages + Guided Writing missions + Portfolio page (`POST /api/missions/practice`).

### Iter 14 — Family Games System (2026-02) — Feature A
- Mini-games library exposed at `/games` for BOTH parents and kids; tabs for Built-in / Custom packs / Pending (parents only).
- Parents can author **custom game packs** for the 3 customizable games (Word Match, Memory Cards, Sentence Builder) via `/parent/games/new` — instantly approved on save and optionally shared with specific kids.
- **Kid Studio** at `/student/studio` — locked behind a per-student `game_studio_unlock_streak` (default 7 days). Once unlocked, the kid can author a pack for a sibling. Every kid-authored pack starts as `status="pending"` and **must be parent-approved before anyone (including the creator) can play it**.
- Parent approval queue: Approve (with optional re-pick of shared kids) or Reject with a short note that the kid sees on their pack tile.
- Kids see their own packs in any status (Waiting/Sent back/Approved chips); only **approved** sibling packs are visible to other kids.
- GamePlay route now supports `?packId=...` standalone (`/play/free/{gameKey}?packId={id}`) and shows the pack name + creator under the game header.
- Per-student `game_studio_unlock_streak` configurable from Student Intake (Peak hours & motivators step).
- Backend models + endpoints (`GamePack`, `/api/game-packs` CRUD, `/api/me/studio-status`) with strict family-scoped visibility and content validation. 17/17 pytest pass (`tests/test_family_games.py`).

### Still open
- ⚠️ **Sign BAAs with OpenAI (Whisper) + Anthropic (Claude) + MongoDB Atlas dedicated** before any therapist or clinical-track sale.
- ⚠️ **Rate-limit /api/public/waitlist** before launch (public endpoint, spam risk).
- Legal review of Privacy Policy + Terms by a privacy attorney (drafts are templates).
- Password-reset flow, brute-force throttling, MongoDB encryption-at-rest.
- Per-student data export (zip with CSV + JSON + audio clips) on demand.
- FERPA-aware "school mode" if schools adopt; GDPR/UK-GDPR if EU users.
- Refactor `server.py` (~3100 lines, critical) into `routers/` modules — increasingly urgent.
- App rename from "MissionBoard" → **MissionSparks** completed in iter9 (Feb 2026). Streak UI rebranded to "Sparks" ⚡ (API field name kept as `streak` to avoid breaking changes).

## Roadmap (deferred)
**Iter 15 (P1) — Co-Parent / Family Group system**: introduce a `family` entity, multi-parent linking to the same student, email invites, admin permission tiers. Requires major authz refactoring across all endpoints to check family group membership instead of single parent ownership.
**Iter 16 (P2) — Backend refactor**: split `server.py` into modular FastAPI routers (`auth.py`, `missions.py`, `ai.py`, `games.py`, `moments.py`, `intake.py`, `practice.py`, `research.py`).
**V1.1**: daily/weekly reflection journal separate from per-mission log; parent encouragement notes on logs; confidence trend graph.
**V1.2**: teacher/tutor role with invite flow; skill mastery visualization over time.
**V2**: streak freezes / "kind day off"; behavior-pattern email digest for parents; AI-suggested intervention plan based on Moments insights; in-app share link to therapist (read-only).

## Test credentials
parent@demo.com / demo1234 (linked to Enzo)
student@demo.com / demo1234

## Test coverage
- 88/88 non-AI backend tests pass (auth, missions, logs, streak, games, moments, voice, practice, landing/waitlist, research, family games).
- AI suite (mission drafting + voice parse + AI interview + reading/writing gen) hits live Claude + Whisper — verified at smoke and integration level.
- Frontend agent verified all flows except real-mic record→upload (headless browser limitation).


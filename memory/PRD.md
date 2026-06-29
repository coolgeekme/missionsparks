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

### Iter 15 — Co-Parent / Family Group system (2026-02) — Feature B
- **New `Family` entity**: each family has an owner + members + student_ids. Replaces "parent → linked_student_ids" as the authz boundary.
- **Auto-migration on startup**: every pre-existing parent gets a personal family containing their previously-linked students. No data loss.
- **3 permission tiers**: `owner` (full control), `co_parent` (create/edit missions, moments, packs), `viewer` (read-only — great for grandparents, therapists, tutors).
- **Multi-family**: one parent can belong to many families (joint custody, blended households, tutors helping multiple families) with a **family switcher in the Navbar**.
- **Invite flow (link-based)**: parent generates an invite for `{email, role}`; gets a shareable `invite_url` + token (14-day TTL). Invitee logs in (or registers) with the matching email and accepts via `/invite/accept?token=...`. Includes preview-before-accept, wrong-email guard, and expired/cancelled states.
- **Family Settings page** (`/family`): members list with name+email+role, role-change select, member-remove, ownership transfer, invite form, pending invites list, danger-zone delete (gated on empty family).
- **Authz refactor across the codebase**: `_assert_parent_owns_student(write=True/False)` is now family-aware; `_accessible_student_ids(user)` aggregates across all families; viewers blocked from writes; missions/moments/audit/streak/students/game packs all scoped via family membership.
- **Removed-member content**: when a parent is removed from a family, their authored missions + moments are reassigned to the family owner (per product spec).
- **Backend**: 29/29 new pytest pass (`tests/test_families_invites.py`); 117/117 across all family-aware suites; 0 regressions on Iter 14 (`tests/test_family_games.py` 17/17 still green).

### Iter 16 — Resend email integration (2026-02)
- Real transactional emails for family invites via Resend's Python SDK (`resend` 2.32.2).
- New module `/app/backend/email_service.py` — async non-blocking wrapper using `asyncio.to_thread`; **never raises** (in-app invite link is always source of truth).
- Email template: styled HTML (inline CSS, table layout) + plain-text fallback. Includes CTA button, copyable link, expiry date, role description.
- POST `/api/families/{id}/invites` now returns `email_sent: true/false`; FamilySettings UI shows "📬 Email sent" vs "Couldn't send — just share the link" message.
- Env config: `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (default `onboarding@resend.dev`), `RESEND_FROM_NAME`, `PUBLIC_APP_URL`.

### Iter 17 — Parent digest emails (2026-02)
- **Daily or weekly summary email** for opted-in parents with kid activity + AI-personalized off-app tips + curated ADHD article.
- New `/app/backend/digest_service.py` — content aggregator + Resend sender. Per-kid section includes spark streak, missions completed, mini-games played + top score, recent moments highlights.
- **AI weekly tips** (Claude) — 3 evidence-informed activities tailored to each kid's interests + motivators. Cached for 7 days per student in `digest_weekly_tips`. Daily digests reuse the same weekly batch.
- **Curated ADHD article rotation** — `/app/backend/digest_articles.py` seeds 12 evergreen entries from CHADD, ADDitude, Harvard Health, NIMH, AAP, ADHD Foundation. Each parent's `seen_article_ids` rotates through the library before recycling.
- **APScheduler** runs hourly (cron at :05) in-process; fires `dispatch_due_digests()`.
- New endpoints: `GET/PUT /api/me/digest-preferences`, `POST /api/me/digest/send-sample`.
- New UI section on `/account`: enable toggle, cadence (daily/weekly), timezone (11 options), send time, day-of-week (weekly only), "Send me a sample now" button, last-sent + next-due chips.
- **Per-member opt-in**: each parent (owner / co_parent / viewer) has their own digest_preferences embedded on their user doc. Coparents enable independently.
- Resend domain `missionsparks.com` is now verified — emails deliver to any recipient. Sender: `hello@missionsparks.com`.
- 15/15 digest pytest tests pass (`tests/test_digest.py`). 103/103 across the whole family-aware suite. Zero regressions.

### Iter 20 — Streak refactor + Freezes + Weekend mode + Email variety (2026-02) [Batch 1 of 6-item request]
- **NEW `/app/backend/streak_service.py`** — single canonical streak compute used by BOTH the kid dashboard (`/api/streak`) and the parent digest (`_compute_streak_for`). Killed the duplicate logic that caused dashboard/email mismatch.
- **Removed the hardcoded "1 free freeze"** that was silently keeping streaks alive when a kid actually missed a day. Real misses now break the streak.
- **Parent-granted Streak Freezes**: `db.streak_freezes` collection. Endpoints: POST/GET/DELETE `/api/students/{id}/freezes`. Quota: 4 per kid per calendar month UTC. Rejects duplicates, future dates, >60-day-old dates, and dates the kid already completed.
- **Family-level weekend toggle**: `PUT /api/families/{id}/streak-weekend-mode` with `all_days` (default) | `weekdays_only`. In weekdays_only mode, Sat/Sun automatically skip without breaking streak.
- **Email content variety**: digest tips cache shortened from 7d → 1d AND keyed by `'{date}::{focus_key}'` where focus rotates daily across 7 angles (momentum/regulation/connection/self-esteem/transition/focus/sleep). Fallback pool expanded from 3 → 10 evidence-backed tips, rotated by day-of-year so even AI-down days vary.
- **UI**: `StreakFreezeManager` component on Parent Dashboard (per-kid quota chip + grant form + freeze list with revoke). `StreakWeekendSection` on Family Settings. Student week-trail now shows ❄ freeze chips, dashed-border weekend dots, and red-tinted missed days.
- **Testing**: 79/79 backend tests pass including new `tests/test_streak_freezes.py` (7 unit) + testing-agent-added `test_streak_freezes_api.py` (16 integration). Frontend Playwright: 100% of critical data-testids verified. Zero bugs.

### Iter 19.2 — Dead article links in digest (2026-02)
- **Bug**: parent reported clicking the "Worth a read" link in the digest landed on a 404. Curl-audit of all 12 curated article URLs in `digest_articles.py` showed **5 of 12 had silently rotted** (CHADD homework, ADDitude praise, ADDitude screen time, Harvard sleep-ADHD, ADDitude mindfulness).
- **Fix**: replaced each dead URL with a verified live alternative on the same publisher covering the same topic (titles + blurbs still apply 1:1). All 12 now return HTTP 200.
- **Regression test**: `tests/test_digest_article_urls.py` parametrically GETs every curated URL and fails the build if any returns ≥400. Network-aware — skips automatically when offline (env `SKIP_NETWORK_TESTS=1` to force-skip in CI).

### Iter 19.1 — Parent Digest stats bug fix (2026-02)
- **Bug**: every parent's daily/weekly digest showed "0-day streak" + "0 missions completed" for every kid, regardless of actual activity.
- **Root cause**: `digest_service.py` queried `mission_logs` with the wrong field names — `{"completed": True}` + `completed_at` — but the real schema uses `{"status": "completed"}` + `timestamp`. The window filter never matched anything → counts always 0. Moments display also used a non-existent `text` field instead of `context_note` → "Recent moments" section never rendered.
- **Fix**: corrected field names in `_compute_streak_for` and `_student_window_summary`. Moments now read `context_note` / `transcript` / `notes` (in that priority).
- **Regression test**: `test_student_window_summary_counts_completed_missions` in `tests/test_digest.py` seeds 3 in-window + 1 out-of-window completed logs + a moment and asserts counts/HTML render correctly. Locks the contract. 16/16 digest tests pass.

### Iter 19 — Family Home Page enrichments (2026-02)
- **Personalized kid tiles** on `/home/{slug}`: spark streak chip, open-missions-today chip, "loves ${interest}" tag from intake. All cheap data reads (parallelized with `asyncio.gather`).
- **AI Spark of the Day** banner — one-line snippet generated by Claude, daily-rotated across `fun_fact` → `riddle` → `affirmation` → `science_nugget`. Cached 24h per family in `db.home_sparks`. Interest-aware: weaves in a kid's interest when known. Static fallback per kind on AI failure (and NOT cached so next page-load retries the LLM).
- **Custom tile avatars** — kids pick an emoji from a 24-item palette + a color from an 8-color palette via `AvatarPickerModal` ("My tile" button on /student dashboard). Stored on `user.avatar_emoji` + `user.avatar_color`; reflected on the public Home Page.
- New endpoints: `GET /api/home/{slug}/spark` (no-auth), `GET/PUT /api/me/avatar` (student-only PUT). Enriched `GET /api/home/{slug}` payload.
- Off-palette emoji/color → 400; parent JWT on PUT /api/me/avatar → 403.
- Testing: 12/12 new pytest pass (`tests/test_iter19_spark_and_avatar.py`). Iter18 regression 13/13 still green. Frontend Playwright: spark banner, all chips, avatar picker save+reflect, "use initial" fallback — all verified.

### Iter 18 — Public Home Dashboard + Mission UX (2026-02)
- **Family slug + 4-digit kid PIN** to bypass full email/password login. Per-family `home_dashboard_enabled` toggle and per-student `home_pin_hash` (bcrypt). Shared iPad-friendly URL: `/home/{slug}`.
- 5-strike PIN lockout (10 minutes) tracked in `db.home_pin_attempts`. 4-hour session cookie issued on success.
- Endpoints: `PUT /api/families/{id}/home-dashboard`, `PUT /api/students/{id}/home-pin`, `DELETE /api/students/{id}/home-pin`, `GET /api/home/{slug}` (no-auth), `POST /api/home/{slug}/login` (no-auth).
- New `HomePage.jsx` (kid-tile picker + PIN modal). `FamilySettings.jsx` got a "Family home page" section: toggle, copyable URL, per-kid PIN setter.
- **Kid dashboard now shows only TODAY's missions by default** with Past/Today/Future arrow nav + date picker + "Today" jump button.
- **Completed missions are read-only**: strikethrough title + "Done ✓" chip + "Tap to view the steps you did" label. No redo, no log button.
- **MissionUpdate now accepts `scope`** = "this" (default) | "future" | "series". Bulk updates skip completed history (`status='completed'` logs); `due_date` only applies to scope=this to avoid series collisions.
- **AI assistant available on edit** mission form (not just create) — Draft with AI panel.
- Testing: 13/13 new pytest pass (`tests/test_home_dashboard_and_scope.py`); E2E PIN→student flow verified via Playwright (Enzo PIN 1234 → /student).
- Fix shipped this iter: `HomePage.jsx submitPin` now calls `refresh()` from AuthContext before navigate, so ProtectedRoute picks up the new kid session.

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
**Iter 18 (P2, next) — Backend refactor**: split `server.py` (~3850 lines, critical) into modular FastAPI routers.
**Iter 19 (P2) — Cross-family pack sharing on approval**: when a parent in multiple families approves a pack, kids in all their families see it (current scope: single-family only).
**Iter 20 (P2) — Web-search-powered "Latest ADHD research" digest section**: optional AI search at send-time for fresh articles beyond the curated 12.
**Iter 21 (P2) — Teacher/Tutor role + Skill Mastery viz.**
**V1.1**: daily/weekly reflection journal separate from per-mission log; parent encouragement notes on logs; confidence trend graph.
**V1.2**: teacher/tutor role with invite flow; skill mastery visualization over time.
**V2**: streak freezes / "kind day off"; behavior-pattern email digest for parents; AI-suggested intervention plan based on Moments insights; in-app share link to therapist (read-only).

## Test credentials
parent@demo.com / demo1234 (linked to Enzo)
student@demo.com / demo1234
Enzo home PIN: 1234 (family slug: `demo-parent-family` → /home/demo-parent-family)

## Test coverage
- 88/88 non-AI backend tests pass (auth, missions, logs, streak, games, moments, voice, practice, landing/waitlist, research, family games).
- AI suite (mission drafting + voice parse + AI interview + reading/writing gen) hits live Claude + Whisper — verified at smoke and integration level.
- Frontend agent verified all flows except real-mic record→upload (headless browser limitation).


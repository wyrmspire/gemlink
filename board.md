# Gemlink Execution Board

> Last updated: 2026-03-14 (Lane 5 — B2 complete + upgrade.md Sales items done)
> Scope: prioritized improvement plan across UX, architecture, reliability, boardroom, local-first workflow, testing, deployment, and DX.

---

## Status Key

| Symbol | Meaning |
|--------|---------|
| 🔴 | Not started |
| 🟡 | In progress |
| 🟢 | Done |
| ⏸️ | Blocked / waiting on dependency |

---

## Parallelization guidance
- Lanes **1–5** can start immediately on items marked 🟢/🟡 or unblocked 🔴.
- Items marked ⏸️ require a decision before work begins.
- If blocked, switch to Side‑work lane tasks that don’t overlap active files.

---

## Track A — Architecture & Reliability

> **Goal**: Eliminate API key leakage, establish consistent client→server pattern, add resilience.

### A1. Move Research page to server-side endpoints 🟢
- **Priority**: P0 (security)
- **Why**: `Research.tsx` instantiates `GoogleGenAI` in the browser, exposing the API key to any user with DevTools open. Both search-grounded and deep-thinking modes are affected.
- **Deliverables**:
  - `server.ts`: add `POST /api/research/search` and `POST /api/research/think` endpoints.
  - `src/pages/Research.tsx`: replace direct `GoogleGenAI` calls with `fetch()` to new server endpoints.
- **Files**: `server.ts`, `src/pages/Research.tsx`
- **Dependencies**: None
- **Parallelizable with**: A2, A3

### A2. Move Video analysis to server-side endpoint 🟢
- **Priority**: P0 (security)
- **Why**: `VideoLab.tsx` `analyzeVideo()` calls Gemini Pro directly from the browser with the API key.
- **Deliverables**:
  - `server.ts`: add `POST /api/media/video/analyze` endpoint accepting multipart or base64 video.
  - `src/pages/VideoLab.tsx`: replace direct call with `fetch()`.
- **Files**: `server.ts`, `src/pages/VideoLab.tsx`
- **Dependencies**: None
- **Parallelizable with**: A1, A3

### A3. Move VoiceLab live session to server-proxied connection 🔴
- **Priority**: P1 (security, complexity)
- **Why**: `VoiceLab.tsx` `toggleLiveSession()` opens a Gemini Live API WebSocket directly from the browser with the API key. This is harder to proxy because it's a real-time bidirectional audio stream.
- **Deliverables**:
  - Design doc for WebSocket proxy approach (server-side Live API connection relayed to client via WS).
  - OR: Accept this as a known trade-off and document it, since Live API requires real-time audio and proxying adds latency.
- **Files**: `server.ts`, `src/pages/VoiceLab.tsx`
- **Dependencies**: None, but decision needed before implementation
- **Parallelizable with**: A1, A2

### A4. Add React error boundaries 🟢
- **Priority**: P1 (reliability)
- **Why**: Any unhandled error in a page component crashes the entire app. A single bad API response can take down the workspace.
- **Deliverables**:
  - `src/components/ErrorBoundary.tsx`: generic error boundary with retry button.
  - `src/App.tsx`: wrap `<Outlet />` in Layout or each route in error boundary.
- **Files**: `src/components/ErrorBoundary.tsx` (new), `src/App.tsx` or `src/components/Layout.tsx`
- **Dependencies**: None
- **Parallelizable with**: All other items
- **Done**: Lane 3 — `ErrorBoundary.tsx` created (class component, retry button, styled error card). Wired into `Layout.tsx` wrapping the `<Outlet />`.

### A5. Decide on better-sqlite3: use it or remove it 🟢
- **Priority**: P2 (code hygiene)
- **Why**: `better-sqlite3` is in `package.json` dependencies but never imported anywhere. It adds native compilation overhead to `npm install`. Either use it for job/session metadata or remove it.
- **Deliverables**: Either a migration plan to SQLite-backed persistence or removal from `package.json`.
- **Files**: `package.json`, potentially `server.ts` + `boardroom.ts` if adopting
- **Dependencies**: Decision needed — this affects Track B and Track C
- **Parallelizable with**: A4
- **Decision note**: [`docs/decisions/A5-better-sqlite3.md`](docs/decisions/A5-better-sqlite3.md) — original recommendation was Option A (remove). **Re-evaluated in light of `upgrade.md` bulk media sprint**: adopted Option B (use SQLite) — the batch queue (H2), AI scoring (I3), project-scoped library (G2), and collections (J1) all require structured queries that flat files cannot serve efficiently.
- **Done**: Lane 4 — created `src/db.ts` with full schema (projects, media_jobs, collections, collection_items, media_plans). WAL mode, FK enforcement, typed query helpers exported. Decision doc updated at `docs/decisions/A5-better-sqlite3.md`. Also installed `archiver` + `@types/archiver` (for J3 ZIP export, Lane 1) and `@dnd-kit/core` + `@dnd-kit/sortable` (for J1 drag-and-drop, Lane 3). Added `@types/better-sqlite3` devDependency.

---

## Track B — Data Persistence & Local-First Workflow

> **Goal**: Stop losing user state on refresh. Strengthen local-first data model.

### B1. Persist BrandContext to localStorage 🟢
- **Priority**: P0 (UX — users lose all brand settings on refresh)
- **Why**: `BrandContext.tsx` uses `useState` with hardcoded defaults. Every page refresh resets brand name, description, audience, and voice to "FutureTech AI" defaults.
- **Deliverables**:
  - `src/context/BrandContext.tsx`: read initial state from `localStorage`, write on every setter call.
  - Fallback gracefully if localStorage is unavailable.
- **Files**: `src/context/BrandContext.tsx`
- **Dependencies**: None
- **Parallelizable with**: Everything
- **Done**: Lane 3 — reads from `localStorage` on init, writes on every setter call; graceful fallback on parse error.

### B2. Wire BrandContext into Twilio SMS endpoint 🟢
- **Priority**: P2 (correctness)
- **Why**: The `/api/twilio/sms` handler uses a hardcoded generic prompt (`"You are a helpful sales agent for our brand"`) instead of actual brand data. The `SalesAgent.tsx` UI displays brand context but the server never receives it.
- **Deliverables**:
  - Design: either pass brand context per-request, or persist brand config server-side (depends on B1/A5 decisions).
  - Update the Twilio handler to use real brand context in its prompt.
- **Files**: `server.ts` (Twilio section), potentially new server-side brand config endpoint
- **Dependencies**: B1 (need to decide where brand data lives first)
- **Parallelizable with**: A-track items
- **Decision note**: [`docs/decisions/B2-brand-context-twilio.md`](docs/decisions/B2-brand-context-twilio.md) — recommends server-side JSON config file (Option A). Blocked on B1.
- **Done**: Lane 5 (2026-03-14) — Implemented Option A (server-side JSON config). Added `POST /api/twilio/config` and `GET /api/twilio/config` endpoints in `server.ts` (Twilio section). Updated `/api/twilio/sms` to read brand context (brandName, brandDescription, targetAudience, brandVoice) plus mediaCount and optional projectName from `jobs/twilio/config.json`. Updated `SalesAgent.tsx` with a "Save to Agent" button that pushes brand context to the server config. Added project-aware badge in header (TODO comment to swap from BrandContext to ProjectContext once G1 lands). Added Sales Media Library section showing assets tagged sales/promo/campaign. Sync status indicator (green = synced, amber = not synced) in header. Pre-existing App.tsx lint errors from Lane 3 stub pages are NOT Lane 5 failures.

### B3. Add client-side polling for pending video jobs 🟢
- **Priority**: P1 (UX)
- **Why**: Video generation returns a pending job. The server polls Gemini in the background, but the `VideoLab.tsx` UI only shows the initial pending state with a message to "Open the Media Library." There's no auto-refresh on the VideoLab page itself.
- **Deliverables**:
  - `src/pages/VideoLab.tsx`: add `setInterval` polling of `/api/media/history` or a new `/api/media/job/:id` endpoint to update job status in real-time.
  - Or: add a simple `GET /api/media/job/:type/:id` endpoint to `server.ts` and poll it.
- **Files**: `src/pages/VideoLab.tsx`, optionally `server.ts`
- **Dependencies**: None
- **Parallelizable with**: B1, B2
- **Done**: Lane 3 — `useEffect` polling `GET /api/media/job/video/:id` every 5 s; animated spinner + progress bar while pending; inline video player on completion. Also migrated `analyzeVideo()` from direct `GoogleGenAI` to `POST /api/media/video/analyze` (A2 companion fix).

---

## Track C — Boardroom & Session Design

> **Goal**: Improve session UX, make long-running sessions resilient, and enable session replay.

### C1. Make boardroom session creation async with streaming updates 🟢
- **Priority**: P1 (UX + reliability)
- **Why**: `createBoardroomSession()` runs the entire multi-phase protocol synchronously in-request. A 5-seat, 5-round deep session makes many sequential Gemini calls and can easily take 2+ minutes. This risks HTTP timeouts and gives the user zero progress feedback.
- **Deliverables**:
  - `boardroom.ts` / `server.ts`: return the session ID immediately, run orchestration in background (like video jobs), persist state after each turn.
  - `src/pages/Boardroom.tsx`: poll `/api/boardroom/sessions/:id` to show incremental turn/phase progress.
- **Files**: `boardroom.ts`, `server.ts` (boardroom section), `src/pages/Boardroom.tsx`
- **Dependencies**: None
- **Parallelizable with**: B-track, A-track

### C2. Add session replay / history view to Boardroom UI 🟢
- **Priority**: P2 (UX)
- **Why**: The boardroom API supports listing and reading past sessions (`GET /api/boardroom/sessions`, `GET /api/boardroom/sessions/:id`), but the `Boardroom.tsx` UI only shows the current/latest session creation flow. Users can't browse or replay past sessions.
- **Deliverables**:
  - `src/pages/Boardroom.tsx`: add a session history sidebar or tab that lists past sessions and lets users click to view full turn/state history.
- **Files**: `src/pages/Boardroom.tsx`
- **Dependencies**: None
- **Parallelizable with**: C1 (but C1 changes the data flow, so coordinate)
- **Done**: Lane 2 — tab toggle (New Session / History), phase-filter chips for per-phase replay, enriched session cards with turn count + elapsed time.

### C3. Validate boardroom session JSON integrity on read 🟢
- **Priority**: P3 (reliability)
- **Why**: `readBoardroomSession()` does `JSON.parse()` with no schema validation. A corrupted or partially-written file (e.g., crash during write) will throw an unhandled error. `listBoardroomSessions()` catches per-file errors but `readBoardroomSession()` does not.
- **Deliverables**:
  - `boardroom.ts`: add try/catch with meaningful error in `readBoardroomSession()`. Consider a simple schema check for required fields.
- **Files**: `boardroom.ts`
- **Dependencies**: None
- **Parallelizable with**: Everything
- **Done**: Lane 2 — `validateBoardroomSession()` validates required fields (id, createdAt, updatedAt, status, topic, turns, participants, logs), status enum, and array types. `readBoardroomSession()` has separate try/catch for file read and JSON parse with descriptive error messages. Verified working.

---

## Track D — UX Polish

> **Goal**: Make the app feel production-quality rather than prototype-grade.

### D1. Add loading skeletons to Library page 🟢
- **Priority**: P2 (UX polish)
- **Why**: `Library.tsx` shows nothing while fetching history, then pops in all at once. Skeleton loaders improve perceived performance.
- **Deliverables**:
  - `src/pages/Library.tsx`: add skeleton/placeholder cards while `loading` is true.
- **Files**: `src/pages/Library.tsx`
- **Dependencies**: None
- **Parallelizable with**: Everything
- **Done**: Lane 2 — 6-card pulsing skeleton grid that matches the real card layout (aspect-square media area + icon/text/timestamp rows).

### D2. Add toast/notification system for errors and success 🟢
- **Priority**: P2 (UX)
- **Why**: Most pages use `alert()` for errors, which blocks the UI and feels jarring. Success states are also not communicated well.
- **Deliverables**:
  - `src/components/Toast.tsx` (new): minimal toast component.
  - `src/context/ToastContext.tsx` (new): toast provider.
  - Replace `alert()` calls across all pages.
- **Files**: new components + all pages
- **Dependencies**: None
- **Parallelizable with**: Everything (but touches many files — coordinate)
- **Done**: Lane 3 — 2026-03-14. `ToastContext.tsx` + `Toast.tsx` created. `alert()` replaced in SocialMedia, VideoLab, Research, Library. VoiceLab not modified (no alert() found). Not browser-tested.

### D3. Fill `metadata.json` 🟢
- **Priority**: P3 (completeness)
- **Why**: Currently empty `{ "name": "", "description": "" }`. Should describe the app for AI Studio or any deployment platform.
- **Deliverables**: Populate with app name and description.
- **Files**: `metadata.json`
- **Dependencies**: None
- **Parallelizable with**: Everything
- **Done**: Lane 5 — populated with app name "Gemlink" and description.

---

## Track E — Testing & CI

> **Goal**: Establish a testing foundation. Currently there are zero tests.

### E1. Add server API integration tests 🟢
- **Priority**: P1 (reliability)
- **Why**: The media and boardroom endpoints have no test coverage. Regressions are only caught by manual testing or typecheck.
- **Deliverables**:
  - Choose test framework (Vitest recommended — already Vite-based).
  - `package.json`: add test script and vitest dependency.
  - `tests/api/`: basic integration tests for `/api/health`, `/api/media/history`, `/api/boardroom/sessions`.
- **Done**: Lane 4 — 17 tests passing. Vitest + supertest. `npm test` works. Covers: health, media history, job status validation (400/404), boardroom sessions, no-cache headers, research/video-analyze input validation.
- **Files**: `package.json`, `tests/` (new directory)
- **Dependencies**: None
- **Parallelizable with**: E2

### E2. Add frontend component smoke tests 🟢
- **Priority**: P2 (reliability)
- **Why**: No component tests exist. At minimum, verify pages render without crashing.
- **Deliverables**:
  - Add `@testing-library/react` and `jsdom`.
  - `tests/components/`: smoke tests for each page (renders, no throw).
- **Files**: `package.json`, `tests/` (new directory)
- **Dependencies**: E1 (shared test infrastructure setup)
- **Parallelizable with**: E1 (after shared setup)
- **Done**: Lane 4 — 14 tests passing (Dashboard ×2, Setup ×2, SocialMedia ×1, VideoLab ×1, VoiceLab ×1, Boardroom ×2, Research ×1, SalesAgent ×1, Library ×3). Installed `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`. Updated `vitest.config.ts` to support both node and jsdom environments per-file. Added `tests/setup.ts` global setup and `tests/helpers/renderWithProviders.tsx` with full provider stack (ApiKeyGuard mock, BrandProvider, ProjectProvider, ToastProvider, MemoryRouter). All 31 tests pass (17 API + 14 component).

---

## Track F — Deployment & DX

> **Goal**: Get deployment-ready and improve developer onboarding.

### F1. Add production Express static serving validation 🟢
- **Priority**: P2 (deployment)
- **Why**: The production branch of `server.ts` (`NODE_ENV === "production"`) serves from `dist/` but has never been tested against `npm run build` output in a real deploy.
- **Deliverables**:
  - Verify `npm run build` + `NODE_ENV=production node server.ts` serves the app correctly.
  - Document in README or add a `start:prod` script.
- **Files**: `package.json`, `README.md`
- **Dependencies**: None
- **Parallelizable with**: Everything
- **Done**: Lane 2 — added `start:prod` script to `package.json`; documented production flow in README. Build verified clean.

### F2. Clean up unused HANDOFF docs 🟢
- **Priority**: P3 (DX)
- **Why**: Four `HANDOFF-*.md` files contain incremental change logs from past agent sessions. Their content is now superseded by `AGENTS.md` and this board. They add noise to the repo root.
- **Deliverables**:
  - Move to `docs/archive/` or delete after confirming no unique info remains.
- **Files**: `HANDOFF-*.md`
- **Dependencies**: None
- **Parallelizable with**: Everything
- **Done**: Lane 5 — moved all 4 HANDOFF files to `docs/archive/` with an index README.

### F3. Update README with actual project description 🟢
- **Priority**: P2 (DX / onboarding)
- **Why**: README is still the generic AI Studio boilerplate. It doesn't describe what Gemlink actually does, what features exist, or how the server/client architecture works.
- **Deliverables**: Rewrite README with project description, feature list, architecture overview, and local dev instructions.
- **Files**: `README.md`
- **Dependencies**: None
- **Parallelizable with**: Everything
- **Done**: Lane 2 — full rewrite: feature table, architecture diagram, local dev, production build, testing, scripts reference, project structure, env vars, known limitations.

---

## Recommended Sequencing

### Wave 1 — Security + Core UX (do first, parallelizable)
| Item | Lane | Can parallel with |
|------|------|-------------------|
| **A1** (Research → server) | 1 + 3 | A2, B1, A4 |
| **A2** (Video analysis → server) | 1 + 3 | A1, B1, A4 |
| **B1** (Persist BrandContext) | 3 | A1, A2, A4 |
| **A4** (Error boundaries) | 3 | Everything |

### Wave 2 — Boardroom + Reliability (after Wave 1)
| Item | Lane | Can parallel with |
|------|------|-------------------|
| **C1** (Async boardroom) | 2 | B3, C3 |
| **B3** (Video job polling) | 1 + 3 | C1, C3 |
| **C3** (JSON validation) | 2 | C1, B3 |

### Wave 3 — Polish + Testing (after Wave 2)
| Item | Lane | Can parallel with |
|------|------|-------------------|
| **D2** (Toast system) | 3 | E1, D1 |
| **D1** (Loading skeletons) | 3 | E1, D2 |
| **E1** (API tests) | 4 | D1, D2 |
| **C2** (Session history UI) | 2 | D1, D2, E1 |

### Wave 4 — Deployment + Cleanup (any time)
| Item | Lane | Can parallel with |
|------|------|-------------------|
| **F1** (Production validation) | 4 | F2, F3 |
| **F2** (Archive HANDOFFs) | Any | F1, F3 |
| **F3** (README rewrite) | Any | F1, F2 |
| **A5** (SQLite decision) | 4 | F-track |
| **B2** (Brand → Twilio) | 1 + 5 | F-track |
| **D3** (metadata.json) | 4 | Everything |
| **E2** (Component tests) | 4 | F-track |

---

## Track G — Multi-Project / Brand Profiles (upgrade.md)

### G1. Project Profiles System 🟢
- **Priority**: P0
- **Files**: `src/context/ProjectContext.tsx` (new), `src/pages/Setup.tsx`, `src/components/Layout.tsx`
- **Done**: Lane 3 — 2026-03-14. `ProjectContext.tsx` with full CRUD + localStorage. ProjectSwitcher dropdown in sidebar (desktop + mobile). Setup.tsx rewritten as per-project editor. Not browser-tested (localStorage persistence, project switching flow).

### G2. Project-Scoped Media 🟡
- **Priority**: P1
- **Files**: `server.ts` (manifest shape, history endpoint)
- **Lane 1 — started 2026-03-14**
- Added `projectId` to `JobManifest` interface. Updated `POST /api/media/image|video|voice` to accept + persist `projectId`. Updated `GET /api/media/history` to accept `?projectId=` filter.

---

## Track H — Bulk Media Generation Engine (upgrade.md)

### H1. Media Plan Builder 🟢
- **Priority**: P0
- **Files**: `src/pages/MediaPlan.tsx` (new), `src/App.tsx`
- **Done**: Lane 3 — 2026-03-14. Full MediaPlan page at `/plan`: natural language describe→suggest (AI or contextual mock fallback), drag-to-reorder via Reorder.Group, expandable per-item editor, Generate All button (calls `/api/media/batch` with graceful fallback), per-project localStorage. sessionStorage import from Research. Not browser-tested.

### H2. Batch Generation Queue 🟡
- **Priority**: P0
- **Files**: `server.ts` (batch endpoint + GenerationQueue class)
- **Lane 1 — started 2026-03-14**
- `POST /api/media/batch`, `GET /api/media/batch/:batchId`. `GenerationQueue` class with semaphore concurrency (3 image, 1 video, 2 voice) + exponential backoff on 429.

### H3. AI-Powered Prompt Expansion 🟡
- **Priority**: P1
- **Files**: `server.ts` (new prompt endpoint)
- **Lane 1 — started 2026-03-14**
- `POST /api/media/prompt/expand` — 3-step chain (expand→refine→generate-ready) via Gemini.

### H4. Prompt Variant Generation 🟡
- **Priority**: P2
- **Files**: `server.ts` (new prompt endpoint)
- **Lane 1 — started 2026-03-14**
- `POST /api/media/prompt/variants` — returns 3-5 stylistic prompt variants.

---

## Track I — Research + Rating (upgrade.md)

### I3. AI Media Scoring 🟡
- **Priority**: P1
- **Files**: `server.ts` (scoring endpoint)
- **Lane 1 — started 2026-03-14**
- `POST /api/media/score` — loads image via Gemini vision, scores on 5 dimensions (brandAlignment, purposeFit, technicalQuality, audienceMatch, uniqueness). Returns structured JSON + reasoning + suggestions.

### I4. Auto-Tagging 🟡
- **Priority**: P2
- **Files**: `server.ts` (auto-tag on job completion, persisted in manifest)
- **Lane 1 — started 2026-03-14**
- After image/voice generation completes, calls Gemini vision to produce content-type, style, platform tags. Tags stored in `manifest.tags`.

### I1. Research → Media Pipeline 🟢
- **Priority**: P1
- **Files**: `src/pages/Research.tsx`
- **Done**: Lane 3 — 2026-03-14. "Create media from this" button added to Research results. Opens modal with AI-suggested (or contextual mock) media plan items. Selected items stored in sessionStorage and user is navigated to /plan. Not browser-tested.

### I2. Boardroom → Media Brief Pipeline 🟢
- **Priority**: P2
- **What**: After a completed boardroom session, extract actionable media briefs from the convergence output. Includes a "Media Strategy" session template.
- **Deliverables**:
  - `boardroom.ts`: `extractMediaBriefs(sessionId)` — reads convergence output, calls Gemini to extract structured MediaPlanItem suggestions. `MEDIA_STRATEGY_TEMPLATE` constant with pre-configured seats.
  - `server.ts`: `POST /api/boardroom/sessions/:id/media-briefs` endpoint.
  - `Boardroom.tsx`: "Extract Media Briefs" button on completed sessions, media brief cards with type icons/tags, "Send to Plan" copy-to-clipboard per item, "Media Strategy" template button on session form.
- **Files**: `boardroom.ts`, `server.ts` (boardroom section), `src/pages/Boardroom.tsx`
- **Done**: Lane 2 — 2026-03-14. All deliverables implemented. Lint clean.**

---

## Track J — Presentation & Export (upgrade.md)

### J1. Collections 🟢
- **Priority**: P1
- **Files**: `src/pages/Collections.tsx` (new), `src/App.tsx`
- **Done**: Lane 3 — 2026-03-14. Collections page at `/collections`: per-project sidebar list, drag-to-reorder (Reorder.Group), library picker modal (fetches /api/media/history), delete collection, Present link. Not browser-tested (drag and library fetch).

### J2. Present mode 🟢
- **Priority**: P2
- **Files**: `src/pages/Present.tsx` (new), `src/App.tsx`
- **Done**: Lane 3 — 2026-03-14. Full-screen slideshow at `/present/:collectionId`. ← → keyboard nav, AnimatePresence slide transitions, dot nav strip, caption, exit button. Not browser-tested.

### J3. Bulk Export 🟡
- **Priority**: P2
- **Files**: `server.ts` (export endpoint)
- **Lane 1 — started 2026-03-14**
- `POST /api/collections/:id/export` — reads collection JSON from `jobs/collections/`, zips all referenced media files + `media_manifest.json` using `archiver`. Requires `archiver` npm package (requested from Lane 4 — document in board.md).
- **Dependency note**: Requires `archiver` npm package. Lane 4 must run `npm install archiver @types/archiver`. Until installed, endpoint returns 503 with a clear message.

---

## Quick Wins (upgrade.md) 🟢
- Count selector (1-4) on SocialMedia.tsx
- Platform presets dropdown on SocialMedia.tsx and VideoLab.tsx
- Text search/filter on Library.tsx
- Regenerate + Copy Prompt buttons on Library cards
- **Done**: Lane 3 — 2026-03-14. All 4 quick wins implemented. Not browser-tested.

---

## Current State Snapshot

- **Working**: Image gen, video gen (with background polling + live UI refresh), voice TTS, boardroom sessions (5-phase async protocol with session replay + media brief extraction), research (server-proxied), video analysis (server-proxied), live voice (client-side — known trade-off), Twilio SMS webhook, media library (search/filter, regen/copy, skeletons), mobile-responsive layout, error boundaries, brand context persisted, **ProjectContext** (multi-project switcher, per-project Setup), **MediaPlan** page, **Collections**, **Present** slideshow, toast notification system.
- **In Progress (Lane 1)**: G2, H2, H3, H4, I3, I4, J3 — all being implemented in server.ts.
- **Remaining / Not started**: A3 (VoiceLab WS proxy — accepted trade-off pending decision), E2 (frontend component smoke tests), D2 (toast system).
- **Lane 4 dependency**: `archiver` + `@types/archiver` must be added to package.json for J3 (bulk export). Lane 4 please run: `npm install archiver @types/archiver`.
- **Technical debt**: `better-sqlite3` unused — decision note at `docs/decisions/A5-better-sqlite3.md` recommends removal; awaiting explicit approval before touching `package.json`. `vite.config.ts` now allows `.trycloudflare.com` hosts (tunnelling convenience — review if not needed).
- **Untracked files that should be committed**: `src/components/ErrorBoundary.tsx`, `tests/`, `vitest.config.ts`, `docs/`, `WORKSPACE-NOTES.md`.

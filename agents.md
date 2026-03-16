# Gemlink Agents Map

> Purpose: standing context for any agent entering this repo. Read this FIRST before touching code.
> Repo: `/home/devpc/.openclaw/workspace/gemlink`
> Updated between sprints, NOT during them.
> When a bug or regression teaches us something, add it to the SOPs below so it never happens again.

---

## Tech Stack

- **Runtime**: Node.js + Express (server.ts)
- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Vanilla CSS (zinc-950 dark theme, indigo-600 accents, rounded-2xl cards)
- **Animation**: `motion/react` (AnimatePresence, motion.div)
- **Drag & Drop**: `@dnd-kit/core` + `@dnd-kit/sortable`
- **Icons**: `lucide-react`
- **Database**: SQLite via `better-sqlite3` (src/db.ts)
- **AI**: `@google/genai` SDK (Google Gemini API)
- **Tests**: Vitest + @testing-library/react
- **Build**: Vite (code-split, lazy routes)

---

## Repo Map

```
.
├── server.ts              # Express bootstrap + middleware wiring
├── routes/                # Route modules extracted from server.ts
│   ├── media.ts           # /api/media/* generation + history
│   ├── compose.ts         # /api/compose/* render + from-plan
│   ├── plan.ts            # /api/media/plan/* suggest + refine
│   ├── boardroom.ts       # /api/boardroom/* session management
│   ├── collections.ts     # /api/collections/* CRUD
│   └── capabilities.ts    # GET /api/capabilities (agent discovery)
├── middleware/             # Express middleware modules
│   ├── rateHeaders.ts     # X-RateLimit-* response headers
│   ├── agentIdentity.ts   # X-Agent-* request header parsing
│   ├── idempotency.ts     # Idempotency-Key deduplication
│   └── dryRun.ts          # X-Dry-Run mode validation
├── boardroom.ts           # Boardroom session engine
├── config.ts              # Centralized model + defaults config
├── compose.ts             # FFmpeg composition engine
├── src/
│   ├── App.tsx            # Routes (React.lazy)
│   ├── pages/             # All page components
│   │   ├── Compose.tsx    # Video composition editor
│   │   ├── MediaPlan.tsx  # AI media planner
│   │   ├── Presentation.tsx # Slideshow presentation mode
│   │   └── ...            # Library, Dashboard, Settings, etc.
│   ├── components/        # Shared UI components
│   │   ├── CaptionEditor.tsx    # Caption style/timing config
│   │   ├── MediaPickerPanel.tsx # Media library picker
│   │   ├── SlideTimeline.tsx    # Drag-and-drop slide ordering
│   │   ├── ComposePreview.tsx   # Live composition preview
│   │   ├── CommandPalette.tsx   # Cmd+K global search
│   │   └── ...            # ErrorBoundary, Breadcrumbs, etc.
│   ├── context/           # React contexts (Project, Toast)
│   └── index.css
├── tests/
│   ├── api/               # API integration tests
│   ├── components/        # Component smoke tests
│   └── helpers/           # Test utilities
├── data/
│   ├── style-db/          # Style database (JSON files)
│   ├── compose-templates/ # Compose template JSONs
│   └── fonts/             # Bundled TTF fonts for ASS captions
├── .env.local             # API key + model config (git-ignored)
├── board.md               # Active sprint plan
├── agents.md              # This file
├── check.md               # Known bugs & confusion inventory
├── medpln.md              # MediaPlan gap analysis & roadmap
├── maddypoints.md         # Agent endpoint improvement suggestions (25 items)
├── AGENTS.md              # Comprehensive agent guide (PR2)
├── settings.md            # Settings system design doc
├── editor.md              # Media editor feature spec (Tiers 1–8)
├── ux.md                  # UX gap inventory (597 lines)
└── boardinit.md           # How to set up board+agents in any repo
```

---

## Standard Operating Procedures (SOPs)

These are non-negotiable rules. Every agent follows them. When a bug teaches us a new rule, we add it here so it never happens again.

### SOP-1: No Hardcoded Model Names
**Learned from**: Sprint 3 → 403 errors from retired preview models, 9 different model strings across 31 locations.

- ❌ `model: "gemini-2.5-flash-preview-04-17"` — NEVER do this
- ✅ `model: models.text` — ALWAYS import from `config.ts`
- Server-side: `import { models } from "./config";`
- Client-side: `import.meta.env.VITE_MODEL_IMAGE || "gemini-2.5-flash-preview-image"`
- If you need a model and `config.ts` doesn't have a slot for it, ADD a slot — don't inline the string

### SOP-2: No Silent Fallbacks
**Learned from**: Sprint 3 → Quick Plan silently dropped mock data when the API call failed, hiding the real error.

- ❌ `catch { useMockData(); toast("it worked!", "info"); }` — NEVER swallow errors with fake success
- ✅ `catch (err) { toast(err.message, "error"); }` — ALWAYS surface the real error
- If an AI endpoint fails, show the user what went wrong (missing key, bad model, rate limit)
- Mock data is only acceptable in test files, never in production code paths

### SOP-3: Always Pass API Key in Fetch Calls
**Learned from**: Sprint 3 → `/plan/suggest` succeeded on server but client never sent the key, causing 500s.

- Every `fetch()` to an AI-powered endpoint MUST include:
  ```typescript
  body: JSON.stringify({
    ...payload,
    apiKey: import.meta.env.VITE_GEMINI_API_KEY || undefined,
  })
  ```
- Server-side: always use `requireApiKey(req.body.apiKey)` — never assume the env var is set
- If `apiKey` is missing, return `401 { error: "API key required" }`, not a 500

### SOP-4: Always Handle Non-OK Responses
**Learned from**: Sprint 3 → `throw new Error("unavailable")` threw away the actual server error message.

- ❌ `if (!res.ok) throw new Error("unavailable")` — throws away the real error
- ✅ Always read the error body:
  ```typescript
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Server error ${res.status}`);
  }
  ```
- This way toasts show "Model not found" instead of "unavailable"

### SOP-5: Config via Environment Variables
- Server-side config: `process.env.VARIABLE_NAME` with a fallback in `config.ts`
- Client-side config: `import.meta.env.VITE_VARIABLE_NAME` (Vite requires the `VITE_` prefix)
- Add new variables to both `.env.local` AND `.env.example`
- Never put secrets in `.env.example` — only placeholder values

### SOP-6: Consistent Error Responses
All server endpoints must return errors in this shape:
```json
{ "error": "Human-readable description of what went wrong" }
```
With proper HTTP status codes:
- `400` — bad input (missing fields, invalid values)
- `401` — missing or invalid API key
- `404` — resource not found
- `500` — unexpected server error
- `503` — dependency unavailable (FFmpeg not installed, etc.)

### SOP-7: Update Tests When Changing UI
**Learned from**: Sprint 3 → "Suggest Plan" button renamed to "Quick Plan" but tests still expected the old text.

- If you change a heading, button label, or any user-visible text → grep `tests/` for the old text
- If you add a new page → add a smoke test in `tests/components/`
- If you add a new endpoint → add validation tests in `tests/api/`
- If you rename or remove a component → update or remove its test

### SOP-8: No Duplicate Logic
- If a function exists in `server.ts` or a helper module, use it — don't write a second version
- If > 2 endpoints need the same parsing logic, extract to a helper function
- If > 2 pages need the same fetch pattern, extract to a shared hook
- Common culprits: JSON parsing, brand context building, manifest reading

### SOP-9: Console Logging with Prefixes
```typescript
// ✅ Grep-friendly, filterable
console.log("[batch] Rehydrated 5 batch state(s)");
console.error("[plan-generate] Outline scored 2.1/5 — refining...");

// ❌ Impossible to filter
console.log("done");
console.error(err);
```
Every `console.log/error` must have a `[section]` prefix.

### SOP-10: No Magic Numbers or Strings
```typescript
// ❌
if (attempts > 60) { ... }
const key = "gemlink-plans-" + projectId;

// ✅
const MAX_POLL_ATTEMPTS = serverConfig.maxVideoPollAttempts;
const PLANS_STORAGE_KEY = `gemlink-plans-${projectId}`;
```
Define constants at the top of the file or import from config.

### SOP-11: New Page Checklist
Every time you create a new page (`src/pages/NewPage.tsx`):
1. Create the page component with `motion.div` wrapper
2. Add lazy import in `App.tsx`: `const NewPage = lazy(() => import("./pages/NewPage"));`
3. Add `<Route>` inside the layout route
4. Add sidebar nav item in `Layout.tsx` with a `lucide-react` icon
5. Match the design system: zinc-950 bg, zinc-800 borders, indigo-600 accents, rounded-2xl cards

### SOP-12: New Endpoint Checklist
Every time you add a server endpoint:
1. Place it under the correct section comment in `server.ts`
2. Use `requireApiKey()` for any AI-calling endpoint
3. Return proper HTTP status codes (see SOP-6)
4. Use `config.models.*` for model selection (see SOP-1)
5. Add `[section]` prefix to all console log/error calls (see SOP-9)
6. Add validation tests in `tests/api/`

### SOP-13: Dependencies
- ❌ Never run `npm install <package>` without discussing it first
- ✅ Use what's already installed. Check `package.json` before adding anything.
- Currently installed: `motion/react`, `@dnd-kit/core`, `@dnd-kit/sortable`, `lucide-react`, `better-sqlite3`, `@google/genai`, `vitest`, `@testing-library/react`

### SOP-14: State Persistence Pattern
```typescript
// Always try/catch localStorage (can throw on quota exceeded)
try {
  localStorage.setItem(`gemlink-${feature}-${projectId}`, JSON.stringify(data));
} catch {
  console.error(`[${feature}] localStorage save failed — quota exceeded?`);
}
```
- Key format: `gemlink-<feature>-<projectId>`
- Cross-page data transfer: `sessionStorage` (ephemeral, cleared on tab close)
- Server-side persistence: `data/` directory for JSON, `jobs/` for media files

### SOP-15: Model Synchronization Issues
**Learned from**: Sprint 4.5 → Media generation failed because `MediaPlan.tsx` hardcoded fallback strings that conflicted with `Settings.tsx`, `data/settings.json`, and `config.ts`.
- ❌ Do not define a dictionary of fallback models inside feature components like `MediaPlan.tsx`.
- ✅ Rely entirely on the server's source of truth (`config.ts`) or properly pass down centralized variables from a context provider.
- If an API returns `404 NOT_FOUND` during model generation, it's almost always a desynchronization between a hardcoded frontend fallback and the backend's allowed models list.

### SOP-16: Board Overwritten Mid-Sprint
**Learned from**: Sprint 7 → While executing Sprint 7 Lane 2 and Lane 3, `board.md` was overwritten with Sprint 5 context by an external anomaly.
- ❌ Do not assume the board always retains your team's context if multiple external checkout events are happening.
- ✅ Always append your Execution Report to `board.md` and add a note to `agents.md` if you find the board was hijacked by a different sprint version. No pushing/pulling from git or using git checkout!

### SOP-17: Batch Field Name Mismatches
**Learned from**: Sprint 9 → `check.md` CHECK-001 (video `resolution` vs `size`), CHECK-002 (image `aspectRatio` hardcoded)
- ❌ `const { resolution } = body as any` — silently `undefined` if client sends `size`
- ✅ `const resolution = body.resolution ?? body.size` — accept both names
- When batch `runJob()` destructures fields, always check what the client actually sends vs what the handler reads
- Reference `check.md` for the full set of known field mismatches

### SOP-18: Client-Side Validation Before Fetch
**Learned from**: Sprint 9 → `check.md` CHECK-012 (merge with no audio → 400), CHECK-013 (captions with no text → 400)
- ❌ Send the request and let the server return 400, then show generic "not yet live" toast
- ✅ Validate required fields client-side BEFORE fetch — show a warning toast and return early
- Compose merge mode: require at least one audio track
- Compose captions mode: require non-empty caption text
- MediaPlan batch: require at least one draft item

### SOP-19: SessionStorage Handoff Must Be Read on Both Sides
**Learned from**: Sprint 10 prep → `auto-compose-groups` was written to sessionStorage by MediaPlan but never read by Compose.tsx. Users landed on an empty page.

- ❌ Write to `sessionStorage.setItem("my-key", ...)` in one page and assume the target page reads it
- ✅ Always verify the receiving page has a `useEffect` that reads AND clears the sessionStorage key
- Pattern: Writer sets key → Navigator navigates → Reader reads key in `useEffect([], [])` → Reader removes key
- If the reader doesn't exist yet, the handoff silently fails with zero errors

### SOP-20: Image vs Video Slides Need Different FFmpeg Filters
**Learned from**: Sprint 10 → `createSlideshow()` applied `tpad=stop_mode=clone` (image padding) to video inputs, producing frozen frames instead of playing the video.

- ❌ `filterParts.push(\`[\${i}:v]scale=...,tpad=stop_mode=clone:stop_duration=\${dur}[v\${i}]\`)` for all slides
- ✅ Branch on `isImageFile(slide.imagePath)`:
  - Images: `scale + tpad + optional zoompan/kenBurns`
  - Videos: `scale + trim=duration=X,setpts=PTS-STARTPTS` (no tpad, no kenBurns)
- Also: Don't use `-stream_loop -1` for video inputs — only for images needing extension

### SOP-21: Default Aspect Ratio Must Be 9:16
**Learned from**: Sprint 10 post-check — every compose default was 16:9 but the primary use case (TikTok, Reels, Shorts) is vertical.

- ❌ `aspectRatio: "16:9"` as default in `defaultProject()`, server fallbacks, or preview components
- ✅ `aspectRatio: "9:16"` as default everywhere — Compose, server compose endpoint, ComposePreview, quick-compose shorthand
- 16:9 remains selectable but is never the default. 9:16 is listed first in all selector UIs.

### SOP-22: Slideshows Must Support Captions in One Render
**Learned from**: Sprint 10 post-check — `type: "slideshow"` ignores `body.captions` entirely. Captions only burn in `type: "caption"` mode, which requires a pre-existing video.

- ❌ Slideshow handler skips captions, user must render slideshow then render captions as a separate step
- ✅ If `body.captions` is present on a slideshow or merge render, do a 2-pass: render video → burn captions onto it
- Same applies to merge mode

### SOP-23: Don't Auto-Call AI For Scoring/Rating
**Learned from**: Sprint 11 review — `autoScoreCompletedBatch()` was calling Gemini (including base64 image uploads) after every batch completion. This burned API credits with no clear user value.

- ❌ Auto-calling Gemini to "rate" generated media on every batch completion
- ✅ Scoring/rating should be opt-in (user clicks "Score" or enables it in Settings) — never fire-and-forget
- The auto-score function still exists but is disabled. Manual scoring via `POST /api/media/score` still works.
- If you re-enable, gate it behind `settings.features.autoScore` and add a cost warning.

### SOP-24: Agents Must Update Board Status
**Learned from**: Sprint 11 — All Lane 1 and Lane 2 code was implemented but agents never marked W items ⬜→✅ on board.md. The board showed work as "Not started" when it was actually done.

- ❌ Implement the code and move on without updating board.md
- ✅ After completing each W item: mark it ✅, add a `- **Done**: ...` summary line
- The handoff protocol is not optional — it's how other agents (and humans) know what's done

---

## Commands

```bash
# Dev server (frontend + API)
npm run dev

# Type check — MUST pass before marking any item ✅
npx tsc --noEmit

# Run all tests — MUST pass before marking any item ✅
npx vitest run

# Build production bundle
npm run build

# CI pipeline
npm run ci

# Check FFmpeg
ffmpeg -version && ffprobe -version

# Find hardcoded model strings (should return zero results)
grep -rn "gemini-.*preview-04\|gemini-3-flash\|gemini-3.1-pro\|veo-3.1-fast" server.ts boardroom.ts
```

---

## Key Architecture Notes

- **Compose.tsx** uses adaptive mode (`deriveMode()`) — no explicit tabs. Infers slideshow/merge/caption from project state.
- **compose.ts** has `createSlideshow()`, `mergeVideoAudio()`, `burnCaptions()`, `generateASS()`, `generateWordLevelASS()`. Supports caption animations (fade/pop/blur), video slide trimming, and `captionSource: "voice"`.
- **server.ts** mounts route modules from `routes/`. Has `/api/media/*`, `/api/media/plan/*`, `/api/compose/*`, `/api/boardroom/*`, `/api/collections/*`, and `/api/capabilities`.
- **MediaPickerPanel** exports the `MediaJob` interface (with duration, width, height, aspectRatio) used by Compose and Library.
- **CaptionEditor** manages caption style, timing, position, animation, font, and text — its config maps directly to ASS generation params. Supports voiceover badge + auto-fill.
- **Auto-compose flow**: MediaPlan → POST auto-compose → groups → sessionStorage → Compose reads on mount and pre-fills (`useEffect` reads + clears the key per SOP-19).
- **Quick compose**: `type: "quick"` shorthand expands `slideJobIds` + `captions: "auto"` + `aspectRatio: "auto"` server-side.

---

## Common Pitfalls

1. **Model 403 errors** — a model name was retired. Check `config.ts` and `.env.local` (SOP-1)
2. **Silent mock fallback** — catch block returns fake data. Show real errors (SOP-2)
3. **Missing apiKey in fetch** — server returns 500. Always send the key (SOP-3)
4. **Tests fail after UI changes** — update test assertions to match new text (SOP-7)
5. **Vite HMR crash** — syntax error in `.tsx`. Check terminal for file:line
6. **TTS returns PCM** — needs WAV header conversion via `pcm16ToWav()` in server.ts
7. **Motion mock missing** — component tests crash without `vi.mock("motion/react", ...)` block
8. **Import cycles** — `config.ts` should have zero imports from `server.ts` or route modules
9. **localStorage full** — plans with many items exceed quota. Always try/catch (SOP-14)
10. **Route module imports** — Each route module imports `helpers` from server.ts. If you move a helper, re-export from a shared `helpers.ts` to avoid breaking other routes.

---

## Sprint Status

| Sprint | Theme | Tests | Status |
|--------|-------|-------|--------|
| Sprint 1 | Core architecture, security, UX polish | 31 | ✅ |
| Sprint 2 | Media pipeline, batch gen, collections, SQLite | 78 | ✅ |
| Sprint 3 | Multi-stage planning, strategy artifacts, multi-plan UI, CI | 114 | ✅ |
| Sprint 5 | Enhanced Editor (Tier 2) — trim, watermarks, multi-track audio | 199 | ✅ |
| Sprint 6 | Music generation — Lyria WebSocket streaming | 199 | ✅ |
| Sprint 7 | Agent ergonomics — rate limits, idempotency, dry-run, job queue | 200 | ✅ |
| Sprint 8 | Model fixes + UX Polish — progress bar, duplicate, single gen, collect approved | 200 | ✅ |
| Sprint 9 | Bug fixes, editor polish, MediaPlan UX, presentation, infrastructure | 224 | ✅ |
| Sprint 10 | Compose UX overhaul, agent pipeline, planner intelligence | 224 | ✅ |
| Sprint 11 | Make Compose Functional (9:16, 2-pass captions, preview sync, Library aspect fix) | 224 | ✅ |

Current test count: **224 passing** | Build: clean | TSC: clean

---

## Lessons Learned (Changelog)

- **2026-03-15**: Sprint 11 complete — all 5 lanes ✅. Disabled auto-scoring (SOP-23). Added SOP-24 (agents must update board status). Agents implemented Lane 1+2 code but never marked items done — caught in review.
- **2026-03-15**: Sprint 11 hijacked/reverted mid-execution. Restored Lane 4 and Lane 5 sections and marked items ✅. Added agent infrastructure (capabilities, idempotency, dry-run, rate-headers).
- **2026-03-15**: Post-Sprint 10 audit found 6 critical compose bugs. Added SOP-21 (default 9:16), SOP-22 (slideshow+captions 2-pass). Sprint 11 = fix these.
- **2026-03-15**: Sprint 10 complete — adaptive compose, agent pipeline (from-plan, refine, thinking depth), FFmpeg video slide fix, visual caption cards, voiceover auto-fill.
- **2026-03-15**: Added SOP-19 (sessionStorage handoff) — auto-compose wrote to sessionStorage but Compose never read it
- **2026-03-15**: Added SOP-20 (image vs video FFmpeg) — video slides got image filters (tpad) producing frozen frames
- **2026-03-15**: Sprint 9 complete — 224 tests, all 5 lanes finished. Added Presentation mode, command palette, error boundaries.
- **2026-03-15**: Added SOP-17 (batch field mismatches) after `check.md` cataloged CHECK-001/002
- **2026-03-15**: Added SOP-18 (client-side validation) after `check.md` cataloged CHECK-012/013
- **2026-03-15**: Merged PR1 (MediaPlan improvements) and PR2 (check.md + AGENTS.md rewrite)
- **2026-03-15**: Added SOP-16 (board overwrite protection) after Sprint 7 board hijack
- **2026-03-15**: Added SOP-15 (model sync) after model 404s from desynchronized fallbacks

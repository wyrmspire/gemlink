# Gemlink — Comprehensive Agent Operating Manual

> **Read this entire file before touching any code.**
> This file is the single authoritative reference for all agents working on Gemlink.
> It combines lane ownership, code connections, line-level references, standard operating procedures, and context preservation instructions.
>
> Companion files:
> - `agents.md` — extended SOPs and common pitfalls (read alongside this file)
> - `check.md` — known bugs and confusing patterns (read before touching Compose or MediaPlan)
> - `board.md` — active sprint plan and task ownership

---

## Project Identity

Gemlink is a React + Express + Vite (TypeScript) agentic workspace for AI-powered brand marketing. It uses Gemini APIs for media generation (image, video, voice), multi-seat boardroom discussions, research, and a Twilio SMS sales agent. Originally scaffolded from Google AI Studio.

**Stack**: React 19, React Router 7, Tailwind CSS v4, Motion, Lucide, Express 4, tsx, @google/genai, Twilio, better-sqlite3 (active — SQLite via `src/db.ts`, database at `data/gemlink.db`).

---

## Agent Lanes

Each lane defines a clear area of responsibility. An agent working within a lane owns the files listed and must not modify files outside the lane without explicit coordination.

### Lane 1 — Media Pipeline (Server)

**Owns**: `server.ts` (media endpoints only: `/api/media/*`, `/api/health`, static `/jobs` serving), `jobs/` directory structure, `src/db.ts` (SQLite queries for media jobs and compose jobs), `compose.ts` (FFmpeg engine).

**Scope**: Image/video/voice/music generation endpoints, job manifest lifecycle, background video polling, media history collection, file persistence under `jobs/` (including `images/`, `videos/`, `voice/`, `music/`, `compose/`, `batches/`), SQLite media job and compose job records.

**Boundaries**:
- Do NOT modify boardroom endpoints or `boardroom.ts`.
- Do NOT modify frontend pages — coordinate with Lane 3 if API shape changes.
- Do NOT touch Twilio endpoint (`/api/twilio/sms`).
- May add new `/api/media/*` endpoints.

**Key constraints**:
- All media ops must create a `manifest.json` with the standard `JobManifest` shape before returning.
- Background async work (video polling) must catch all errors and write failure state to manifest.
- Never expose API keys in responses.

---

### Lane 2 — Boardroom Engine

**Owns**: `boardroom.ts`, `src/pages/Boardroom.tsx`.

**Scope**: Session creation, multi-phase protocol orchestration, objective anchoring, state snapshots, seat prompting, final synthesis, boardroom API endpoints in `server.ts` (`/api/boardroom/*`), boardroom UI.

**Boundaries**:
- Do NOT modify media endpoints in `server.ts`.
- Do NOT modify shared components (`Layout.tsx`, `ApiKeyGuard.tsx`) without coordinating with Lane 4.
- May add new `/api/boardroom/*` endpoints to `server.ts` (boardroom section only).
- May add new types/interfaces to `boardroom.ts`.

**Key constraints**:
- Sessions persist as JSON in `jobs/boardroom/`.
- The 5-phase protocol (`opening_brief → first_pass → challenge → refinement → convergence`) is the canonical flow. Do not remove phases without explicit approval.
- Seat prompts must always reference: objective anchor, room state, prior turns, and current phase.
- Treat rough names/examples as provisional unless `namingExplicitlyRequested` is true.
- Keep `internalNotes` short and serialization-safe.

---

### Lane 3 — Frontend / UX

**Owns**: `src/pages/` (all pages), `src/components/`, `src/context/`, `src/index.css`, `src/main.tsx`, `src/App.tsx`, `index.html`.

**Scope**: All React components, routing, layout, styling, client-side state, brand context, API key guard.

**Boundaries**:
- Do NOT modify `server.ts` or `boardroom.ts` directly — request API changes from Lane 1 or Lane 2.
- May add new pages, components, and context providers.
- May add new routes to `App.tsx`.

**Key constraints**:
- Mobile-first: all layouts must work at 375px width minimum.
- Use the existing design system: zinc-950 backgrounds, zinc-800 borders, indigo-500 accents, Motion for animations.
- All pages use `motion/react` entry animations (`opacity: 0, y: 20 → opacity: 1, y: 0`).
- Never instantiate `GoogleGenAI` directly in frontend pages for generation tasks — route through server APIs. (Research and VideoLab analysis currently violate this; see board.md.)

---

### Lane 4 — Infrastructure / Config / DX

**Owns**: `vite.config.ts`, `tsconfig.json`, `package.json`, `.env.example`, `.env.local`, `.gitignore`, `metadata.json`, `WORKSPACE-NOTES.md`.

**Scope**: Build config, TypeScript config, dependency management, environment variables, dev server setup, deployment configuration.

**Boundaries**:
- Do NOT modify application logic in pages/components/server.
- May update `server.ts` only for Express/Vite integration changes (the startup/middleware section).
- Coordinate with all lanes before changing `tsconfig.json` compiler options.

**Key constraints**:
- `.env.local` is gitignored and contains real secrets — never commit it.
- Vite HMR can be disabled via `DISABLE_HMR=true` env var (AI Studio compatibility).
- The `@` path alias resolves to project root.

---

### Lane 5 — Twilio / Sales Agent

**Owns**: `src/pages/SalesAgent.tsx`, the `/api/twilio/sms` endpoint in `server.ts`.

**Scope**: SMS webhook handling, Twilio TwiML responses, sales agent configuration UI.

**Boundaries**:
- Do NOT modify other endpoints in `server.ts`.
- Coordinate with Lane 3 for shared UI changes.

**Key constraints**:
- The SMS endpoint must return valid TwiML XML (`text/xml` content type).
- Must always catch errors and return a fallback TwiML response.
- Currently does NOT use brand context from BrandContext — uses hardcoded prompt. This is a known gap.

---

## Known Architectural Issues (for all lanes)

Full details in `check.md`. Summary of open issues:

- **Client-side Gemini calls**: `Research.tsx` and `VideoLab.tsx` (analysis) call Gemini directly from the browser, exposing the API key. These should be migrated to server endpoints (Lane 1 + Lane 3 coordination). — `check.md` CHECK-019
- **BrandContext not persisted**: Brand settings are lost on page refresh. Needs localStorage or server persistence. — `check.md` CHECK-018
- **No error boundaries**: A crash in any page takes down the whole app.
- **Batch generation field mismatches**: Video `resolution` vs `size`, image `aspectRatio` hardcoded to `"1:1"` — `check.md` CHECK-001, CHECK-002
- **`plan/suggest` drops `music` type**: Sanitizer doesn't allow music suggestions — `check.md` CHECK-003
- **Dead `audioJobId` field in Compose**: Never set by any UI, never read in render — `check.md` CHECK-011
- **Misleading error toasts in MediaPlan + Compose**: Catch blocks hide real server errors — `check.md` CHECK-005

---

## Code Connection Map

> Use this section to find where specific features are implemented. Every major cross-cutting path is traced from UI to server to storage.

### Path 1: Individual Image Generation (SocialMedia Lab → server → jobs/)

```
src/pages/SocialMedia.tsx
  handleGenerate()
    → fetch("POST /api/media/image")
      body: { prompt, model, aspectRatio, size, count, negativePrompt, brandContext, projectId, apiKey }
    server.ts:525 — POST /api/media/image
      requireApiKey()
      createJobId() → getJobDir("image", jobId) → writeManifest()
      ai.models.generateContent({ model, contents, config.imageConfig.aspectRatio, imageSize })
      patchManifest(status: "completed", outputs: ["/jobs/images/{jobId}/output_0.png"])
      autoTagMedia(fire-and-forget)
    jobs/images/{jobId}/manifest.json + output_0.png
```

### Path 2: Batch Generation (MediaPlan → server → jobs/)

```
src/pages/MediaPlan.tsx
  handleGenerateAll()                                    ← CHECK-004: no apiKey sent
    → fetch("POST /api/media/batch")
      body: { items: [{ type, body: { prompt, ...generationConfig } }] }
                                                         ← CHECK-001: body.size not body.resolution for video
                                                         ← CHECK-017: no brandContext
    server.ts:1602 — POST /api/media/batch
      requireApiKey(apiKey)
      batchStore.set(batchId, state)
      generationQueue.enqueueOne(batchId, i, item, key)
        → runJob(item, apiKey)
          if image: server.ts:1342 — hardcodes aspectRatio:"1:1" ← CHECK-002
          if voice: server.ts:1380 — reads text||prompt, voice||"Kore"
          if video: server.ts:1422 — reads resolution ← CHECK-001 resolution undefined
          if music: server.ts:1459 — reads prompt, model, duration
    batchId returned immediately (202)

  Polling useEffect (MediaPlan.tsx:663)                  ← CHECK-008: stale closure risk
    → fetch("GET /api/media/batch/{batchId}")
      server.ts:1636 — returns statuses[], jobIds[], errors[]
    → saveItems() updates item status: draft→generating→review|rejected
```

### Path 3: Compose Render (Compose.tsx → server → compose.ts → FFmpeg → jobs/compose/)

```
src/pages/Compose.tsx
  handleRender()                                         ← CHECK-010: no apiKey sent
    Builds body: { type, slides?, audioTracks?, videoJobId?, captions?, output, watermarkJobId? }
                                                         ← CHECK-012: merge with no audio → 400
                                                         ← CHECK-013: caption with no text → 400
    → fetch("POST /api/media/compose")
    server.ts:2798 — POST /api/media/compose
      compose.waitForInit()
      compose.isFFmpegAvailable() — returns 503 if no FFmpeg
      Validation: type in ["merge","slideshow","caption"], slides[], videoJobId, captions.text
      composeJobQueries.insert(jobRow)       — SQLite record in src/db.ts:composeJobQueries
      Resolves audio tracks: jobId → /jobs/{type}/{id}/output.wav
      Resolves slide paths: jobId → /jobs/images/{id}/output_0.png
      Resolves watermark: jobId → /jobs/images/{id}/output_0.png
      compose.ts: createSlideshow() | mergeVideoAudio() | burnCaptions()
        → FFmpeg subprocess
      composeJobQueries.updateStatus({id, status:"completed", outputs:["/jobs/compose/{id}/output.mp4"]})
    Returns: { composeId, status:"processing" }        — client polls /api/media/history for status

Audio URL resolution (used for in-page preview):
  resolveAudioUrl(jobId)                                ← CHECK-014: fetches all history just for one job
    → fetch("GET /api/media/history")
    → finds job by ID → reads outputs[0]
```

### Path 4: Plan Suggest (MediaPlan → server → AI → MediaPlan)

```
src/pages/MediaPlan.tsx
  handleSuggest()
    → fetch("POST /api/media/plan/suggest")
      body: { description, apiKey, projectContext: { brandName, ... } }
    server.ts:1659 — POST /api/media/plan/suggest
      ai.models.generateContent({ model: getMergedModels().text, ... })
      sanitised items: type forced to ["image","video","voice"] only ← CHECK-003: music dropped
      Returns: { items: [{ id, type, label, purpose, promptTemplate, status:"draft", ... }] }
                                                        ← CHECK-006: no generationConfig in response
    handleSuggest():
      items.map(x => newItem(x))
        newItem() always uses defaultConfig() ← CHECK-006: image defaults for all types
        newItem() always uses VITE_MODEL_IMAGE ← CHECK-022
      saveItems() → localStorage
```

### Path 5: Voice Generation (VoiceLab Lab path vs Batch path)

```
INDIVIDUAL LAB (works):
  src/pages/VoiceLab.tsx
    → fetch("POST /api/media/voice")
      body: { text, voice, brandContext, projectId, apiKey }
    server.ts:757 — reads text directly

BATCH path (was broken, now fixed in Sprint 8):
  src/pages/MediaPlan.tsx handleGenerateAll()
    body: { type:"voice", body: { prompt: i.promptTemplate, voice, ...rest } }
    server.ts:1380 batch voice handler
      const actualText = text || prompt     ← FIXED: accepts both text and prompt
      const actualVoice = voice || "Kore"   ← FIXED: default voice
```

### Path 6: Boardroom → MediaPlan Handoff

```
src/pages/MediaPlan.tsx
  handleBoardroomPlan()
    sessionStorage.setItem("boardroom-plan-handoff", JSON.stringify({
      templateId: "media-strategy",
      topic, context, returnTo: "plan"
    }))
    navigate("/boardroom")

src/pages/Boardroom.tsx (on mount)
  sessionStorage.getItem("boardroom-plan-handoff")
  → pre-fills discussion topic
  → After session ends, writes media items to:
    sessionStorage.setItem("media-plan-import", JSON.stringify(items))
    navigate("/plan")

src/pages/MediaPlan.tsx (on mount)
  sessionStorage.getItem("media-plan-import") || "pending-media-items"
  → items.map(x => newItem(x))
  → saveItems() → adds to active plan
```

### Path 7: "Send to Compose" (Library → Compose)

```
src/pages/Library.tsx
  handleSendToCompose(job)
    sessionStorage.setItem("compose-send-item", JSON.stringify(job))
    navigate("/compose")

src/pages/Compose.tsx (on mount)
  sessionStorage.getItem("compose-send-item")
  → if voice: patch({ voiceJobId: job.id })
  → if music: patch({ musicJobId: job.id })
  → else: addSlideFromJob(job) → patch({ slides: [..., newSlide] })
```

### Path 8: Media History + SQLite

```
server.ts:~1050 — GET /api/media/history
  src/db.ts: mediaJobQueries.getAll(type?, projectId?)
  Returns: JobManifest[]
  Jobs are indexed by type in db.ts mediaJobQueries

src/db.ts (Lane 1 owns):
  mediaJobQueries       — images, videos, voice, music jobs (CRUD by jobId and type)
  collectionQueries     — collections (groups of jobs)
  collectionItemQueries — collection ↔ job many-to-many
  strategyArtifactQueries — research/boardroom artifacts (pinned to projects)
  composeJobQueries     — compose render jobs (insert on start, update on complete)
  idempotencyQueries    — dedup cache by x-idempotency-key header

Note: better-sqlite3 IS in use via src/db.ts. Database file is at data/gemlink.db
(created on first run). The db.ts module is imported by server.ts at startup.
```

### Path 9: Config → Server → Client Model Sync

```
config.ts
  models.image   ← process.env.MODEL_IMAGE    || "gemini-3-pro-image-preview"
  models.video   ← process.env.MODEL_VIDEO    || "veo-3.1-generate-preview"
  models.tts     ← process.env.MODEL_TTS      || "gemini-2.5-flash-preview-tts"
  models.music   ← process.env.MODEL_MUSIC    || "lyria-realtime-exp"
  models.text    ← process.env.MODEL_TEXT      || "gemini-2.5-flash"
  models.boardroom ← process.env.MODEL_BOARDROOM || "gemini-2.5-pro"

server.ts:
  getMergedModels()  — merges config.ts defaults with data/settings.json overrides
  Used in every generation handler

src/pages/MediaPlan.tsx MODELS constant:
  import.meta.env.VITE_MODEL_IMAGE || "gemini-3-pro-image-preview"  ← CHECK-021: mixes all types
  These must stay in sync with config.ts values
  SOP-15: never add fallback model strings in components, use env vars only
```

---

## Key File Reference (with line anchors)

> Line numbers are approximate — always search by function/comment name to find exact locations.

| Feature | File | Approx. Line | Search For |
|---------|------|-------------|------------|
| Batch endpoint | `server.ts` | 1602 | `api.post("/media/batch"` |
| Batch image handler | `server.ts` | 1342 | `if (type === "image")` inside `runJob` |
| Batch voice handler | `server.ts` | 1380 | `if (type === "voice")` inside `runJob` |
| Batch video handler | `server.ts` | 1422 | `if (type === "video")` inside `runJob` |
| Batch music handler | `server.ts` | 1459 | `if (type === "music")` inside `runJob` |
| Batch poll endpoint | `server.ts` | 1636 | `api.get("/media/batch/:batchId"` |
| Plan suggest endpoint | `server.ts` | 1659 | `api.post("/media/plan/suggest"` |
| Plan suggest sanitizer | `server.ts` | 1702 | `["image", "video", "voice"].includes` |
| Plan generate endpoint | `server.ts` | ~1730 | `api.post("/media/plan/generate"` |
| Compose endpoint | `server.ts` | 2798 | `api.post("/media/compose"` |
| requireApiKey function | `server.ts` | 105 | `function requireApiKey` |
| getMergedModels | `server.ts` | ~160 | `function getMergedModels` |
| patchManifest | `server.ts` | ~200 | `async function patchManifest` |
| writeManifest | `server.ts` | ~180 | `async function writeManifest` |
| autoTagMedia | `server.ts` | ~350 | `async function autoTagMedia` |
| GenerationQueue class | `server.ts` | ~1260 | `class GenerationQueue` |
| handleGenerateAll | `src/pages/MediaPlan.tsx` | 747 | `const handleGenerateAll` |
| handleSuggest | `src/pages/MediaPlan.tsx` | 625 | `const handleSuggest` |
| handleBoardroomPlan | `src/pages/MediaPlan.tsx` | 717 | `const handleBoardroomPlan` |
| Batch polling useEffect | `src/pages/MediaPlan.tsx` | 663 | `// Polling for batch generation` |
| defaultConfig | `src/pages/MediaPlan.tsx` | 115 | `function defaultConfig` |
| newItem | `src/pages/MediaPlan.tsx` | 127 | `function newItem` |
| handleRender | `src/pages/Compose.tsx` | 385 | `async function handleRender` |
| handleMediaSelect | `src/pages/Compose.tsx` | 314 | `function handleMediaSelect` |
| resolveAudioUrl | `src/pages/Compose.tsx` | 225 | `const resolveAudioUrl` |
| ComposeProject type | `src/pages/Compose.tsx` | 41 | `export interface ComposeProject` |
| JobManifest type | `server.ts` | ~55 | `export interface JobManifest` |
| MediaType type | `server.ts` | 47 | `export type MediaType` |
| BrandContext | `src/context/BrandContext.tsx` | 1 | full file |
| ProjectContext | `src/context/ProjectContext.tsx` | 1 | full file |
| DB queries | `src/db.ts` | 1 | full file |
| Model config | `config.ts` | 1 | full file |
| Compose engine | `compose.ts` | 1 | full file |
| Boardroom engine | `boardroom.ts` | 1 | full file |

---

## Context Capture Instructions (CCI)

> CCI sections tell agents exactly what to snapshot before starting and what to verify before finishing.
> These are anti-hallucination guards — the most common errors happen when agents assume state rather than reading it.

### CCI-1: Before any `server.ts` edit

```
MUST READ before editing:
1. grep "getMergedModels\|requireApiKey" server.ts — understand these helpers
2. Check the exact line range you will edit (use grep to find the function)
3. Read the full function body of any function you will modify
4. Check if the function you're changing is called elsewhere: grep -n "functionName" server.ts
5. Run: npx tsc --noEmit — record the BEFORE output; must still be clean AFTER your change
```

### CCI-2: Before any `MediaPlan.tsx` edit

```
MUST READ before editing:
1. Read check.md Section 1 (all CHECK-001 through CHECK-022 items)
2. Understand GenerationConfig type (src/pages/MediaPlan.tsx ~line 34)
3. Understand how handleGenerateAll builds the batch body (line ~757)
4. Understand defaultConfig() and newItem() — they affect all item creation
5. Note: MODELS array mixes image/video/voice/music models (CHECK-021)
6. Note: video items need "resolution" not "size" (CHECK-001)
```

### CCI-3: Before any `Compose.tsx` edit

```
MUST READ before editing:
1. Read check.md Section 2 (CHECK-010 through CHECK-024)
2. Understand ComposeProject type (line ~41) — note dead audioJobId field
3. Understand pickerTarget state type (line ~216) — "audio" target is dead (CHECK-011)
4. Understand handleMediaSelect() logic (line ~314) — CHECK-024 slideshow mode bug
5. Understand handleRender() body construction (line ~385)
6. The compose endpoint requires: type, slides[] OR videoJobId, audioTracks for merge
```

### CCI-4: Before any batch-related fix

```
Fields that batch handlers read (server.ts runJob function):
  image:  prompt, model, size, aspectRatio (⚠ CHECK-002: currently hardcoded "1:1"), brandContext, projectId
  video:  prompt, model, resolution (⚠ CHECK-001: MediaPlan sends "size" not "resolution"), aspectRatio, brandContext, projectId
  voice:  text (or prompt), voice, brandContext, projectId
  music:  prompt, model, duration, brandContext, projectId

Fields that handleGenerateAll sends (MediaPlan.tsx):
  { prompt: i.promptTemplate, ...i.generationConfig }
  generationConfig has: model, size, aspectRatio, count, negativePrompt, voice, duration
  MISMATCH: sends "size" but video handler reads "resolution" (CHECK-001)
  BUG: batch image handler ignores "aspectRatio" from body, hardcodes "1:1" (CHECK-002)
  MISSING: no apiKey (CHECK-004), no brandContext (CHECK-017)
```

### CCI-5: Before any new page or endpoint

```
New page checklist:
1. Create src/pages/NewPage.tsx with motion.div wrapper + entry animation
2. Add lazy import in App.tsx: const NewPage = lazy(() => import("./pages/NewPage"))
3. Add <Route> inside the layout route in App.tsx
4. Add sidebar nav item in Layout.tsx with lucide-react icon
5. Add tool card in Dashboard.tsx tools[] array
6. Add smoke test in tests/components/

New endpoint checklist:
1. Place under correct section comment in server.ts
2. Use requireApiKey() for any AI-calling endpoint
3. Use getMergedModels().{type} for model selection (never hardcode)
4. Return { error: "..." } with correct HTTP status code
5. Add [section] prefix to all console.log/error calls
6. Add validation tests in tests/api/
```

### CCI-6: Before marking any sprint item ✅

```
Must verify:
1. npx tsc --noEmit — zero type errors
2. npx vitest run — all tests pass (current baseline: 200)
3. The specific check.md items related to your change — mark ✅ if fixed
4. Update board.md — mark item done, add fix location
5. If API shape changed: notify other lanes in board.md
```

### CCI-7: Context snapshot for multi-session work

```
When starting a new session, check these values immediately:
1. cat board.md | head -50           — active sprint and lane assignments
2. cat check.md | grep "⬜"          — open bugs
3. npx tsc --noEmit                   — baseline type check
4. npx vitest run                     — baseline test count
5. git log --oneline -5               — what changed recently

When ending a session, record in board.md:
1. What you changed (file:line references)
2. What you tested vs assumed
3. What check.md items were fixed (update status to ✅)
4. Any new bugs discovered (add to check.md immediately)
```

---

## Standard Operating Procedures (SOPs)

> Full SOPs are in `agents.md`. This section lists the most commonly violated rules.

### SOP-1: No Hardcoded Model Names
- ❌ `model: "gemini-2.5-flash-preview-04-17"`
- ✅ `model: models.text` (server-side) or `import.meta.env.VITE_MODEL_IMAGE` (client-side)
- `config.ts` is the single source of truth for all model names

### SOP-2: No Silent Fallbacks
- ❌ `catch { useMockData(); toast("it worked!") }`
- ✅ `catch (err) { toast(err.message, "error") }`
- Check `check.md` CHECK-005 — this is already violated in MediaPlan and Compose

### SOP-3: Always Pass `apiKey` in Fetch Calls
- Every AI endpoint fetch must include `apiKey: import.meta.env.VITE_GEMINI_API_KEY || undefined`
- Check `check.md` CHECK-004 and CHECK-010 — currently missing in batch and compose

### SOP-4: Always Handle Non-OK Responses
```typescript
if (!res.ok) {
  const err = await res.json().catch(() => ({}));
  throw new Error(err.error || `Server error ${res.status}`);
}
```

### SOP-5: Use Config Variables for Everything
- Models: `config.ts` → `getMergedModels()` (server) or `import.meta.env.VITE_MODEL_*` (client)
- Add env vars to both `.env.local` and `.env.example`

### SOP-14: State Persistence Pattern
```typescript
try {
  localStorage.setItem(`gemlink-${feature}-${projectId}`, JSON.stringify(data));
} catch {
  console.error(`[${feature}] localStorage save failed — quota exceeded?`);
}
```
- Key format: `gemlink-<feature>-<projectId>`
- Cross-page handoff: `sessionStorage` (cleared on tab close)

---

## Handoff Protocol

When completing work, an agent must:

1. **Update `board.md`** — mark completed items, add new discoveries.
2. **Update `check.md`** — mark fixed items ✅, add any new bugs discovered.
3. **Verify build** — run `npm run lint` (typecheck) and `npm run build` before handing off.
4. **Log what was NOT tested** — be honest about what was verified vs. assumed.
5. **Do not create new HANDOFF-*.md files** — update `board.md` instead. The existing HANDOFF docs are historical and should not be extended.
6. **Summarize changes in commit message** — include lane number and scope.

---

## Collision Avoidance Rules

1. **`server.ts` is a shared file.** It has three logical sections:
   - Media endpoints (Lane 1): lines roughly covering `/api/media/*` routes.
   - Boardroom endpoints (Lane 2): lines covering `/api/boardroom/*` routes.
   - Twilio endpoint (Lane 5): the `/api/twilio/sms` handler.
   - Infrastructure (Lane 4): Express setup, Vite integration, static file serving, server startup.
   
   **Only edit your section.** If you need to touch shared infrastructure (middleware, startup), coordinate with Lane 4.

2. **`package.json` changes** require Lane 4 approval. If you need a new dependency, document it in board.md and let Lane 4 add it.

3. **Never modify two lanes' files in one commit** unless you are explicitly doing cross-lane integration work with approval.

4. **BrandContext is shared state.** If you change its shape (`BrandContextType`), notify Lane 1 (server may need to accept new fields) and Lane 5 (sales agent uses brand data).

5. **Route additions** — if you add a new page to `App.tsx`, also add it to the `navigation` array in `Layout.tsx` and the `tools` array in `Dashboard.tsx`.

---

## File Ownership Quick Reference

| File / Directory | Lane | Notes |
|---|---|---|
| `server.ts` | Shared (1, 2, 5) | Sections are owned per-lane. Coordinate edits. |
| `boardroom.ts` | 2 | Single owner. |
| `src/pages/Boardroom.tsx` | 2 | Single owner. |
| `src/pages/SalesAgent.tsx` | 5 | Single owner. |
| `src/pages/*` (all other pages) | 3 | Single owner. |
| `src/components/*` | 3 | Shared UI — coordinate if Lane 2 or 5 needs changes. |
| `src/context/*` | 3 | Single owner. |
| `src/App.tsx` | 3 | Routing — coordinate if new pages added. |
| `jobs/` | 1, 2 | Lane 1 owns `images/`, `videos/`, `voice/`, `music/`, `compose/`, `batches/`. Lane 2 owns `boardroom/`. |
| `vite.config.ts` | 4 | Single owner. |
| `package.json` | 4 | Single owner — lanes request dep changes. |
| `config.ts` | 4 | Single owner — all model/feature config lives here. |
| `src/db.ts` | 1 | SQLite queries — coordinate if schema changes. |
| `compose.ts` | 1 | FFmpeg engine — Lane 1 owns. |
| `AGENTS.md` | Any | This file. Update when lanes or rules change. |
| `check.md` | Any | Bug inventory. Update when bugs are found or fixed. |
| `board.md` | Any | Execution board. Update when work status changes. |
| `agents.md` | Any | SOPs. Update when a bug teaches a new rule. |
| `docs/archive/HANDOFF-*.md` | Read-only | Historical context. Archived from repo root. Superseded by this doc + board.md. |

---

## In-App Agent Personas (Boardroom System)

The Boardroom feature simulates multi-agent discussions with configurable AI seats. Default seats:

| Seat ID | Name | Role | Focus |
|---|---|---|---|
| `strategist` | Strategy Lead | Strategy Lead | Positioning, market timing, business leverage |
| `operator` | Operations Lead | Operations Lead | Execution risk, workflow fit, delivery scope |

Custom seats can be provided via the API (up to 5). All seats use Gemini models and follow the 5-phase protocol.

Boardroom protocol phases (in order):
1. `opening_brief` — objective anchoring, room context injection
2. `first_pass` — each seat gives initial position
3. `challenge` — seats challenge each other's assumptions
4. `refinement` — incorporate challenges, update positions
5. `convergence` — synthesize into final actionable output

---

## Commands

```bash
# Dev server (frontend + API on :3015)
npm run dev

# Type check — MUST pass before marking any item ✅
npx tsc --noEmit

# Run all tests — MUST pass before marking any item ✅
npx vitest run

# Build production bundle
npm run build

# Find hardcoded model strings (should return zero new results)
grep -rn "gemini-.*preview-04\|gemini-3-flash\|veo-3.1-fast" server.ts boardroom.ts

# Find open check.md items
grep "^### CHECK-\|^\\*\\*Status\\*\\*: ⬜" check.md

# Find all places apiKey is sent/missing in client fetches
grep -rn "apiKey.*VITE_GEMINI\|fetch(.*POST\|fetch(.*media" src/pages/

# Check FFmpeg availability
ffmpeg -version && ffprobe -version
```

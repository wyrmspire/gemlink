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
├── server.ts              # Express API server (all endpoints)
├── boardroom.ts           # Boardroom session engine
├── config.ts              # Centralized model + defaults config
├── compose.ts             # FFmpeg composition engine (Sprint 4)
├── src/
│   ├── App.tsx            # Routes (React.lazy)
│   ├── pages/             # All page components
│   ├── components/        # Shared UI components
│   ├── context/           # React contexts (Project, Toast)
│   └── index.css
├── tests/
│   ├── api/               # API integration tests
│   ├── components/        # Component smoke tests
│   └── helpers/           # Test utilities
├── data/
│   └── style-db.json      # Style database
├── .env.local             # API key + model config (git-ignored)
├── board.md               # Active sprint plan
├── agents.md              # This file
├── settings.md            # Settings system design doc
├── editor.md              # Media editor feature spec
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

## File Ownership Rules

- `board.md` defines per-sprint file ownership
- Each file is owned by exactly ONE lane per sprint
- If you must edit a file owned by another lane, add your changes in a clearly marked section: `// ── Added by Lane N ──`
- Shared files (`App.tsx`, `Layout.tsx`) — only add lines, don't refactor existing code
- Never modify `agents.md` during a sprint
- Never push/pull from git

---

## Common Pitfalls

1. **Model 403 errors** — a model name was retired. Check `config.ts` and `.env.local` (SOP-1)
2. **Silent mock fallback** — catch block returns fake data. Show real errors (SOP-2)
3. **Missing apiKey in fetch** — server returns 500. Always send the key (SOP-3)
4. **Tests fail after UI changes** — update test assertions to match new text (SOP-7)
5. **Vite HMR crash** — syntax error in `.tsx`. Check terminal for file:line
6. **TTS returns PCM** — needs WAV header conversion via `pcm16ToWav()` in server.ts
7. **Motion mock missing** — component tests crash without `vi.mock("motion/react", ...)` block
8. **Import cycles** — `config.ts` should have zero imports from `server.ts`
9. **localStorage full** — plans with many items exceed quota. Always try/catch (SOP-14)

---

## Sprint Status

| Sprint | Theme | Tests | Status |
|--------|-------|-------|--------|
| Sprint 1 | Core architecture, security, UX polish | 31 | ✅ |
| Sprint 2 | Media pipeline, batch gen, collections, SQLite | 78 | ✅ |
| Sprint 3 | Multi-stage planning, strategy artifacts, multi-plan UI, CI | 114 | ✅ |
| Sprint 4 | Media Editor / Compose Engine | — | Planned |
| Sprint 4.5 | Settings & Model Centralization | — | 🟡 Active |

Current test count: **114 passing** | Build: clean | TSC: clean

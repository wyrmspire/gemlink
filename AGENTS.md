# Gemlink — Agent Operating Manual

## Project Identity

Gemlink is a React + Express + Vite (TypeScript) agentic workspace for AI-powered brand marketing. It uses Gemini APIs for media generation (image, video, voice), multi-seat boardroom discussions, research, and a Twilio SMS sales agent. Originally scaffolded from Google AI Studio.

**Stack**: React 19, React Router 7, Tailwind CSS v4, Motion, Lucide, Express 4, tsx, @google/genai, Twilio, better-sqlite3 (installed but unused).

---

## Agent Lanes

Each lane defines a clear area of responsibility. An agent working within a lane owns the files listed and must not modify files outside the lane without explicit coordination.

### Lane 1 — Media Pipeline (Server)

**Owns**: `server.ts` (media endpoints only: `/api/media/*`, `/api/health`, static `/jobs` serving), `jobs/` directory structure.

**Scope**: Image/video/voice generation endpoints, job manifest lifecycle, background video polling, media history collection, file persistence under `jobs/`.

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
| `jobs/` | 1, 2 | Lane 1 owns `images/`, `videos/`, `voice/`. Lane 2 owns `boardroom/`. |
| `vite.config.ts` | 4 | Single owner. |
| `package.json` | 4 | Single owner — lanes request dep changes. |
| `AGENTS.md` | Any | This file. Update when lanes or rules change. |
| `board.md` | Any | Execution board. Update when work status changes. |
| `docs/archive/HANDOFF-*.md` | Read-only | Historical context. Archived from repo root. Superseded by this doc + board.md. |

---

## Handoff Protocol

When completing work, an agent must:

1. **Update `board.md`** — mark completed items, add new discoveries.
2. **Verify build** — run `npm run lint` (typecheck) and `npm run build` before handing off.
3. **Log what was NOT tested** — be honest about what was verified vs. assumed.
4. **Do not create new HANDOFF-*.md files** — update `board.md` instead. The existing HANDOFF docs are historical and should not be extended.
5. **Summarize changes in commit message** — include lane number and scope.

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

## In-App Agent Personas (Boardroom System)

The Boardroom feature simulates multi-agent discussions with configurable AI seats. Default seats:

| Seat ID | Name | Role | Focus |
|---|---|---|---|
| `strategist` | Strategy Lead | Strategy Lead | Positioning, market timing, business leverage |
| `operator` | Operations Lead | Operations Lead | Execution risk, workflow fit, delivery scope |

Custom seats can be provided via the API (up to 5). All seats use Gemini models and follow the 5-phase protocol.

---

## Known Architectural Issues (for all lanes)

These are documented in detail in `board.md`. Key awareness items:

- **Client-side Gemini calls**: `Research.tsx` and `VideoLab.tsx` (analysis) call Gemini directly from the browser, exposing the API key. These should be migrated to server endpoints (Lane 1 + Lane 3 coordination).
- **BrandContext not persisted**: Brand settings are lost on page refresh. Needs localStorage or server persistence.
- **No error boundaries**: A crash in any page takes down the whole app.
- **`better-sqlite3` installed but unused**: Either use it for job/session metadata or remove it.

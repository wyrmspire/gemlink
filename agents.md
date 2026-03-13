# Gemlink Agents Plan

> Purpose: coordinate multi-agent execution against the Gemlink board without collisions.
> Repo: /home/devpc/.openclaw/workspace/gemlink

## Global constraints
- Work only in this repo path.
- Follow `board.md` priorities and dependencies.
- Do not change scope without explicit approval.
- Prefer small, reviewable commits per lane.
- Avoid overlapping file edits; announce conflicts and re-route if needed.
- Keep API keys server-side; no client-side key exposure.
- If unsure about a dependency (A5, A3), stop and ask before proceeding.

## Lanes (5 agents)

### Lane 1 — Security/API key containment
**Primary focus**: Track A items that move client-side Gemini calls to server endpoints.
- A1: Research → server endpoints (`server.ts`, `src/pages/Research.tsx`)
- A2: Video analysis → server endpoint (`server.ts`, `src/pages/VideoLab.tsx`)

**Boundaries**:
- Avoid touching Boardroom or BrandContext unless strictly required.
- Coordinate any shared changes in `server.ts` with Lane 3.

**Deliverables**:
- New API routes in `server.ts`
- Refactored client pages using server endpoints
- Basic error handling on client and server

---

### Lane 2 — Boardroom async + reliability
**Primary focus**: Track C work.
- C1: Async boardroom session creation + polling
- C3: JSON integrity validation on read

**Boundaries**:
- Do not alter the core boardroom protocol logic unless required for async.
- If changes affect routes in `server.ts`, coordinate with Lane 3.

**Deliverables**:
- Background job flow for sessions
- Client polling updates for Boardroom page
- Safe parsing + error handling for session reads

---

### Lane 3 — Core UX reliability + persistence
**Primary focus**: Cross-cutting UX reliability and local-first persistence.
- A4: Error boundaries
- B1: BrandContext persistence
- B3: Video job polling UI (if not already done by Lane 1)

**Boundaries**:
- Avoid stepping into Boardroom logic.
- Coordinate any shared server updates with Lane 1/2.

**Deliverables**:
- ErrorBoundary component + app integration
- Persisted BrandContext to localStorage
- Video job polling UX improvement

---

### Lane 4 — Testing + deployment readiness
**Primary focus**: Track E + F1 + documentation hygiene.
- E1/E2: Test harness and basic tests
- F1: Production build/serve validation
- F3: README rewrite (after architecture stabilizes)

**Boundaries**:
- Do not refactor app logic; focus on test scaffolding and docs.
- Coordinate README rewrite with Lane 3 if UX changes affect docs.

**Deliverables**:
- Test scripts + minimal tests
- Production start instructions
- Improved README

---

### Lane 5 — Docs cleanup + metadata + low-risk polish
**Primary focus**: Low-risk DX tasks and polish after core fixes.
- D1/D2/D3 (where safe)
- F2: HANDOFF archive/cleanup
- A5/B2 decision notes (capture options, do not implement unless directed)

**Boundaries**:
- Avoid large cross-file UI rewrites without coordination.
- If D2 (toast system) touches many pages, sync with Lane 3.

**Deliverables**:
- Metadata.json filled
- Handoff docs archived or documented
- Optional small UX polish after higher priorities

## Coordination rules
- Check `board.md` before starting a task.
- Announce which files you will touch in your first update.
- If two lanes need `server.ts`, decide a merge order and keep changes minimal.
- Escalate blockers or unclear dependencies instead of guessing.

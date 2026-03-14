# Gemlink Agents Map

> Purpose: a standing navigation + coordination map for any agent entering the repo.
> Repo: /home/devpc/.openclaw/workspace/gemlink

## Repo map (high‑level)
- **Server**: `server.ts` (API endpoints, media jobs, boardroom routes)
- **Boardroom core**: `boardroom.ts` (session logic + persistence)
- **UI pages**: `src/pages/*` (Research, VideoLab, Boardroom, Library, etc.)
- **Shared UI**: `src/components/*`, `src/context/*`
- **Tests**: `tests/*`, `vitest.config.ts`
- **Docs/decisions**: `docs/decisions/*`, `README.md`, `metadata.json`

## Lanes (coordination map, not a task list)
These lanes define **ownership zones** to reduce collisions. The actual work is scheduled in `board.md`.

### Lane 1 — Security / API key containment
Owns: moving client‑side Gemini usage to server endpoints; security‑sensitive API changes.

### Lane 2 — Boardroom reliability
Owns: boardroom session flow, async orchestration, session read/write safety.

### Lane 3 — Core UX reliability + persistence
Owns: error boundaries, local persistence, UX resilience on core pages.

### Lane 4 — Testing + deployment readiness
Owns: test harness, integration tests, build/serve validation, onboarding docs.

### Lane 5 — Docs + low‑risk polish
Owns: metadata/docs cleanup, low‑risk UI polish, packaging hygiene.

### Side‑work lane (optional)
If blocked, agents may pick low‑risk tasks that **don’t overlap** other lanes (tiny docs fixes, metadata updates, or safe UI polish) and note the change in `board.md`.

## Coordination rules
- `board.md` is the execution plan; `agents.md` is the map.
- Avoid overlapping file edits across lanes; if overlap is unavoidable, pause and coordinate.
- If a task depends on a decision gate (A3/A5), stop and ask.
- Keep changes scoped to your lane; if you must cross lanes, state it explicitly.

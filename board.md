# Gemlink Execution Board

> Last updated: 2026-03-15 (Sprint 7 — Agent Endpoint Ergonomics)
> Scope: Implementing the suggestions from maddypoints.md to make the API more robust for agent workflows.
> Context: `agents.md` for repo patterns, `maddypoints.md` for specific endpoint ergonomics specs.

---

## Sprint History

| Sprint | Theme | Tests | Status |
|--------|-------|-------|--------|
| Sprint 1 | Core architecture, security, UX polish, testing foundation | 31 | ✅ |
| Sprint 2 | Media pipeline, batch gen, collections, SQLite, boardroom | 78 | ✅ |
| Sprint 3 | Multi-stage planning, strategy artifacts, multi-plan UI, CI | 114 | ✅ |
| Sprint 5 | Enhanced Editor (Tier 2) | 199 | ✅ |
| Sprint 6 | Music Generation Support | 199 | ✅ |

---

## Status Key

| Symbol | Meaning |
|--------|---------|
| ⬜ | Not started |
| 🟡 | In progress |
| ✅ | Done |
| 🔴 | Blocked |

---

## Parallelization Guidance

> **Dependency Weaving**:
> - **Lane 1** splits `server.ts` into isolated route modules. This is the foundation.
> - **Lane 2** builds new ergonomic features (capabilities, idempotency keys, headers) inside those modules.
> - **Lane 3** focuses on data flow enhancements (rate limit tracking, streaming, cancelling).
> 
> *Warning*: Lane 1's route splitting must be done carefully to avoid breaking existing functionality. Lanes 2 and 3 should coordinate with Lane 1 on the exact file structure once the routes are split.

---

## Sprint 7 — Pre-Flight Checklist

- [ ] All 199 tests passing (`npx vitest run`)
- [ ] Read `agents.md`
- [ ] Read `maddypoints.md`

---

## 🔴 Lane 1 — Server Routing Refactor

**Focus**: Split the monolithic server.ts and standardize API prefixes.
**Owns**: `server.ts`, `routes/*`

### W1. Split Route Modules (P0) ⬜
- **Files**: `server.ts`, `routes/*.ts`
- **What**: Implement suggestion #1 from maddypoints. Extract endpoints from `server.ts` into specific files (e.g., `routes/media.ts`, `routes/boardroom.ts`). 
- **Unlocks**: L2:W2, L3:W1

### W2. Prefix Inconsistency Fix (P0) ⬜
- **Depends**: L1:W1
- **Files**: `server.ts`, `routes/*.ts`, all frontend UI calling endpoints
- **What**: Implement suggestion #6. Move endpoints like `/health`, `/style-db`, and `/settings` under the `/api/` prefix. Add backward-compatible redirects.

### W3. Boardroom Per-Seat Models (P1) ⬜
- **Depends**: L1:W1
- **Files**: `routes/boardroom.ts`, `src/db.ts`
- **What**: Implement suggestion #11. Honor the `provider` and `model` configuration for each Boardroom seat so agents can mix-and-match models per session.

---

## 🟣 Lane 2 — Agent Ergonomics & Capabilities

**Focus**: Features that make the API predictable and safe for agents to use.
**Owns**: `server.ts`, core middleware

### W1. Agent Identity Tracking (P1) ⬜
- **Files**: `server.ts`
- **What**: Implement suggestion #9. Add middleware to parse `X-Agent-Id`, `X-Agent-Session`, and `X-Agent-Lane` headers, recording them in console logs for traceability.

### W2. Capabilities Endpoint (P0) ⬜
- **Depends**: L1:W1
- **Files**: `routes/system.ts` or `server.ts`
- **What**: Implement suggestion #2. Create `GET /api/capabilities` returning models, rate limits, feature toggles, and accepted agent headers.

### W3. Idempotency Keys (P1) ⬜
- **Files**: `routes/media.ts`, `src/db.ts`
- **What**: Implement suggestion #5. Accept `Idempotency-Key` headers on media generation endpoints. Cache successful responses in SQLite with a TTL and replay if the same key is received.

### W4. Dry-Run Mode (P1) ⬜
- **Files**: `routes/media.ts`, `routes/boardroom.ts`
- **What**: Implement suggestion #10. Allow a `dry-run: true` parameter or `X-Dry-Run` header to pre-validate operations (especially for boardroom payloads) before burning real quota.

---

## 🔵 Lane 3 — Real-Time Streams & Constraints

**Focus**: Exposing live status, streams, and constraints to agents organically.
**Owns**: Streaming components, rate limiting features

### W1. Real-Time Streams (SSE) (P0) ⬜
- **Depends**: L1:W1
- **Files**: `routes/boardroom.ts`, `routes/media.ts`, `routes/compose.ts`
- **What**: Implement suggestion #4. Add standard SSE stream endpoints for boardroom sessions and long-running media/compose jobs to replace polling loops.

### W2. Rate Limit Headers (P0) ⬜
- **Files**: `routes/media.ts` (or auth/middleware)
- **What**: Implement suggestion #3. Return standard `X-RateLimit-*` headers exposing current capacity. Add `Retry-After` headers to any 429 status endpoints.

### W3. Queue Status & Job Cancellation (P1) ⬜
- **Files**: `routes/media.ts`
- **What**: Implement suggestions #8 and #12. Create `GET /api/queue` to show running vs pending queued jobs, and add cancellation endpoints (`POST /api/media/job/:type/:id/cancel`).

---

## Handoff Protocol

1. Mark each W item ⬜→🟡→✅ as you go
2. Add "- **Done**: ..." line summarizing what shipped
3. Run `npx tsc --noEmit` — must pass
4. Run `npx vitest run` — all tests must pass
5. Commit: `"L<N>-S7: <scope>"`

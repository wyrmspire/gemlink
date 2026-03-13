# Decision Note: A5 — better-sqlite3: Use It or Remove It

> Status: **Options captured — awaiting decision**
> Author: Lane 5 | Date: 2026-03-13

## Context

`better-sqlite3@^12.4.1` is in `package.json` dependencies but is **never imported anywhere** in the codebase. It adds native compilation overhead (C++ binding via `node-gyp`) to every `npm install`, which slows installation and can fail on systems without build tools.

Currently, all persistence is flat-file JSON:
- **Media jobs**: `jobs/images/<id>/manifest.json`, `jobs/videos/<id>/manifest.json`, `jobs/voice/<id>/manifest.json`
- **Boardroom sessions**: `jobs/boardroom/<id>.json`
- **Brand context**: Not persisted at all (in-memory only — see B1)

## Option A: Remove It (Recommended for Now)

**Action**: Remove `better-sqlite3` from `package.json`, run `npm install`.

**Pros**:
- Eliminates native compilation overhead (~10–30s on install, more on CI)
- Reduces attack surface and dependency count
- The current file-backed approach works fine for a single-user/single-server app
- Can always add it back later if needed

**Cons**:
- If we later want structured queries (e.g., "all video jobs from last week"), we'd need to re-add it

**Effort**: 5 minutes.

## Option B: Adopt It for Job/Session Metadata

**Action**: Create a `db.ts` module that initializes a SQLite database, create tables for job manifests and boardroom sessions, and migrate the read/write paths in `server.ts` and `boardroom.ts`.

**Pros**:
- Structured queries and filtering (e.g., by status, date, type)
- Atomic writes — no risk of partial JSON files on crash
- Scales better if job volume grows
- Could also store brand config (solves B1 server-side)

**Cons**:
- Significant refactor of `server.ts` (Lane 1) and `boardroom.ts` (Lane 2)
- Need to coordinate across 3 lanes (1, 2, 4)
- Adds operational complexity (DB file management, migrations)
- Overkill for a single-user tool that currently has < 100 jobs

**Effort**: 4–8 hours across multiple lanes.

## Option C: Adopt It Only for Brand Config (Minimal)

**Action**: Use SQLite only for persisting brand configuration server-side. Keep file-based job persistence as-is.

**Pros**:
- Solves B1 and partially B2 (brand context available server-side for Twilio)
- Minimal surface area — only one new module, no existing code migration

**Cons**:
- Mixed persistence model (SQLite for config, files for jobs)
- Still has the native compilation cost for a small use case
- `localStorage` (proposed in B1) would solve the same problem without SQLite

**Effort**: 1–2 hours.

## Recommendation

**Go with Option A (remove it) for now.** The app is a single-user local tool. The flat-file approach is sufficient, and `localStorage` (B1) handles brand persistence. If the app grows to need structured queries or multi-user support, revisit Option B.

## Decision Required From

- **Lane 4** (owns `package.json`) for removal
- **Lane 1 + Lane 2** if adoption is chosen instead

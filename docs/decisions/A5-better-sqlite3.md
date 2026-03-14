# Decision Note: A5 — better-sqlite3: Use It or Remove It

> Status: **DECIDED — Option B (Adopt for structured metadata)**
> Original author: Lane 5 | Date: 2026-03-13
> Revised by: Lane 4 | Date: 2026-03-14

## Context

`better-sqlite3@^12.4.1` is in `package.json` dependencies but was never
imported anywhere in the codebase. The original recommendation (Option A) was
to remove it.

## Re-evaluation: upgrade.md bulk media sprint

The `upgrade.md` document introduces a suite of features that require
structured queries on media metadata:

| Feature | Query need |
|---------|-----------|
| **G2** — Project-scoped media | `WHERE projectId = ?` on media_jobs |
| **H2** — Batch queue | `WHERE status = 'pending'` + `ORDER BY createdAt` |
| **I3** — AI scoring | Store + query `scores` JSON per job |
| **I4** — Tag & organize | `WHERE tags LIKE ?` / full-text search |
| **J1** — Collections | Join table: `collection_items(collectionId, jobId)` |
| **J3** — Bulk export | Collect all items in a collection efficiently |
| **H1** — Media plans | Persist + retrieve plan item arrays per project |

None of these are efficient with flat-file JSON. With SQLite, each is a single
indexed query. The flat-file approach would require reading every manifest on
every request.

## Decision: Option B — Adopt SQLite

**Implementation**: `src/db.ts` created. See that file for full schema details.

### Tables created

| Table | Purpose |
|-------|---------|
| `projects` | Project profiles (replaces single BrandContext) |
| `media_jobs` | Indexed manifest metadata (binary files stay on disk) |
| `collections` | Named curated media sets |
| `collection_items` | Join table with sort order |
| `media_plans` | AI-generated media plans (JSON items column) |

### Key design choices

1. **Binary files remain on disk** — images/videos/audio are NOT in SQLite.
   The DB only indexes the metadata (prompts, status, tags, scores, paths).
   This avoids SQLite blob performance issues and keeps the file-based output
   system compatible with the existing `jobs/` directory structure.

2. **WAL mode** — `PRAGMA journal_mode = WAL` for better concurrent reads
   (relevant once the batch queue runs multiple concurrent jobs that are also
   being polled from the UI).

3. **Foreign keys on** — `PRAGMA foreign_keys = ON`. Referential integrity
   enforced: deleting a project cascades to its media plans and collections.

4. **INSERT OR REPLACE for media_jobs** — allows the batch job runner to
   upsert status updates without checking existence first.

5. **Typed helpers exported** — `projectQueries`, `mediaJobQueries`,
   `collectionQueries`, `collectionItemQueries`, `mediaPlanQueries`. Other
   lanes import these helpers, not `db` directly (except for custom queries).

## Migration path from flat files

The DB is **additive** — existing flat-file jobs in `jobs/images/`, `jobs/videos/`,
`jobs/voice/` continue to work. Lane 1 will backfill `media_jobs` rows when
serving history (or on first access). There is no hard cutover.

## Reversing this decision

If SQLite causes issues (e.g. native build failures on a target platform),
remove the `db.ts` import from server-side modules and switch back to flat
files. The schema drop is: `rm jobs/gemlink.db`.

## Decision authority

- **Lane 4** owns `package.json` and made the final call.
- **Lane 1** (server.ts endpoints) and **Lane 3** (context) should import
  `src/db.ts` for any new persistence needs related to the upgrade sprint.

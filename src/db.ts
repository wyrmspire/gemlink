/**
 * db.ts — Gemlink SQLite persistence layer
 *
 * Provides a single shared `better-sqlite3` Database instance and creates
 * all tables on first run (CREATE TABLE IF NOT EXISTS — idempotent).
 *
 * Other modules import named getters/helpers from here; they never interact
 * with better-sqlite3 directly.
 *
 * ## Tables
 *
 * ### projects
 * One row per project profile (replaces single BrandContext).
 *
 * ### media_jobs
 * Mirrors the flat-file manifest shape but adds projectId, tags, and scores.
 * Binary outputs (images, video, audio) remain on disk; only the manifest
 * metadata is indexed here for efficient filtering.
 *
 * ### collections
 * Named curated sets of media (e.g. "Website Launch Assets").
 *
 * ### collection_items
 * Join table between collections and media_jobs with user-controlled sort order.
 *
 * ### media_plans
 * Stored media plans produced by the AI plan builder (H1).  The `items` column
 * holds a JSON array of MediaPlanItem objects.
 *
 * ## Usage
 * ```ts
 * import { db } from "./db.ts";
 * const projects = db.prepare("SELECT * FROM projects").all();
 * ```
 * Or use the typed helpers exported below.
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// ---------------------------------------------------------------------------
// Database location: jobs/gemlink.db  (alongside the flat-file job dirs)
// ---------------------------------------------------------------------------
const jobsDir = path.join(process.cwd(), "jobs");
if (!fs.existsSync(jobsDir)) {
  fs.mkdirSync(jobsDir, { recursive: true });
}

const DB_PATH = path.join(jobsDir, "gemlink.db");

export const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma("journal_mode = WAL");
// Enforce foreign key constraints
db.pragma("foreign_keys = ON");

// ---------------------------------------------------------------------------
// Schema bootstrap (idempotent — safe to call on every startup)
// ---------------------------------------------------------------------------
db.exec(/* sql */ `
  -- ── Projects ──────────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS projects (
    id               TEXT    PRIMARY KEY,   -- e.g. "proj_abc123"
    name             TEXT    NOT NULL,       -- "SaaS Launch Campaign"
    brandName        TEXT    NOT NULL,
    brandDescription TEXT    NOT NULL,
    targetAudience   TEXT    NOT NULL,
    brandVoice       TEXT    NOT NULL,
    colorPalette     TEXT,                  -- JSON array of hex strings
    styleKeywords    TEXT,                  -- JSON array of strings
    referenceImages  TEXT,                  -- JSON array of file paths / URLs
    createdAt        TEXT    NOT NULL,
    updatedAt        TEXT    NOT NULL
  );

  -- ── Media jobs ────────────────────────────────────────────────────────────
  -- Mirrors the flat-file manifest shape; adds projectId, tags, scores.
  -- Binary outputs remain on disk; this table is the queryable index.
  CREATE TABLE IF NOT EXISTS media_jobs (
    id            TEXT    PRIMARY KEY,      -- e.g. "img_abc123"
    projectId     TEXT    REFERENCES projects(id) ON DELETE SET NULL,
    type          TEXT    NOT NULL CHECK(type IN ('image', 'video', 'voice')),
    status        TEXT    NOT NULL CHECK(status IN ('pending', 'completed', 'failed')),
    prompt        TEXT,
    model         TEXT,
    size          TEXT,
    aspectRatio   TEXT,
    resolution    TEXT,
    voice         TEXT,
    outputs       TEXT    NOT NULL DEFAULT '[]',  -- JSON array of output paths
    tags          TEXT    NOT NULL DEFAULT '[]',  -- JSON array of tag strings
    scores        TEXT,                           -- JSON object: { overall, brandAlignment, … }
    rating        INTEGER,                         -- user manual rating 1-5
    planItemId    TEXT,                           -- FK into media_plans item ID (soft ref)
    createdAt     TEXT    NOT NULL,
    updatedAt     TEXT    NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_media_jobs_project  ON media_jobs(projectId);
  CREATE INDEX IF NOT EXISTS idx_media_jobs_status   ON media_jobs(status);
  CREATE INDEX IF NOT EXISTS idx_media_jobs_type     ON media_jobs(type);
  CREATE INDEX IF NOT EXISTS idx_media_jobs_created  ON media_jobs(createdAt DESC);

  -- ── Collections ───────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS collections (
    id        TEXT    PRIMARY KEY,           -- e.g. "col_abc123"
    projectId TEXT    REFERENCES projects(id) ON DELETE CASCADE,
    name      TEXT    NOT NULL,
    createdAt TEXT    NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_collections_project ON collections(projectId);

  -- ── Collection items ──────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS collection_items (
    collectionId TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    jobId        TEXT NOT NULL REFERENCES media_jobs(id)  ON DELETE CASCADE,
    sortOrder    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (collectionId, jobId)
  );

  CREATE INDEX IF NOT EXISTS idx_col_items_collection ON collection_items(collectionId, sortOrder);

  -- ── Media plans ───────────────────────────────────────────────────────────
  -- items is a JSON array of MediaPlanItem (defined in upgrade.md Track H).
  CREATE TABLE IF NOT EXISTS media_plans (
    id        TEXT    PRIMARY KEY,             -- e.g. "plan_abc123"
    projectId TEXT    REFERENCES projects(id) ON DELETE CASCADE,
    name      TEXT    NOT NULL,
    items     TEXT    NOT NULL DEFAULT '[]',   -- JSON array of MediaPlanItem
    createdAt TEXT    NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_media_plans_project ON media_plans(projectId);
`);

// ---------------------------------------------------------------------------
// TypeScript types (shared by all lanes that import db.ts)
// ---------------------------------------------------------------------------

export interface ProjectRow {
  id: string;
  name: string;
  brandName: string;
  brandDescription: string;
  targetAudience: string;
  brandVoice: string;
  /** JSON-encoded string[] */
  colorPalette: string | null;
  /** JSON-encoded string[] */
  styleKeywords: string | null;
  /** JSON-encoded string[] */
  referenceImages: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MediaJobRow {
  id: string;
  projectId: string | null;
  type: "image" | "video" | "voice";
  status: "pending" | "completed" | "failed";
  prompt: string | null;
  model: string | null;
  size: string | null;
  aspectRatio: string | null;
  resolution: string | null;
  voice: string | null;
  /** JSON-encoded string[] */
  outputs: string;
  /** JSON-encoded string[] */
  tags: string;
  /** JSON-encoded score object */
  scores: string | null;
  rating: number | null;
  planItemId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CollectionRow {
  id: string;
  projectId: string | null;
  name: string;
  createdAt: string;
}

export interface CollectionItemRow {
  collectionId: string;
  jobId: string;
  sortOrder: number;
}

export interface MediaPlanRow {
  id: string;
  projectId: string | null;
  name: string;
  /** JSON-encoded MediaPlanItem[] */
  items: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Typed prepared-statement helpers
// ---------------------------------------------------------------------------

// ── Projects ────────────────────────────────────────────────────────────────

const _insertProject = db.prepare<ProjectRow>(/* sql */ `
  INSERT INTO projects
    (id, name, brandName, brandDescription, targetAudience, brandVoice,
     colorPalette, styleKeywords, referenceImages, createdAt, updatedAt)
  VALUES
    (@id, @name, @brandName, @brandDescription, @targetAudience, @brandVoice,
     @colorPalette, @styleKeywords, @referenceImages, @createdAt, @updatedAt)
`);

const _updateProject = db.prepare<Partial<ProjectRow> & { id: string }>(/* sql */ `
  UPDATE projects
  SET name             = @name,
      brandName        = @brandName,
      brandDescription = @brandDescription,
      targetAudience   = @targetAudience,
      brandVoice       = @brandVoice,
      colorPalette     = @colorPalette,
      styleKeywords    = @styleKeywords,
      referenceImages  = @referenceImages,
      updatedAt        = @updatedAt
  WHERE id = @id
`);

const _getProject = db.prepare<{ id: string }>(
  "SELECT * FROM projects WHERE id = @id"
);

const _listProjects = db.prepare("SELECT * FROM projects ORDER BY createdAt DESC");

export const projectQueries = {
  insert: (row: ProjectRow) => _insertProject.run(row),
  update: (row: Partial<ProjectRow> & { id: string }) => _updateProject.run(row),
  get: (id: string): ProjectRow | undefined =>
    _getProject.get({ id }) as ProjectRow | undefined,
  list: (): ProjectRow[] => _listProjects.all() as ProjectRow[],
  delete: (id: string) => db.prepare("DELETE FROM projects WHERE id = ?").run(id),
};

// ── Media jobs ───────────────────────────────────────────────────────────────

const _insertJob = db.prepare<MediaJobRow>(/* sql */ `
  INSERT OR REPLACE INTO media_jobs
    (id, projectId, type, status, prompt, model, size, aspectRatio, resolution,
     voice, outputs, tags, scores, rating, planItemId, createdAt, updatedAt)
  VALUES
    (@id, @projectId, @type, @status, @prompt, @model, @size, @aspectRatio, @resolution,
     @voice, @outputs, @tags, @scores, @rating, @planItemId, @createdAt, @updatedAt)
`);

const _getJob = db.prepare<{ id: string }>("SELECT * FROM media_jobs WHERE id = @id");

const _listJobsByProject = db.prepare<{ projectId: string }>(
  "SELECT * FROM media_jobs WHERE projectId = @projectId ORDER BY createdAt DESC"
);

const _updateJobStatus = db.prepare<{
  id: string;
  status: string;
  outputs: string;
  updatedAt: string;
}>(/* sql */ `
  UPDATE media_jobs
  SET status    = @status,
      outputs   = @outputs,
      updatedAt = @updatedAt
  WHERE id = @id
`);

const _updateJobScores = db.prepare<{
  id: string;
  scores: string;
  rating: number | null;
  updatedAt: string;
}>(/* sql */ `
  UPDATE media_jobs
  SET scores    = @scores,
      rating    = @rating,
      updatedAt = @updatedAt
  WHERE id = @id
`);

export const mediaJobQueries = {
  upsert: (row: MediaJobRow) => _insertJob.run(row),
  get: (id: string): MediaJobRow | undefined =>
    _getJob.get({ id }) as MediaJobRow | undefined,
  listByProject: (projectId: string): MediaJobRow[] =>
    _listJobsByProject.all({ projectId }) as MediaJobRow[],
  updateStatus: (opts: {
    id: string;
    status: string;
    outputs: string[];
    updatedAt: string;
  }) =>
    _updateJobStatus.run({
      ...opts,
      outputs: JSON.stringify(opts.outputs),
    }),
  updateScores: (opts: {
    id: string;
    scores: object;
    rating: number | null;
    updatedAt: string;
  }) =>
    _updateJobScores.run({
      ...opts,
      scores: JSON.stringify(opts.scores),
    }),
};

// ── Collections ──────────────────────────────────────────────────────────────

const _insertCollection = db.prepare<CollectionRow>(/* sql */ `
  INSERT INTO collections (id, projectId, name, createdAt)
  VALUES (@id, @projectId, @name, @createdAt)
`);

const _listCollections = db.prepare<{ projectId: string }>(
  "SELECT * FROM collections WHERE projectId = @projectId ORDER BY createdAt DESC"
);

const _getCollection = db.prepare<{ id: string }>(
  "SELECT * FROM collections WHERE id = @id"
);

export const collectionQueries = {
  insert: (row: CollectionRow) => _insertCollection.run(row),
  list: (projectId: string): CollectionRow[] =>
    _listCollections.all({ projectId }) as CollectionRow[],
  get: (id: string): CollectionRow | undefined =>
    _getCollection.get({ id }) as CollectionRow | undefined,
  delete: (id: string) => db.prepare("DELETE FROM collections WHERE id = ?").run(id),
};

// ── Collection items ──────────────────────────────────────────────────────────

const _insertCollectionItem = db.prepare<CollectionItemRow>(/* sql */ `
  INSERT OR REPLACE INTO collection_items (collectionId, jobId, sortOrder)
  VALUES (@collectionId, @jobId, @sortOrder)
`);

const _listCollectionItems = db.prepare<{ collectionId: string }>(/* sql */ `
  SELECT ci.*, mj.*
  FROM collection_items ci
  JOIN media_jobs mj ON mj.id = ci.jobId
  WHERE ci.collectionId = @collectionId
  ORDER BY ci.sortOrder ASC
`);

export const collectionItemQueries = {
  insert: (row: CollectionItemRow) => _insertCollectionItem.run(row),
  listWithJobs: (collectionId: string) =>
    _listCollectionItems.all({ collectionId }),
  remove: (collectionId: string, jobId: string) =>
    db
      .prepare(
        "DELETE FROM collection_items WHERE collectionId = ? AND jobId = ?"
      )
      .run(collectionId, jobId),
};

// ── Media plans ───────────────────────────────────────────────────────────────

const _insertPlan = db.prepare<MediaPlanRow>(/* sql */ `
  INSERT INTO media_plans (id, projectId, name, items, createdAt)
  VALUES (@id, @projectId, @name, @items, @createdAt)
`);

const _updatePlanItems = db.prepare<{ id: string; items: string }>(/* sql */ `
  UPDATE media_plans SET items = @items WHERE id = @id
`);

const _listPlans = db.prepare<{ projectId: string }>(
  "SELECT * FROM media_plans WHERE projectId = @projectId ORDER BY createdAt DESC"
);

const _getPlan = db.prepare<{ id: string }>(
  "SELECT * FROM media_plans WHERE id = @id"
);

export const mediaPlanQueries = {
  insert: (row: MediaPlanRow) => _insertPlan.run(row),
  updateItems: (id: string, items: unknown[]) =>
    _updatePlanItems.run({ id, items: JSON.stringify(items) }),
  list: (projectId: string): MediaPlanRow[] =>
    _listPlans.all({ projectId }) as MediaPlanRow[],
  get: (id: string): MediaPlanRow | undefined =>
    _getPlan.get({ id }) as MediaPlanRow | undefined,
  delete: (id: string) =>
    db.prepare("DELETE FROM media_plans WHERE id = ?").run(id),
};

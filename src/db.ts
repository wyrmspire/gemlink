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
    type          TEXT    NOT NULL CHECK(type IN ('image', 'video', 'voice', 'music')),
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

  -- ── Strategy artifacts ──────────────────────────────────────────────────────
  -- Persistent strategy intelligence: boardroom insights, research findings,
  -- style directions, etc. Pinned artifacts auto-inject into generation context.
  CREATE TABLE IF NOT EXISTS strategy_artifacts (
    id         TEXT    PRIMARY KEY,
    projectId  TEXT    REFERENCES projects(id) ON DELETE CASCADE,
    type       TEXT    NOT NULL CHECK(type IN (
      'boardroom_insight','research_finding','strategy_brief',
      'style_direction','scoring_analysis','custom'
    )),
    title      TEXT    NOT NULL,
    summary    TEXT    NOT NULL,
    content    TEXT    NOT NULL,
    tags       TEXT    NOT NULL DEFAULT '[]',
    source     TEXT    NOT NULL DEFAULT '{}',
    pinned     INTEGER NOT NULL DEFAULT 0,
    createdAt  TEXT    NOT NULL,
    updatedAt  TEXT    NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_strategy_artifacts_project ON strategy_artifacts(projectId);
  CREATE INDEX IF NOT EXISTS idx_strategy_artifacts_type    ON strategy_artifacts(type);
  CREATE INDEX IF NOT EXISTS idx_strategy_artifacts_pinned  ON strategy_artifacts(projectId, pinned);

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

  -- ── Compose jobs ─────────────────────────────────────────────────────────────────────────
  -- Tracks FFmpeg compose jobs (slideshow, merge, caption).
  CREATE TABLE IF NOT EXISTS compose_jobs (
    id           TEXT    PRIMARY KEY,     -- e.g. "compose_abc123"
    projectId    TEXT    REFERENCES projects(id) ON DELETE SET NULL,
    type         TEXT    NOT NULL CHECK(type IN ('merge', 'slideshow', 'caption')),
    status       TEXT    NOT NULL CHECK(status IN ('pending', 'processing', 'done', 'failed')),
    title        TEXT,
    inputConfig  TEXT    NOT NULL DEFAULT '{}',  -- JSON ComposeRequest snapshot
    audioTracks  TEXT,                           -- JSON array of AudioTrackInput
    trimPoints   TEXT,                           -- JSON object: { inPoint, outPoint }
    watermarkJobId TEXT,                        -- reference image jobId
    outputPath   TEXT,
    outputs      TEXT    NOT NULL DEFAULT '[]',  -- JSON array of output paths
    duration     REAL,
    createdAt    TEXT    NOT NULL,
    updatedAt    TEXT    NOT NULL
  );

  -- Migration for existing compose_jobs table (Tier 2)
  -- Wrap in try-catch blocks via application logic or use a specific pragma check if needed,
  -- but since better-sqlite3 exec() doesn't allow catching individual errors in one multi-statement call,
  -- we'll split the alter calls into separate exec calls below the main bootstrap.
  CREATE INDEX IF NOT EXISTS idx_compose_jobs_project ON compose_jobs(projectId);
  CREATE INDEX IF NOT EXISTS idx_compose_jobs_status  ON compose_jobs(status);
`);

// ── Migration logic for existing installations ──────────────────────────────
["audioTracks", "trimPoints", "watermarkJobId"].forEach(col => {
  try { db.exec(`ALTER TABLE compose_jobs ADD COLUMN ${col} TEXT`); } catch {}
});
try { db.exec(`ALTER TABLE compose_jobs ADD COLUMN outputs TEXT NOT NULL DEFAULT '[]'`); } catch {}

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
  type: "image" | "video" | "voice" | "music";
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

// ── Compose jobs types ────────────────────────────────────────────────────────

export interface ComposeJobRow {
  id: string;
  projectId: string | null;
  type: "merge" | "slideshow" | "caption";
  status: "pending" | "processing" | "done" | "failed";
  title: string | null;
  /** JSON-encoded ComposeRequest snapshot */
  inputConfig: string;
  /** JSON-encoded AudioTrackInput[] */
  audioTracks: string | null;
  /** JSON-encoded trimPoints object */
  trimPoints: string | null;
  watermarkJobId: string | null;
  outputPath: string | null;
  /** JSON-encoded string[] */
  outputs: string;
  duration: number | null;
  createdAt: string;
  updatedAt: string;
}

export type ArtifactType =
  | "boardroom_insight"
  | "research_finding"
  | "strategy_brief"
  | "style_direction"
  | "scoring_analysis"
  | "custom";

export interface StrategyArtifactRow {
  id: string;
  projectId: string | null;
  type: ArtifactType;
  title: string;
  summary: string;
  content: string;
  /** JSON-encoded string[] */
  tags: string;
  /** JSON-encoded ArtifactSource object */
  source: string;
  pinned: number; // 0 or 1
  createdAt: string;
  updatedAt: string;
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

// ── Strategy artifacts ────────────────────────────────────────────────────────

const _insertArtifact = db.prepare<StrategyArtifactRow>(/* sql */ `
  INSERT INTO strategy_artifacts
    (id, projectId, type, title, summary, content, tags, source, pinned, createdAt, updatedAt)
  VALUES
    (@id, @projectId, @type, @title, @summary, @content, @tags, @source, @pinned, @createdAt, @updatedAt)
`);

const _getArtifact = db.prepare<{ id: string }>(
  "SELECT * FROM strategy_artifacts WHERE id = @id"
);

const _listArtifacts = db.prepare<{ projectId: string }>(
  "SELECT * FROM strategy_artifacts WHERE projectId = @projectId ORDER BY pinned DESC, updatedAt DESC"
);

const _listPinnedArtifacts = db.prepare<{ projectId: string }>(
  "SELECT * FROM strategy_artifacts WHERE projectId = @projectId AND pinned = 1 ORDER BY updatedAt DESC"
);

const _updateArtifact = db.prepare<StrategyArtifactRow>(/* sql */ `
  UPDATE strategy_artifacts
  SET type      = @type,
      title     = @title,
      summary   = @summary,
      content   = @content,
      tags      = @tags,
      source    = @source,
      pinned    = @pinned,
      updatedAt = @updatedAt
  WHERE id = @id
`);

const _togglePin = db.prepare<{ id: string; pinned: number; updatedAt: string }>(/* sql */ `
  UPDATE strategy_artifacts SET pinned = @pinned, updatedAt = @updatedAt WHERE id = @id
`);

export const strategyArtifactQueries = {
  insert: (row: StrategyArtifactRow) => _insertArtifact.run(row),
  get: (id: string): StrategyArtifactRow | undefined =>
    _getArtifact.get({ id }) as StrategyArtifactRow | undefined,
  list: (projectId: string): StrategyArtifactRow[] =>
    _listArtifacts.all({ projectId }) as StrategyArtifactRow[],
  listPinned: (projectId: string): StrategyArtifactRow[] =>
    _listPinnedArtifacts.all({ projectId }) as StrategyArtifactRow[],
  update: (row: StrategyArtifactRow) => _updateArtifact.run(row),
  delete: (id: string) =>
    db.prepare("DELETE FROM strategy_artifacts WHERE id = ?").run(id),
  togglePin: (id: string, pinned: boolean) =>
    _togglePin.run({ id, pinned: pinned ? 1 : 0, updatedAt: new Date().toISOString() }),
};

/**
 * getActiveArtifacts — returns all pinned strategy artifacts for a project.
 * Called by generation endpoints to inject context.
 */
export function getActiveArtifacts(projectId: string): StrategyArtifactRow[] {
  return strategyArtifactQueries.listPinned(projectId);
}

// ── Compose jobs ───────────────────────────────────────────────────────────────

const _insertComposeJob = db.prepare<ComposeJobRow>(/* sql */ `
  INSERT OR REPLACE INTO compose_jobs
    (id, projectId, type, status, title, inputConfig, audioTracks, trimPoints, watermarkJobId, outputPath, outputs, duration, createdAt, updatedAt)
  VALUES
    (@id, @projectId, @type, @status, @title, @inputConfig, @audioTracks, @trimPoints, @watermarkJobId, @outputPath, @outputs, @duration, @createdAt, @updatedAt)
`);

const _getComposeJob = db.prepare<{ id: string }>(
  "SELECT * FROM compose_jobs WHERE id = @id"
);

const _listComposeJobsByProject = db.prepare<{ projectId: string }>(
  "SELECT * FROM compose_jobs WHERE projectId = @projectId ORDER BY createdAt DESC"
);

const _updateComposeJobStatus = db.prepare<{
  id: string;
  status: string;
  outputPath: string | null;
  outputs: string;
  duration: number | null;
  updatedAt: string;
}>(/* sql */ `
  UPDATE compose_jobs
  SET status     = @status,
      outputPath = @outputPath,
      outputs    = @outputs,
      duration   = @duration,
      updatedAt  = @updatedAt
  WHERE id = @id
`);

export const composeJobQueries = {
  insert: (row: ComposeJobRow) => _insertComposeJob.run(row),
  getById: (id: string): ComposeJobRow | undefined =>
    _getComposeJob.get({ id }) as ComposeJobRow | undefined,
  listByProject: (projectId: string): ComposeJobRow[] =>
    _listComposeJobsByProject.all({ projectId }) as ComposeJobRow[],
  updateStatus: (opts: {
    id: string;
    status: ComposeJobRow["status"];
    outputPath?: string | null;
    outputs?: string[];
    duration?: number | null;
    updatedAt?: string;
  }) =>
    _updateComposeJobStatus.run({
      id: opts.id,
      status: opts.status,
      outputPath: opts.outputPath ?? null,
      outputs: JSON.stringify(opts.outputs ?? (opts.outputPath ? [opts.outputPath] : [])),
      duration: opts.duration ?? null,
      updatedAt: opts.updatedAt ?? new Date().toISOString(),
    }),
};

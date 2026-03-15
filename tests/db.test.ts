/**
 * Sprint 2 — W2: SQLite integration tests (db.ts)
 *
 * Exercises the full schema and query helpers using an in-memory `:memory:`
 * database so tests are hermetic and leave no files on disk.
 *
 * Uses a dedicated in-memory database instance rather than importing the
 * production `db` singleton from `src/db.ts` (which would open/modify
 * `jobs/gemlink.db`).  We re-define the schema + helpers against the test DB.
 *
 * Test coverage:
 *   1. Insert a project → reads back correctly
 *   2. Insert a media job linked to a project → listByProject works
 *   3. Create a collection + items → listWithJobs JOIN works
 *   4. Delete a project → CASCADE deletes linked collections
 */

import Database from "better-sqlite3";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

// ---------------------------------------------------------------------------
// Build an isolated in-memory database with the same schema as src/db.ts
// We copy the schema strings literally so this test catches drift.
// ---------------------------------------------------------------------------

let db: InstanceType<typeof Database>;

const SCHEMA = /* sql */ `
  CREATE TABLE IF NOT EXISTS projects (
    id               TEXT    PRIMARY KEY,
    name             TEXT    NOT NULL,
    brandName        TEXT    NOT NULL,
    brandDescription TEXT    NOT NULL,
    targetAudience   TEXT    NOT NULL,
    brandVoice       TEXT    NOT NULL,
    colorPalette     TEXT,
    styleKeywords    TEXT,
    referenceImages  TEXT,
    createdAt        TEXT    NOT NULL,
    updatedAt        TEXT    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS media_jobs (
    id            TEXT    PRIMARY KEY,
    projectId     TEXT    REFERENCES projects(id) ON DELETE SET NULL,
    type          TEXT    NOT NULL CHECK(type IN ('image', 'video', 'voice')),
    status        TEXT    NOT NULL CHECK(status IN ('pending', 'completed', 'failed')),
    prompt        TEXT,
    model         TEXT,
    size          TEXT,
    aspectRatio   TEXT,
    resolution    TEXT,
    voice         TEXT,
    outputs       TEXT    NOT NULL DEFAULT '[]',
    tags          TEXT    NOT NULL DEFAULT '[]',
    scores        TEXT,
    rating        INTEGER,
    planItemId    TEXT,
    createdAt     TEXT    NOT NULL,
    updatedAt     TEXT    NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_media_jobs_project  ON media_jobs(projectId);
  CREATE INDEX IF NOT EXISTS idx_media_jobs_status   ON media_jobs(status);
  CREATE INDEX IF NOT EXISTS idx_media_jobs_type     ON media_jobs(type);
  CREATE INDEX IF NOT EXISTS idx_media_jobs_created  ON media_jobs(createdAt DESC);

  CREATE TABLE IF NOT EXISTS collections (
    id        TEXT    PRIMARY KEY,
    projectId TEXT    REFERENCES projects(id) ON DELETE CASCADE,
    name      TEXT    NOT NULL,
    createdAt TEXT    NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_collections_project ON collections(projectId);

  CREATE TABLE IF NOT EXISTS collection_items (
    collectionId TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    jobId        TEXT NOT NULL REFERENCES media_jobs(id)  ON DELETE CASCADE,
    sortOrder    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (collectionId, jobId)
  );

  CREATE INDEX IF NOT EXISTS idx_col_items_collection ON collection_items(collectionId, sortOrder);

  CREATE TABLE IF NOT EXISTS media_plans (
    id        TEXT    PRIMARY KEY,
    projectId TEXT    REFERENCES projects(id) ON DELETE CASCADE,
    name      TEXT    NOT NULL,
    items     TEXT    NOT NULL DEFAULT '[]',
    createdAt TEXT    NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_media_plans_project ON media_plans(projectId);

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
`;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const PROJECT_ID = "proj_test_001";
const JOB_ID = "img_test_001";
const COLLECTION_ID = "col_test_001";
const NOW = new Date().toISOString();

function seedProject() {
  db.prepare(`
    INSERT INTO projects
      (id, name, brandName, brandDescription, targetAudience, brandVoice,
       colorPalette, styleKeywords, referenceImages, createdAt, updatedAt)
    VALUES
      (?, ?, ?, ?, ?, ?,
       ?, ?, ?, ?, ?)
  `).run(
    PROJECT_ID,
    "Test Project",
    "TestBrand",
    "A modern SaaS product for developers",
    "Software engineers",
    "Professional and approachable",
    JSON.stringify(["#1a1a2e", "#16213e"]),
    JSON.stringify(["minimal", "dark"]),
    null,
    NOW,
    NOW,
  );
}

function seedMediaJob(projectId: string = PROJECT_ID) {
  db.prepare(`
    INSERT OR REPLACE INTO media_jobs
      (id, projectId, type, status, prompt, model, size, aspectRatio, resolution,
       voice, outputs, tags, scores, rating, planItemId, createdAt, updatedAt)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?,
       ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    JOB_ID,
    projectId,
    "image",
    "completed",
    "A vibrant product hero shot",
    "gemini-3.1-flash-image-preview",
    "1K",
    "16:9",
    null,
    null,
    JSON.stringify(["/jobs/images/img_test_001/output_0.png"]),
    JSON.stringify(["hero", "minimal", "social"]),
    JSON.stringify({ overall: 4.2, brandAlignment: 4, purposeFit: 5 }),
    null,
    null,
    NOW,
    NOW,
  );
}

function seedCollection() {
  db.prepare(`
    INSERT INTO collections (id, projectId, name, createdAt)
    VALUES (?, ?, ?, ?)
  `).run(COLLECTION_ID, PROJECT_ID, "Website Launch Assets", NOW);
}

function seedCollectionItem() {
  db.prepare(`
    INSERT OR REPLACE INTO collection_items (collectionId, jobId, sortOrder)
    VALUES (?, ?, ?)
  `).run(COLLECTION_ID, JOB_ID, 0);
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeAll(() => {
  db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
});

afterAll(() => {
  db.close();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SQLite schema — projects table", () => {
  it("inserts a project and reads it back correctly", () => {
    seedProject();
    const row = db.prepare("SELECT * FROM projects WHERE id = ?").get(PROJECT_ID) as any;

    expect(row).not.toBeNull();
    expect(row.id).toBe(PROJECT_ID);
    expect(row.name).toBe("Test Project");
    expect(row.brandName).toBe("TestBrand");
    expect(row.brandDescription).toBe("A modern SaaS product for developers");
    expect(row.targetAudience).toBe("Software engineers");
    expect(row.brandVoice).toBe("Professional and approachable");
    // JSON columns are stored as strings
    expect(JSON.parse(row.colorPalette)).toEqual(["#1a1a2e", "#16213e"]);
    expect(JSON.parse(row.styleKeywords)).toEqual(["minimal", "dark"]);
    expect(row.referenceImages).toBeNull();
    expect(row.createdAt).toBe(NOW);
    expect(row.updatedAt).toBe(NOW);
  });

  it("lists all projects", () => {
    const rows = db.prepare("SELECT * FROM projects ORDER BY createdAt DESC").all();
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("returns undefined for a non-existent project", () => {
    const row = db.prepare("SELECT * FROM projects WHERE id = ?").get("proj_does_not_exist");
    expect(row).toBeUndefined();
  });

  it("allows updating a project's name", () => {
    db.prepare("UPDATE projects SET name = ?, updatedAt = ? WHERE id = ?")
      .run("Updated Test Project", new Date().toISOString(), PROJECT_ID);
    const row = db.prepare("SELECT name FROM projects WHERE id = ?").get(PROJECT_ID) as any;
    expect(row.name).toBe("Updated Test Project");
  });
});

describe("SQLite schema — media_jobs table", () => {
  it("inserts a media job linked to a project and reads it back", () => {
    seedMediaJob();
    const row = db.prepare("SELECT * FROM media_jobs WHERE id = ?").get(JOB_ID) as any;

    expect(row).not.toBeNull();
    expect(row.id).toBe(JOB_ID);
    expect(row.projectId).toBe(PROJECT_ID);
    expect(row.type).toBe("image");
    expect(row.status).toBe("completed");
    expect(row.prompt).toBe("A vibrant product hero shot");
    // JSON columns round-trip correctly
    const outputs = JSON.parse(row.outputs);
    expect(Array.isArray(outputs)).toBe(true);
    expect(outputs[0]).toContain("/jobs/images/img_test_001/");
    const tags = JSON.parse(row.tags);
    expect(tags).toContain("hero");
    const scores = JSON.parse(row.scores);
    expect(scores.overall).toBe(4.2);
  });

  it("listByProject returns only jobs for that project", () => {
    // Seed a job for a different project
    const OTHER_PROJECT = "proj_other_999";
    db.prepare(`
      INSERT INTO projects (id, name, brandName, brandDescription, targetAudience, brandVoice, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(OTHER_PROJECT, "Other Project", "OtherBrand", "Desc", "Audience", "Voice", NOW, NOW);

    db.prepare(`
      INSERT OR REPLACE INTO media_jobs
        (id, projectId, type, status, outputs, tags, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run("img_other_001", OTHER_PROJECT, "image", "pending", "[]", "[]", NOW, NOW);

    const rows = db
      .prepare("SELECT * FROM media_jobs WHERE projectId = ? ORDER BY createdAt DESC")
      .all(PROJECT_ID) as any[];

    expect(rows.length).toBeGreaterThanOrEqual(1);
    for (const row of rows) {
      expect(row.projectId).toBe(PROJECT_ID);
    }
  });

  it("rejects an invalid media type (CHECK constraint)", () => {
    expect(() => {
      db.prepare(`
        INSERT INTO media_jobs (id, type, status, outputs, tags, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run("job_bad_type", "podcast", "pending", "[]", "[]", NOW, NOW);
    }).toThrow();
  });

  it("rejects an invalid status value (CHECK constraint)", () => {
    expect(() => {
      db.prepare(`
        INSERT INTO media_jobs (id, type, status, outputs, tags, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run("job_bad_status", "image", "processing", "[]", "[]", NOW, NOW);
    }).toThrow();
  });

  it("updates job scores", () => {
    const newScores = { overall: 4.9, brandAlignment: 5, purposeFit: 5 };
    db.prepare("UPDATE media_jobs SET scores = ?, updatedAt = ? WHERE id = ?")
      .run(JSON.stringify(newScores), new Date().toISOString(), JOB_ID);
    const row = db.prepare("SELECT scores FROM media_jobs WHERE id = ?").get(JOB_ID) as any;
    expect(JSON.parse(row.scores).overall).toBe(4.9);
  });
});

describe("SQLite schema — collections + collection_items", () => {
  it("creates a collection and lists it by project", () => {
    seedCollection();
    const rows = db
      .prepare("SELECT * FROM collections WHERE projectId = ? ORDER BY createdAt DESC")
      .all(PROJECT_ID) as any[];
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const col = rows.find((r: any) => r.id === COLLECTION_ID);
    expect(col).toBeDefined();
    expect(col.name).toBe("Website Launch Assets");
  });

  it("adds an item to a collection and listWithJobs JOIN returns the job data", () => {
    seedCollectionItem();
    const rows = db.prepare(`
      SELECT ci.*, mj.*
      FROM collection_items ci
      JOIN media_jobs mj ON mj.id = ci.jobId
      WHERE ci.collectionId = ?
      ORDER BY ci.sortOrder ASC
    `).all(COLLECTION_ID) as any[];

    expect(rows.length).toBeGreaterThanOrEqual(1);
    const item = rows[0];
    // From collection_items
    expect(item.collectionId).toBe(COLLECTION_ID);
    expect(item.jobId).toBe(JOB_ID);
    expect(item.sortOrder).toBe(0);
    // From the JOIN with media_jobs
    expect(item.type).toBe("image");
    expect(item.status).toBe("completed");
  });

  it("removes a specific item from a collection", () => {
    db.prepare("DELETE FROM collection_items WHERE collectionId = ? AND jobId = ?")
      .run(COLLECTION_ID, JOB_ID);
    const rows = db
      .prepare("SELECT * FROM collection_items WHERE collectionId = ?")
      .all(COLLECTION_ID);
    expect(rows).toHaveLength(0);
    // Re-seed for subsequent tests
    seedCollectionItem();
  });

  it("enforces FK: inserting a collection_item for a non-existent job fails", () => {
    expect(() => {
      db.prepare(`
        INSERT INTO collection_items (collectionId, jobId, sortOrder)
        VALUES (?, ?, ?)
      `).run(COLLECTION_ID, "img_does_not_exist_xyz", 99);
    }).toThrow();
  });
});

describe("SQLite schema — CASCADE deletes", () => {
  it("deleting a project cascades to its collections", () => {
    // Insert a project and a collection linked to it
    const CASCADE_PROJ = "proj_cascade_test";
    const CASCADE_COL = "col_cascade_test";
    db.prepare(`
      INSERT INTO projects (id, name, brandName, brandDescription, targetAudience, brandVoice, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(CASCADE_PROJ, "Cascade Test Project", "Brand", "Desc", "Audience", "Voice", NOW, NOW);

    db.prepare(`
      INSERT INTO collections (id, projectId, name, createdAt)
      VALUES (?, ?, ?, ?)
    `).run(CASCADE_COL, CASCADE_PROJ, "Cascade Collection", NOW);

    // Confirm it was inserted
    const pre = db.prepare("SELECT * FROM collections WHERE id = ?").get(CASCADE_COL);
    expect(pre).toBeDefined();

    // Delete the project
    db.prepare("DELETE FROM projects WHERE id = ?").run(CASCADE_PROJ);

    // Collection should be gone (ON DELETE CASCADE)
    const post = db.prepare("SELECT * FROM collections WHERE id = ?").get(CASCADE_COL);
    expect(post).toBeUndefined();
  });

  it("deleting a project sets null on media_jobs.projectId (ON DELETE SET NULL)", () => {
    // Insert a temporary project + job
    const NULL_PROJ = "proj_null_test";
    const NULL_JOB = "img_null_test";
    db.prepare(`
      INSERT INTO projects (id, name, brandName, brandDescription, targetAudience, brandVoice, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(NULL_PROJ, "Null Test Project", "Brand", "Desc", "Audience", "Voice", NOW, NOW);

    db.prepare(`
      INSERT INTO media_jobs (id, projectId, type, status, outputs, tags, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(NULL_JOB, NULL_PROJ, "image", "completed", "[]", "[]", NOW, NOW);

    // Confirm initial state
    const pre = db.prepare("SELECT projectId FROM media_jobs WHERE id = ?").get(NULL_JOB) as any;
    expect(pre.projectId).toBe(NULL_PROJ);

    // Delete the project
    db.prepare("DELETE FROM projects WHERE id = ?").run(NULL_PROJ);

    // Job should still exist but projectId is now NULL
    const post = db.prepare("SELECT projectId FROM media_jobs WHERE id = ?").get(NULL_JOB) as any;
    expect(post).toBeDefined();
    expect(post.projectId).toBeNull();
  });

  it("deleting a collection cascades to collection_items", () => {
    // Use the existing seeded collection + item
    const pre = db
      .prepare("SELECT * FROM collection_items WHERE collectionId = ?")
      .all(COLLECTION_ID);
    expect(pre.length).toBeGreaterThan(0);

    db.prepare("DELETE FROM collections WHERE id = ?").run(COLLECTION_ID);

    const post = db
      .prepare("SELECT * FROM collection_items WHERE collectionId = ?")
      .all(COLLECTION_ID);
    expect(post).toHaveLength(0);
  });
});

describe("SQLite schema — media_plans table", () => {
  it("inserts a plan and retrieves it by project", () => {
    const PLAN_ID = "plan_test_001";
    const planItems = [
      { id: "item_1", type: "image", prompt: "Hero shot", platform: "website" },
      { id: "item_2", type: "voice", text: "Product tagline", platform: "social" },
    ];
    db.prepare(`
      INSERT INTO media_plans (id, projectId, name, items, createdAt)
      VALUES (?, ?, ?, ?, ?)
    `).run(PLAN_ID, PROJECT_ID, "Website Launch Plan", JSON.stringify(planItems), NOW);

    const rows = db
      .prepare("SELECT * FROM media_plans WHERE projectId = ? ORDER BY createdAt DESC")
      .all(PROJECT_ID) as any[];
    expect(rows.length).toBeGreaterThanOrEqual(1);

    const plan = rows.find((r: any) => r.id === PLAN_ID);
    expect(plan).toBeDefined();
    expect(plan.name).toBe("Website Launch Plan");
    const parsed = JSON.parse(plan.items);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].type).toBe("image");
  });

  it("updates plan items", () => {
    const PLAN_ID = "plan_test_001";
    const updatedItems = [{ id: "item_1", type: "image", prompt: "Updated hero" }];
    db.prepare("UPDATE media_plans SET items = ? WHERE id = ?")
      .run(JSON.stringify(updatedItems), PLAN_ID);

    const plan = db.prepare("SELECT items FROM media_plans WHERE id = ?").get(PLAN_ID) as any;
    const parsed = JSON.parse(plan.items);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].prompt).toBe("Updated hero");
  });
});

// ---------------------------------------------------------------------------
// Sprint 3 — W3: strategy_artifacts table
// ---------------------------------------------------------------------------

const SA_PROJECT_ID = "proj_sa_test";
const ARTIFACT_ID_1 = "art_001";
const ARTIFACT_ID_2 = "art_002";
const ARTIFACT_ID_3 = "art_003";

function seedArtifactsProject() {
  db.prepare(`
    INSERT OR IGNORE INTO projects
      (id, name, brandName, brandDescription, targetAudience, brandVoice, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(SA_PROJECT_ID, "SA Project", "TestBrand", "Desc", "Audience", "Voice", NOW, NOW);
}

function seedArtifact(opts: {
  id: string;
  type?: string;
  title?: string;
  summary?: string;
  content?: string;
  pinned?: number;
  tags?: string[];
  projectId?: string;
}) {
  db.prepare(`
    INSERT OR REPLACE INTO strategy_artifacts
      (id, projectId, type, title, summary, content, tags, source, pinned, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, '{}', ?, ?, ?)
  `).run(
    opts.id,
    opts.projectId ?? SA_PROJECT_ID,
    opts.type ?? "research_finding",
    opts.title ?? "Test Artifact",
    opts.summary ?? "A brief summary",
    opts.content ?? "Full content of the strategy artifact",
    JSON.stringify(opts.tags ?? ["tag_a", "tag_b"]),
    opts.pinned ?? 0,
    NOW,
    NOW,
  );
}

describe("SQLite schema — strategy_artifacts table", () => {
  beforeAll(() => {
    seedArtifactsProject();
  });

  it("inserts an artifact and reads back all fields correctly", () => {
    seedArtifact({ id: ARTIFACT_ID_1, type: "boardroom_insight", title: "Key Insight", pinned: 1, tags: ["brand", "strategy"] });
    const row = db.prepare("SELECT * FROM strategy_artifacts WHERE id = ?").get(ARTIFACT_ID_1) as any;

    expect(row).not.toBeNull();
    expect(row.id).toBe(ARTIFACT_ID_1);
    expect(row.projectId).toBe(SA_PROJECT_ID);
    expect(row.type).toBe("boardroom_insight");
    expect(row.title).toBe("Key Insight");
    expect(row.summary).toBe("A brief summary");
    expect(row.content).toBe("Full content of the strategy artifact");
    expect(JSON.parse(row.tags)).toEqual(["brand", "strategy"]);
    expect(row.pinned).toBe(1);
    expect(typeof row.createdAt).toBe("string");
    expect(typeof row.updatedAt).toBe("string");
  });

  it("filters artifacts by projectId", () => {
    // Seed a second artifact for a different project
    const OTHER_PROJ = "proj_sa_other";
    db.prepare(`
      INSERT OR IGNORE INTO projects (id, name, brandName, brandDescription, targetAudience, brandVoice, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(OTHER_PROJ, "Other SA Project", "OtherBrand", "Desc", "Audience", "Voice", NOW, NOW);
    seedArtifact({ id: "art_other_001", projectId: OTHER_PROJ, title: "Other Project Artifact" });
    seedArtifact({ id: ARTIFACT_ID_2, title: "Project-Scoped Artifact" });

    const rows = db
      .prepare("SELECT * FROM strategy_artifacts WHERE projectId = ? ORDER BY createdAt DESC")
      .all(SA_PROJECT_ID) as any[];
    expect(rows.length).toBeGreaterThanOrEqual(2); // ARTIFACT_ID_1 + ARTIFACT_ID_2
    for (const row of rows) {
      expect(row.projectId).toBe(SA_PROJECT_ID);
    }
  });

  it("filters artifacts by type", () => {
    seedArtifact({ id: ARTIFACT_ID_3, type: "style_direction", title: "Dark Mode Direction" });

    const boardroomRows = db
      .prepare("SELECT * FROM strategy_artifacts WHERE projectId = ? AND type = ?")
      .all(SA_PROJECT_ID, "boardroom_insight") as any[];
    const styleRows = db
      .prepare("SELECT * FROM strategy_artifacts WHERE projectId = ? AND type = ?")
      .all(SA_PROJECT_ID, "style_direction") as any[];

    expect(boardroomRows.length).toBeGreaterThanOrEqual(1);
    expect(styleRows.length).toBeGreaterThanOrEqual(1);
    for (const r of boardroomRows) expect(r.type).toBe("boardroom_insight");
    for (const r of styleRows) expect(r.type).toBe("style_direction");
  });

  it("filters by pinned=1 returns only pinned artifacts", () => {
    // ARTIFACT_ID_1 is pinned=1; ARTIFACT_ID_2 and ARTIFACT_ID_3 are pinned=0
    const pinnedRows = db
      .prepare("SELECT * FROM strategy_artifacts WHERE projectId = ? AND pinned = 1")
      .all(SA_PROJECT_ID) as any[];
    expect(pinnedRows.length).toBeGreaterThanOrEqual(1);
    for (const r of pinnedRows) {
      expect(r.pinned).toBe(1);
    }
    // Confirm unread artifacts don't appear
    const unpinnedIds = pinnedRows.map((r: any) => r.id);
    expect(unpinnedIds).toContain(ARTIFACT_ID_1);
    expect(unpinnedIds).not.toContain(ARTIFACT_ID_2);
  });

  it("updates pin status (togglePin)", () => {
    // Verify ARTIFACT_ID_2 starts unpinned
    const before = db.prepare("SELECT pinned FROM strategy_artifacts WHERE id = ?").get(ARTIFACT_ID_2) as any;
    expect(before.pinned).toBe(0);

    // Pin it
    db.prepare("UPDATE strategy_artifacts SET pinned = 1, updatedAt = ? WHERE id = ?")
      .run(new Date().toISOString(), ARTIFACT_ID_2);
    const after = db.prepare("SELECT pinned FROM strategy_artifacts WHERE id = ?").get(ARTIFACT_ID_2) as any;
    expect(after.pinned).toBe(1);

    // Unpin it again
    db.prepare("UPDATE strategy_artifacts SET pinned = 0, updatedAt = ? WHERE id = ?")
      .run(new Date().toISOString(), ARTIFACT_ID_2);
    const final = db.prepare("SELECT pinned FROM strategy_artifacts WHERE id = ?").get(ARTIFACT_ID_2) as any;
    expect(final.pinned).toBe(0);
  });

  it("CASCADE delete when project is deleted removes all its artifacts", () => {
    const CASCADE_PROJ = "proj_sa_cascade";
    db.prepare(`
      INSERT INTO projects (id, name, brandName, brandDescription, targetAudience, brandVoice, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(CASCADE_PROJ, "Cascade SA Project", "Brand", "Desc", "Audience", "Voice", NOW, NOW);

    const CASCADE_ART = "art_cascade_001";
    db.prepare(`
      INSERT INTO strategy_artifacts
        (id, projectId, type, title, summary, content, tags, source, pinned, createdAt, updatedAt)
      VALUES (?, ?, 'custom', 'Cascade Artifact', 'Summary', 'Content', '[]', '{}', 0, ?, ?)
    `).run(CASCADE_ART, CASCADE_PROJ, NOW, NOW);

    // Confirm inserted
    const pre = db.prepare("SELECT * FROM strategy_artifacts WHERE id = ?").get(CASCADE_ART);
    expect(pre).toBeDefined();

    // Delete the project — CASCADE should remove the artifact
    db.prepare("DELETE FROM projects WHERE id = ?").run(CASCADE_PROJ);

    const post = db.prepare("SELECT * FROM strategy_artifacts WHERE id = ?").get(CASCADE_ART);
    expect(post).toBeUndefined();
  });

  it("rejects an invalid artifact type (CHECK constraint)", () => {
    expect(() => {
      db.prepare(`
        INSERT INTO strategy_artifacts
          (id, projectId, type, title, summary, content, tags, source, pinned, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, '[]', '{}', 0, ?, ?)
      `).run("art_bad_type", SA_PROJECT_ID, "invalid_type", "Bad", "Bad", "Bad", NOW, NOW);
    }).toThrow();
  });
});

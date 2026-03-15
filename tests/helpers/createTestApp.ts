/**
 * Test helper: creates a preconfigured Express app identical to server.ts
 * but without calling app.listen() (supertest handles binding).
 *
 * We also skip Vite middleware so tests run entirely in node.
 *
 * Sprint 2 additions:
 *   - POST /api/media/batch              (H2)
 *   - GET  /api/media/batch/:batchId     (H2)
 *   - POST /api/media/prompt/expand      (H3)
 *   - POST /api/media/prompt/variants    (H4)
 *   - POST /api/media/score              (I3)
 *   - GET  /api/media/history?projectId= (G2)
 *   - POST /api/collections              (J1/W5 placeholder)
 *   - GET  /api/collections              (J1/W5)
 *   - DELETE /api/collections/:id        (J1/W5)
 *
 * Sprint 3 additions:
 *   - POST /api/media/plan/suggest       (W2 — Gemini stubbed)
 *   - POST /api/collections/:id/items   (W2 — items round-trip)
 *   - DELETE /api/collections/:id/items/:jobId
 *   - PUT  /api/collections/:id/items/reorder
 *
 * Sprint 4 additions (Lane 5 — W3):
 *   - POST /api/media/compose            (stub — 400 validation + 202 accepted)
 *   - GET  /api/media/compose/:id        (stub — 404 for unknown, 200 for known)
 *   - POST /api/media/trim               (stub — 400 validation)
 *   - POST /api/media/speed              (stub — 400 validation)
 *   - POST /api/media/overlay/text       (stub — 400 validation)
 *   - POST /api/media/overlay/image      (stub — 400 validation)
 *   - POST /api/media/audio/mix          (stub — 400 validation)
 *   - GET  /api/compose/templates        (stub — returns empty array)
 *   - GET  /api/health                   (updated — includes ffmpeg: boolean)
 */

import express from "express";
import path from "path";
import fs from "fs/promises";
import { listBoardroomSessions, readBoardroomSession } from "../../boardroom.ts";

// ---------------------------------------------------------------------------
// Types mirrored from server.ts (keep in sync)
// ---------------------------------------------------------------------------
type MediaType = "image" | "video" | "voice";
type BatchStatus = "queued" | "generating" | "completed" | "failed";

interface JobManifest {
  id: string;
  type: MediaType;
  createdAt: string;
  updatedAt: string;
  status: "pending" | "completed" | "failed";
  prompt?: string;
  text?: string;
  model?: string;
  size?: string;
  resolution?: string;
  aspectRatio?: string;
  voice?: string;
  brandContext?: unknown;
  projectId?: string;
  outputs: string[];
  logs?: string[];
  error?: string;
  providerOperationName?: string | null;
  tags?: string[];
  score?: Record<string, unknown>;
}

interface BatchJobItem {
  type: MediaType;
  body: Record<string, unknown>;
}

interface BatchState {
  id: string;
  createdAt: string;
  total: number;
  jobIds: Array<string | null>;
  statuses: BatchStatus[];
  errors: Array<string | null>;
}

// Sprint 4: compose job stub
interface ComposeJobStub {
  composeId: string;
  type: string;
  status: "processing" | "completed" | "failed";
  createdAt: string;
}

const jobsDir = path.join(process.cwd(), "jobs");
const jobTypeDirs: Record<MediaType, string> = {
  image: "images",
  video: "videos",
  voice: "voice",
};

function getJobDir(type: MediaType, id: string) {
  return path.join(jobsDir, jobTypeDirs[type], id);
}

function getManifestPath(type: MediaType, id: string) {
  return path.join(getJobDir(type, id), "manifest.json");
}

async function readManifest(type: MediaType, id: string): Promise<JobManifest> {
  const raw = await fs.readFile(getManifestPath(type, id), "utf8");
  return JSON.parse(raw) as JobManifest;
}

async function collectHistory(projectId?: string) {
  const history: JobManifest[] = [];
  for (const type of Object.keys(jobTypeDirs) as MediaType[]) {
    const typeDir = path.join(jobsDir, jobTypeDirs[type]);
    try {
      const jobIds = await fs.readdir(typeDir);
      for (const jobId of jobIds) {
        try {
          const manifest = await readManifest(type, jobId);
          if (projectId && manifest.projectId !== projectId) continue;
          history.push(manifest);
        } catch {
          // ignore broken manifests
        }
      }
    } catch {
      // ignore missing dirs
    }
  }
  history.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  return history;
}

// In-memory batch store (mirrors server.ts batchStore)
const batchStore = new Map<string, BatchState>();

// In-memory compose job store (Sprint 4)
const composeStore = new Map<string, ComposeJobStub>();

function createJobId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------
export function createTestApp() {
  const app = express();
  const api = express.Router();

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  // ── Health (updated Sprint 4: includes ffmpeg field) ────────────────────
  api.get("/health", (_req, res) => {
    res.json({ status: "ok", ffmpeg: false });
  });

  // ── Media history (with optional ?projectId= filter) ────────────────────
  api.get("/media/history", async (req, res) => {
    try {
      const projectId = req.query.projectId as string | undefined;
      res.json(await collectHistory(projectId));
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch history" });
    }
  });

  // ── Media job status ────────────────────────────────────────────────────
  api.get("/media/job/:type/:id", async (req, res) => {
    const type = req.params.type as MediaType;
    if (!jobTypeDirs[type]) {
      return res.status(400).json({ error: `Invalid media type: ${type}` });
    }
    try {
      const manifest = await readManifest(type, req.params.id);
      res.json(manifest);
    } catch (error: any) {
      res.status(404).json({ error: error.message || "Job not found" });
    }
  });

  // ── H2: Batch generation ────────────────────────────────────────────────
  api.post("/media/batch", (req, res) => {
    const { items } = req.body as { items: BatchJobItem[]; apiKey?: string };
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "items must be a non-empty array" });
    }
    const validTypes: MediaType[] = ["image", "video", "voice"];
    for (const item of items) {
      if (!validTypes.includes(item.type)) {
        return res.status(400).json({ error: `Invalid type: ${item.type}` });
      }
    }
    const batchId = `batch-${createJobId()}`;
    const state: BatchState = {
      id: batchId,
      createdAt: new Date().toISOString(),
      total: items.length,
      jobIds: new Array(items.length).fill(null),
      statuses: new Array(items.length).fill("queued") as BatchStatus[],
      errors: new Array(items.length).fill(null),
    };
    batchStore.set(batchId, state);
    // In tests we DO NOT actually run Gemini jobs — just store the placeholder state.
    res.status(202).json({ batchId, total: items.length, jobIds: state.jobIds, statuses: state.statuses });
  });

  api.get("/media/batch/:batchId", (req, res) => {
    const state = batchStore.get(req.params.batchId);
    if (!state) return res.status(404).json({ error: "Batch not found" });
    const done = state.statuses.filter((s) => s === "completed" || s === "failed").length;
    res.set("Cache-Control", "no-store").json({
      ...state,
      summary: {
        total: state.total,
        done,
        generating: state.statuses.filter((s) => s === "generating").length,
        queued: state.statuses.filter((s) => s === "queued").length,
        failed: state.errors.filter(Boolean).length,
      },
      complete: done === state.total,
    });
  });

  // ── H3: Prompt expansion (validation only — Gemini call skipped) ─────────
  api.post("/media/prompt/expand", (req, res) => {
    const { basePrompt } = req.body;
    if (!basePrompt) return res.status(400).json({ error: "basePrompt is required" });
    // Return a stubbed 3-step chain without calling Gemini
    res.json({
      basePrompt,
      expanded: `${basePrompt} [expanded]`,
      refined: `${basePrompt} [expanded] [refined]`,
      final: `${basePrompt} [expanded] [refined] [final]`,
      chain: [
        `${basePrompt} [expanded]`,
        `${basePrompt} [expanded] [refined]`,
        `${basePrompt} [expanded] [refined] [final]`,
      ],
    });
  });

  // ── H4: Prompt variants (validation only) ───────────────────────────────
  api.post("/media/prompt/variants", (req, res) => {
    const { expandedPrompt, count = 4 } = req.body;
    if (!expandedPrompt) return res.status(400).json({ error: "expandedPrompt is required" });
    const styles = ["photorealistic", "illustrated", "abstract", "typographic", "cinematic"];
    const variants = (styles.slice(0, count) as string[]).map((style) => ({
      style,
      prompt: `${expandedPrompt} — ${style} style`,
    }));
    res.json({ expandedPrompt, variants });
  });

  // ── I3: Media scoring (validation only — requires a completed job) ───────
  api.post("/media/score", async (req, res) => {
    const { jobId, jobType } = req.body;
    if (!jobId || !jobType) {
      return res.status(400).json({ error: "jobId and jobType are required" });
    }
    if (!jobTypeDirs[jobType as MediaType]) {
      return res.status(400).json({ error: "Invalid jobType" });
    }
    // Try to read manifest — if job doesn't exist return 404-equivalent error
    try {
      const manifest = await readManifest(jobType as MediaType, jobId);
      if (manifest.status !== "completed" || manifest.outputs.length === 0) {
        return res.status(400).json({ error: "Job is not completed or has no outputs" });
      }
      // Return stubbed scores (no Gemini call in tests)
      res.json({
        jobId,
        jobType,
        scores: {
          brandAlignment: 4,
          purposeFit: 4,
          technicalQuality: 4,
          audienceMatch: 4,
          uniqueness: 3,
        },
        overall: 3.8,
        reasoning: "Test stub score",
        suggestions: [],
      });
    } catch {
      // manifest read failed — job doesn't exist
      return res.status(400).json({ error: "Job not found or not readable" });
    }
  });

  // ── W2 (Sprint 3): POST /api/media/plan/suggest (Gemini stubbed) ─────────
  api.post("/media/plan/suggest", (req, res) => {
    const { description, projectContext } = req.body;
    if (!description) {
      return res.status(400).json({ error: "description is required" });
    }
    if (!projectContext) {
      return res.status(400).json({ error: "projectContext is required" });
    }
    // Stub: return 3 synthetic plan items without calling Gemini
    const items = [
      {
        id: `item_${createJobId()}`,
        type: "image",
        label: "Hero Banner",
        purpose: "Website hero section",
        promptTemplate: `${description} — hero banner, wide format`,
        status: "draft",
        generatedJobIds: [],
        tags: ["hero", "website"],
      },
      {
        id: `item_${createJobId()}`,
        type: "video",
        label: "Intro Video",
        purpose: "YouTube / social",
        promptTemplate: `Cinematic intro for: ${description}`,
        status: "draft",
        generatedJobIds: [],
        tags: ["video", "social"],
      },
      {
        id: `item_${createJobId()}`,
        type: "voice",
        label: "Voiceover",
        purpose: "Ad spot",
        promptTemplate: `30-second voiceover: ${description}`,
        status: "draft",
        generatedJobIds: [],
        tags: ["voice", "ad"],
      },
    ];
    res.json({ items, count: items.length });
  });

  // ── Collections CRUD (in-memory stub, mirrors server W5 shape) ──────────
  const collectionsStore = new Map<string, { id: string; projectId: string; name: string; createdAt: string }>();
  // collection_items: collectionId -> Array<{jobId, sortOrder}>
  const collectionItemsStore = new Map<string, Array<{ jobId: string; sortOrder: number }>>();

  api.post("/collections", (req, res) => {
    const { name, projectId } = req.body;
    if (!name || !projectId) {
      return res.status(400).json({ error: "name and projectId are required" });
    }
    const id = `col-${createJobId()}`;
    const col = { id, name: String(name), projectId: String(projectId), createdAt: new Date().toISOString() };
    collectionsStore.set(id, col);
    collectionItemsStore.set(id, []);
    res.status(201).json(col);
  });

  api.get("/collections", (req, res) => {
    const { projectId } = req.query;
    if (!projectId) return res.status(400).json({ error: "projectId is required" });
    const results = Array.from(collectionsStore.values()).filter((c) => c.projectId === projectId);
    res.json(results);
  });

  api.get("/collections/:id", (req, res) => {
    const col = collectionsStore.get(req.params.id);
    if (!col) return res.status(404).json({ error: "Collection not found" });
    const items = collectionItemsStore.get(req.params.id) ?? [];
    res.json({ ...col, items });
  });

  // Add item to collection
  api.post("/collections/:id/items", (req, res) => {
    const { id } = req.params;
    if (!collectionsStore.has(id)) return res.status(404).json({ error: "Collection not found" });
    const { jobId } = req.body;
    if (!jobId) return res.status(400).json({ error: "jobId is required" });
    const items = collectionItemsStore.get(id) ?? [];
    const sortOrder = items.length;
    items.push({ jobId: String(jobId), sortOrder });
    collectionItemsStore.set(id, items);
    res.status(201).json({ collectionId: id, jobId, sortOrder });
  });

  // Remove item from collection
  api.delete("/collections/:id/items/:jobId", (req, res) => {
    const { id, jobId } = req.params;
    if (!collectionsStore.has(id)) return res.status(404).json({ error: "Collection not found" });
    const items = (collectionItemsStore.get(id) ?? []).filter((i) => i.jobId !== jobId);
    collectionItemsStore.set(id, items);
    res.json({ ok: true });
  });

  // Reorder items
  api.put("/collections/:id/items/reorder", (req, res) => {
    const { id } = req.params;
    if (!collectionsStore.has(id)) return res.status(404).json({ error: "Collection not found" });
    const { order } = req.body as { order: string[] };
    if (!Array.isArray(order)) return res.status(400).json({ error: "order must be an array" });
    const current = collectionItemsStore.get(id) ?? [];
    const reordered = order.map((jobId, idx) => {
      const existing = current.find((i) => i.jobId === jobId);
      return { jobId, sortOrder: idx, ...(existing ? {} : {}) };
    });
    collectionItemsStore.set(id, reordered);
    res.json({ ok: true, count: reordered.length });
  });

  api.delete("/collections/:id", (req, res) => {
    const { id } = req.params;
    if (!collectionsStore.has(id)) return res.status(404).json({ error: "Collection not found" });
    collectionsStore.delete(id);
    collectionItemsStore.delete(id);
    res.json({ ok: true });
  });

  // ── Boardroom sessions ──────────────────────────────────────────────────
  api.get("/boardroom/sessions", async (_req, res) => {
    try {
      res.json(await listBoardroomSessions());
    } catch (error: any) {
      res
        .status(500)
        .json({ error: error.message || "Failed to fetch boardroom sessions" });
    }
  });

  api.get("/boardroom/sessions/:id", async (req, res) => {
    try {
      const session = await readBoardroomSession(req.params.id);
      res.set("Cache-Control", "no-store").set("Pragma", "no-cache").json(session);
    } catch (error: any) {
      res.status(404).json({ error: error.message || "Boardroom session not found" });
    }
  });

  // ── Research validation (body-only; actual Gemini calls require a live key) ─
  api.post("/research/search", async (req, res) => {
    const { query } = req.body;
    if (!query) {
      return res.status(400).json({ error: "query is required" });
    }
    // Real implementation calls Gemini — tested only for validation here
    res.status(501).json({ error: "Not callable in test environment" });
  });

  api.post("/research/think", async (req, res) => {
    const { query } = req.body;
    if (!query) {
      return res.status(400).json({ error: "query is required" });
    }
    res.status(501).json({ error: "Not callable in test environment" });
  });

  // ── Video analysis validation ───────────────────────────────────────────
  api.post("/media/video/analyze", async (req, res) => {
    const { videoData, mimeType } = req.body;
    if (!videoData || !mimeType) {
      return res.status(400).json({ error: "videoData and mimeType are required" });
    }
    res.status(501).json({ error: "Not callable in test environment" });
  });

  // ── Sprint 4: Compose endpoints (stub implementations) ──────────────────

  /**
   * POST /api/media/compose
   * Validation stub — no FFmpeg required.
   * 400 for validation errors, 202 for valid requests.
   */
  api.post("/media/compose", (req, res) => {
    const body = req.body as Record<string, unknown>;
    const type = body.type as string | undefined;

    if (!type) {
      return res.status(400).json({ error: "type is required" });
    }
    const validTypes = ["merge", "slideshow", "caption"];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        error: `type must be one of "merge", "slideshow", "caption"`,
      });
    }

    if (type === "slideshow") {
      const slides = body.slides as unknown[] | undefined;
      if (!slides || !Array.isArray(slides) || slides.length === 0) {
        return res.status(400).json({
          error: "slideshow requires at least one slide in the slides[] array",
        });
      }
    }

    const composeId = `compose_test_${createJobId()}`;
    const job: ComposeJobStub = {
      composeId,
      type,
      status: "processing",
      createdAt: new Date().toISOString(),
    };
    composeStore.set(composeId, job);
    res.status(202).json({ composeId, status: "processing" });
  });

  /**
   * GET /api/media/compose/:id
   * Returns 404 for unknown ids, 200 for known stub jobs.
   */
  api.get("/media/compose/:id", (req, res) => {
    const job = composeStore.get(req.params.id);
    if (!job) {
      return res.status(404).json({ error: "Compose job not found" });
    }
    res.json(job);
  });

  /**
   * POST /api/media/trim
   * Validates jobId, start, duration.
   */
  api.post("/media/trim", (req, res) => {
    const { jobId, start, duration } = req.body;
    if (!jobId) {
      return res.status(400).json({ error: "jobId is required" });
    }
    if (start === undefined || start === null) {
      return res.status(400).json({ error: "start is required" });
    }
    if (duration === undefined || duration === null) {
      return res.status(400).json({ error: "duration is required" });
    }
    if (typeof duration === "number" && duration < 0) {
      return res.status(400).json({ error: "duration must be non-negative" });
    }
    res.status(202).json({ ok: true, jobId, start, duration });
  });

  /**
   * POST /api/media/speed
   * Validates jobId, factor (must be 0.25–4.0).
   */
  api.post("/media/speed", (req, res) => {
    const { jobId, factor } = req.body;
    if (!jobId) {
      return res.status(400).json({ error: "jobId is required" });
    }
    if (factor === undefined || factor === null) {
      return res.status(400).json({ error: "factor is required" });
    }
    if (typeof factor === "number" && factor < 0.25) {
      return res.status(400).json({ error: "factor must be >= 0.25" });
    }
    if (typeof factor === "number" && factor > 4.0) {
      return res.status(400).json({ error: "factor must be <= 4.0" });
    }
    res.status(202).json({ ok: true, jobId, factor });
  });

  /**
   * POST /api/media/overlay/text
   * Validates jobId, overlays[].
   */
  api.post("/media/overlay/text", (req, res) => {
    const { jobId, overlays } = req.body;
    if (!jobId) {
      return res.status(400).json({ error: "jobId is required" });
    }
    if (!overlays) {
      return res.status(400).json({ error: "overlays is required" });
    }
    if (!Array.isArray(overlays) || overlays.length === 0) {
      return res.status(400).json({ error: "overlays must be a non-empty array" });
    }
    res.status(202).json({ ok: true, jobId, overlayCount: overlays.length });
  });

  /**
   * POST /api/media/overlay/image
   * Validates videoJobId, imageJobId.
   */
  api.post("/media/overlay/image", (req, res) => {
    const { videoJobId, imageJobId } = req.body;
    if (!videoJobId) {
      return res.status(400).json({ error: "videoJobId is required" });
    }
    if (!imageJobId) {
      return res.status(400).json({ error: "imageJobId is required" });
    }
    res.status(202).json({ ok: true, videoJobId, imageJobId });
  });

  /**
   * POST /api/media/audio/mix
   * Validates tracks[] non-empty, volume within range.
   */
  api.post("/media/audio/mix", (req, res) => {
    const { tracks } = req.body;
    if (!tracks || !Array.isArray(tracks) || tracks.length === 0) {
      return res.status(400).json({ error: "tracks must be a non-empty array" });
    }
    for (const track of tracks) {
      if (track.volume !== undefined && typeof track.volume === "number" && track.volume > 1) {
        return res.status(400).json({ error: "track volume must be <= 1.0" });
      }
    }
    res.status(202).json({ ok: true, trackCount: tracks.length });
  });

  /**
   * GET /api/compose/templates
   * Returns an array (may be empty if Lane 3 hasn't shipped).
   */
  api.get("/compose/templates", (_req, res) => {
    res.json([]);
  });

  app.use("/api", api);
  return app;
}

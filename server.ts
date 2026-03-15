import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs/promises";
import twilio from "twilio";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { startBoardroomSessionAsync, listBoardroomSessions, readBoardroomSession, extractMediaBriefs, STRATEGY_ANALYSIS_TEMPLATE, extractStrategyAnalysisOutput } from "./boardroom.ts";
import { mediaJobQueries, collectionQueries, collectionItemQueries, strategyArtifactQueries, getActiveArtifacts, composeJobQueries, idempotencyQueries, type MediaJobRow, type StrategyArtifactRow, type ArtifactType, type ComposeJobRow } from "./src/db.ts";
import type { SlideInput as ComposeSlideInput } from "./compose.ts";
import { loadTemplates, getTemplate, type ComposeTemplate } from "./templates.ts";
// ── L1-S4.5 + L2-S4.5: Centralized config import ───────────────────────────
import { models, defaults as cfgDefaultsTop, features as cfgFeaturesTop, server as serverConfig, app as cfgAppTop, rateLimits } from "./config.ts";


// ── W1 (L5): FFmpeg availability state — populated on server start ─────────────
let _serverFfmpegAvailable = false;
let _serverFfmpegVersion: string | undefined;

async function checkFfmpegOnStartup(): Promise<void> {
  try {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);
    const [ffmpegResult] = await Promise.allSettled([
      execFileAsync("ffmpeg", ["-version"]),
    ]);
    if (ffmpegResult.status === "fulfilled") {
      _serverFfmpegAvailable = true;
      // Extract version string from first line: "ffmpeg version X.Y.Z ..."
      const firstLine = ffmpegResult.value.stdout.split("\n")[0] ?? "";
      const versionMatch = firstLine.match(/ffmpeg version (\S+)/);
      _serverFfmpegVersion = versionMatch?.[1];
      console.log(`[health] FFmpeg available — version: ${_serverFfmpegVersion ?? "unknown"}`);
    } else {
      _serverFfmpegAvailable = false;
      console.warn("[health] WARNING: ffmpeg not found. Compose features will be disabled. Run: sudo apt install ffmpeg");
    }
  } catch {
    _serverFfmpegAvailable = false;
  }
}

dotenv.config({ path: path.join(process.cwd(), ".env.local") });
dotenv.config();

export type MediaType = "image" | "video" | "voice" | "music";
export type JobStatus = "pending" | "completed" | "failed";

export interface MediaScore {
  brandAlignment: number;
  purposeFit: number;
  technicalQuality: number;
  audienceMatch: number;
  uniqueness: number;
  overall: number;
  reasoning: string;
  suggestions: string[];
}

export interface JobManifest {
  id: string;
  type: MediaType;
  createdAt: string;
  updatedAt: string;
  status: JobStatus;
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
  score?: MediaScore;
}

const PORT = Number(process.env.PORT || 3000);
const jobsDir = path.join(process.cwd(), "jobs");

// ── SAFETY: Maximum iterations for any polling/retry loop. ──────────────────
// An agent working on this codebase MUST ensure ALL loops that await external
// APIs (video polling, batch retries, operation polling) have a hard upper
// bound. NEVER use an open-ended `while (true)` or `while (!condition)` loop
// without a maximum attempt counter. If you add a new loop, add a MAX guard.
// Current limits:
//   • Video polling: serverConfig.maxVideoPollAttempts (from config.ts, default 360 × 10 s = ~60 min)
//   • Batch retry on 429: max 3 retries with exponential backoff (see GenerationQueue)
//   • Boardroom: bounded by MAX_ROUNDS (5) × MAX_SEATS (5), see boardroom.ts
// MAX_VIDEO_POLL_ATTEMPTS replaced with serverConfig.maxVideoPollAttempts (from config.ts)
// L2-S4.5: Use serverConfig.maxVideoPollAttempts everywhere this was used.
const jobTypeDirs: Record<MediaType, string> = {
  image: "images",
  video: "videos",
  voice: "voice",
  music: "music",
};

function requireApiKey(explicitKey?: string) {
  const key = explicitKey || process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY is missing. Set it in .env.local or provide apiKey in the request.");
  }
  return key;
}

function createJobId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function ensureJobDirectories() {
  await Promise.all(
    Object.values(jobTypeDirs).map((dir) => fs.mkdir(path.join(jobsDir, dir), { recursive: true })),
  );
}

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

/** Map a JobManifest to the SQLite MediaJobRow shape (W1) */
function manifestToRow(manifest: JobManifest): MediaJobRow {
  return {
    id: manifest.id,
    projectId: manifest.projectId ?? null,
    type: manifest.type,
    status: manifest.status,
    prompt: manifest.prompt ?? null,
    model: manifest.model ?? null,
    size: manifest.size ?? null,
    aspectRatio: manifest.aspectRatio ?? null,
    resolution: manifest.resolution ?? null,
    voice: manifest.voice ?? null,
    outputs: JSON.stringify(manifest.outputs ?? []),
    tags: JSON.stringify(manifest.tags ?? []),
    scores: manifest.score ? JSON.stringify(manifest.score) : null,
    rating: null,
    planItemId: null,
    createdAt: manifest.createdAt,
    updatedAt: manifest.updatedAt,
  };
}

async function writeManifest(manifest: JobManifest) {
  await fs.mkdir(getJobDir(manifest.type, manifest.id), { recursive: true });
  await fs.writeFile(getManifestPath(manifest.type, manifest.id), JSON.stringify(manifest, null, 2));
  // W1: also index in SQLite
  try { mediaJobQueries.upsert(manifestToRow(manifest)); } catch (dbErr) { console.error("[db] writeManifest upsert failed:", dbErr); }
}

async function patchManifest(
  type: MediaType,
  id: string,
  update: Partial<JobManifest> | ((current: JobManifest) => JobManifest),
) {
  const current = await readManifest(type, id);
  const next = typeof update === "function" ? update(current) : { ...current, ...update };
  next.updatedAt = new Date().toISOString();
  await writeManifest(next); // writeManifest already calls mediaJobQueries.upsert
  return next;
}

function appendLog(manifest: JobManifest, message: string) {
  const stamped = `[${new Date().toISOString()}] ${message}`;
  return [...(manifest.logs || []), stamped].slice(-40);
}

function pcm16ToWav(buffer: Buffer, sampleRate = 24000, channels = 1) {
  const bitsPerSample = 16;
  const byteRate = sampleRate * channels * bitsPerSample / 8;
  const blockAlign = channels * bitsPerSample / 8;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + buffer.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(buffer.length, 40);
  return Buffer.concat([header, buffer]);
}

async function collectHistory(projectId?: string) {
  // W1: Use SQLite index for project-scoped queries (O(1) vs O(N) flat-file scan)
  if (projectId) {
    try {
      const rows = mediaJobQueries.listByProject(projectId);
      // Map DB rows back to JobManifest shape so callers get the same shape
      return rows.map((row) => ({
        id: row.id,
        type: row.type as MediaType,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        status: row.status as JobManifest["status"],
        prompt: row.prompt ?? undefined,
        model: row.model ?? undefined,
        size: row.size ?? undefined,
        resolution: row.resolution ?? undefined,
        aspectRatio: row.aspectRatio ?? undefined,
        voice: row.voice ?? undefined,
        projectId: row.projectId ?? undefined,
        outputs: JSON.parse(row.outputs) as string[],
        tags: JSON.parse(row.tags) as string[],
        score: row.scores ? JSON.parse(row.scores) : undefined,
      } as JobManifest));
    } catch (dbErr) {
      console.error("[db] collectHistory fallback to flat-file due to:", dbErr);
      // fall through to flat-file scan below
    }
  }

  // No projectId filter — full flat-file scan (unchanged behaviour)
  const history: JobManifest[] = [];
  for (const type of Object.keys(jobTypeDirs) as MediaType[]) {
    const typeDir = path.join(jobsDir, jobTypeDirs[type]);
    try {
      const jobIds = await fs.readdir(typeDir);
      for (const jobId of jobIds) {
        try {
          const manifest = await readManifest(type, jobId);
          history.push(manifest);
        } catch {
          // Ignore broken/missing manifests so one bad job does not poison the library.
        }
      }
    } catch {
      // Ignore missing directories.
    }
  }
  history.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return history;
}

// ── H2: GenerationQueue types (hoisted so W3 helpers can reference them) ──────

interface BatchJobItem {
  type: MediaType;
  body: Record<string, unknown>;
}

export interface BatchState {
  id: string;
  createdAt: string;
  total: number;
  jobIds: Array<string | null>;
  statuses: Array<"queued" | "generating" | "completed" | "failed">;
  errors: Array<string | null>;
}

// ── W3: Batch state persistence helpers ─────────────────────────────────────

const batchesDir = path.join(process.cwd(), "jobs", "batches");

async function saveBatchState(state: BatchState): Promise<void> {
  try {
    const dir = path.join(batchesDir, state.id);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "state.json"), JSON.stringify(state, null, 2));
  } catch (err) {
    console.error(`[batch] Failed to persist state for ${state.id}:`, err);
  }
}

async function loadBatchStates(): Promise<Map<string, BatchState>> {
  const map = new Map<string, BatchState>();
  try {
    await fs.mkdir(batchesDir, { recursive: true });
    const entries = await fs.readdir(batchesDir);
    for (const entry of entries) {
      try {
        const raw = await fs.readFile(path.join(batchesDir, entry, "state.json"), "utf8");
        const state = JSON.parse(raw) as BatchState;
        // W3: Mark any mid-generation jobs as failed on restart (they will never complete)
        state.statuses = state.statuses.map((s) =>
          s === "generating" || s === "queued" ? "failed" : s
        );
        state.errors = state.statuses.map((s, i) =>
          s === "failed" && !state.errors[i] ? "Server restarted while job was in progress" : state.errors[i]
        );
        map.set(state.id, state);
        // Persist the recovered state back to disk
        await saveBatchState(state);
      } catch {
        // Ignore unreadable state files
      }
    }
  } catch {
    // Ignore if directory doesn't exist yet
  }
  return map;
}

// ── W3: Style & Psychology Database ───────────────────────────────────────────

interface StyleDatabase {
  colorPsychology: Record<string, unknown>;
  audienceArchetypes: Record<string, unknown>;
  styleArchetypes: Record<string, unknown>;
}

let cachedStyleDb: StyleDatabase | null = null;

async function loadStyleDatabase(): Promise<StyleDatabase> {
  if (cachedStyleDb) return cachedStyleDb;
  const baseDir = path.join(process.cwd(), "data", "style-db");
  const [colorPsychology, audienceArchetypes, styleArchetypes] = await Promise.all([
    fs.readFile(path.join(baseDir, "color-psychology.json"), "utf8").then(JSON.parse).catch(() => ({})),
    fs.readFile(path.join(baseDir, "audience-archetypes.json"), "utf8").then(JSON.parse).catch(() => ({})),
    fs.readFile(path.join(baseDir, "style-archetypes.json"), "utf8").then(JSON.parse).catch(() => ({})),
  ]);
  cachedStyleDb = { colorPsychology, audienceArchetypes, styleArchetypes };
  console.log("[style-db] Loaded color psychology, audience archetypes, style archetypes.");
  return cachedStyleDb;
}

async function startServer() {
  const app = express();
  const api = express.Router();

  // ── L2-S7 (W1): Agent Identity Tracking middleware ────────────────────────
  app.use((req, _res, next) => {
    const agentId = req.headers["x-agent-id"];
    const agentSession = req.headers["x-agent-session"];
    const agentLane = req.headers["x-agent-lane"];
    if (agentId || agentSession || agentLane) {
      console.log(`[agent-tracking] ID:${agentId || "none"} | Session:${agentSession || "none"} | Lane:${agentLane || "none"} | ${req.method} ${req.url}`);
    }
    next();
  });

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  await ensureJobDirectories();
  app.use("/jobs", express.static(jobsDir));

  // W1 (L5): Check FFmpeg availability on startup
  await checkFfmpegOnStartup();

  const SETTINGS_FILE = path.join(process.cwd(), "data", "settings.json");
  let runtimeSettings: any = { models: {}, defaults: {}, features: {}, app: {} };
  try {
    const data = await fs.readFile(SETTINGS_FILE, "utf8");
    runtimeSettings = JSON.parse(data);
    console.log("[settings] Loaded runtime overrides from data/settings.json");
  } catch {
  }
  
  function getMergedModels(): Record<string, string> {
    return { ...models, ...(runtimeSettings.models ?? {}) };
  }
  function getMergedDefaults(): Record<string, unknown> {
    return { ...cfgDefaultsTop, ...(runtimeSettings.defaults ?? {}) };
  }
  function getMergedFeatures(): Record<string, boolean> {
    return { ...cfgFeaturesTop, ...(runtimeSettings.features ?? {}) };
  }

  // ── I4: autoTagMedia — fire-and-forget helper ────────────────────────────────
  async function autoTagMedia(
    type: MediaType,
    id: string,
    filePath: string,
    apiKey: string,
    promptText?: string,
  ): Promise<void> {
    try {
      const ai = new GoogleGenAI({ apiKey });
      let tags: string[] = [];
      if (type === "image" && filePath) {
        const imgData = await fs.readFile(filePath);
        const resp = await ai.models.generateContent({
          model: getMergedModels().multimodal,
          contents: {
            parts: [
              { inlineData: { data: imgData.toString("base64"), mimeType: "image/png" } },
              { text: "Analyze this image. Return a JSON array of short tags covering: content type (hero,social,thumbnail,icon,background), style (minimal,bold,corporate,playful,abstract,photorealistic,illustrated), platform (instagram,twitter,linkedin,website,pitch-deck,youtube). Respond ONLY with a valid JSON array of strings, nothing else." },
            ],
          },
        });
        const txt = resp.text?.trim() ?? "[]";
        const m = txt.match(/\[[\s\S]*?\]/);
        if (m) tags = JSON.parse(m[0]);
      } else if (promptText) {
        const resp = await ai.models.generateContent({
          model: getMergedModels().text,
          contents: `Given this ${type} generation prompt: "${promptText.slice(0, 300)}", return a JSON array of short tags (content type, style, platform/purpose). Respond ONLY with a valid JSON array of strings.`,
        });
        const txt = resp.text?.trim() ?? "[]";
        const m = txt.match(/\[[\s\S]*?\]/);
        if (m) tags = JSON.parse(m[0]);
      }
      if (tags.length > 0) await patchManifest(type, id, { tags });
    } catch (err) {
      console.error(`Auto-tag skipped for ${type}/${id}:`, err);
    }
  }

  api.get("/health", (_req, res) => {
    const health: Record<string, unknown> = {
      status: "ok",
      ffmpeg: _serverFfmpegAvailable,
    };
    if (_serverFfmpegVersion) health.ffmpegVersion = _serverFfmpegVersion;
    res.json(health);
  });

  // ── W3: Load style database on startup + serve via API ─────────────────────
  await loadStyleDatabase();

  

  api.get("/style-db", async (_req, res) => {
    try {
      const db = await loadStyleDatabase();
      res.json(db);
    } catch (err: any) {
      console.error("Style DB Error:", err);
      res.status(500).json({ error: err.message ?? "Failed to load style database" });
    }
  });

  // ── L3-S7 (W2): Rate Limiting Middleware ─────────────────────────────────────
  interface RateTracker { count: number; resetAt: number; }
  const rateTrackers = new Map<string, RateTracker>();

  function rateLimitMiddleware(type: keyof typeof rateLimits) {
    return (req: any, res: any, next: any) => {
      const limit = rateLimits[type] || 60;
      const now = Date.now();
      
      let tracker = rateTrackers.get(type);
      if (!tracker || tracker.resetAt <= now) {
        tracker = { count: 0, resetAt: now + 60000 };
        rateTrackers.set(type, tracker);
      }

      const reqId = req.headers["x-request-id"] || `req_${Date.now()}`;
      res.setHeader("X-Request-Id", reqId as string);

      if (tracker.count >= limit) {
        res.setHeader("X-RateLimit-Limit", limit.toString());
        res.setHeader("X-RateLimit-Remaining", "0");
        res.setHeader("X-RateLimit-Reset", Math.floor(tracker.resetAt / 1000).toString());
        res.setHeader("Retry-After", Math.ceil((tracker.resetAt - now) / 1000).toString());
        return res.status(429).json({ error: `Rate limit exceeded for ${type}. Try again later.` });
      }

      tracker.count++;
      res.setHeader("X-RateLimit-Limit", limit.toString());
      res.setHeader("X-RateLimit-Remaining", (limit - tracker.count).toString());
      res.setHeader("X-RateLimit-Reset", Math.floor(tracker.resetAt / 1000).toString());
      next();
    };
  }

  // ── L3-S7 (W3): Queue and Cancellation Tracking ──────────────────────────────
  const jobTracker = {
    running: { image: 0, video: 0, voice: 0, music: 0, boardroom: 0, compose: 0 },
    pending: { image: 0, video: 0, voice: 0, music: 0, boardroom: 0, compose: 0 },
    cancellations: new Set<string>(),
    activeOperations: new Map<string, any>(),
  };

  api.get("/queue", (req, res) => {
    const rateLimitStatus: Record<string, any> = {};
    for (const [type, limit] of Object.entries(rateLimits)) {
      const tracker = rateTrackers.get(type);
      rateLimitStatus[type] = {
        callsThisMinute: tracker ? tracker.count : 0,
        limit,
      };
    }
    res.json({
      running: jobTracker.running,
      pending: jobTracker.pending,
      rateLimitStatus,
    });
  });

  api.post("/media/job/:type/:id/cancel", async (req, res) => {
    const { type, id } = req.params;
    jobTracker.cancellations.add(id);
    
    const op = jobTracker.activeOperations.get(id);
    if (op && typeof op.cancel === 'function') {
      try { await op.cancel(); } catch (e) { console.error("Cancel error", e); }
    }
    
    try {
      if (jobTypeDirs[type as MediaType]) {
        await patchManifest(type as MediaType, id, (m) => ({
          ...m,
          status: "failed",
          error: "Cancelled by user",
          logs: appendLog(m, "Job cancelled by user request."),
        }));
      }
    } catch {}

    res.json({ success: true, message: `Cancellation requested for job ${id}` });
  });

  api.post("/media/image", rateLimitMiddleware("image"), async (req, res) => {
    try {
      jobTracker.running.image++;
      // ── L2-S7 (W3): Idempotency wrapper (image) ──
      const idempotencyKey = req.headers["idempotency-key"] as string | undefined;
      if (idempotencyKey) {
        const cached = idempotencyQueries.get(`${idempotencyKey}-image`);
        if (cached) return res.status(200).json(cached);
      }

      const { prompt, model, size, aspectRatio, count, brandContext, projectId, apiKey } = req.body;
      // ── L2-S7 (W4): Dry-Run Mode (image) ──
      const dryRun = req.headers["x-dry-run"] || req.body["dry-run"];
      if (dryRun) {
        return res.status(200).json({ valid: true, estimatedCredits: 1, model: model || getMergedModels().image });
      }
      const key = requireApiKey(apiKey);
      const ai = new GoogleGenAI({ apiKey: key });

      const jobId = createJobId();
      const manifest: JobManifest = {
        id: jobId,
        type: "image",
        prompt,
        model: model || getMergedModels().image,
        size: size || "1K",
        aspectRatio: aspectRatio || "1:1",
        brandContext,
        projectId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: "pending",
        outputs: [],
        logs: [`[${new Date().toISOString()}] Image request received.`],
      };
      await writeManifest(manifest);

      const response = await ai.models.generateContent({
        model: manifest.model!,
        contents: { parts: [{ text: prompt }] },
        config: {
          imageConfig: {
            aspectRatio: manifest.aspectRatio || "1:1",
            imageSize: manifest.size,
          },
        },
      });

      const outputs: string[] = [];
      const parts = response.candidates?.[0]?.content?.parts || [];
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (!part.inlineData?.data) continue;
        const fileName = `output_${i}.png`;
        await fs.writeFile(
          path.join(getJobDir("image", jobId), fileName),
          Buffer.from(part.inlineData.data, "base64"),
        );
        outputs.push(`/jobs/images/${jobId}/${fileName}`);
      }

      const finalManifest = await patchManifest("image", jobId, (current) => ({
        ...current,
        status: outputs.length > 0 ? "completed" : "failed",
        outputs,
        error: outputs.length > 0 ? undefined : "Model returned no image data.",
        logs: appendLog(current, outputs.length > 0 ? `Saved ${outputs.length} image output(s).` : "No image data returned."),
      }));

      // I4: Auto-tag via Gemini vision (fire-and-forget)
      if (outputs.length > 0) {
        void autoTagMedia("image", jobId, path.join(getJobDir("image", jobId), "output_0.png"), key, prompt);
      }

      if (idempotencyKey) idempotencyQueries.insert(`${idempotencyKey}-image`, finalManifest);
      res.json(finalManifest);
    } catch (error: any) {
      console.error("Image Generation Error:", error);
      res.status(500).json({ error: error.message || "Failed to generate image" });
    } finally {
      jobTracker.running.image--;
    }
  });

  api.post("/media/video", rateLimitMiddleware("video"), async (req, res) => {
    try {
      jobTracker.running.video++;
      // ── L2-S7 (W3): Idempotency wrapper (video) ──
      const idempotencyKey = req.headers["idempotency-key"] as string | undefined;
      if (idempotencyKey) {
        const cached = idempotencyQueries.get(`${idempotencyKey}-video`);
        if (cached) return res.status(200).json(cached);
      }

      const { prompt, model, resolution, aspectRatio, brandContext, projectId, apiKey, imageBytes, mimeType } = req.body;
      // ── L2-S7 (W4): Dry-Run Mode (video) ──
      const dryRun = req.headers["x-dry-run"] || req.body["dry-run"];
      if (dryRun) {
        return res.status(200).json({ valid: true, estimatedCredits: 1, model: model || getMergedModels().video });
      }
      const key = requireApiKey(apiKey);
      const ai = new GoogleGenAI({ apiKey: key });
      const selectedModel = model || getMergedModels().video;

      const operation = imageBytes && mimeType
        ? await ai.models.generateVideos({
            model: selectedModel,
            prompt,
            image: { imageBytes, mimeType },
            config: { numberOfVideos: 1, resolution, aspectRatio },
          })
        : await ai.models.generateVideos({
            model: selectedModel,
            prompt,
            config: { numberOfVideos: 1, resolution, aspectRatio },
          });

      const jobId = createJobId();
      const operationName = (operation as any)?.name || null;
      const manifest: JobManifest = {
        id: jobId,
        type: "video",
        prompt,
        model: selectedModel,
        resolution,
        aspectRatio,
        brandContext,
        projectId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: "pending",
        outputs: [],
        providerOperationName: operationName,
        logs: [
          `[${new Date().toISOString()}] Video request received.`,
          `[${new Date().toISOString()}] Provider operation created${operationName ? `: ${operationName}` : "."}`,
        ],
      };
      await writeManifest(manifest);

      void (async () => {
        try {
          jobTracker.activeOperations.set(jobId, operation);
          let currentOp = operation;
          let attempts = 0;

          // SAFETY: Hard upper bound to prevent infinite polling if the provider
          // never reports done. Fails the job after serverConfig.maxVideoPollAttempts.
          while (!currentOp.done) {
            if (jobTracker.cancellations.has(jobId)) {
               console.log(`[video] Polling aborted for cancelled job ${jobId}`);
               jobTracker.activeOperations.delete(jobId);
               jobTracker.cancellations.delete(jobId);
               await patchManifest("video", jobId, (current) => ({
                ...current,
                status: "failed",
                error: "Video generation cancelled by user.",
                logs: appendLog(current, "Polling aborted: Job cancelled by user."),
              }));
               return;
            }
            attempts += 1;
            if (attempts > serverConfig.maxVideoPollAttempts) {
              await patchManifest("video", jobId, (current) => ({
                ...current,
                status: "failed",
                error: `Video polling timed out after ${attempts} attempts (~${Math.round(attempts * 10 / 60)} minutes). The provider never reported completion.`,
                logs: appendLog(current, `SAFETY: Polling aborted after ${attempts} attempts. Possible stuck operation.`),
              }));
              jobTracker.activeOperations.delete(jobId);
              return;
            }
            await patchManifest("video", jobId, (current) => ({
              ...current,
              logs: appendLog(current, `Polling provider status (attempt ${attempts}/${serverConfig.maxVideoPollAttempts})...`),
            }));
            await new Promise((resolve) => setTimeout(resolve, 10000));
            currentOp = await ai.operations.getVideosOperation({ operation: currentOp });
          }

          const downloadLink = currentOp.response?.generatedVideos?.[0]?.video?.uri;
          if (!downloadLink) {
            await patchManifest("video", jobId, (current) => ({
              ...current,
              status: "failed",
              error: "Video operation finished without a downloadable file.",
              logs: appendLog(current, "Provider completed, but no download URL was returned."),
            }));
            jobTracker.activeOperations.delete(jobId);
            return;
          }

          const videoRes = await fetch(downloadLink, { headers: { "x-goog-api-key": key } });
          if (!videoRes.ok) {
            throw new Error(`Failed to download completed video (${videoRes.status}).`);
          }

          const fileName = "output.mp4";
          const filePath = path.join(getJobDir("video", jobId), fileName);
          const arrayBuffer = await videoRes.arrayBuffer();
          await fs.writeFile(filePath, Buffer.from(arrayBuffer));

          await patchManifest("video", jobId, (current) => ({
            ...current,
            status: "completed",
            outputs: [`/jobs/videos/${jobId}/${fileName}`],
            error: undefined,
            logs: appendLog(current, "Video downloaded and saved locally."),
          }));
          jobTracker.activeOperations.delete(jobId);
        } catch (err: any) {
          console.error("Background video polling error:", err);
          await patchManifest("video", jobId, (current) => ({
            ...current,
            status: "failed",
            error: err?.message || "Background video polling failed.",
            logs: appendLog(current, `Background polling failed: ${err?.message || "unknown error"}`),
          }));
          jobTracker.activeOperations.delete(jobId);
        }
      })();

      if (idempotencyKey) idempotencyQueries.insert(`${idempotencyKey}-video`, manifest);
      res.status(202).json(manifest);
    } catch (error: any) {
      console.error("Video Generation Error:", error);
      res.status(500).json({ error: error.message || "Failed to generate video" });
    } finally {
      jobTracker.running.video--;
    }
  });

  api.post("/media/voice", rateLimitMiddleware("voice"), async (req, res) => {
    try {
      jobTracker.running.voice++;
      // ── L2-S7 (W3): Idempotency wrapper (voice) ──
      const idempotencyKey = req.headers["x-idempotency-key"] as string | undefined;
      if (idempotencyKey) {
        const cached = idempotencyQueries.get(`${idempotencyKey}-voice`);
        if (cached) return res.status(200).json(cached);
      }

      const { text, voice, brandContext, projectId, apiKey } = req.body;
      // ── L2-S7 (W4): Dry-Run Mode (voice) ──
      const dryRun = req.headers["x-dry-run"] || req.body["dry-run"];
      if (dryRun) {
        return res.status(200).json({ valid: true, estimatedCredits: 1, model: getMergedModels().tts });
      }
      const key = requireApiKey(apiKey);
      const ai = new GoogleGenAI({ apiKey: key });
      const jobId = createJobId();

      const manifest: JobManifest = {
        id: jobId,
        type: "voice",
        text,
        voice,
        brandContext,
        projectId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: "pending",
        outputs: [],
        logs: [`[${new Date().toISOString()}] Voice request received.`],
      };
      await writeManifest(manifest);

      const response = await ai.models.generateContent({
        model: getMergedModels().tts,
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voice },
            },
          },
        },
      });

      const inlineAudio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      const base64Audio = inlineAudio?.data;
      const mimeType = inlineAudio?.mimeType || "audio/L16;codec=pcm;rate=24000";
      const outputs: string[] = [];
      let savedLabel = mimeType;
      if (base64Audio) {
        const rawBuffer = Buffer.from(base64Audio, "base64");
        let fileName = "output.bin";
        let saveBuffer = rawBuffer;

        if (mimeType.includes("audio/L16") || mimeType.includes("pcm")) {
          const rateMatch = mimeType.match(/rate=(\d+)/i);
          const sampleRate = rateMatch ? Number(rateMatch[1]) : 24000;
          fileName = "output.wav";
          saveBuffer = pcm16ToWav(rawBuffer, sampleRate, 1);
          savedLabel = `WAV wrapped from ${mimeType}`;
        } else if (mimeType.includes("wav")) {
          fileName = "output.wav";
          savedLabel = "WAV";
        } else if (mimeType.includes("mpeg") || mimeType.includes("mp3")) {
          fileName = "output.mp3";
          savedLabel = "MP3";
        } else if (mimeType.includes("ogg")) {
          fileName = "output.ogg";
          savedLabel = "OGG";
        }

        await fs.writeFile(path.join(getJobDir("voice", jobId), fileName), saveBuffer);
        outputs.push(`/jobs/voice/${jobId}/${fileName}`);
      }

      const finalManifest = await patchManifest("voice", jobId, (current) => ({
        ...current,
        status: outputs.length > 0 ? "completed" : "failed",
        outputs,
        error: outputs.length > 0 ? undefined : "Model returned no audio data.",
        logs: appendLog(current, outputs.length > 0 ? `Audio saved locally (${savedLabel}).` : "No audio data returned."),
      }));

      // I4: Auto-tag voice (text-based, fire-and-forget)
      if (outputs.length > 0) {
        void autoTagMedia("voice", jobId, "", key, text);
      }

      if (idempotencyKey) idempotencyQueries.insert(`${idempotencyKey}-voice`, finalManifest);
      res.json(finalManifest);
    } catch (error: any) {
      console.error("Voice Generation Error:", error);
      res.status(500).json({ error: error.message || "Failed to generate voice" });
    } finally {
      jobTracker.running.voice--;
    }
  });

  api.post("/media/music", rateLimitMiddleware("music"), async (req, res) => {
    try {
      jobTracker.running.music++;
      const idempotencyKey = req.headers["idempotency-key"] as string | undefined;
      if (idempotencyKey) {
        const cached = idempotencyQueries.get(`${idempotencyKey}-music`);
        if (cached) return res.status(200).json(cached);
      }

      const { prompt, model, duration, brandContext, projectId, apiKey } = req.body;
      const dryRun = req.headers["x-dry-run"] || req.body["dry-run"];
      if (dryRun) {
        return res.status(200).json({ valid: true, estimatedCredits: 1, model: model || getMergedModels().music });
      }
      const key = requireApiKey(apiKey);
      const jobId = createJobId();
      const selectedModel = model ?? getMergedModels().music;
      const durationSec = Math.min(Math.max(duration ?? 30, 5), 120);

      const manifest: JobManifest = {
        id: jobId, type: "music", prompt, model: selectedModel,
        brandContext, projectId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        status: "pending", outputs: [], logs: [`[${new Date().toISOString()}] Music request received (${durationSec}s via Lyria RealTime).`],
      };
      await writeManifest(manifest);

      // Lyria RealTime uses WebSocket streaming via ai.live.music.connect()
      void (async () => {
        try {
          const ai = new GoogleGenAI({ apiKey: key, apiVersion: "v1alpha" });
          const audioChunks: Buffer[] = [];
          let setupDone = false;
          const sampleRate = 44100;
          const channels = 2;

          await patchManifest("music", jobId, (c) => ({
            ...c, logs: appendLog(c, `Connecting to Lyria RealTime (model: ${selectedModel})...`),
          }));

          const session = await (ai.live as any).music.connect({
            model: `models/${selectedModel}`,
            callbacks: {
              onmessage: (message: any) => {
                if (message.setupComplete) {
                  setupDone = true;
                  console.log(`[music] Job ${jobId}: setup complete`);
                }
                if (message.serverContent && message.serverContent.audioChunks) {
                  for (const chunk of message.serverContent.audioChunks) {
                    if (chunk.data) {
                      audioChunks.push(Buffer.from(chunk.data, "base64"));
                    }
                  }
                }
                if (message.filteredPrompt) {
                  console.log(`[music] Job ${jobId}: prompt filtered — ${message.filteredPrompt.filteredReason || "unknown"}`);
                }
              },
              onerror: (error: any) => {
                console.error(`[music] Job ${jobId}: session error:`, error);
              },
              onclose: () => {
                console.log(`[music] Job ${jobId}: session closed`);
              },
            },
          });

          // Wait for setup to complete (max 10s)
          for (let i = 0; i < 100 && !setupDone; i++) {
            await new Promise((r) => setTimeout(r, 100));
          }
          if (!setupDone) {
            await patchManifest("music", jobId, (c) => ({
              ...c, status: "failed", error: "Lyria setup timed out.",
              logs: appendLog(c, "Setup timed out after 10s."),
            }));
            try { session.close(); } catch {}
            return;
          }

          await patchManifest("music", jobId, (c) => ({
            ...c, logs: appendLog(c, "Connected. Sending prompt and starting..."),
          }));

          // Send the prompt
          await session.setWeightedPrompts({
            weightedPrompts: [{ text: prompt, weight: 1.0 }],
          });

          // Configure generation
          await session.setMusicGenerationConfig({
            musicGenerationConfig: { temperature: 1.0, bpm: 120 },
          });

          // Start playback (synchronous WebSocket send)
          session.play();
          console.log(`[music] Job ${jobId}: play() sent, recording for ${durationSec}s...`);

          // Give it a moment to start streaming
          await new Promise((r) => setTimeout(r, 1000));

          // Record for the requested duration
          const startTime = Date.now();
          while (Date.now() - startTime < durationSec * 1000) {
            if (jobTracker.cancellations.has(jobId)) {
              jobTracker.cancellations.delete(jobId);
              try { session.close(); } catch {}
              await patchManifest("music", jobId, (c) => ({
                ...c, status: "failed", error: "Cancelled by user.",
                logs: appendLog(c, "Cancelled by user."),
              }));
              return;
            }
            if ((Date.now() - startTime) % 2000 < 600) {
              console.log(`[music] Job ${jobId}: ${audioChunks.length} chunks (${((Date.now() - startTime) / 1000).toFixed(0)}s)`);
            }
            await new Promise((r) => setTimeout(r, 500));
          }

          console.log(`[music] Job ${jobId}: done recording, ${audioChunks.length} chunks total`);
          try { session.stop(); } catch {}
          await new Promise((r) => setTimeout(r, 500));
          try { session.close(); } catch {}

          if (audioChunks.length === 0) {
            await patchManifest("music", jobId, (c) => ({
              ...c, status: "failed", error: "No audio data received from Lyria.",
              logs: appendLog(c, "Session completed but no audio chunks received."),
            }));
            return;
          }

          // Combine PCM chunks and wrap as WAV
          const rawPcm = Buffer.concat(audioChunks);
          const bitsPerSample = 16;
          const byteRate = sampleRate * channels * bitsPerSample / 8;
          const blockAlign = channels * bitsPerSample / 8;
          const hdr = Buffer.alloc(44);
          hdr.write("RIFF", 0);
          hdr.writeUInt32LE(36 + rawPcm.length, 4);
          hdr.write("WAVE", 8);
          hdr.write("fmt ", 12);
          hdr.writeUInt32LE(16, 16);
          hdr.writeUInt16LE(1, 20);
          hdr.writeUInt16LE(channels, 22);
          hdr.writeUInt32LE(sampleRate, 24);
          hdr.writeUInt32LE(byteRate, 28);
          hdr.writeUInt16LE(blockAlign, 32);
          hdr.writeUInt16LE(bitsPerSample, 34);
          hdr.write("data", 36);
          hdr.writeUInt32LE(rawPcm.length, 40);
          const wavBuffer = Buffer.concat([hdr, rawPcm]);

          const fileName = "output.wav";
          await fs.writeFile(path.join(getJobDir("music", jobId), fileName), wavBuffer);
          await patchManifest("music", jobId, (c) => ({
            ...c, status: "completed",
            outputs: [`/jobs/music/${jobId}/${fileName}`],
            error: undefined,
            logs: appendLog(c, `Music saved (${(rawPcm.length / byteRate).toFixed(1)}s, ${(wavBuffer.length / 1024).toFixed(0)}KB WAV).`),
          }));
          console.log(`[music] Job ${jobId} completed: ${(rawPcm.length / byteRate).toFixed(1)}s of audio`);
        } catch (err: any) {
          console.error("Music generation error:", err);
          await patchManifest("music", jobId, (c) => ({
            ...c, status: "failed", error: err?.message || "Music generation failed.",
          }));
        }
      })();

      if (idempotencyKey) idempotencyQueries.insert(`${idempotencyKey}-music`, manifest);
      res.status(202).json(manifest);
    } catch (error: any) {
      console.error("Music Generation Error:", error);
      res.status(500).json({ error: error.message || "Failed to generate music" });
    } finally {
      jobTracker.running.music--;
    }
  });

  api.get("/media/job/:type/:id", async (req, res) => {
    try {
      const type = req.params.type as MediaType;
      if (!jobTypeDirs[type]) {
        return res.status(400).json({ error: `Invalid media type: ${type}` });
      }
      const manifest = await readManifest(type, req.params.id);
      res.json(manifest);
    } catch (error: any) {
      res.status(404).json({ error: error.message || "Job not found" });
    }
  });

  api.delete("/media/job/:type/:id", async (req, res) => {
    try {
      const type = req.params.type;
      const { id } = req.params;
      
      const isCompose = type === "compose";
      if (!isCompose && !jobTypeDirs[type as MediaType]) {
        return res.status(400).json({ error: `Invalid media type: ${type}` });
      }

      // 1. Delete from DB
      if (isCompose) {
        composeJobQueries.delete(id);
      } else {
        mediaJobQueries.delete(id);
      }

      // 2. Delete from filesystem
      const dirName = isCompose ? "compose" : jobTypeDirs[type as MediaType];
      const jobDir = path.join(jobsDir, dirName, id);
      try {
        await fs.rm(jobDir, { recursive: true, force: true });
      } catch (e: any) {
        console.warn(`Could not completely remove job dir: ${e.message}`);
      }
      res.json({ ok: true });
    } catch (error: any) {
      console.error("Delete Error:", error);
      res.status(500).json({ error: error.message || "Failed to delete job" });
    }
  });

  api.get("/media/history", async (req, res) => {
    try {
      const projectId = req.query.projectId as string | undefined;
      res.json(await collectHistory(projectId));
    } catch (error: any) {
      console.error("History Error:", error);
      res.status(500).json({ error: "Failed to fetch history" });
    }
  });

  api.get("/boardroom/sessions", async (_req, res) => {
    try {
      res.json(await listBoardroomSessions());
    } catch (error: any) {
      console.error("Boardroom History Error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch boardroom sessions" });
    }
  });

  // C1: Polling endpoint — no-cache headers so the client always gets fresh state.
  api.get("/boardroom/sessions/:id", async (req, res) => {
    try {
      const session = await readBoardroomSession(req.params.id);
      res
        .set("Cache-Control", "no-store")
        .set("Pragma", "no-cache")
        .json(session);
    } catch (error: any) {
      console.error("Boardroom Session Read Error:", error);
      res.status(404).json({ error: error.message || "Boardroom session not found" });
    }
  });

  // C1: Async session creation — returns 202 immediately; client polls GET /boardroom/sessions/:id for progress.
  api.post("/boardroom/sessions", async (req, res) => {
    try {
      // ── L2-S7 (W4): Dry-Run Mode (boardroom) ──
      const dryRun = req.headers["x-dry-run"] || req.body["dry-run"];
      if (dryRun) {
        return res.status(200).json({ valid: true, estimatedCalls: 32, seats: req.body?.seats || [] });
      }

      const session = await startBoardroomSessionAsync(req.body || {});
      res.status(202).json(session);
    } catch (error: any) {
      console.error("Boardroom Session Error:", error);
      res.status(500).json({ error: error.message || "Failed to start boardroom session" });
    }
  });

  // I2: Extract media briefs from a completed boardroom session (Lane 2).
  api.post("/boardroom/sessions/:id/media-briefs", async (req, res) => {
    try {
      const briefs = await extractMediaBriefs(req.params.id, req.body?.apiKey);
      res.json(briefs);
    } catch (error: any) {
      console.error("Media Briefs Extraction Error:", error);
      const status = error.message?.includes("not found") ? 404
        : error.message?.includes("status") ? 400
        : 500;
      res.status(status).json({ error: error.message || "Failed to extract media briefs" });
    }
  });

  // ── A1: Research endpoints (Lane 1 — move client-side Gemini to server) ──

  api.post("/research/search", async (req, res) => {
    try {
      const { query, brandContext } = req.body;
      if (!query) {
        return res.status(400).json({ error: "query is required" });
      }

      const key = requireApiKey(req.body.apiKey);
      const ai = new GoogleGenAI({ apiKey: key });

      const context = brandContext
        ? `Context: Our brand is ${brandContext.brandName}. ${brandContext.brandDescription}. Target audience: ${brandContext.targetAudience}. `
        : "";

      const response = await ai.models.generateContent({
        model: getMergedModels().creative,
        contents: context + "Research query: " + query,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      const sources = chunks ? chunks.map((c: any) => c.web).filter(Boolean) : [];

      res.json({
        text: response.text || "No results found.",
        sources,
      });
    } catch (error: any) {
      console.error("Research Search Error:", error);
      res.status(500).json({ error: error.message || "Research search failed" });
    }
  });

  api.post("/research/think", async (req, res) => {
    try {
      const { query, brandContext } = req.body;
      if (!query) {
        return res.status(400).json({ error: "query is required" });
      }

      const key = requireApiKey(req.body.apiKey);
      const ai = new GoogleGenAI({ apiKey: key });

      const context = brandContext
        ? `Context: Our brand is ${brandContext.brandName}. ${brandContext.brandDescription}. Target audience: ${brandContext.targetAudience}. `
        : "";

      const response = await ai.models.generateContent({
        model: getMergedModels().multimodal,
        contents: context + "Deep analysis query: " + query,
        config: {
          thinkingConfig: { thinkingLevel: "HIGH" as any },
        },
      });

      res.json({
        text: response.text || "No analysis generated.",
      });
    } catch (error: any) {
      console.error("Research Think Error:", error);
      res.status(500).json({ error: error.message || "Research thinking failed" });
    }
  });

  // ── A2: Video analysis endpoint (Lane 1 — move client-side Gemini to server) ──

  api.post("/media/video/analyze", async (req, res) => {
    try {
      const { videoData, mimeType } = req.body;
      if (!videoData || !mimeType) {
        return res.status(400).json({ error: "videoData and mimeType are required" });
      }

      const key = requireApiKey(req.body.apiKey);
      const ai = new GoogleGenAI({ apiKey: key });

      const response = await ai.models.generateContent({
        model: getMergedModels().multimodal,
        contents: {
          parts: [
            {
              inlineData: {
                data: videoData,
                mimeType,
              },
            },
            { text: "Analyze this video for key information, brand alignment, and potential improvements." },
          ],
        },
      });

      res.json({
        text: response.text || "No analysis generated.",
      });
    } catch (error: any) {
      console.error("Video Analysis Error:", error);
      res.status(500).json({ error: error.message || "Video analysis failed" });
    }
  });


  // ── H2: GenerationQueue (semaphore + exponential backoff) ───────────────────

  // W3: Pre-load any persisted batch state from disk (marks stale in-flight jobs as failed)
  const batchStore = await loadBatchStates();
  console.log(`[batch] Rehydrated ${batchStore.size} batch state(s) from disk.`);

  class GenerationQueue {
    private slots: Record<MediaType, number> = { image: 0, video: 0, voice: 0, music: 0 };
    private readonly max: Record<MediaType, number> = { image: 5, video: 1, voice: 4, music: 2 };
    private lastRequest: Record<MediaType, number> = { image: 0, video: 0, voice: 0, music: 0 };

    /**
     * Ensures we stay under the RPM (Requests Per Minute) limits defined in config.
     */
    private async waitForThrottle(type: MediaType): Promise<void> {
      const rpm = (rateLimits as any)[type] || 5;
      const minInterval = Math.ceil(60000 / rpm) + 200; // Add 200ms buffer
      const now = Date.now();
      const elapsed = now - this.lastRequest[type];
      if (elapsed < minInterval) {
        await new Promise(r => setTimeout(r, minInterval - elapsed));
      }
      this.lastRequest[type] = Date.now();
    }

    private waitForSlot(type: MediaType): Promise<void> {
      return new Promise((resolve) => {
        const check = async () => {
          if (this.slots[type] < this.max[type]) { 
            this.slots[type]++; 
            await this.waitForThrottle(type);
            resolve(); 
          }
          else setTimeout(check, 500);
        };
        check();
      });
    }

    private release(type: MediaType) {
      this.slots[type] = Math.max(0, this.slots[type] - 1);
    }

    async enqueueOne(batchId: string, idx: number, item: BatchJobItem, apiKey: string): Promise<void> {
      const state = batchStore.get(batchId);
      await this.waitForSlot(item.type);
      if (state) {
        state.statuses[idx] = "generating";
        void saveBatchState(state); // W3: persist state change
      }
      let attempts = 0;
      let lastErr: unknown;
      while (attempts < 4) {
        try {
          const jobId = await this.runJob(item, apiKey);
          if (state) {
            state.jobIds[idx] = jobId;
            state.statuses[idx] = "completed";
            void saveBatchState(state); // W3: persist on completion
          }
          this.release(item.type);
          // W4: If all items in this batch are done, trigger auto-scoring
          if (state) void autoScoreCompletedBatch(state, apiKey);
          return;
        } catch (err: any) {
          lastErr = err;
          attempts++;
          const is429 = err?.status === 429 || String(err?.message ?? "").includes("429");
          if (is429 && attempts < 4) await new Promise((r) => setTimeout(r, (2 ** attempts) * 1000));
          else break;
        }
      }
      if (state) {
        state.statuses[idx] = "failed";
        const errMsg = (lastErr as any)?.message || String(lastErr || "Unknown error");
        state.errors[idx] = `${item.type.toUpperCase()} generation failed: ${errMsg}`;
        void saveBatchState(state); // W3: persist failure
      }
      this.release(item.type);
    }

    private async runJob(item: BatchJobItem, apiKey: string): Promise<string> {
      const ai = new GoogleGenAI({ apiKey });
      const jobId = createJobId();
      const { type, body } = item;

      if (type === "image") {
        const { prompt, model, size, brandContext, projectId } = body as any;
        const manifest: JobManifest = {
          id: jobId, type: "image", prompt, model: model || getMergedModels().image || "imagen-3.0-generate-002",
          size: size ?? "1K", brandContext, projectId,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          status: "pending", outputs: [],
          logs: [`[${new Date().toISOString()}] Batch image generation started.`],
        };
        await writeManifest(manifest);
        // W2/CHECK-002: read aspectRatio from request body instead of hardcoding "1:1"
        const itemAspectRatio = (body as any).aspectRatio ?? "1:1";
        const resp = await ai.models.generateContent({
          model: manifest.model!, contents: { parts: [{ text: prompt }] },
          config: { imageConfig: { aspectRatio: itemAspectRatio, imageSize: manifest.size } },
        });
        const outputs: string[] = [];
        const candidate = resp.candidates?.[0];

        if (candidate?.finishReason === "SAFETY") {
          throw new Error("Rejected by safety filter (CSM). Please try a more compliant prompt.");
        }

        const parts = candidate?.content?.parts ?? [];
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          if (!part.inlineData?.data) continue;
          const fn = `output_${i}.png`;
          const fp = path.join(getJobDir("image", jobId), fn);
          await fs.writeFile(fp, Buffer.from(part.inlineData.data, "base64"));
          outputs.push(`/jobs/images/${jobId}/${fn}`);
        }
        await patchManifest("image", jobId, (c) => ({
          ...c, status: outputs.length > 0 ? "completed" : "failed", outputs,
          error: outputs.length > 0 ? undefined : "No image data returned from provider.",
          logs: appendLog(c, `Batch: ${outputs.length} image(s) saved.`),
        }));
        if (outputs.length > 0) {
          void autoTagMedia("image", jobId, path.join(getJobDir("image", jobId), "output_0.png"), apiKey, prompt);
        }
        return jobId;
      }

      if (type === "voice") {
        const { text, prompt, voice, brandContext, projectId } = body as any;
        const actualText = text || prompt;
        const actualVoice = voice || "Kore";
        const manifest: JobManifest = {
          id: jobId, type: "voice", text: actualText, voice: actualVoice, brandContext, projectId,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          status: "pending", outputs: [],
          logs: [`[${new Date().toISOString()}] Batch voice generation started.`],
        };
        await writeManifest(manifest);
        const resp = await ai.models.generateContent({
          model: getMergedModels().tts, contents: [{ parts: [{ text: actualText }] }],
          config: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: actualVoice } } } },
        });
        const inlineAudio = resp.candidates?.[0]?.content?.parts?.[0]?.inlineData;
        const b64 = inlineAudio?.data;
        const mime = inlineAudio?.mimeType ?? "audio/L16;codec=pcm;rate=24000";
        const outputs: string[] = [];
        if (b64) {
          const raw = Buffer.from(b64, "base64");
          let fn = "output.wav"; let buf = raw;
          if (mime.includes("audio/L16") || mime.includes("pcm")) {
            const r = mime.match(/rate=(\d+)/i);
            buf = pcm16ToWav(raw, r ? Number(r[1]) : 24000, 1);
          } else if (mime.includes("mpeg") || mime.includes("mp3")) { fn = "output.mp3"; }
          else if (mime.includes("ogg")) { fn = "output.ogg"; }
          await fs.writeFile(path.join(getJobDir("voice", jobId), fn), buf);
          outputs.push(`/jobs/voice/${jobId}/${fn}`);
        }
        await patchManifest("voice", jobId, (c) => ({
          ...c, status: outputs.length > 0 ? "completed" : "failed", outputs,
          error: outputs.length > 0 ? undefined : "No audio data.",
          logs: appendLog(c, "Batch: audio saved."),
        }));
        if (outputs.length > 0) void autoTagMedia("voice", jobId, "", apiKey, actualText);
        return jobId;
      }

      if (type === "video") {
        const { prompt, model, aspectRatio, brandContext, projectId } = body as any;
        // W3/CHECK-001: client sends "size" but handler read "resolution" — accept both
        const resolution = (body as any).resolution ?? (body as any).size;
        const selectedModel = model ?? getMergedModels().video;
        const operation = await ai.models.generateVideos({ model: selectedModel, prompt, config: { numberOfVideos: 1, resolution, aspectRatio } });
        const operationName = (operation as any)?.name ?? null;
        const manifest: JobManifest = {
          id: jobId, type: "video", prompt, model: selectedModel, resolution, aspectRatio,
          brandContext, projectId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          status: "pending", outputs: [], providerOperationName: operationName,
          logs: [`[${new Date().toISOString()}] Batch video job queued. Operation: ${operationName}`],
        };
        await writeManifest(manifest);
        try {
          let op = operation; let a = 0;
          // SAFETY: Hard upper bound — same MAX_VIDEO_POLL_ATTEMPTS guard as the
          // single-video endpoint. Never loop forever waiting for provider.
          while (!op.done) {
            a++;
            if (a > serverConfig.maxVideoPollAttempts) {
              await patchManifest("video", jobId, (c) => ({ ...c, status: "failed", error: `Batch video polling timed out after ${a} attempts.`, logs: appendLog(c, `SAFETY: Polling aborted after ${a} attempts.`) }));
              throw new Error(`Batch video polling timed out after ${a} attempts.`);
            }
            await patchManifest("video", jobId, (c) => ({ ...c, logs: appendLog(c, `Polling attempt ${a}/${serverConfig.maxVideoPollAttempts}...`) }));
            await new Promise((r) => setTimeout(r, 10000));
            op = await ai.operations.getVideosOperation({ operation: op });
          }
          const link = op.response?.generatedVideos?.[0]?.video?.uri;
          if (!link) throw new Error("No video download URL returned.");
          const vRes = await fetch(link, { headers: { "x-goog-api-key": apiKey } });
          if (!vRes.ok) throw new Error(`Video download failed (${vRes.status}).`);
          const fn = "output.mp4";
          await fs.writeFile(path.join(getJobDir("video", jobId), fn), Buffer.from(await vRes.arrayBuffer()));
          await patchManifest("video", jobId, (c) => ({ ...c, status: "completed", outputs: [`/jobs/videos/${jobId}/${fn}`], error: undefined, logs: appendLog(c, "Batch video downloaded.") }));
        } catch (err: any) {
          await patchManifest("video", jobId, (c) => ({ ...c, status: "failed", error: err?.message ?? "Batch video polling failed.", logs: appendLog(c, `Polling failed: ${err?.message}`) }));
          throw err;
        }
        return jobId;
      }

      if (type === "music") {
        const { prompt, model, duration, brandContext, projectId } = body as any;
        const selectedModel = model ?? getMergedModels().music;
        const durationSec = Math.min(Math.max(duration ?? 30, 5), 120);
        const manifest: JobManifest = {
          id: jobId, type: "music", prompt, model: selectedModel,
          brandContext, projectId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          status: "pending", outputs: [],
          logs: [`[${new Date().toISOString()}] Batch music job queued (${durationSec}s via Lyria).`],
        };
        await writeManifest(manifest);

        // Use Lyria WebSocket streaming (same as main music endpoint)
        void (async () => {
          try {
            const lyAi = new GoogleGenAI({ apiKey, apiVersion: "v1alpha" });
            const audioChunks: Buffer[] = [];
            let setupDone = false;
            const sampleRate = 44100;
            const channels = 2;

            const session = await (lyAi.live as any).music.connect({
              model: `models/${selectedModel}`,
              callbacks: {
                onmessage: (message: any) => {
                  if (message.setupComplete) setupDone = true;
                  if (message.serverContent?.audioChunks) {
                    for (const chunk of message.serverContent.audioChunks) {
                      if (chunk.data) audioChunks.push(Buffer.from(chunk.data, "base64"));
                    }
                  }
                },
                onerror: () => {},
                onclose: () => {},
              },
            });

            // Wait for setup
            for (let i = 0; i < 100 && !setupDone; i++) await new Promise((r) => setTimeout(r, 100));
            if (!setupDone) { try { session.close(); } catch {} throw new Error("Lyria setup timed out."); }

            await session.setWeightedPrompts({ weightedPrompts: [{ text: prompt, weight: 1.0 }] });
            await session.setMusicGenerationConfig({ musicGenerationConfig: { temperature: 1.0, bpm: 120 } });
            session.play();

            await new Promise((r) => setTimeout(r, 1000));
            const start = Date.now();
            while (Date.now() - start < durationSec * 1000) await new Promise((r) => setTimeout(r, 500));

            try { session.stop(); } catch {}
            await new Promise((r) => setTimeout(r, 500));
            try { session.close(); } catch {}

            if (audioChunks.length === 0) throw new Error("No audio data received from Lyria.");

            const rawPcm = Buffer.concat(audioChunks);
            const bitsPerSample = 16;
            const byteRate = sampleRate * channels * bitsPerSample / 8;
            const blockAlign = channels * bitsPerSample / 8;
            const hdr = Buffer.alloc(44);
            hdr.write("RIFF", 0); hdr.writeUInt32LE(36 + rawPcm.length, 4);
            hdr.write("WAVE", 8); hdr.write("fmt ", 12);
            hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20);
            hdr.writeUInt16LE(channels, 22); hdr.writeUInt32LE(sampleRate, 24);
            hdr.writeUInt32LE(byteRate, 28); hdr.writeUInt16LE(blockAlign, 32);
            hdr.writeUInt16LE(bitsPerSample, 34); hdr.write("data", 36);
            hdr.writeUInt32LE(rawPcm.length, 40);

            const fn = "output.wav";
            await fs.writeFile(path.join(getJobDir("music", jobId), fn), Buffer.concat([hdr, rawPcm]));
            await patchManifest("music", jobId, (c) => ({
              ...c, status: "completed", outputs: [`/jobs/music/${jobId}/${fn}`], error: undefined,
              logs: appendLog(c, `Batch music saved (${(rawPcm.length / byteRate).toFixed(1)}s WAV).`),
            }));
          } catch (err: any) {
            await patchManifest("music", jobId, (c) => ({
              ...c, status: "failed", error: err?.message ?? "Batch music failed.",
              logs: appendLog(c, `Failed: ${err?.message}`),
            }));
          }
        })();
        return jobId;
      }

      throw new Error(`Unsupported batch type: ${type}`);
    }
  }

  // ── W4: Auto-scoring helper called after each batch item completes ───────────

  async function autoScoreCompletedBatch(state: BatchState, apiKey: string): Promise<void> {
    // Only run once all items are terminal (done or failed)
    const allDone = state.statuses.every((s) => s === "completed" || s === "failed");
    if (!allDone) return;
    const ai = new GoogleGenAI({ apiKey });
    for (let i = 0; i < state.total; i++) {
      if (state.statuses[i] !== "completed" || !state.jobIds[i]) continue;
      const jobId = state.jobIds[i]!;
      // Detect type from the batchStore items array — we stored type on the state
      // We need to know the type; read the manifest to get it.
      try {
        // Try image first, then voice, then video (most common order)
        let manifest: JobManifest | null = null;
        let jobType: MediaType | null = null;
        for (const t of ["image", "voice", "video", "music"] as MediaType[]) {
          try { manifest = await readManifest(t, jobId); jobType = t; break; } catch { /* not this type */ }
        }
        if (!manifest || !jobType || manifest.status !== "completed" || manifest.outputs.length === 0) continue;
        if (manifest.score) continue; // already scored

        const brandCtx = manifest.brandContext
          ? `Brand: ${(manifest.brandContext as any).brandName ?? ""}. Audience: ${(manifest.brandContext as any).targetAudience ?? ""}. Voice: ${(manifest.brandContext as any).brandVoice ?? ""}.`
          : "No brand context.";
        const purposeCtx = (manifest.prompt ?? manifest.text ?? "general media").slice(0, 400);
        const scoreSchema = `{ "scores": { "brandAlignment": <1-5>, "purposeFit": <1-5>, "technicalQuality": <1-5>, "audienceMatch": <1-5>, "uniqueness": <1-5> }, "overall": <float 1-5>, "reasoning": "...", "suggestions": ["..."] }`;

        let contents: any;
        if (jobType === "image") {
          const relPath = manifest.outputs[0].replace(/^\/jobs\//, "jobs/");
          const absPath = path.join(process.cwd(), relPath);
          const parts: any[] = [{ text: `Score this image across 5 criteria. ${brandCtx} Purpose: "${purposeCtx}".\nReturn ONLY valid JSON matching: ${scoreSchema}` }];
          try { const imgData = await fs.readFile(absPath); parts.unshift({ inlineData: { data: imgData.toString("base64"), mimeType: "image/png" } }); } catch { /* score text-only */ }
          contents = { parts };
        } else {
          contents = `Score this ${jobType}. Prompt/Text: "${purposeCtx}". ${brandCtx}\nReturn ONLY valid JSON matching: ${scoreSchema}`;
        }

        const response = await ai.models.generateContent({ model: jobType === "image" ? getMergedModels().multimodal : getMergedModels().text, contents });
        const txt = response.text?.trim() ?? "{}";
        const m = txt.match(/\{[\s\S]*\}/);
        const scoreData = m ? JSON.parse(m[0]) as MediaScore : null;
        if (scoreData) {
          await patchManifest(jobType, jobId, { score: scoreData });
          console.log(`[W4] Auto-scored ${jobType}/${jobId}: ${scoreData.overall}`);
        }
      } catch (err) {
        console.error(`[W4] Auto-score failed for ${jobId}:`, err);
      }
    }
  }

  const generationQueue = new GenerationQueue();

  api.post("/media/batch", async (req, res) => {
    try {
      const { items, apiKey } = req.body as { items: BatchJobItem[]; apiKey?: string };
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "items must be a non-empty array" });
      }
      const validTypes: MediaType[] = ["image", "video", "voice", "music"];
      for (const item of items) {
        if (!validTypes.includes(item.type)) return res.status(400).json({ error: `Invalid type: ${item.type}` });
      }
      const key = requireApiKey(apiKey);
      const batchId = `batch-${createJobId()}`;
      const state: BatchState = {
        id: batchId, createdAt: new Date().toISOString(), total: items.length,
        jobIds: new Array(items.length).fill(null),
        statuses: new Array(items.length).fill("queued"),
        errors: new Array(items.length).fill(null),
      };
      batchStore.set(batchId, state);
      void saveBatchState(state); // W3: persist initial state immediately
      void Promise.all(items.map((item, i) => generationQueue.enqueueOne(batchId, i, item, key)));
      res.status(202).json({ 
        batchId, 
        total: items.length, 
        jobIds: state.jobIds, 
        statuses: state.statuses,
        rateLimits,
        advice: "Gemlink handles throttling internally. You can queue up to 100+ items; they will be processed as slots and RPM limits allow."
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Batch failed" });
    }
  });

  api.get("/media/batch/:batchId", (req, res) => {
    const state = batchStore.get(req.params.batchId);
    if (!state) return res.status(404).json({ error: "Batch not found" });
    const done = state.statuses.filter((s) => s === "completed" || s === "failed").length;
    res.set("Cache-Control", "no-store").json({
      ...state,
      summary: {
        total: state.total, done,
        generating: state.statuses.filter((s) => s === "generating").length,
        queued: state.statuses.filter((s) => s === "queued").length,
        failed: state.errors.filter(Boolean).length,
      },
      complete: done === state.total,
    });
  });

  // ── Sprint 2 W2: Media Plan Suggest (renamed to suggestQuick for Sprint 3) ──

  api.post("/media/plan/suggest", async (req, res) => {
    // Fast fallback — single-call plan suggestion (kept as-is from Sprint 2)
    try {
      const { description, projectContext, apiKey } = req.body;
      if (!description) return res.status(400).json({ error: "description is required" });
      const key = requireApiKey(apiKey);
      const ai = new GoogleGenAI({ apiKey: key });

      const brandCtx = projectContext
        ? `Brand: ${projectContext.brandName ?? ""}. Description: ${projectContext.brandDescription ?? ""}. Audience: ${projectContext.targetAudience ?? ""}. Voice: ${projectContext.brandVoice ?? ""}.`
        : "";

      const itemSchema = `{ "id": "item_<random8chars>", "type": "image"|"video"|"voice", "label": "short asset name", "purpose": "platform or use case", "promptTemplate": "detailed generation prompt", "model": null, "size": null, "aspectRatio": null, "status": "draft", "tags": ["..."] }`;

      const systemPrompt = [
        "You are a strategic media planner and creative director.",
        "Based on the user's project description and brand context, suggest a media plan.",
        "A media plan is a structured list of assets the project needs.",
        brandCtx,
        "Rules:",
        "- Include a mix of asset types: image, video, voice (vary based on the description).",
        "- Each promptTemplate should be a detailed, ready-to-use generation prompt.",
        "- Suggest 4-8 items total. Match the scope to the project description.",
        "- For promptTemplate: be specific about style, composition, lighting, platform specs.",
        `- Return ONLY a valid JSON object: { "items": [ ${itemSchema} ] }`,
        "- Do NOT include any explanation or markdown fences.",
      ].filter(Boolean).join(" ");

      const response = await ai.models.generateContent({
        model: getMergedModels().text,
        contents: `${systemPrompt}\n\nProject description: "${description}"`,
        config: {
          responseMimeType: "application/json",
        } as any,
      });

      const txt = response.text?.trim() ?? "{}";
      let parsed: { items?: unknown[] } = {};
      try {
        parsed = JSON.parse(txt);
      } catch {
        const m = txt.match(/\{[\s\S]*\}/);
        if (m) { try { parsed = JSON.parse(m[0]); } catch { /* give up */ } }
      }

      const items = Array.isArray(parsed.items) ? parsed.items : [];
      const sanitised = items.map((x: any) => ({
        id: `item_${Math.random().toString(36).slice(2, 10)}`,
        // W4/CHECK-003: allow "music" type so AI-suggested music items aren't silently converted to "image"
        type: ["image", "video", "voice", "music"].includes(x.type) ? x.type : "image",
        label: x.label ?? "Untitled",
        purpose: x.purpose ?? "",
        promptTemplate: x.promptTemplate ?? "",
        model: x.model ?? null,
        size: x.size ?? null,
        aspectRatio: x.aspectRatio ?? null,
        status: "draft",
        tags: Array.isArray(x.tags) ? x.tags : [],
        generatedJobIds: [],
      }));

      res.json({ items: sanitised, count: sanitised.length });
    } catch (err: any) {
      console.error("Plan Suggest Error:", err);
      res.status(500).json({ error: err.message ?? "Plan suggestion failed" });
    }
  });

  // ── W1: Multi-Stage Plan Pipeline (Track K1) ────────────────────────────────

  const planProgressDir = path.join(jobsDir, "plan-progress");

  async function writePlanProgress(planId: string, data: Record<string, unknown>) {
    await fs.mkdir(planProgressDir, { recursive: true });
    await fs.writeFile(path.join(planProgressDir, `${planId}.json`), JSON.stringify(data, null, 2));
  }

  function parseGeminiJson(text: string): any {
    const txt = text?.trim() ?? "{}";
    try { return JSON.parse(txt); } catch { /* fallback */ }
    const m = txt.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch { /* give up */ } }
    return {};
  }

  /** GET /api/media/plan/progress/:planId — poll generation progress */
  api.get("/media/plan/progress/:planId", async (req, res) => {
    try {
      const filePath = path.join(planProgressDir, `${req.params.planId}.json`);
      const data = await fs.readFile(filePath, "utf8");
      res.set("Cache-Control", "no-store").json(JSON.parse(data));
    } catch {
      res.status(404).json({ error: "No progress found for this plan ID" });
    }
  });

  /** POST /api/media/plan/generate — multi-stage plan pipeline */
  api.post("/media/plan/generate", async (req, res) => {
    try {
      const { description, projectContext, projectId, apiKey } = req.body;
      if (!description) return res.status(400).json({ error: "description is required" });
      const key = requireApiKey(apiKey);
      const ai = new GoogleGenAI({ apiKey: key });

      const planId = `plan_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const stages: { name: string; duration: number }[] = [];

      // Build common context
      const brandCtx = projectContext
        ? `Brand: ${projectContext.brandName ?? ""}. Description: ${projectContext.brandDescription ?? ""}. Audience: ${projectContext.targetAudience ?? ""}. Voice: ${projectContext.brandVoice ?? ""}. Style keywords: ${(projectContext.styleKeywords ?? []).join(", ")}.`
        : "";

      // ── Stage 1: Context Gathering ─────────────────────────────────────────
      const s1Start = Date.now();
      await writePlanProgress(planId, { stage: "context_gathering", progress: 1, total: 5, message: "Gathering brand context and strategy artifacts..." });

      let artifactContext = "";
      if (projectId) {
        try {
          const pinnedArtifacts = getActiveArtifacts(projectId);
          if (pinnedArtifacts.length > 0) {
            artifactContext = "\n\nPinned strategy artifacts:\n" + pinnedArtifacts.map((a) =>
              `- [${a.type}] "${a.title}": ${a.summary}`
            ).join("\n");
          }
        } catch { /* no artifacts available */ }
      }

      let styleContext = "";
      try {
        const styleDb = await loadStyleDatabase();
        const audience = projectContext?.targetAudience?.toLowerCase() ?? "";
        const archetypes = (styleDb.audienceArchetypes as any)?.archetypes ?? {};
        // Find matching audience archetype
        for (const [key, archetype] of Object.entries(archetypes) as [string, any][]) {
          const label = (archetype.label ?? key).toLowerCase();
          if (audience.includes(label.split(" ")[0]) || audience.includes(key.replace(/_/g, " "))) {
            styleContext = `\nRecommended style for audience "${archetype.label}": visual style: ${archetype.visual_style?.join(", ")}. Colors: ${archetype.color_tendency?.join(", ")}. Typography: ${archetype.typography}. Avoid: ${archetype.avoid?.join(", ")}. Psychology: ${archetype.psychology_note}`;
            break;
          }
        }
        if (!styleContext && projectContext?.styleKeywords?.length) {
          // Match by style keywords to style archetypes
          const styleArchetypes = (styleDb.styleArchetypes as any)?.archetypes ?? {};
          for (const [, sa] of Object.entries(styleArchetypes) as [string, any][]) {
            if (projectContext.styleKeywords.some((kw: string) => sa.prompt_keywords?.toLowerCase().includes(kw.toLowerCase()))) {
              styleContext = `\nRecommended style archetype "${sa.label}": ${sa.description}. Prompt keywords: ${sa.prompt_keywords}. Avoid: ${sa.negative_keywords}.`;
              break;
            }
          }
        }
      } catch { /* style-db not critical */ }

      const contextBrief = `${brandCtx}${artifactContext}${styleContext}`;
      stages.push({ name: "context_gathering", duration: Date.now() - s1Start });

      // ── Stage 2: Outline Generation ────────────────────────────────────────
      const s2Start = Date.now();
      await writePlanProgress(planId, { stage: "outline_generation", progress: 2, total: 5, message: "Generating strategic media outline..." });

      const outlinePrompt = [
        "You are a strategic media planner. Generate a structured media plan OUTLINE (NOT prompts yet).",
        "The outline should include:",
        "- content_pillars: array of { name, percentage, description } — what themes the media should cover",
        "- platform_distribution: array of { platform, count, rationale } — how many assets per platform",
        "- style_direction: { name, description, rationale } — the visual approach",
        "- total_items: number — recommended total assets",
        `Context: ${contextBrief}`,
        `Project description: "${description}"`,
        'Return ONLY valid JSON: { "content_pillars": [...], "platform_distribution": [...], "style_direction": {...}, "total_items": N }',
      ].join("\n");

      const outlineResp = await ai.models.generateContent({
        model: getMergedModels().text,
        contents: outlinePrompt,
        config: { responseMimeType: "application/json" } as any,
      });
      const outline = parseGeminiJson(outlineResp.text ?? "{}");
      stages.push({ name: "outline_generation", duration: Date.now() - s2Start });

      // ── Stage 3: Outline Grading ───────────────────────────────────────────
      const s3Start = Date.now();
      await writePlanProgress(planId, { stage: "outline_grading", progress: 3, total: 5, message: "Grading outline quality..." });

      let currentOutline = outline;
      let outlineGrade: any = null;
      const MAX_OUTLINE_RETRIES = 2;

      for (let attempt = 0; attempt <= MAX_OUTLINE_RETRIES; attempt++) {
        const gradePrompt = [
          "You are a media strategy critic. Grade this media plan outline on 4 dimensions (1-5 each):",
          "- completeness: Are all key platforms and audience needs addressed?",
          "- differentiation: Would this stand out from competitor media?",
          "- balance: Is the pillar distribution appropriate for the goal?",
          "- feasibility: Can AI image/video models produce these well?",
          "Also provide an overall score (average of all 4), specific improvements, and whether the outline passes (overall >= 3.5).",
          `Context: ${contextBrief}`,
          `Project: "${description}"`,
          `Outline: ${JSON.stringify(currentOutline)}`,
          'Return ONLY valid JSON: { "completeness": N, "differentiation": N, "balance": N, "feasibility": N, "overall": N, "improvements": ["..."], "passes": boolean }',
        ].join("\n");

        const gradeResp = await ai.models.generateContent({
          model: getMergedModels().text,
          contents: gradePrompt,
          config: { responseMimeType: "application/json" } as any,
        });
        outlineGrade = parseGeminiJson(gradeResp.text ?? "{}");

        if (outlineGrade.overall >= 3.5 || attempt >= MAX_OUTLINE_RETRIES) break;

        // Auto-refine: ask Gemini to improve the outline based on the grading feedback
        console.log(`[plan-generate] Outline scored ${outlineGrade.overall}/5 — refining (attempt ${attempt + 1}/${MAX_OUTLINE_RETRIES})...`);
        await writePlanProgress(planId, { stage: "outline_refining", progress: 3, total: 5, message: `Outline scored ${outlineGrade.overall}/5 — refining...` });

        const refinePrompt = [
          "You are a media strategy planner. Improve this outline based on the critic's feedback.",
          `Original outline: ${JSON.stringify(currentOutline)}`,
          `Critic feedback: ${JSON.stringify(outlineGrade.improvements)}`,
          `Context: ${contextBrief}`,
          'Return the improved outline in the SAME JSON format: { "content_pillars": [...], "platform_distribution": [...], "style_direction": {...}, "total_items": N }',
        ].join("\n");

        const refineResp = await ai.models.generateContent({
          model: getMergedModels().text,
          contents: refinePrompt,
          config: { responseMimeType: "application/json" } as any,
        });
        currentOutline = parseGeminiJson(refineResp.text ?? "{}");
      }
      stages.push({ name: "outline_grading", duration: Date.now() - s3Start });

      // ── Stage 4: Prompt Generation ─────────────────────────────────────────
      const s4Start = Date.now();
      await writePlanProgress(planId, { stage: "prompt_generation", progress: 4, total: 5, message: "Generating media prompts from graded outline..." });

      const promptGenPrompt = [
        "You are an expert creative director and prompt engineer.",
        "Based on this graded media plan outline, generate actual media plan items with detailed generation prompts.",
        `Context: ${contextBrief}`,
        `Outline: ${JSON.stringify(currentOutline)}`,
        "Rules:",
        "- Each item needs: id (item_<random8>), type (image|video|voice), label, purpose, promptTemplate, tags[]",
        "- promptTemplate must be a detailed, vivid, generation-ready prompt with style, composition, lighting, and platform specs",
        "- Include negative prompt guidance where appropriate (appended with 'Negative:' prefix)",
        "- Match the number of items to the outline's total_items and pillar distribution",
        "- Add status: 'draft', generatedJobIds: [], model: null, size: null, aspectRatio: null",
        'Return ONLY valid JSON: { "items": [ { "id": "...", "type": "...", "label": "...", "purpose": "...", "promptTemplate": "...", "tags": [...], "status": "draft", "generatedJobIds": [], "model": null, "size": null, "aspectRatio": null } ] }',
      ].join("\n");

      const promptResp = await ai.models.generateContent({
        model: getMergedModels().text,
        contents: promptGenPrompt,
        config: { responseMimeType: "application/json" } as any,
      });
      const promptData = parseGeminiJson(promptResp.text ?? "{}");
      const rawItems = Array.isArray(promptData.items) ? promptData.items : [];

      // Sanitise items
      const items = rawItems.map((x: any) => ({
        id: `item_${Math.random().toString(36).slice(2, 10)}`,
        // W4/CHECK-003: allow "music" type in boardroom plan sanitiser too
        type: ["image", "video", "voice", "music"].includes(x.type) ? x.type : "image",
        label: x.label ?? "Untitled",
        purpose: x.purpose ?? "",
        promptTemplate: x.promptTemplate ?? "",
        model: x.model ?? null,
        size: x.size ?? null,
        aspectRatio: x.aspectRatio ?? null,
        status: "draft",
        tags: Array.isArray(x.tags) ? x.tags : [],
        generatedJobIds: [],
      }));
      stages.push({ name: "prompt_generation", duration: Date.now() - s4Start });

      // ── Stage 5: Prompt Grading ────────────────────────────────────────────
      const s5Start = Date.now();
      await writePlanProgress(planId, { stage: "prompt_grading", progress: 5, total: 5, message: "Evaluating prompt quality..." });

      const promptGradePrompt = [
        "You are a prompt quality evaluator. Score each media generation prompt on 3 criteria (1-5 each):",
        "- specificity: Is the prompt detailed enough to produce a distinctive result?",
        "- style_match: Does the prompt align with the project's style direction?",
        "- purpose_fitness: Will this serve its stated purpose?",
        "Also compute an overall score per prompt and flag weak ones (overall < 3.5) with improvement notes.",
        `Style direction: ${JSON.stringify(currentOutline.style_direction ?? {})}`,
        `Prompts to grade: ${JSON.stringify(items.map((item: any, i: number) => ({ index: i, label: item.label, purpose: item.purpose, prompt: item.promptTemplate })))}`,
        'Return ONLY valid JSON: { "grades": [ { "index": N, "specificity": N, "style_match": N, "purpose_fitness": N, "overall": N, "weak": boolean, "improvement": "..." } ] }',
      ].join("\n");

      const gradeResp = await ai.models.generateContent({
        model: getMergedModels().text,
        contents: promptGradePrompt,
        config: { responseMimeType: "application/json" } as any,
      });
      const promptGrades = parseGeminiJson(gradeResp.text ?? "{}");
      stages.push({ name: "prompt_grading", duration: Date.now() - s5Start });

      // Write final progress
      await writePlanProgress(planId, { stage: "complete", progress: 5, total: 5, message: "Plan generation complete." });

      res.json({
        planId,
        outline: currentOutline,
        outlineGrade,
        items,
        promptGrades: promptGrades.grades ?? [],
        stages,
      });
    } catch (err: any) {
      console.error("Plan Generate Error:", err);
      res.status(500).json({ error: err.message ?? "Plan generation failed" });
    }
  });

  // ── H3 + W4: Prompt Expansion (3-step chain + artifact injection) ────────────

  api.post("/media/prompt/expand", async (req, res) => {
    try {
      const { basePrompt, purpose, projectContext, platform, projectId, apiKey } = req.body;
      if (!basePrompt) return res.status(400).json({ error: "basePrompt is required" });
      const key = requireApiKey(apiKey);
      const ai = new GoogleGenAI({ apiKey: key });

      const brandCtx = projectContext
        ? `Brand: ${projectContext.brandName ?? ""}. Description: ${projectContext.brandDescription ?? ""}. Audience: ${projectContext.targetAudience ?? ""}. Voice: ${projectContext.brandVoice ?? ""}. Style: ${(projectContext.styleKeywords ?? []).join(", ")}.`
        : "";
      const platCtx = platform ? `Target platform: ${platform}.` : "";
      const purpCtx = `Purpose: ${purpose ?? "general"}.`;

      // W4: Inject pinned strategy artifacts into the expansion context
      let artifactCtx = "";
      if (projectId) {
        try {
          const pinnedArtifacts = getActiveArtifacts(projectId);
          if (pinnedArtifacts.length > 0) {
            artifactCtx = "\nStrategy context from pinned artifacts:\n" + pinnedArtifacts.map((a) =>
              `- [${a.type}] "${a.title}": ${a.summary}`
            ).join("\n") + "\nIncorporate these strategic directions naturally into the prompt.";
          }
        } catch { /* artifacts not critical */ }
      }

      const fullContext = `${brandCtx}\n${platCtx}\n${purpCtx}${artifactCtx}`;

      const s1 = await ai.models.generateContent({
        model: getMergedModels().creative,
        contents: `You are a creative director writing image generation prompts. Expand this rough idea into a detailed, vivid prompt.\n${fullContext}\nBase idea: "${basePrompt}"\nRespond with ONLY the expanded prompt, no preamble.`,
      });
      const expanded = s1.text?.trim() ?? basePrompt;

      const s2 = await ai.models.generateContent({
        model: getMergedModels().creative,
        contents: `Refine this image generation prompt for brand alignment and platform fit. Add specific details about lighting, composition, color palette, and mood.\n${fullContext}\nPrompt: "${expanded}"\nRespond with ONLY the refined prompt.`,
      });
      const refined = s2.text?.trim() ?? expanded;

      const s3 = await ai.models.generateContent({
        model: getMergedModels().creative,
        contents: `Convert this creative brief into a final generation-ready image prompt. Add technical quality descriptors (high resolution, sharp focus, professional photography) and a negative prompt suffix.\nBrief: "${refined}"\nRespond with ONLY the final prompt.`,
      });
      const final = s3.text?.trim() ?? refined;

      res.json({ basePrompt, expanded, refined, final, chain: [expanded, refined, final] });
    } catch (err: any) {
      console.error("Prompt Expand Error:", err);
      res.status(500).json({ error: err.message ?? "Prompt expansion failed" });
    }
  });

  // ── H4: Prompt Variants ──────────────────────────────────────────────────────

  api.post("/media/prompt/variants", async (req, res) => {
    try {
      const { expandedPrompt, count = 4, apiKey } = req.body;
      if (!expandedPrompt) return res.status(400).json({ error: "expandedPrompt is required" });
      const key = requireApiKey(apiKey);
      const ai = new GoogleGenAI({ apiKey: key });
      const response = await ai.models.generateContent({
        model: getMergedModels().creative,
        contents: `Generate ${count} distinct stylistic variants of this image prompt. Explore different visual styles: photorealistic, illustrated/vector, abstract, typographic, cinematic.\nBase prompt: "${expandedPrompt}"\nReturn ONLY a valid JSON object: { "variants": [ { "style": "...", "prompt": "..." } ] }`,
      });
      const txt = response.text?.trim() ?? "{}";
      const m = txt.match(/\{[\s\S]*\}/);
      const parsed = m ? JSON.parse(m[0]) : { variants: [] };
      res.json({ expandedPrompt, ...parsed });
    } catch (err: any) {
      console.error("Prompt Variants Error:", err);
      res.status(500).json({ error: err.message ?? "Prompt variant generation failed" });
    }
  });

  // ── I3: AI Media Scoring (LLM-as-Judge) ────────────────────────────────────

  api.post("/media/score", async (req, res) => {
    try {
      const { jobId, jobType, projectContext, purpose, apiKey } = req.body;
      if (!jobId || !jobType) return res.status(400).json({ error: "jobId and jobType are required" });
      if (!jobTypeDirs[jobType as MediaType]) return res.status(400).json({ error: "Invalid jobType" });
      const key = requireApiKey(apiKey);
      const ai = new GoogleGenAI({ apiKey: key });

      const manifest = await readManifest(jobType as MediaType, jobId);
      if (manifest.status !== "completed" || manifest.outputs.length === 0) {
        return res.status(400).json({ error: "Job is not completed or has no outputs" });
      }

      const brandCtx = projectContext
        ? `Brand: ${projectContext.brandName ?? ""}. Audience: ${projectContext.targetAudience ?? ""}. Voice: ${projectContext.brandVoice ?? ""}.`
        : "No brand context provided.";
      const purposeCtx = purpose ?? manifest.prompt ?? manifest.text ?? "general media";
      const scoreSchema = `{ "scores": { "brandAlignment": <1-5>, "purposeFit": <1-5>, "technicalQuality": <1-5>, "audienceMatch": <1-5>, "uniqueness": <1-5> }, "overall": <float 1-5>, "reasoning": "...", "suggestions": ["..."] }`;

      let contents: any;
      if (jobType === "image") {
        const relPath = manifest.outputs[0].replace(/^\/jobs\//, "jobs/");
        const absPath = path.join(process.cwd(), relPath);
        const parts: any[] = [
          { text: `Score this image across 5 criteria. ${brandCtx} Purpose: "${purposeCtx}".\nReturn ONLY valid JSON matching: ${scoreSchema}` },
        ];
        try {
          const imgData = await fs.readFile(absPath);
          parts.unshift({ inlineData: { data: imgData.toString("base64"), mimeType: "image/png" } });
        } catch { /* score text-only if file missing */ }
        contents = { parts };
      } else {
        const promptText = (manifest.prompt ?? manifest.text ?? "").slice(0, 400);
        contents = `Score this ${jobType}. Prompt/Text: "${promptText}". ${brandCtx} Purpose: "${purposeCtx}".\nReturn ONLY valid JSON matching: ${scoreSchema}`;
      }

      const response = await ai.models.generateContent({ model: jobType === "image" ? getMergedModels().multimodal : getMergedModels().text, contents });
      const txt = response.text?.trim() ?? "{}";
      const m = txt.match(/\{[\s\S]*\}/);
      const scoreData = m ? JSON.parse(m[0]) as MediaScore : null;
      if (scoreData) await patchManifest(jobType as MediaType, jobId, { score: scoreData });
      res.json({ jobId, jobType, ...(scoreData ?? { error: "Could not parse score response" }) });
    } catch (err: any) {
      console.error("Media Score Error:", err);
      res.status(500).json({ error: err.message ?? "Media scoring failed" });
    }
  });

  // ── W5: Collections CRUD (server-side) ──────────────────────────────────────
  // Uses collectionQueries + collectionItemQueries from src/db.ts
  // Frontend (Lane 3) currently uses localStorage; these endpoints provide the
  // server-side source of truth for when SQLite is the primary store.

  function genCollectionId() {
    return `col_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  }

  /** POST /api/collections — create a new collection */
  api.post("/collections", (req, res) => {
    try {
      const { name, projectId } = req.body;
      if (!name) return res.status(400).json({ error: "name is required" });
      const id = genCollectionId();
      const row = { id, projectId: projectId ?? null, name: String(name), createdAt: new Date().toISOString() };
      collectionQueries.insert(row);
      res.status(201).json(row);
    } catch (err: any) {
      console.error("Collections POST error:", err);
      res.status(500).json({ error: err.message ?? "Failed to create collection" });
    }
  });

  /** GET /api/collections?projectId= — list collections for a project */
  api.get("/collections", (req, res) => {
    try {
      const { projectId } = req.query;
      if (!projectId || typeof projectId !== "string") {
        return res.status(400).json({ error: "projectId query param is required" });
      }
      const cols = collectionQueries.list(projectId);
      res.json(cols);
    } catch (err: any) {
      console.error("Collections GET error:", err);
      res.status(500).json({ error: err.message ?? "Failed to list collections" });
    }
  });

  /** GET /api/collections/:id — get a collection with its items */
  api.get("/collections/:id", (req, res) => {
    try {
      const col = collectionQueries.get(req.params.id);
      if (!col) return res.status(404).json({ error: "Collection not found" });
      const items = collectionItemQueries.listWithJobs(req.params.id);
      res.json({ ...col, items });
    } catch (err: any) {
      console.error("Collection GET error:", err);
      res.status(500).json({ error: err.message ?? "Failed to get collection" });
    }
  });

  /** DELETE /api/collections/:id — delete a collection (cascade deletes items) */
  api.delete("/collections/:id", (req, res) => {
    try {
      const col = collectionQueries.get(req.params.id);
      if (!col) return res.status(404).json({ error: "Collection not found" });
      collectionQueries.delete(req.params.id);
      res.json({ ok: true });
    } catch (err: any) {
      console.error("Collection DELETE error:", err);
      res.status(500).json({ error: err.message ?? "Failed to delete collection" });
    }
  });

  /** POST /api/collections/:id/items — add a media job to a collection */
  api.post("/collections/:id/items", (req, res) => {
    try {
      const col = collectionQueries.get(req.params.id);
      if (!col) return res.status(404).json({ error: "Collection not found" });
      const { jobId, sortOrder } = req.body;
      if (!jobId) return res.status(400).json({ error: "jobId is required" });
      collectionItemQueries.insert({
        collectionId: req.params.id,
        jobId: String(jobId),
        sortOrder: typeof sortOrder === "number" ? sortOrder : 0,
      });
      res.status(201).json({ ok: true });
    } catch (err: any) {
      console.error("Collection item POST error:", err);
      res.status(500).json({ error: err.message ?? "Failed to add item" });
    }
  });

  /** DELETE /api/collections/:id/items/:jobId — remove an item from a collection */
  api.delete("/collections/:id/items/:jobId", (req, res) => {
    try {
      collectionItemQueries.remove(req.params.id, req.params.jobId);
      res.json({ ok: true });
    } catch (err: any) {
      console.error("Collection item DELETE error:", err);
      res.status(500).json({ error: err.message ?? "Failed to remove item" });
    }
  });

  /** PUT /api/collections/:id/items/reorder — update sort orders for items */
  api.put("/collections/:id/items/reorder", (req, res) => {
    try {
      const col = collectionQueries.get(req.params.id);
      if (!col) return res.status(404).json({ error: "Collection not found" });
      const { order } = req.body as { order: Array<{ jobId: string; sortOrder: number }> };
      if (!Array.isArray(order)) return res.status(400).json({ error: "order must be an array of { jobId, sortOrder }" });
      for (const { jobId, sortOrder } of order) {
        collectionItemQueries.insert({ collectionId: req.params.id, jobId, sortOrder });
      }
      res.json({ ok: true });
    } catch (err: any) {
      console.error("Collection reorder error:", err);
      res.status(500).json({ error: err.message ?? "Failed to reorder items" });
    }
  });

  // ── J3: Collection Export (ZIP) ─────────────────────────────────────────────

  const collectionsDir = path.join(jobsDir, "collections");

  api.post("/collections/:id/export", async (req, res) => {
    let archiver: any;
    try {
      archiver = (await import("archiver")).default;
    } catch {
      return res.status(503).json({
        error: "ZIP export unavailable. Lane 4: please run `npm install archiver @types/archiver`.",
      });
    }
    try {
      const { collectionName, items } = req.body as {
        collectionName?: string;
        items: Array<{ jobId: string; type: MediaType; filePath?: string; prompt?: string; tags?: string[]; score?: MediaScore }>;
      };
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "items array is required" });
      }

      const collectionId = req.params.id;
      const exportName = (collectionName ?? collectionId).replace(/[^a-z0-9_-]/gi, "_");

      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${exportName}.zip"`);

      const archive = archiver("zip", { zlib: { level: 6 } });
      archive.on("error", (err: Error) => { console.error("Archive error:", err); res.destroy(); });
      archive.pipe(res);

      const manifest: Record<string, unknown>[] = [];
      for (const item of items) {
        try {
          const jobManifest = await readManifest(item.type, item.jobId);
          const output = jobManifest.outputs?.[0];
          if (output) {
            const relPath = output.replace(/^\/jobs\//, "jobs/");
            const absPath = path.join(process.cwd(), relPath);
            const ext = path.extname(absPath);
            const fileName = `${item.type}_${item.jobId}${ext}`;
            archive.file(absPath, { name: fileName });
            manifest.push({
              filename: fileName,
              jobId: item.jobId,
              type: item.type,
              purpose: item.prompt ?? jobManifest.prompt ?? jobManifest.text ?? "",
              prompt: jobManifest.prompt ?? jobManifest.text ?? "",
              tags: jobManifest.tags ?? item.tags ?? [],
              score: jobManifest.score ?? item.score ?? null,
              createdAt: jobManifest.createdAt,
            });
          }
        } catch { /* skip items that can't be read */ }
      }

      archive.append(JSON.stringify({
        collection: collectionName ?? collectionId,
        collectionId,
        exported: new Date().toISOString(),
        items: manifest,
      }, null, 2), { name: "media_manifest.json" });

      await archive.finalize();
    } catch (err: any) {
      console.error("Collection Export Error:", err);
      if (!res.headersSent) res.status(500).json({ error: err.message ?? "Export failed" });
    }
  });

  // ── L6: Strategy Artifacts CRUD ─────────────────────────────────────────────
  // Supports L6 (Research Save as Artifact, Scoring Insights)
  // and L2 (Boardroom Strategy Extraction).

  function genArtifactId() {
    return `art_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  }

  const VALID_ARTIFACT_TYPES: ArtifactType[] = [
    "boardroom_insight",
    "research_finding",
    "strategy_brief",
    "style_direction",
    "scoring_analysis",
    "custom",
  ];

  /** POST /api/artifacts — create a new strategy artifact */
  api.post("/artifacts", (req, res) => {
    try {
      const { projectId, type, title, summary, content, tags, source, pinned } = req.body;
      if (!type || !title || !content) {
        return res.status(400).json({ error: "type, title, and content are required" });
      }
      if (!VALID_ARTIFACT_TYPES.includes(type as ArtifactType)) {
        return res.status(400).json({ error: `Invalid type. Must be one of: ${VALID_ARTIFACT_TYPES.join(", ")}` });
      }
      const now = new Date().toISOString();
      const row: StrategyArtifactRow = {
        id: genArtifactId(),
        projectId: projectId ?? null,
        type: type as ArtifactType,
        title: String(title).slice(0, 200),
        summary: String(summary ?? content.slice(0, 300)).slice(0, 500),
        content: String(content),
        tags: JSON.stringify(Array.isArray(tags) ? tags : []),
        source: JSON.stringify(source ?? { type: "manual", timestamp: now }),
        pinned: pinned ? 1 : 0,
        createdAt: now,
        updatedAt: now,
      };
      strategyArtifactQueries.insert(row);
      res.status(201).json({ ...row, tags: JSON.parse(row.tags), source: JSON.parse(row.source), pinned: row.pinned === 1 });
    } catch (err: any) {
      console.error("Artifact POST error:", err);
      res.status(500).json({ error: err.message ?? "Failed to create artifact" });
    }
  });

  /** GET /api/artifacts?projectId=&pinned=true — list artifacts for a project */
  api.get("/artifacts", (req, res) => {
    try {
      const { projectId, pinned } = req.query;
      if (!projectId || typeof projectId !== "string") {
        return res.status(400).json({ error: "projectId query param is required" });
      }
      const rows = pinned === "true"
        ? strategyArtifactQueries.listPinned(projectId)
        : strategyArtifactQueries.list(projectId);
      res.json(rows.map((r) => ({
        ...r,
        tags: (() => { try { return JSON.parse(r.tags); } catch { return []; } })(),
        source: (() => { try { return JSON.parse(r.source); } catch { return {}; } })(),
        pinned: r.pinned === 1,
      })));
    } catch (err: any) {
      console.error("Artifacts GET error:", err);
      res.status(500).json({ error: err.message ?? "Failed to list artifacts" });
    }
  });

  /** GET /api/artifacts/:id — get a single artifact */
  api.get("/artifacts/:id", (req, res) => {
    try {
      const row = strategyArtifactQueries.get(req.params.id);
      if (!row) return res.status(404).json({ error: "Artifact not found" });
      res.json({ ...row, tags: (() => { try { return JSON.parse(row.tags); } catch { return []; } })(), source: (() => { try { return JSON.parse(row.source); } catch { return {}; } })(), pinned: row.pinned === 1 });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to get artifact" });
    }
  });

  /** POST /api/artifacts/:id/pin — toggle pinned state */
  api.post("/artifacts/:id/pin", (req, res) => {
    try {
      const row = strategyArtifactQueries.get(req.params.id);
      if (!row) return res.status(404).json({ error: "Artifact not found" });
      const { pinned } = req.body;
      strategyArtifactQueries.togglePin(req.params.id, !!pinned);
      res.json({ ok: true, pinned: !!pinned });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to toggle pin" });
    }
  });

  /** DELETE /api/artifacts/:id — delete an artifact */
  api.delete("/artifacts/:id", (req, res) => {
    try {
      const row = strategyArtifactQueries.get(req.params.id);
      if (!row) return res.status(404).json({ error: "Artifact not found" });
      strategyArtifactQueries.delete(req.params.id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message ?? "Failed to delete artifact" });
    }
  });

  // ── W4 (L6): Scoring Insights → Auto-Artifact ───────────────────────────────
  // Reads all scored media for a project, calls Gemini to summarize visual
  // trends, then saves the result as a scoring_analysis artifact.

  api.post("/media/scoring-insights", async (req, res) => {
    try {
      const { projectId, apiKey } = req.body;
      if (!projectId) return res.status(400).json({ error: "projectId is required" });
      const key = requireApiKey(apiKey);
      const ai = new GoogleGenAI({ apiKey: key });

      // Collect all scored media for this project
      const rows: MediaJobRow[] = mediaJobQueries.listByProject(projectId);
      const scored = rows.filter((r) => r.scores && r.status === "completed");

      if (scored.length === 0) {
        return res.status(400).json({ error: "No scored media found for this project. Generate and score some media first." });
      }

      // Build a text summary of scores for Gemini to analyze
      const scoreSummaries = scored.map((r) => {
        const s = (() => { try { return JSON.parse(r.scores!); } catch { return null; } })();
        if (!s) return null;
        const tags = (() => { try { return JSON.parse(r.tags); } catch { return []; } })();
        return `- Prompt: "${(r.prompt ?? (r as any).text ?? "").slice(0, 120)}" | Type: ${r.type} | Tags: ${tags.join(", ")} | Scores: brand=${s.brandAlignment ?? s.scores?.brandAlignment ?? "?"}/5, technical=${s.technicalQuality ?? s.scores?.technicalQuality ?? "?"}/5, overall=${s.overall}/5 | Reasoning: "${(s.reasoning ?? "").slice(0, 120)}"`;
      }).filter(Boolean);

      const prompt = [
        "You are a visual media strategist analyzing AI-generated media performance data.",
        `Below are scoring results for ${scored.length} media assets from the same project.`,
        "Identify the top 3-5 trends that distinguish high-scoring from low-scoring media.",
        "Be specific about visual attributes: lighting, composition, style, color, format.",
        "Write a concise strategic brief (2-4 paragraphs) that a creative director could act on.",
        "End with 3-5 bullet-point recommendations (use markdown bullets).",
        "",
        "Scored media data:",
        ...scoreSummaries,
      ].filter(Boolean).join("\n");

      const response = await ai.models.generateContent({
        model: getMergedModels().text,
        contents: prompt,
      });

      const analysisText = response.text?.trim() ?? "No analysis generated.";
      const summary = analysisText.slice(0, 300).replace(/\n/g, " ") + (analysisText.length > 300 ? "…" : "");

      // Auto-generate tags from the top-scoring media tags
      const allTags = scored
        .sort((a, b) => {
          const sa = (() => { try { return JSON.parse(a.scores!).overall ?? 0; } catch { return 0; } })();
          const sb = (() => { try { return JSON.parse(b.scores!).overall ?? 0; } catch { return 0; } })();
          return sb - sa;
        })
        .slice(0, 5)
        .flatMap((r) => { try { return JSON.parse(r.tags) as string[]; } catch { return []; } });
      const uniqueTags = [...new Set(allTags)].slice(0, 8);

      const now = new Date().toISOString();
      const row: StrategyArtifactRow = {
        id: genArtifactId(),
        projectId,
        type: "scoring_analysis",
        title: `Scoring Insights — ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
        summary,
        content: analysisText,
        tags: JSON.stringify(uniqueTags),
        source: JSON.stringify({ type: "scoring", timestamp: now, mediaCount: scored.length }),
        pinned: 0,
        createdAt: now,
        updatedAt: now,
      };
      strategyArtifactQueries.insert(row);

      console.log(`[L6] Scoring insights artifact created: ${row.id} (${scored.length} media analyzed)`);

      res.json({
        ok: true,
        artifactId: row.id,
        title: row.title,
        mediaAnalyzed: scored.length,
        summary,
        tags: uniqueTags,
      });
    } catch (err: any) {
      console.error("Scoring Insights Error:", err);
      res.status(500).json({ error: err.message ?? "Scoring insights failed" });
    }
  });

  // ── Lane 5: Twilio / Sales Agent ──


  const twilioConfigPath = path.join(jobsDir, "twilio", "config.json");

  interface TwilioAgentConfig {
    brandName: string;
    brandDescription: string;
    targetAudience: string;
    brandVoice: string;
    projectId?: string;
    projectName?: string;
    mediaCount?: number;
    updatedAt: string;
  }

  const DEFAULT_TWILIO_CONFIG: TwilioAgentConfig = {
    brandName: "Our Brand",
    brandDescription: "A forward-thinking agency.",
    targetAudience: "Small to medium businesses.",
    brandVoice: "Professional, innovative, and approachable.",
    updatedAt: new Date().toISOString(),
  };

  async function readTwilioConfig(): Promise<TwilioAgentConfig> {
    try {
      const raw = await fs.readFile(twilioConfigPath, "utf8");
      const parsed = JSON.parse(raw);
      // Merge with defaults so missing fields don't crash the prompt
      return { ...DEFAULT_TWILIO_CONFIG, ...parsed };
    } catch {
      return DEFAULT_TWILIO_CONFIG;
    }
  }

  // GET /api/twilio/config — read current agent config
  api.get("/twilio/config", async (_req, res) => {
    try {
      const config = await readTwilioConfig();
      res.json(config);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to read Twilio config" });
    }
  });

  // POST /api/twilio/config — save brand context for the SMS agent
  api.post("/twilio/config", async (req, res) => {
    try {
      const { brandName, brandDescription, targetAudience, brandVoice, projectId, projectName, mediaCount } = req.body;

      if (!brandName) {
        return res.status(400).json({ error: "brandName is required" });
      }

      await fs.mkdir(path.join(jobsDir, "twilio"), { recursive: true });

      const config: TwilioAgentConfig = {
        brandName: String(brandName),
        brandDescription: String(brandDescription || ""),
        targetAudience: String(targetAudience || ""),
        brandVoice: String(brandVoice || ""),
        projectId: projectId ? String(projectId) : undefined,
        projectName: projectName ? String(projectName) : undefined,
        mediaCount: typeof mediaCount === "number" ? mediaCount : undefined,
        updatedAt: new Date().toISOString(),
      };

      await fs.writeFile(twilioConfigPath, JSON.stringify(config, null, 2));
      res.json({ ok: true, config });
    } catch (error: any) {
      console.error("Twilio Config Save Error:", error);
      res.status(500).json({ error: error.message || "Failed to save Twilio config" });
    }
  });

  // POST /api/twilio/sms — Twilio SMS webhook (brand-context-aware)
  app.post("/api/twilio/sms", async (req, res) => {
    try {
      const { Body } = req.body;
      const ai = new GoogleGenAI({ apiKey: requireApiKey() });

      // Load persisted brand/project config for this agent
      const cfg = await readTwilioConfig();

      const mediaNote = cfg.mediaCount && cfg.mediaCount > 0
        ? ` We have recently produced ${cfg.mediaCount} media asset${cfg.mediaCount !== 1 ? "s" : ""} for this brand.`
        : "";

      const projectNote = cfg.projectName
        ? ` You are currently representing the project: "${cfg.projectName}".`
        : "";

      const systemPrompt = [
        `You are an AI sales representative for ${cfg.brandName}.`,
        `Brand description: ${cfg.brandDescription}`,
        `Target audience: ${cfg.targetAudience}`,
        `Brand voice / tone: ${cfg.brandVoice}`,
        projectNote,
        mediaNote,
        `Keep your reply concise — it will be delivered via SMS (under 160 characters ideally).`,
        `Respond naturally and helpfully to the customer.`,
      ]
        .filter(Boolean)
        .join(" ");

      const response = await ai.models.generateContent({
        model: getMergedModels().creative,
        contents: `${systemPrompt}\n\nCustomer message: "${Body}"\n\nYour SMS reply:`,
      });

      const twiml = new twilio.twiml.MessagingResponse();
      twiml.message(response.text || "Sorry, I couldn't process that.");

      res.type("text/xml").send(twiml.toString());
    } catch (error) {
      console.error("Twilio SMS Error:", error);
      const twiml = new twilio.twiml.MessagingResponse();
      twiml.message("System error. Please try again later.");
      res.type("text/xml").send(twiml.toString());
    }
  });

  // ── L1/L2: Strategy Artifacts CRUD ─────────────────────────────────────────

  // POST /api/artifacts — create a new strategy artifact
  api.post("/artifacts", (req, res) => {
    try {
      const { projectId, type, title, summary, content, tags, source, pinned } = req.body;
      if (!title || !type || !content) {
        return res.status(400).json({ error: "title, type, and content are required" });
      }
      const VALID_TYPES = new Set(["boardroom_insight", "research_finding", "strategy_brief", "style_direction", "scoring_analysis", "custom"]);
      if (!VALID_TYPES.has(type)) {
        return res.status(400).json({ error: `Invalid type: ${type}. Must be one of ${[...VALID_TYPES].join(", ")}` });
      }
      const now = new Date().toISOString();
      const id = `art_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const row: StrategyArtifactRow = {
        id,
        projectId: projectId ?? null,
        type,
        title: String(title).slice(0, 200),
        summary: String(summary ?? "").slice(0, 500),
        content: String(content),
        tags: JSON.stringify(Array.isArray(tags) ? tags : []),
        source: JSON.stringify(source ?? { type: "manual", timestamp: now }),
        pinned: pinned ? 1 : 0,
        createdAt: now,
        updatedAt: now,
      };
      strategyArtifactQueries.insert(row);
      res.status(201).json({ ...row, tags: JSON.parse(row.tags), source: JSON.parse(row.source) });
    } catch (error: any) {
      console.error("Artifact Create Error:", error);
      res.status(500).json({ error: error.message || "Failed to create artifact" });
    }
  });

  // GET /api/artifacts?projectId= — list artifacts for a project
  api.get("/artifacts", (req, res) => {
    try {
      const projectId = req.query.projectId as string;
      if (!projectId) return res.status(400).json({ error: "projectId query param is required" });
      const rows = strategyArtifactQueries.list(projectId);
      const parsed = rows.map((r) => ({ ...r, tags: JSON.parse(r.tags || "[]"), source: JSON.parse(r.source || "{}") }));
      res.json(parsed);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to list artifacts" });
    }
  });

  // GET /api/artifacts/:id — get a single artifact
  api.get("/artifacts/:id", (req, res) => {
    try {
      const row = strategyArtifactQueries.get(req.params.id);
      if (!row) return res.status(404).json({ error: "Artifact not found" });
      res.json({ ...row, tags: JSON.parse(row.tags || "[]"), source: JSON.parse(row.source || "{}") });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to get artifact" });
    }
  });

  // PATCH /api/artifacts/:id/pin — toggle pin state
  api.patch("/artifacts/:id/pin", (req, res) => {
    try {
      const { pinned } = req.body;
      strategyArtifactQueries.togglePin(req.params.id, Boolean(pinned));
      const row = strategyArtifactQueries.get(req.params.id);
      if (!row) return res.status(404).json({ error: "Artifact not found" });
      res.json({ ...row, tags: JSON.parse(row.tags || "[]"), source: JSON.parse(row.source || "{}") });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to update artifact" });
    }
  });

  // DELETE /api/artifacts/:id
  api.delete("/artifacts/:id", (req, res) => {
    try {
      strategyArtifactQueries.delete(req.params.id);
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to delete artifact" });
    }
  });

  // W2 (S3): POST /api/boardroom/sessions/:id/save-artifact
  // Reads convergence, calls Gemini for title+summary, creates a boardroom_insight artifact.
  // For Strategy Analysis sessions, also runs extractStrategyAnalysisOutput.
  api.post("/boardroom/sessions/:id/save-artifact", async (req, res) => {
    try {
      const { projectId, apiKey: rawApiKey } = req.body;
      const apiKey = rawApiKey || process.env.GEMINI_API_KEY;
      const sessionId = req.params.id;
      const session = await readBoardroomSession(sessionId);

      if (session.status !== "completed") {
        return res.status(400).json({ error: "Session must be completed to save as artifact" });
      }

      // Detect if this is a Strategy Analysis session by checking participant IDs
      const isStrategyAnalysis = session.participants.some(
        (p) => p.id === "analyst" || p.id === "psychologist" || p.id === "adapter" || p.id === "devils-advocate",
      );

      let title: string;
      let summary: string;
      let content: string;
      let tags: string[];
      let artifactType: StrategyArtifactRow["type"];

      if (isStrategyAnalysis && apiKey) {
        // Run structured extraction for Strategy Analysis sessions
        const output = await extractStrategyAnalysisOutput(sessionId, apiKey);
        title = `Strategy Analysis: ${output.tags.slice(0, 3).join(", ") || session.topic.slice(0, 50)}`;
        summary = output.adaptationNotes || output.originalDescription;
        content = JSON.stringify(output, null, 2);
        tags = [...output.tags, ...output.extractedPrinciples.slice(0, 3)];
        artifactType = "strategy_brief";
      } else if (apiKey) {
        // General boardroom insight — generate title+summary via Gemini
        const convergence = [
          session.result?.summary ?? "",
          session.result?.nextSteps?.join(" — ") ?? "",
        ].filter(Boolean).join("\n").slice(0, 2000);

        const ai = new GoogleGenAI({ apiKey });
        const metaResp = await ai.models.generateContent({
          model: getMergedModels().boardroom,
          contents: `Given this boardroom session result about "${session.topic}", return only JSON with shape: { "title": "...", "summary": "...", "tags": ["..."] }. title: 5-8 words. summary: 2-3 sentences. tags: 4-6 strategic keywords.\n\nSession result:\n${convergence}`,
        });
        try {
          const raw = metaResp.text?.trim() ?? "{}";
          const m = raw.match(/\{[\s\S]*\}/);
          const parsed = m ? JSON.parse(m[0]) : {};
          title = String(parsed.title || session.topic).slice(0, 200);
          summary = String(parsed.summary || "").slice(0, 500);
          tags = Array.isArray(parsed.tags) ? parsed.tags.map(String) : [];
        } catch {
          title = session.topic.slice(0, 200);
          summary = session.result?.summary ?? "";
          tags = [];
        }
        content = JSON.stringify({
          sessionId,
          summary: session.result?.summary ?? "",
          nextSteps: session.result?.nextSteps ?? [],
          perspectives: session.result?.perspectives ?? [],
        }, null, 2);
        artifactType = "boardroom_insight";
      } else {
        // Fallback without API key
        title = session.topic.slice(0, 200);
        summary = session.result?.summary?.slice(0, 500) ?? "";
        tags = [];
        content = JSON.stringify({
          sessionId,
          summary: session.result?.summary ?? "",
          nextSteps: session.result?.nextSteps ?? [],
        }, null, 2);
        artifactType = "boardroom_insight";
      }

      const now = new Date().toISOString();
      const id = `art_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const source = { type: "boardroom" as const, sessionId, timestamp: now };

      const row: StrategyArtifactRow = {
        id,
        projectId: projectId ?? null,
        type: artifactType,
        title,
        summary,
        content,
        tags: JSON.stringify(tags),
        source: JSON.stringify(source),
        pinned: 0,
        createdAt: now,
        updatedAt: now,
      };

      strategyArtifactQueries.insert(row);

      const artifact = { ...row, tags, source };
      res.status(201).json(artifact);
    } catch (error: any) {
      console.error("Save Artifact Error:", error);
      const status = error.message?.includes("not found") ? 404
        : error.message?.includes("completed") ? 400
        : 500;
      res.status(status).json({ error: error.message || "Failed to save artifact" });
    }
  });

  // ── Compose ──────────────────────────────────────────────────────────────────────────

  /**
   * POST /api/media/compose
   * Accepts a ComposeRequest and runs the composition in the background.
   * Returns 202 immediately with { composeId, status: "processing" }.
   *
   * type: "merge"      — merge a video + audio track
   * type: "slideshow"  — create a slideshow from images
   * type: "caption"    — burn ASS subtitles onto a video
   */
  api.post("/media/compose", async (req, res) => {
    // Lazy-load compose module to avoid import-time side effects during testing
    const compose = await import("./compose.ts");
    await compose.waitForInit();

    if (!compose.isFFmpegAvailable()) {
      return res.status(503).json({
        error: "FFmpeg not installed",
        installHint: "sudo apt install ffmpeg",
      });
    }

    const body = req.body as Record<string, unknown>;
    const type = body.type as string | undefined;

    if (!type || !["merge", "slideshow", "caption"].includes(type)) {
      return res.status(400).json({ error: 'type must be one of "merge", "slideshow", "caption"' });
    }

    if (type === "slideshow") {
      const slides = body.slides as unknown[] | undefined;
      if (!slides || !Array.isArray(slides) || slides.length === 0) {
        return res.status(400).json({ error: "slideshow requires at least one slide in the slides[] array" });
      }
    }

    if (type === "merge") {
      if (!body.videoJobId && !body.videoPath) {
        return res.status(400).json({ error: "merge requires videoJobId or videoPath" });
      }
      if (!body.audioJobId && !body.audioPath && (!Array.isArray(body.audioTracks) || body.audioTracks.length === 0)) {
        return res.status(400).json({ error: "merge requires audioJobId, audioPath, or audioTracks" });
      }
    }

    if (type === "caption") {
      if (!body.videoJobId && !body.videoPath) {
        return res.status(400).json({ error: "caption requires videoJobId or videoPath" });
      }
      if (!body.captions || typeof (body.captions as any).text !== "string") {
        return res.status(400).json({ error: "caption requires captions.text" });
      }
    }

    const composeId = `compose_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    const projectId = (body.projectId as string | undefined) ?? null;
    const title = (body.title as string | undefined) ?? null;

    const outputDir = path.join(jobsDir, "compose", composeId);
    const outputFilePath = path.join(outputDir, "output.mp4");
    const outputUrl = `/jobs/compose/${composeId}/output.mp4`;

    // Insert initial DB record
    const jobRow: ComposeJobRow = {
      id: composeId,
      projectId,
      type: type as ComposeJobRow["type"],
      status: "processing",
      title,
      inputConfig: JSON.stringify(body),
      audioTracks: body.audioTracks ? JSON.stringify(body.audioTracks) : null,
      trimPoints: body.trimPoints ? JSON.stringify(body.trimPoints) : null,
      watermarkJobId: (body.watermarkJobId as string) ?? null,
      outputPath: null,
      outputs: JSON.stringify([]),
      duration: null,
      createdAt: now,
      updatedAt: now,
    };
    try {
      composeJobQueries.insert(jobRow);
    } catch (dbErr) {
      console.error("[compose] DB insert failed:", dbErr);
    }

    // Write a manifest file so the job is discoverable via GET
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(
      path.join(outputDir, "manifest.json"),
      JSON.stringify({ ...jobRow, outputs: [] }, null, 2),
    );

    // Fire-and-forget background composition
    void (async () => {
      try {
        let result: { outputPath: string; duration: number; size: number } | null = null;

        // ── Resolve Common Assets (Audio & Watermark) ───────────────────────
        const resolvedAudioTracks: import("./compose.ts").AudioTrackInput[] = [];
        if (Array.isArray(body.audioTracks) && body.audioTracks.length > 0) {
          for (const t of body.audioTracks as Array<{ jobId?: string; path?: string; volume?: number }>) {
            let ap = "";
            if (t.path) {
              ap = t.path;
            } else if (t.jobId) {
              let manifest;
              try {
                manifest = await readManifest("voice", t.jobId);
              } catch {
                try {
                  manifest = await readManifest("audio" as any, t.jobId);
                } catch {
                  manifest = await readManifest("video", t.jobId); 
                }
              }
              const relOut = manifest.outputs[0];
              if (!relOut) throw new Error(`audioTrack jobId ${t.jobId} has no outputs`);
              ap = path.join(process.cwd(), relOut.replace(/^\//, ""));
            } else {
              continue;
            }
            resolvedAudioTracks.push({ audioPath: ap, volume: t.volume });
          }
        } else if (body.audioJobId || body.audioPath) {
          // legacy single track fallback
          let audioPath: string;
          if (body.audioPath) {
            audioPath = body.audioPath as string;
          } else {
            const manifest = await readManifest("voice", body.audioJobId as string);
            const relOut = manifest.outputs[0];
            if (!relOut) throw new Error(`audioJobId ${body.audioJobId} has no outputs`);
            audioPath = path.join(process.cwd(), relOut.replace(/^\//, ""));
          }
          resolvedAudioTracks.push({ audioPath });
        }

        let watermarkPath: string | undefined;
        if (body.watermarkPath) {
          watermarkPath = body.watermarkPath as string;
        } else if (body.watermarkJobId) {
          const manifest = await readManifest("image", body.watermarkJobId as string);
          const relOut = manifest.outputs[0];
          if (!relOut) throw new Error(`watermarkJobId ${body.watermarkJobId} has no outputs`);
          watermarkPath = path.join(process.cwd(), relOut.replace(/^\//, ""));
        }

        if (type === "merge") {
          // Resolve video path
          let videoPath: string;
          if (body.videoPath) {
            videoPath = body.videoPath as string;
          } else {
            const manifest = await readManifest(
              "video",
              body.videoJobId as string
            );
            const relOut = manifest.outputs[0];
            if (!relOut) throw new Error(`videoJobId ${body.videoJobId} has no outputs`);
            videoPath = path.join(process.cwd(), relOut.replace(/^\//, ""));
          }

          // Resolve trim points
          let trimPoints: { inPoint: number; outPoint: number } | undefined;
          if (body.trimPoints && typeof body.trimPoints === "object") {
            const tp = body.trimPoints as { inPoint?: number; outPoint?: number };
            if (tp.inPoint !== undefined && tp.outPoint !== undefined) {
              trimPoints = { inPoint: Number(tp.inPoint), outPoint: Number(tp.outPoint) };
            }
          }

          const mergeOpts: import("./compose.ts").MergeOptions = {
             trimPoints,
             watermarkPath,
             watermarkOpacity: (body.watermarkOpacity as number) ?? 1.0,
          };

          result = await compose.mergeVideoAudio(videoPath, resolvedAudioTracks, outputFilePath, mergeOpts);


        } else if (type === "slideshow") {
          const slides = body.slides as Array<{
            jobId?: string;
            imagePath?: string;
            duration?: number;
            transition?: string;
            kenBurns?: boolean;
          }>;

          const resolvedSlides: ComposeSlideInput[] = [];
          for (const slide of slides) {
            let imagePath: string;
            if (slide.imagePath) {
              imagePath = slide.imagePath;
            } else if (slide.jobId) {
              const manifest = await readManifest("image", slide.jobId);
              const relOut = manifest.outputs[0];
              if (!relOut) throw new Error(`jobId ${slide.jobId} has no outputs`);
              imagePath = path.join(process.cwd(), relOut.replace(/^\//, ""));
            } else {
              throw new Error("Each slide must have jobId or imagePath");
            }
            resolvedSlides.push({
              imagePath,
              duration: slide.duration ?? 3,
              transition: slide.transition ?? "fade",
              kenBurns: slide.kenBurns ?? false,
            });
          }

          const outputCfg = (body.output as Record<string, unknown>) ?? {};
          const [ow, oh] = (() => {
            const ar = (outputCfg.aspectRatio as string) ?? "16:9";
            if (ar === "9:16") return [1080, 1920];
            if (ar === "1:1") return [1080, 1080];
            if (ar === "4:5") return [1080, 1350];
            return [1920, 1080]; // 16:9 default
          })();

          result = await compose.createSlideshow(resolvedSlides, outputFilePath, {
            width: ow,
            height: oh,
            fps: (outputCfg.fps as number) ?? 30,
            audioTracks: resolvedAudioTracks,
            watermarkPath,
            watermarkOpacity: (body.watermarkOpacity as number) ?? 1.0,
          });

        } else if (type === "caption") {
          // Resolve video path
          let videoPath: string;
          if (body.videoPath) {
            videoPath = body.videoPath as string;
          } else {
            const manifest = await readManifest(
              "video",
              body.videoJobId as string
            );
            const relOut = manifest.outputs[0];
            if (!relOut) throw new Error(`videoJobId ${body.videoJobId} has no outputs`);
            videoPath = path.join(process.cwd(), relOut.replace(/^\//, ""));
          }

          const captionCfg = body.captions as {
            text: string;
            style?: string;
            fontSize?: number;
            color?: string;
            position?: "top" | "center" | "bottom";
            timing?: "sentence" | "word";
          };

          const videoProbe = await compose.probeMedia(videoPath);
          const duration = videoProbe.duration;

          const style = (captionCfg.style ?? "clean") as Parameters<typeof compose.generateASS>[1];
          const assResult =
            captionCfg.timing === "word"
              ? await compose.generateWordLevelASS(captionCfg.text, style, duration, {
                  fontSize: captionCfg.fontSize,
                  fontColor: captionCfg.color,
                  position: captionCfg.position,
                })
              : await compose.generateASS(captionCfg.text, style, duration, {
                  fontSize: captionCfg.fontSize,
                  fontColor: captionCfg.color,
                  position: captionCfg.position,
                });

          result = await compose.burnCaptions(videoPath, assResult.assPath, outputFilePath);
        }

        if (result) {
          composeJobQueries.updateStatus({
            id: composeId,
            status: "done",
            outputPath: outputUrl,
            duration: result.duration,
          });

          // Update manifest file
          await fs.writeFile(
            path.join(outputDir, "manifest.json"),
            JSON.stringify({
              id: composeId,
              projectId,
              type,
              title,
              status: "done",
              inputConfig: body,
              outputPath: outputUrl,
              outputs: [outputUrl],
              duration: result.duration,
              createdAt: now,
              updatedAt: new Date().toISOString(),
            }, null, 2),
          );

          // Also index in media_jobs so it appears in Library
          try {
            mediaJobQueries.upsert({
              id: composeId,
              projectId,
              type: "video",
              status: "completed",
              prompt: title ?? `${type} compose job`,
              model: null,
              size: null,
              aspectRatio: (body.output as any)?.aspectRatio ?? null,
              resolution: null,
              voice: null,
              outputs: JSON.stringify([outputUrl]),
              tags: JSON.stringify(["compose", type]),
              scores: null,
              rating: null,
              planItemId: null,
              createdAt: now,
              updatedAt: new Date().toISOString(),
            });
          } catch (dbErr) {
            console.error("[compose] media_jobs index failed:", dbErr);
          }

          console.log(`[compose] Job ${composeId} completed — ${outputUrl}`);
        }
      } catch (err: any) {
        console.error(`[compose] Job ${composeId} failed:`, err);
        composeJobQueries.updateStatus({
          id: composeId,
          status: "failed",
          outputPath: null,
          duration: null,
        });
        await fs.writeFile(
          path.join(outputDir, "manifest.json"),
          JSON.stringify({
            id: composeId,
            projectId,
            type,
            status: "failed",
            error: err?.message || "Unknown compose error",
            createdAt: now,
            updatedAt: new Date().toISOString(),
          }, null, 2),
        ).catch(() => {});
      }
    })();

    res.status(202).json({ composeId, status: "processing" });
  });

  /**
   * GET /api/media/compose/:id
   * Poll for compose job status. Returns manifest + DB status.
   */
  api.get("/media/compose/:id", async (req, res) => {
    const { id } = req.params;
    try {
      const job = composeJobQueries.getById(id);
      if (job) {
        return res.json(job);
      }
      // Fallback: read manifest file
      const manifestPath = path.join(jobsDir, "compose", id, "manifest.json");
      const raw = await fs.readFile(manifestPath, "utf8");
      return res.json(JSON.parse(raw));
    } catch {
      return res.status(404).json({ error: `Compose job ${id} not found` });
    }
  });

  // ── Lane 3: Composition Templates & Batch Compose ───────────────────────────

  /**
   * GET /api/compose/templates
   * Returns all composition templates as a JSON array.
   * Loaded from data/compose-templates/*.json — cached in memory.
   */
  api.get("/compose/templates", async (_req, res) => {
    try {
      const templates = await loadTemplates();
      res.json(templates);
    } catch (err: any) {
      console.error("[L3] GET /compose/templates error:", err);
      res.status(500).json({ error: err.message || "Failed to load templates" });
    }
  });

  /**
   * POST /api/compose/template-from-artifact
   * Reads a strategy artifact and uses Gemini to suggest composition settings.
   * Falls back to "faceless-explainer" defaults if Gemini is unavailable or fails.
   *
   * Body: { artifactId: string, projectId?: string, apiKey?: string }
   * Returns: { template: ComposeTemplate, reasoning: string }
   */
  api.post("/compose/template-from-artifact", async (req, res) => {
    try {
      const { artifactId, projectId, apiKey: bodyKey } = req.body;
      if (!artifactId) {
        return res.status(400).json({ error: "artifactId is required" });
      }

      // Fetch the artifact
      const artifacts = strategyArtifactQueries.list(projectId ?? "");
      const artifact = artifacts.find((a: StrategyArtifactRow) => a.id === artifactId);
      if (!artifact) {
        return res.status(404).json({ error: "Artifact not found" });
      }

      const apiKey = bodyKey || process.env.GEMINI_API_KEY;
      const fallbackId = "faceless-explainer";
      const fallback = await getTemplate(fallbackId);
      const allTemplates = await loadTemplates();

      // Without API key, fall back immediately
      if (!apiKey || allTemplates.length === 0) {
        return res.json({
          template: fallback ?? allTemplates[0],
          reasoning: "API key unavailable — using default template.",
        });
      }

      // ── Call Gemini to suggest a composition config ──────────────────────────
      const ai = new GoogleGenAI({ apiKey });
      const templateIds = allTemplates.map((t: ComposeTemplate) => t.id).join(", ");
      const promptText = [
        "You are a video composition assistant. Based on the following strategy artifact, suggest the best composition settings.",
        "Return ONLY a JSON object with these fields:",
        `  templateId: one of ${templateIds}`,
        "  slideCount: number (3-8)",
        "  slideDuration: number (1.5-6, seconds per slide)",
        "  transitionStyle: one of fadeblack | dissolve | slideright | smoothleft | wiperight",
        "  captionStyle: one of clean | bold-outline | boxed | typewriter | word-highlight",
        "  aspectRatio: one of 9:16 | 16:9 | 1:1",
        "  kenBurns: boolean",
        "  pacing: short note (10-20 words) about pacing rationale",
        "",
        "Strategy Artifact:",
        `Title: ${artifact.title}`,
        `Summary: ${artifact.summary}`,
        `Content: ${String(artifact.content).slice(0, 1500)}`,
      ].join("\n");

      let templateResult: ComposeTemplate | null = null;
      let reasoning = "";

      try {
        const aiRes = await ai.models.generateContent({
          model: getMergedModels().text,
          contents: promptText,
        });
        const raw = aiRes.text?.trim() ?? "{}";
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          // Find the recommended template
          const recommended = allTemplates.find((t: ComposeTemplate) => t.id === parsed.templateId);
          if (recommended) {
            // Build a customized copy based on AI suggestions
            const slideCount = Math.max(2, Math.min(10, Number(parsed.slideCount) || recommended.slides.length));
            const slideDuration = Math.max(1.5, Math.min(8, Number(parsed.slideDuration) || 3));

            const customSlides = Array.from({ length: slideCount }, (_, i) => ({
              ...((recommended.slides[i] ?? recommended.slides[recommended.slides.length - 1]) as typeof recommended.slides[0]),
              duration: slideDuration,
              transition: parsed.transitionStyle || recommended.slides[i]?.transition || "dissolve",
              kenBurns: typeof parsed.kenBurns === "boolean" ? parsed.kenBurns : recommended.slides[i]?.kenBurns ?? true,
            }));

            templateResult = {
              ...recommended,
              id: `${recommended.id}-custom`,
              name: `${recommended.name} (AI-tuned)`,
              aspectRatio: (["9:16", "16:9", "1:1"].includes(parsed.aspectRatio) ? parsed.aspectRatio : recommended.aspectRatio) as ComposeTemplate["aspectRatio"],
              slides: customSlides,
              captions: {
                ...recommended.captions,
                style: (["clean","bold-outline","boxed","typewriter","word-highlight"].includes(parsed.captionStyle)
                  ? parsed.captionStyle
                  : recommended.captions.style) as ComposeTemplate["captions"]["style"],
              },
            };
            reasoning = parsed.pacing || "Template customized based on artifact content.";
          }
        }
      } catch (aiErr) {
        console.warn("[L3] Gemini template suggestion failed, using fallback:", aiErr);
      }

      res.json({
        template: templateResult ?? fallback ?? allTemplates[0],
        reasoning: reasoning || "Using default template — AI suggestion unavailable.",
      });
    } catch (err: any) {
      console.error("[L3] template-from-artifact error:", err);
      res.status(500).json({ error: err.message || "Failed to build template from artifact" });
    }
  });

  /**
   * POST /api/media/plan/:planId/auto-compose
   * Groups completed media plan items by tags into slideshow compositions.
   * Images with similar tags → slideshow groups (3-5 per group).
   * Voice items paired with related image groups.
   *
   * Body: { items: MediaPlanItem[] }  — items to consider (should have status approved/review/generating)
   * Returns: { compositions: [{ title, template, slideJobIds, voiceJobId?, captionText? }] }
   */
  api.post("/media/plan/:planId/auto-compose", async (req, res) => {
    try {
      const { items } = req.body as { items: Array<{
        id: string;
        type: "image" | "video" | "voice";
        label: string;
        purpose: string;
        tags?: string[];
        status: string;
        generatedJobIds: string[];
        promptTemplate?: string;
      }> };

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "items array is required" });
      }

      // Filter to completed items with generated job IDs
      const completedItems = items.filter(
        (item) =>
          (item.status === "approved" || item.status === "review" || item.status === "generating" || item.status === "done") &&
          item.generatedJobIds.length > 0
      );

      const imageItems = completedItems.filter((i) => i.type === "image");
      const voiceItems = completedItems.filter((i) => i.type === "voice");

      if (imageItems.length === 0) {
        return res.status(400).json({ error: "No completed image items found to compose" });
      }

      // Cluster images by overlapping tags (greedy grouping)
      const SLIDES_PER_GROUP = 4; // target 3-5 per group
      const groups: Array<{ items: typeof imageItems; tags: string[] }> = [];

      const ungrouped = [...imageItems];
      while (ungrouped.length > 0) {
        const anchor = ungrouped.shift()!;
        const anchorTags = anchor.tags ?? [];
        const group = [anchor];

        // Find items with overlapping tags
        for (let i = ungrouped.length - 1; i >= 0 && group.length < SLIDES_PER_GROUP; i--) {
          const candidate = ungrouped[i];
          const candidateTags = candidate.tags ?? [];
          const overlap = anchorTags.some((t) => candidateTags.includes(t)) ||
            anchor.purpose === candidate.purpose;
          if (overlap) {
            group.push(candidate);
            ungrouped.splice(i, 1);
          }
        }

        // If group is too small, absorb remaining ungrouped until target size
        while (group.length < 3 && ungrouped.length > 0) {
          group.push(ungrouped.shift()!);
        }

        const groupTags = Array.from(new Set(group.flatMap((i) => i.tags ?? [])));
        groups.push({ items: group, tags: groupTags });
      }

      // Load templates to pick best match per group
      const allTemplates = await loadTemplates();
      const facelessTemplate = await getTemplate("faceless-explainer") ?? allTemplates[0];

      // Build composition suggestions
      const compositions = await Promise.all(
        groups.map(async (group, idx) => {
          const slideJobIds = group.items.flatMap((i) => i.generatedJobIds);
          const groupPurpose = group.items[0].purpose || group.items[0].label;

          // Match voice item: same tags or same purpose
          const matchedVoice = voiceItems.find((v) => {
            const vTags = v.tags ?? [];
            return group.tags.some((t) => vTags.includes(t)) || v.purpose === groupPurpose;
          });
          const voiceJobId = matchedVoice?.generatedJobIds[0];

          // Pick template: listicle for numbered content, faceless-explainer otherwise
          const isListicle = group.tags.some((t) =>
            ["tips", "steps", "listicle", "numbered", "how-to"].includes(t)
          );
          const templateId = isListicle ? "listicle" : "faceless-explainer";
          const template = await getTemplate(templateId) ?? facelessTemplate;

          // Caption text from matched voice item or combined labels
          const captionText = matchedVoice?.promptTemplate ||
            group.items.map((i) => i.label).join(". ");

          return {
            title: groupPurpose
              ? `${groupPurpose} (Group ${idx + 1})`
              : `Composition ${idx + 1}`,
            template,
            slideJobIds,
            voiceJobId,
            captionText,
            slideCount: group.items.length,
          };
        })
      );

      res.json({ compositions });
    } catch (err: any) {
      console.error("[L3] auto-compose error:", err);
      res.status(500).json({ error: err.message || "Auto-compose failed" });
    }
  });

  // ── L1-S4.5: Settings API (W2 + W4) ─────────────────────────────────────────
  // GET /api/settings  — returns current config (no API key)
  // PUT /api/settings  — runtime overrides saved to data/settings.json
  // POST /api/settings/test-model — verifies a model responds

  api.get("/settings", (_req, res) => {
    res.json({
      models: getMergedModels(),
      defaults: getMergedDefaults(),
      features: getMergedFeatures(),
      server: { port: serverConfig.port },
      ffmpeg: _serverFfmpegAvailable,
      ffmpegVersion: _serverFfmpegVersion ?? null,
      version: cfgAppTop.version,
      rateLimits,
    });
  });

  api.put("/settings", async (req, res) => {
    try {
      const { models: m, defaults: d, features: f } = req.body as {
        models?: Record<string, string>;
        defaults?: Record<string, unknown>;
        features?: Record<string, boolean>;
      };

      // Deep-merge incoming values into runtimeSettings
      if (m) runtimeSettings.models = { ...(runtimeSettings.models ?? {}), ...m };
      if (d) runtimeSettings.defaults = { ...(runtimeSettings.defaults ?? {}), ...d };
      if (f) runtimeSettings.features = { ...(runtimeSettings.features ?? {}), ...f };

      // Persist to disk
      await fs.mkdir(path.dirname(SETTINGS_FILE), { recursive: true });
      await fs.writeFile(SETTINGS_FILE, JSON.stringify(runtimeSettings, null, 2));

      res.json({
        ok: true,
        models: getMergedModels(),
        defaults: getMergedDefaults(),
        features: getMergedFeatures(),
      });
    } catch (err: any) {
      console.error("[settings] PUT error:", err);
      res.status(500).json({ ok: false, error: err.message || "Failed to save settings" });
    }
  });

  // W4: Test whether a given model is accessible and responsive
  api.post("/settings/test-model", async (req, res) => {
    const { model, apiKey } = req.body as { model?: string; apiKey?: string };
    if (!model) {
      return res.status(400).json({ ok: false, error: "model is required" });
    }
    let key: string;
    try {
      key = requireApiKey(apiKey);
    } catch {
      return res.status(400).json({ ok: false, model, error: "No API key available" });
    }

    const start = Date.now();
    try {
      const ai = new GoogleGenAI({ apiKey: key });
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);

      const response = await ai.models.generateContent({
        model,
        contents: "Respond with only the word: OK",
      });
      clearTimeout(timeout);

      const text = response.text?.trim() ?? "";
      const responseTime = Date.now() - start;
      res.json({ ok: true, model, responseTime, response: text });
    } catch (err: any) {
      const responseTime = Date.now() - start;
      const isTimeout = err?.name === "AbortError" || responseTime >= 9900;
      res.json({
        ok: false,
        model,
        responseTime,
        error: isTimeout ? "Timed out after 10s" : (err?.message || "Model call failed"),
      });
    }
  });

  app.use("/api", api);



  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "custom",
    });
    app.use(vite.middlewares);
    app.get("*", async (req, res, next) => {
      if (req.path.startsWith("/api/") || req.path.startsWith("/jobs/")) {
        return next();
      }
      try {
        const indexPath = path.join(process.cwd(), "index.html");
        const template = await fs.readFile(indexPath, "utf8");
        const html = await vite.transformIndexHtml(req.originalUrl, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(html);
      } catch (error) {
        vite.ssrFixStacktrace(error as Error);
        next(error);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api/") || req.path.startsWith("/jobs/")) {
        return next();
      }
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

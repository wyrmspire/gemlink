import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs/promises";
import twilio from "twilio";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { startBoardroomSessionAsync, listBoardroomSessions, readBoardroomSession, extractMediaBriefs } from "./boardroom.ts";
import { mediaJobQueries, collectionQueries, collectionItemQueries, type MediaJobRow } from "./src/db.ts";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });
dotenv.config();

type MediaType = "image" | "video" | "voice";
type JobStatus = "pending" | "completed" | "failed";

interface MediaScore {
  brandAlignment: number;
  purposeFit: number;
  technicalQuality: number;
  audienceMatch: number;
  uniqueness: number;
  overall: number;
  reasoning: string;
  suggestions: string[];
}

interface JobManifest {
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
//   • Video polling: MAX_VIDEO_POLL_ATTEMPTS (360 × 10 s = ~60 min)
//   • Batch retry on 429: max 3 retries with exponential backoff (see GenerationQueue)
//   • Boardroom: bounded by MAX_ROUNDS (5) × MAX_SEATS (5), see boardroom.ts
const MAX_VIDEO_POLL_ATTEMPTS = 360; // 360 × 10 s = ~60 minutes max wait
const jobTypeDirs: Record<MediaType, string> = {
  image: "images",
  video: "videos",
  voice: "voice",
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

interface BatchState {
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

async function startServer() {
  const app = express();
  const api = express.Router();

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  await ensureJobDirectories();
  app.use("/jobs", express.static(jobsDir));

  api.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  api.post("/media/image", async (req, res) => {
    try {
      const { prompt, model, size, brandContext, projectId, apiKey } = req.body;
      const key = requireApiKey(apiKey);
      const ai = new GoogleGenAI({ apiKey: key });

      const jobId = createJobId();
      const manifest: JobManifest = {
        id: jobId,
        type: "image",
        prompt,
        model: model || "gemini-3.1-flash-image-preview",
        size: size || "1K",
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
            aspectRatio: "1:1",
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

      res.json(finalManifest);
    } catch (error: any) {
      console.error("Image Generation Error:", error);
      res.status(500).json({ error: error.message || "Failed to generate image" });
    }
  });

  api.post("/media/video", async (req, res) => {
    try {
      const { prompt, model, resolution, aspectRatio, brandContext, projectId, apiKey, imageBytes, mimeType } = req.body;
      const key = requireApiKey(apiKey);
      const ai = new GoogleGenAI({ apiKey: key });
      const selectedModel = model || "veo-3.1-fast-generate-preview";

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
          let currentOp = operation;
          let attempts = 0;

          // SAFETY: Hard upper bound to prevent infinite polling if the provider
          // never reports done. Fails the job after MAX_VIDEO_POLL_ATTEMPTS.
          while (!currentOp.done) {
            attempts += 1;
            if (attempts > MAX_VIDEO_POLL_ATTEMPTS) {
              await patchManifest("video", jobId, (current) => ({
                ...current,
                status: "failed",
                error: `Video polling timed out after ${attempts} attempts (~${Math.round(attempts * 10 / 60)} minutes). The provider never reported completion.`,
                logs: appendLog(current, `SAFETY: Polling aborted after ${attempts} attempts. Possible stuck operation.`),
              }));
              return;
            }
            await patchManifest("video", jobId, (current) => ({
              ...current,
              logs: appendLog(current, `Polling provider status (attempt ${attempts}/${MAX_VIDEO_POLL_ATTEMPTS})...`),
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
        } catch (err: any) {
          console.error("Background video polling error:", err);
          await patchManifest("video", jobId, (current) => ({
            ...current,
            status: "failed",
            error: err?.message || "Background video polling failed.",
            logs: appendLog(current, `Background polling failed: ${err?.message || "unknown error"}`),
          }));
        }
      })();

      res.status(202).json(manifest);
    } catch (error: any) {
      console.error("Video Generation Error:", error);
      res.status(500).json({ error: error.message || "Failed to generate video" });
    }
  });

  api.post("/media/voice", async (req, res) => {
    try {
      const { text, voice, brandContext, projectId, apiKey } = req.body;
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
        model: "gemini-2.5-flash-preview-tts",
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

      res.json(finalManifest);
    } catch (error: any) {
      console.error("Voice Generation Error:", error);
      res.status(500).json({ error: error.message || "Failed to generate voice" });
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
        model: "gemini-3-flash-preview",
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
        model: "gemini-3.1-pro-preview",
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
        model: "gemini-3.1-pro-preview",
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
          model: "gemini-2.5-flash-preview-04-17",
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
          model: "gemini-3-flash-preview",
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

  // ── H2: GenerationQueue (semaphore + exponential backoff) ───────────────────

  // W3: Pre-load any persisted batch state from disk (marks stale in-flight jobs as failed)
  const batchStore = await loadBatchStates();
  console.log(`[batch] Rehydrated ${batchStore.size} batch state(s) from disk.`);

  class GenerationQueue {
    private slots: Record<MediaType, number> = { image: 0, video: 0, voice: 0 };
    private readonly max: Record<MediaType, number> = { image: 3, video: 1, voice: 2 };

    private waitForSlot(type: MediaType): Promise<void> {
      return new Promise((resolve) => {
        const check = () => {
          if (this.slots[type] < this.max[type]) { this.slots[type]++; resolve(); }
          else setTimeout(check, 400);
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
        state.errors[idx] = (lastErr as any)?.message ?? "Unknown error";
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
          id: jobId, type: "image", prompt, model: model ?? "gemini-3.1-flash-image-preview",
          size: size ?? "1K", brandContext, projectId,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          status: "pending", outputs: [],
          logs: [`[${new Date().toISOString()}] Batch image generation started.`],
        };
        await writeManifest(manifest);
        const resp = await ai.models.generateContent({
          model: manifest.model!, contents: { parts: [{ text: prompt }] },
          config: { imageConfig: { aspectRatio: "1:1", imageSize: manifest.size } },
        });
        const outputs: string[] = [];
        for (let i = 0; i < (resp.candidates?.[0]?.content?.parts ?? []).length; i++) {
          const part = resp.candidates![0].content!.parts![i];
          if (!part.inlineData?.data) continue;
          const fn = `output_${i}.png`;
          const fp = path.join(getJobDir("image", jobId), fn);
          await fs.writeFile(fp, Buffer.from(part.inlineData.data, "base64"));
          outputs.push(`/jobs/images/${jobId}/${fn}`);
        }
        await patchManifest("image", jobId, (c) => ({
          ...c, status: outputs.length > 0 ? "completed" : "failed", outputs,
          error: outputs.length > 0 ? undefined : "No image data.",
          logs: appendLog(c, `Batch: ${outputs.length} image(s) saved.`),
        }));
        if (outputs.length > 0) {
          void autoTagMedia("image", jobId, path.join(getJobDir("image", jobId), "output_0.png"), apiKey, prompt);
        }
        return jobId;
      }

      if (type === "voice") {
        const { text, voice, brandContext, projectId } = body as any;
        const manifest: JobManifest = {
          id: jobId, type: "voice", text, voice, brandContext, projectId,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          status: "pending", outputs: [],
          logs: [`[${new Date().toISOString()}] Batch voice generation started.`],
        };
        await writeManifest(manifest);
        const resp = await ai.models.generateContent({
          model: "gemini-2.5-flash-preview-tts", contents: [{ parts: [{ text }] }],
          config: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
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
        if (outputs.length > 0) void autoTagMedia("voice", jobId, "", apiKey, text);
        return jobId;
      }

      if (type === "video") {
        const { prompt, model, resolution, aspectRatio, brandContext, projectId } = body as any;
        const selectedModel = model ?? "veo-3.1-fast-generate-preview";
        const operation = await ai.models.generateVideos({ model: selectedModel, prompt, config: { numberOfVideos: 1, resolution, aspectRatio } });
        const operationName = (operation as any)?.name ?? null;
        const manifest: JobManifest = {
          id: jobId, type: "video", prompt, model: selectedModel, resolution, aspectRatio,
          brandContext, projectId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          status: "pending", outputs: [], providerOperationName: operationName,
          logs: [`[${new Date().toISOString()}] Batch video job queued. Operation: ${operationName}`],
        };
        await writeManifest(manifest);
         void (async () => {
          try {
            let op = operation; let a = 0;
            // SAFETY: Hard upper bound — same MAX_VIDEO_POLL_ATTEMPTS guard as the
            // single-video endpoint. Never loop forever waiting for provider.
            while (!op.done) {
              a++;
              if (a > MAX_VIDEO_POLL_ATTEMPTS) {
                await patchManifest("video", jobId, (c) => ({ ...c, status: "failed", error: `Batch video polling timed out after ${a} attempts.`, logs: appendLog(c, `SAFETY: Polling aborted after ${a} attempts.`) }));
                return;
              }
              await patchManifest("video", jobId, (c) => ({ ...c, logs: appendLog(c, `Polling attempt ${a}/${MAX_VIDEO_POLL_ATTEMPTS}...`) }));
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
        for (const t of ["image", "voice", "video"] as MediaType[]) {
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

        const response = await ai.models.generateContent({ model: "gemini-2.5-flash-preview-04-17", contents });
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
      const validTypes: MediaType[] = ["image", "video", "voice"];
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
      res.status(202).json({ batchId, total: items.length, jobIds: state.jobIds, statuses: state.statuses });
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

  // ── W2: Media Plan Suggest ───────────────────────────────────────────────────

  api.post("/media/plan/suggest", async (req, res) => {
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
        model: "gemini-2.5-flash-preview-04-17",
        contents: `${systemPrompt}\n\nProject description: "${description}"`,
        config: {
          responseMimeType: "application/json",
        } as any,
      });

      const txt = response.text?.trim() ?? "{}";
      let parsed: { items?: unknown[] } = {};
      try {
        // Try strict JSON first (works when responseMimeType is honoured)
        parsed = JSON.parse(txt);
      } catch {
        // Fallback: extract JSON block from text if the model wrapped in markdown
        const m = txt.match(/\{[\s\S]*\}/);
        if (m) { try { parsed = JSON.parse(m[0]); } catch { /* give up */ } }
      }

      const items = Array.isArray(parsed.items) ? parsed.items : [];
      // Ensure each item has required fields + a fresh random id
      const sanitised = items.map((x: any) => ({
        id: `item_${Math.random().toString(36).slice(2, 10)}`,
        type: ["image", "video", "voice"].includes(x.type) ? x.type : "image",
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

  // ── H3: Prompt Expansion (3-step chain) ─────────────────────────────────────

  api.post("/media/prompt/expand", async (req, res) => {
    try {
      const { basePrompt, purpose, projectContext, platform, apiKey } = req.body;
      if (!basePrompt) return res.status(400).json({ error: "basePrompt is required" });
      const key = requireApiKey(apiKey);
      const ai = new GoogleGenAI({ apiKey: key });

      const brandCtx = projectContext
        ? `Brand: ${projectContext.brandName ?? ""}. Description: ${projectContext.brandDescription ?? ""}. Audience: ${projectContext.targetAudience ?? ""}. Voice: ${projectContext.brandVoice ?? ""}. Style: ${(projectContext.styleKeywords ?? []).join(", ")}.`
        : "";
      const platCtx = platform ? `Target platform: ${platform}.` : "";
      const purpCtx = `Purpose: ${purpose ?? "general"}.`;

      const s1 = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `You are a creative director writing image generation prompts. Expand this rough idea into a detailed, vivid prompt.\n${brandCtx}\n${platCtx}\n${purpCtx}\nBase idea: "${basePrompt}"\nRespond with ONLY the expanded prompt, no preamble.`,
      });
      const expanded = s1.text?.trim() ?? basePrompt;

      const s2 = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Refine this image generation prompt for brand alignment and platform fit. Add specific details about lighting, composition, color palette, and mood.\n${brandCtx}\n${platCtx}\nPrompt: "${expanded}"\nRespond with ONLY the refined prompt.`,
      });
      const refined = s2.text?.trim() ?? expanded;

      const s3 = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
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
        model: "gemini-3-flash-preview",
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

      const response = await ai.models.generateContent({ model: "gemini-2.5-flash-preview-04-17", contents });
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
        model: "gemini-3-flash-preview",
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

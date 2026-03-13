/**
 * Test helper: creates a preconfigured Express app identical to server.ts
 * but without calling app.listen() (supertest handles binding).
 *
 * We also skip Vite middleware so tests run entirely in node.
 */

import express from "express";
import path from "path";
import fs from "fs/promises";
import { listBoardroomSessions, readBoardroomSession } from "../../boardroom.ts";

// ---------------------------------------------------------------------------
// Types mirrored from server.ts (keep in sync)
// ---------------------------------------------------------------------------
type MediaType = "image" | "video" | "voice";

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
  outputs: string[];
  logs?: string[];
  error?: string;
  providerOperationName?: string | null;
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

async function collectHistory() {
  const history: JobManifest[] = [];
  for (const type of Object.keys(jobTypeDirs) as MediaType[]) {
    const typeDir = path.join(jobsDir, jobTypeDirs[type]);
    try {
      const jobIds = await fs.readdir(typeDir);
      for (const jobId of jobIds) {
        try {
          history.push(await readManifest(type, jobId));
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

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------
export function createTestApp() {
  const app = express();
  const api = express.Router();

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  // ── Health ──────────────────────────────────────────────────────────────
  api.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // ── Media history ───────────────────────────────────────────────────────
  api.get("/media/history", async (_req, res) => {
    try {
      res.json(await collectHistory());
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

  app.use("/api", api);
  return app;
}

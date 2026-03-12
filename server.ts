import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs/promises";
import twilio from "twilio";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });
dotenv.config();

type MediaType = "image" | "video" | "voice";
type JobStatus = "pending" | "completed" | "failed";

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
  outputs: string[];
  logs?: string[];
  error?: string;
  providerOperationName?: string | null;
}

const PORT = Number(process.env.PORT || 3000);
const jobsDir = path.join(process.cwd(), "jobs");
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

async function writeManifest(manifest: JobManifest) {
  await fs.mkdir(getJobDir(manifest.type, manifest.id), { recursive: true });
  await fs.writeFile(getManifestPath(manifest.type, manifest.id), JSON.stringify(manifest, null, 2));
}

async function patchManifest(
  type: MediaType,
  id: string,
  update: Partial<JobManifest> | ((current: JobManifest) => JobManifest),
) {
  const current = await readManifest(type, id);
  const next = typeof update === "function" ? update(current) : { ...current, ...update };
  next.updatedAt = new Date().toISOString();
  await writeManifest(next);
  return next;
}

function appendLog(manifest: JobManifest, message: string) {
  const stamped = `[${new Date().toISOString()}] ${message}`;
  return [...(manifest.logs || []), stamped].slice(-40);
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
      const { prompt, model, size, brandContext, apiKey } = req.body;
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

      res.json(finalManifest);
    } catch (error: any) {
      console.error("Image Generation Error:", error);
      res.status(500).json({ error: error.message || "Failed to generate image" });
    }
  });

  api.post("/media/video", async (req, res) => {
    try {
      const { prompt, model, resolution, aspectRatio, brandContext, apiKey, imageBytes, mimeType } = req.body;
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

          while (!currentOp.done) {
            attempts += 1;
            await patchManifest("video", jobId, (current) => ({
              ...current,
              logs: appendLog(current, `Polling provider status (attempt ${attempts})...`),
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
      const { text, voice, brandContext, apiKey } = req.body;
      const key = requireApiKey(apiKey);
      const ai = new GoogleGenAI({ apiKey: key });
      const jobId = createJobId();

      const manifest: JobManifest = {
        id: jobId,
        type: "voice",
        text,
        voice,
        brandContext,
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

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      const outputs: string[] = [];
      if (base64Audio) {
        const fileName = "output.mp3";
        await fs.writeFile(path.join(getJobDir("voice", jobId), fileName), Buffer.from(base64Audio, "base64"));
        outputs.push(`/jobs/voice/${jobId}/${fileName}`);
      }

      const finalManifest = await patchManifest("voice", jobId, (current) => ({
        ...current,
        status: outputs.length > 0 ? "completed" : "failed",
        outputs,
        error: outputs.length > 0 ? undefined : "Model returned no audio data.",
        logs: appendLog(current, outputs.length > 0 ? "Audio saved locally." : "No audio data returned."),
      }));

      res.json(finalManifest);
    } catch (error: any) {
      console.error("Voice Generation Error:", error);
      res.status(500).json({ error: error.message || "Failed to generate voice" });
    }
  });

  api.get("/media/history", async (_req, res) => {
    try {
      res.json(await collectHistory());
    } catch (error: any) {
      console.error("History Error:", error);
      res.status(500).json({ error: "Failed to fetch history" });
    }
  });

  app.post("/api/twilio/sms", async (req, res) => {
    try {
      const { Body } = req.body;
      const ai = new GoogleGenAI({ apiKey: requireApiKey() });

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `You are a helpful sales agent for our brand. The user says: "${Body}". Reply concisely via SMS.`,
      });

      const twiml = new twilio.twiml.MessagingResponse();
      twiml.message(response.text || "Sorry, I couldn't process that.");

      res.type("text/xml").send(twiml.toString());
    } catch (error) {
      console.error("Twilio SMS Error:", error);
      const twiml = new twilio.twiml.MessagingResponse();
      twiml.message("System error.");
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

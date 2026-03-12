import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs/promises";
import twilio from "twilio";
import { GoogleGenAI } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Increase payload limit for base64 images
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Ensure jobs directories exist
  const jobsDir = path.join(process.cwd(), 'jobs');
  await fs.mkdir(path.join(jobsDir, 'images'), { recursive: true });
  await fs.mkdir(path.join(jobsDir, 'videos'), { recursive: true });
  await fs.mkdir(path.join(jobsDir, 'voice'), { recursive: true });

  // Serve jobs directory statically so the client can load media
  app.use('/jobs', express.static(jobsDir));

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // --- Media Generation Endpoints ---

  app.post("/api/media/image", async (req, res) => {
    try {
      const { prompt, model, size, brandContext, apiKey } = req.body;
      
      // Use provided key or fallback to env
      const ai = new GoogleGenAI({ apiKey: apiKey || process.env.GEMINI_API_KEY });
      
      const response = await ai.models.generateContent({
        model: model || "gemini-3.1-flash-image-preview",
        contents: {
          parts: [{ text: prompt }],
        },
        config: {
          imageConfig: {
            aspectRatio: "1:1",
            imageSize: size || "1K",
          },
        },
      });

      const images = [];
      const jobId = Date.now().toString() + '-' + Math.random().toString(36).substring(7);
      const jobPath = path.join(jobsDir, 'images', jobId);
      await fs.mkdir(jobPath, { recursive: true });

      for (let i = 0; i < (response.candidates?.[0]?.content?.parts?.length || 0); i++) {
        const part = response.candidates![0].content.parts[i];
        if (part.inlineData) {
          const base64Data = part.inlineData.data;
          const fileName = `output_${i}.png`;
          const filePath = path.join(jobPath, fileName);
          
          // Save the actual image file
          await fs.writeFile(filePath, Buffer.from(base64Data, 'base64'));
          images.push(`/jobs/images/${jobId}/${fileName}`);
        }
      }

      // Save manifest
      const manifest = {
        id: jobId,
        type: 'image',
        prompt,
        model,
        size,
        brandContext,
        createdAt: new Date().toISOString(),
        outputs: images
      };
      await fs.writeFile(path.join(jobPath, 'manifest.json'), JSON.stringify(manifest, null, 2));

      res.json(manifest);
    } catch (error: any) {
      console.error("Image Generation Error:", error);
      res.status(500).json({ error: error.message || "Failed to generate image" });
    }
  });

  app.post("/api/media/video", async (req, res) => {
    try {
      const { prompt, model, resolution, aspectRatio, brandContext, apiKey, imageBytes, mimeType } = req.body;
      
      // STUB: We will simulate a job creation for now
      const jobId = Date.now().toString() + '-' + Math.random().toString(36).substring(7);
      const jobPath = path.join(jobsDir, 'videos', jobId);
      await fs.mkdir(jobPath, { recursive: true });

      // Save manifest
      const manifest = {
        id: jobId,
        type: 'video',
        prompt,
        model,
        resolution,
        aspectRatio,
        brandContext,
        createdAt: new Date().toISOString(),
        status: 'pending', // In a real implementation, this would be updated when polling finishes
        outputs: [] // Would contain the video URL once done
      };
      await fs.writeFile(path.join(jobPath, 'manifest.json'), JSON.stringify(manifest, null, 2));

      // Return the stubbed manifest
      res.json(manifest);
    } catch (error: any) {
      console.error("Video Generation Error:", error);
      res.status(500).json({ error: error.message || "Failed to generate video" });
    }
  });

  app.post("/api/media/voice", async (req, res) => {
    try {
      const { text, voice, brandContext, apiKey } = req.body;
      
      // STUB: We will simulate a job creation for now
      const jobId = Date.now().toString() + '-' + Math.random().toString(36).substring(7);
      const jobPath = path.join(jobsDir, 'voice', jobId);
      await fs.mkdir(jobPath, { recursive: true });

      // Save manifest
      const manifest = {
        id: jobId,
        type: 'voice',
        text,
        voice,
        brandContext,
        createdAt: new Date().toISOString(),
        status: 'pending',
        outputs: [] 
      };
      await fs.writeFile(path.join(jobPath, 'manifest.json'), JSON.stringify(manifest, null, 2));

      res.json(manifest);
    } catch (error: any) {
      console.error("Voice Generation Error:", error);
      res.status(500).json({ error: error.message || "Failed to generate voice" });
    }
  });

  app.get("/api/media/history", async (req, res) => {
    try {
      const history = [];
      const types = ['images', 'videos', 'voice'];
      
      for (const type of types) {
        const typeDir = path.join(jobsDir, type);
        try {
          const jobs = await fs.readdir(typeDir);
          for (const job of jobs) {
            const manifestPath = path.join(typeDir, job, 'manifest.json');
            try {
              const manifestData = await fs.readFile(manifestPath, 'utf-8');
              history.push(JSON.parse(manifestData));
            } catch (e) {
              // Ignore missing/invalid manifests
            }
          }
        } catch (e) {
          // Ignore if directory doesn't exist
        }
      }
      
      // Sort newest first
      history.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      res.json(history);
    } catch (error: any) {
      console.error("History Error:", error);
      res.status(500).json({ error: "Failed to fetch history" });
    }
  });

  // Twilio Webhook for SMS
  app.post("/api/twilio/sms", async (req, res) => {
    try {
      const { Body, From } = req.body;
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `You are a helpful sales agent for our brand. The user says: "${Body}". Reply concisely via SMS.`,
      });

      const twiml = new twilio.twiml.MessagingResponse();
      twiml.message(response.text || "Sorry, I couldn't process that.");
      
      res.type('text/xml').send(twiml.toString());
    } catch (error) {
      console.error("Twilio SMS Error:", error);
      const twiml = new twilio.twiml.MessagingResponse();
      twiml.message("System error.");
      res.type('text/xml').send(twiml.toString());
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

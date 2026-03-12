import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import twilio from "twilio";
import { GoogleGenAI } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
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

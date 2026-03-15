/**
 * tests/api/compose_endpoints.test.ts — W3: Compose API Integration Tests (Lane 5, Sprint 4)
 *
 * HTTP-level tests for Sprint 4 compose endpoints (all stubbed — no real FFmpeg).
 *
 * Endpoints covered (stub implementations in createTestApp.ts):
 *   POST /api/media/compose     — type validation + slideshow slides check + 202 accepted
 *   GET  /api/media/compose/:id — 404 unknown, 200 known
 *   POST /api/media/trim        — jobId, start, duration validation
 *   POST /api/media/speed       — jobId, factor range validation (0.25–4.0)
 *   POST /api/media/overlay/text  — jobId + overlays[] validation
 *   POST /api/media/overlay/image — videoJobId + imageJobId validation
 *   POST /api/media/audio/mix   — tracks[] validation + volume <= 1.0
 *   GET  /api/compose/templates  — returns array (possibly empty)
 *   GET  /api/health             — verifies ffmpeg field is present and boolean
 *
 * Test count target: ~25 tests
 */

import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createTestApp } from "../helpers/createTestApp.ts";
import type { Express } from "express";

let app: Express;

beforeAll(() => {
  app = createTestApp();
});

// ── GET /api/health ───────────────────────────────────────────────────────────

describe("GET /api/health", () => {
  it("returns 200 with status ok", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("includes ffmpeg field as a boolean", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(typeof res.body.ffmpeg).toBe("boolean");
  });
});

// ── POST /api/media/compose ───────────────────────────────────────────────────

describe("POST /api/media/compose — validation", () => {
  it("returns 400 when type is missing", async () => {
    const res = await request(app)
      .post("/api/media/compose")
      .send({ videoJobId: "job-001" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 400 for invalid type (e.g. 'lipsync' not yet supported)", async () => {
    const res = await request(app)
      .post("/api/media/compose")
      .send({ type: "lipsync" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
    expect(res.body.error).toMatch(/merge.*slideshow.*caption/i);
  });

  it("returns 400 for slideshow with empty slides array", async () => {
    const res = await request(app)
      .post("/api/media/compose")
      .send({ type: "slideshow", slides: [] });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
    expect(res.body.error).toMatch(/slide/i);
  });

  it("returns 400 for slideshow with missing slides field", async () => {
    const res = await request(app)
      .post("/api/media/compose")
      .send({ type: "slideshow" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 202 for valid slideshow request", async () => {
    const res = await request(app)
      .post("/api/media/compose")
      .send({
        type: "slideshow",
        slides: [{ jobId: "img-001", duration: 3 }],
      });
    expect(res.status).toBe(202);
    expect(res.body).toHaveProperty("composeId");
    expect(res.body.status).toBe("processing");
  });

  it("returns 202 for valid merge request", async () => {
    const res = await request(app)
      .post("/api/media/compose")
      .send({ type: "merge", videoJobId: "vid-001", audioJobId: "aud-001" });
    expect(res.status).toBe(202);
    expect(res.body).toHaveProperty("composeId");
  });

  it("returns 202 for valid caption request", async () => {
    const res = await request(app)
      .post("/api/media/compose")
      .send({ type: "caption", videoJobId: "vid-001", captionConfig: { text: "Hello world" } });
    expect(res.status).toBe(202);
    expect(res.body).toHaveProperty("composeId");
  });
});

// ── GET /api/media/compose/:id ────────────────────────────────────────────────

describe("GET /api/media/compose/:id", () => {
  it("returns 404 for unknown compose id", async () => {
    const res = await request(app).get("/api/media/compose/nonexistent-compose-xyz");
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 200 for a known compose id (created via POST)", async () => {
    // First create a job
    const createRes = await request(app)
      .post("/api/media/compose")
      .send({ type: "merge", videoJobId: "vid-001" });
    expect(createRes.status).toBe(202);
    const { composeId } = createRes.body;

    // Now poll it
    const pollRes = await request(app).get(`/api/media/compose/${composeId}`);
    expect(pollRes.status).toBe(200);
    expect(pollRes.body).toHaveProperty("composeId", composeId);
  });
});

// ── POST /api/media/trim ──────────────────────────────────────────────────────

describe("POST /api/media/trim — validation", () => {
  it("returns 400 when jobId is missing", async () => {
    const res = await request(app)
      .post("/api/media/trim")
      .send({ start: 0, duration: 5 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/jobId/i);
  });

  it("returns 400 when start is missing", async () => {
    const res = await request(app)
      .post("/api/media/trim")
      .send({ jobId: "vid-001", duration: 5 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/start/i);
  });

  it("returns 400 when duration is missing", async () => {
    const res = await request(app)
      .post("/api/media/trim")
      .send({ jobId: "vid-001", start: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/duration/i);
  });

  it("returns 400 for negative duration", async () => {
    const res = await request(app)
      .post("/api/media/trim")
      .send({ jobId: "vid-001", start: 0, duration: -2 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/non-negative/i);
  });

  it("returns 202 for valid trim request", async () => {
    const res = await request(app)
      .post("/api/media/trim")
      .send({ jobId: "vid-001", start: 5, duration: 10 });
    expect(res.status).toBe(202);
    expect(res.body.ok).toBe(true);
  });
});

// ── POST /api/media/speed ─────────────────────────────────────────────────────

describe("POST /api/media/speed — validation", () => {
  it("returns 400 when jobId is missing", async () => {
    const res = await request(app)
      .post("/api/media/speed")
      .send({ factor: 1.5 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/jobId/i);
  });

  it("returns 400 when factor is missing", async () => {
    const res = await request(app)
      .post("/api/media/speed")
      .send({ jobId: "vid-001" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/factor/i);
  });

  it("returns 400 when factor < 0.25", async () => {
    const res = await request(app)
      .post("/api/media/speed")
      .send({ jobId: "vid-001", factor: 0.1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/0\.25/);
  });

  it("returns 400 when factor > 4.0", async () => {
    const res = await request(app)
      .post("/api/media/speed")
      .send({ jobId: "vid-001", factor: 5.0 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/4\.0|4/);
  });

  it("returns 202 for valid factor (1.5x)", async () => {
    const res = await request(app)
      .post("/api/media/speed")
      .send({ jobId: "vid-001", factor: 1.5 });
    expect(res.status).toBe(202);
    expect(res.body.ok).toBe(true);
  });
});

// ── POST /api/media/overlay/text ─────────────────────────────────────────────

describe("POST /api/media/overlay/text — validation", () => {
  it("returns 400 when jobId is missing", async () => {
    const res = await request(app)
      .post("/api/media/overlay/text")
      .send({ overlays: [{ text: "Hello", x: 0, y: 0 }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/jobId/i);
  });

  it("returns 400 when overlays is missing", async () => {
    const res = await request(app)
      .post("/api/media/overlay/text")
      .send({ jobId: "vid-001" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/overlays/i);
  });

  it("returns 400 when overlays is an empty array", async () => {
    const res = await request(app)
      .post("/api/media/overlay/text")
      .send({ jobId: "vid-001", overlays: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/non-empty/i);
  });

  it("returns 202 for valid overlay request", async () => {
    const res = await request(app)
      .post("/api/media/overlay/text")
      .send({
        jobId: "vid-001",
        overlays: [{ text: "Hello", x: 100, y: 100, startTime: 0, endTime: 3 }],
      });
    expect(res.status).toBe(202);
    expect(res.body.ok).toBe(true);
  });
});

// ── POST /api/media/overlay/image ────────────────────────────────────────────

describe("POST /api/media/overlay/image — validation", () => {
  it("returns 400 when videoJobId is missing", async () => {
    const res = await request(app)
      .post("/api/media/overlay/image")
      .send({ imageJobId: "img-001" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/videoJobId/i);
  });

  it("returns 400 when imageJobId is missing", async () => {
    const res = await request(app)
      .post("/api/media/overlay/image")
      .send({ videoJobId: "vid-001" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/imageJobId/i);
  });

  it("returns 202 for valid overlay/image request", async () => {
    const res = await request(app)
      .post("/api/media/overlay/image")
      .send({ videoJobId: "vid-001", imageJobId: "img-001" });
    expect(res.status).toBe(202);
    expect(res.body.ok).toBe(true);
  });
});

// ── POST /api/media/audio/mix ─────────────────────────────────────────────────

describe("POST /api/media/audio/mix — validation", () => {
  it("returns 400 when tracks is missing", async () => {
    const res = await request(app)
      .post("/api/media/audio/mix")
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/tracks/i);
  });

  it("returns 400 when tracks is empty", async () => {
    const res = await request(app)
      .post("/api/media/audio/mix")
      .send({ tracks: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/tracks/i);
  });

  it("returns 400 when a track has volume > 1", async () => {
    const res = await request(app)
      .post("/api/media/audio/mix")
      .send({
        tracks: [
          { jobId: "voice-001", volume: 1.5 },
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/volume/i);
  });

  it("returns 202 for valid audio mix request", async () => {
    const res = await request(app)
      .post("/api/media/audio/mix")
      .send({
        tracks: [
          { jobId: "voice-001", volume: 0.8 },
          { jobId: "music-001", volume: 0.3 },
        ],
      });
    expect(res.status).toBe(202);
    expect(res.body.ok).toBe(true);
    expect(res.body.trackCount).toBe(2);
  });
});

// ── GET /api/compose/templates ────────────────────────────────────────────────

describe("GET /api/compose/templates", () => {
  it("returns 200 with an array", async () => {
    const res = await request(app).get("/api/compose/templates");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("each template (if any) has required fields", async () => {
    const res = await request(app).get("/api/compose/templates");
    expect(res.status).toBe(200);
    // If Lane 3 has shipped templates, verify their schema; otherwise passes vacuously
    for (const template of res.body) {
      expect(typeof (template.id || template.name)).toBe("string");

    }
  });
});

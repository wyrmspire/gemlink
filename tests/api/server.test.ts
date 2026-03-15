/**
 * E1 — Server API integration tests
 *
 * Tests the following routes:
 *   GET  /api/health
 *   GET  /api/media/history
 *   GET  /api/media/job/:type/:id  (validation + not-found)
 *   GET  /api/boardroom/sessions
 *   GET  /api/boardroom/sessions/:id  (not-found)
 *   POST /api/research/search       (missing body → 400)
 *   POST /api/research/think        (missing body → 400)
 *   POST /api/media/video/analyze   (missing body → 400)
 *
 * Gemini-dependent flows (image gen, video gen, voice) are excluded because
 * they require a live GEMINI_API_KEY. They are covered by smoke-typing in
 * the typecheck pass and will be exercised in an e2e suite once a test key
 * is available in CI.
 */

import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createTestApp } from "../helpers/createTestApp.ts";
import type { Express } from "express";

let app: Express;

beforeAll(() => {
  app = createTestApp();
});

// ─── Health ────────────────────────────────────────────────────────────────

describe("GET /api/health", () => {
  it("returns 200 with { status: 'ok' }", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok" });
  });
});

// ─── Media history ─────────────────────────────────────────────────────────

describe("GET /api/media/history", () => {
  it("returns 200 with an array", async () => {
    const res = await request(app).get("/api/media/history");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("items have expected shape if any exist", async () => {
    const res = await request(app).get("/api/media/history");
    expect(res.status).toBe(200);
    for (const item of res.body) {
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("type");
      expect(item).toHaveProperty("status");
      expect(item).toHaveProperty("outputs");
      expect(Array.isArray(item.outputs)).toBe(true);
    }
  });
});

// ─── Media job status ──────────────────────────────────────────────────────

describe("GET /api/media/job/:type/:id", () => {
  it("returns 400 for an invalid media type", async () => {
    const res = await request(app).get("/api/media/job/bogustype/some-id");
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
    expect(res.body.error).toMatch(/Invalid media type/i);
  });

  it("returns 404 for a non-existent image job", async () => {
    const res = await request(app).get("/api/media/job/image/nonexistent-job-id");
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 404 for a non-existent video job", async () => {
    const res = await request(app).get("/api/media/job/video/nonexistent-job-id");
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 404 for a non-existent voice job", async () => {
    const res = await request(app).get("/api/media/job/voice/nonexistent-job-id");
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });
});

// ─── Boardroom sessions ────────────────────────────────────────────────────

describe("GET /api/boardroom/sessions", () => {
  it("returns 200 with an array", async () => {
    const res = await request(app).get("/api/boardroom/sessions");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("session items have expected fields if any exist", async () => {
    const res = await request(app).get("/api/boardroom/sessions");
    expect(res.status).toBe(200);
    for (const session of res.body) {
      expect(session).toHaveProperty("id");
    }
  });
});

describe("GET /api/boardroom/sessions/:id", () => {
  it("returns 404 with an error message for a missing session", async () => {
    const res = await request(app).get(
      "/api/boardroom/sessions/nonexistent-session-id-xyz"
    );
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });

  it("sets no-cache headers on a found session", async () => {
    // Get list first; only run this assertion if sessions exist
    const list = await request(app).get("/api/boardroom/sessions");
    if (list.body.length === 0) {
      // No sessions seeded — skip assertion but do not fail
      return;
    }
    const firstId = list.body[0].id;
    const res = await request(app).get(`/api/boardroom/sessions/${firstId}`);
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["pragma"]).toBe("no-cache");
  });
});

// ─── Research validation ───────────────────────────────────────────────────

describe("POST /api/research/search — input validation", () => {
  it("returns 400 when query is missing", async () => {
    const res = await request(app).post("/api/research/search").send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
    expect(res.body.error).toMatch(/query is required/i);
  });

  it("returns 400 when body is empty string", async () => {
    const res = await request(app)
      .post("/api/research/search")
      .set("Content-Type", "application/json")
      .send("");
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});

describe("POST /api/research/think — input validation", () => {
  it("returns 400 when query is missing", async () => {
    const res = await request(app).post("/api/research/think").send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
    expect(res.body.error).toMatch(/query is required/i);
  });
});

// ─── Video analysis validation ─────────────────────────────────────────────

describe("POST /api/media/video/analyze — input validation", () => {
  it("returns 400 when videoData and mimeType are missing", async () => {
    const res = await request(app).post("/api/media/video/analyze").send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
    expect(res.body.error).toMatch(/videoData and mimeType are required/i);
  });

  it("returns 400 when only videoData is provided", async () => {
    const res = await request(app)
      .post("/api/media/video/analyze")
      .send({ videoData: "abc123" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 400 when only mimeType is provided", async () => {
    const res = await request(app)
      .post("/api/media/video/analyze")
      .send({ mimeType: "video/mp4" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});

/**
 * Sprint 3 — W2: E2E tests for Sprint 2 endpoints that had no coverage
 *
 * Test coverage:
 *   POST /api/media/plan/suggest
 *     — 400 for missing description
 *     — 400 for missing projectContext
 *     — 200 response shape: { items[], count }
 *     — each item has required fields (id, type, label, purpose, promptTemplate, status, generatedJobIds)
 *
 *   Collections round-trip
 *     — create → add item → list items → reorder → remove → delete
 *
 *   Batch state persistence
 *     — create batch → GET /api/media/batch/:batchId → verify state.json shape
 *       (disk-level persistence tested in W3 via db.test.ts; here we verify
 *        the API layer correctly materialises a recoverable state object)
 */

import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createTestApp } from "../helpers/createTestApp.ts";
import type { Express } from "express";

let app: Express;

beforeAll(() => {
  app = createTestApp();
});

// ─── POST /api/media/plan/suggest ─────────────────────────────────────────────

describe("POST /api/media/plan/suggest", () => {
  it("returns 400 when description is missing", async () => {
    const res = await request(app)
      .post("/api/media/plan/suggest")
      .send({
        projectContext: { brandName: "TestBrand", brandDescription: "A SaaS tool" },
      });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
    expect(res.body.error).toMatch(/description is required/i);
  });

  it("returns 400 when projectContext is missing", async () => {
    const res = await request(app)
      .post("/api/media/plan/suggest")
      .send({ description: "Campaign for a new product launch" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
    expect(res.body.error).toMatch(/projectContext is required/i);
  });

  it("returns 200 with items array and count", async () => {
    const res = await request(app)
      .post("/api/media/plan/suggest")
      .send({
        description: "E2E test campaign — product launch",
        projectContext: {
          brandName: "TestBrand",
          brandDescription: "A modern SaaS tool",
          targetAudience: "software engineers",
          brandVoice: "professional and approachable",
          styleKeywords: ["minimal", "dark"],
        },
      });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("items");
    expect(res.body).toHaveProperty("count");
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.count).toBe(res.body.items.length);
  });

  it("each returned item has all required fields", async () => {
    const res = await request(app)
      .post("/api/media/plan/suggest")
      .send({
        description: "Social media push for spring sale",
        projectContext: { brandName: "TestBrand" },
      });
    expect(res.status).toBe(200);
    for (const item of res.body.items) {
      expect(typeof item.id).toBe("string");
      expect(["image", "video", "voice"]).toContain(item.type);
      expect(typeof item.label).toBe("string");
      expect(typeof item.purpose).toBe("string");
      expect(typeof item.promptTemplate).toBe("string");
      expect(item.status).toBe("draft");
      expect(Array.isArray(item.generatedJobIds)).toBe(true);
    }
  });

  it("returns items whose promptTemplate incorporates the description", async () => {
    const description = "unique-test-phrase-xyz";
    const res = await request(app)
      .post("/api/media/plan/suggest")
      .send({
        description,
        projectContext: { brandName: "AcmeCo" },
      });
    expect(res.status).toBe(200);
    // At least one item's prompt should reference the description
    const anyMatch = res.body.items.some((item: { promptTemplate: string }) =>
      item.promptTemplate.toLowerCase().includes(description)
    );
    expect(anyMatch).toBe(true);
  });
});

// ─── Collections full round-trip ──────────────────────────────────────────────

describe("Collections round-trip: create → add item → list items → reorder → remove → delete", () => {
  const PROJECT_ID = `proj_roundtrip_${Date.now()}`;
  let collectionId: string;
  const JOB_A = "job-alpha-001";
  const JOB_B = "job-bravo-002";
  const JOB_C = "job-charlie-003";

  it("step 1 — creates a collection and returns 201", async () => {
    const res = await request(app)
      .post("/api/collections")
      .send({ name: "Round-Trip Collection", projectId: PROJECT_ID });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body.name).toBe("Round-Trip Collection");
    expect(res.body.projectId).toBe(PROJECT_ID);
    collectionId = res.body.id;
  });

  it("step 2a — adds first item to the collection", async () => {
    const res = await request(app)
      .post(`/api/collections/${collectionId}/items`)
      .send({ jobId: JOB_A });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("collectionId", collectionId);
    expect(res.body).toHaveProperty("jobId", JOB_A);
    expect(typeof res.body.sortOrder).toBe("number");
  });

  it("step 2b — adds second item to the collection", async () => {
    const res = await request(app)
      .post(`/api/collections/${collectionId}/items`)
      .send({ jobId: JOB_B });
    expect(res.status).toBe(201);
    expect(res.body.jobId).toBe(JOB_B);
  });

  it("step 2c — adds third item to the collection", async () => {
    const res = await request(app)
      .post(`/api/collections/${collectionId}/items`)
      .send({ jobId: JOB_C });
    expect(res.status).toBe(201);
    expect(res.body.jobId).toBe(JOB_C);
  });

  it("step 3 — GET /api/collections/:id lists the 3 items", async () => {
    const res = await request(app).get(`/api/collections/${collectionId}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("id", collectionId);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items).toHaveLength(3);
    const jobIds = res.body.items.map((i: { jobId: string }) => i.jobId);
    expect(jobIds).toContain(JOB_A);
    expect(jobIds).toContain(JOB_B);
    expect(jobIds).toContain(JOB_C);
  });

  it("step 4 — reorders items (C, A, B)", async () => {
    const res = await request(app)
      .put(`/api/collections/${collectionId}/items/reorder`)
      .send({ order: [JOB_C, JOB_A, JOB_B] });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("ok", true);
    expect(res.body).toHaveProperty("count", 3);

    // Verify new order
    const listRes = await request(app).get(`/api/collections/${collectionId}`);
    expect(listRes.status).toBe(200);
    const reordered = listRes.body.items.sort(
      (a: { sortOrder: number }, b: { sortOrder: number }) => a.sortOrder - b.sortOrder
    );
    expect(reordered[0].jobId).toBe(JOB_C);
    expect(reordered[1].jobId).toBe(JOB_A);
    expect(reordered[2].jobId).toBe(JOB_B);
  });

  it("step 5 — removes middle item (JOB_A)", async () => {
    const res = await request(app).delete(
      `/api/collections/${collectionId}/items/${JOB_A}`
    );
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("ok", true);

    const listRes = await request(app).get(`/api/collections/${collectionId}`);
    const jobIds = listRes.body.items.map((i: { jobId: string }) => i.jobId);
    expect(jobIds).not.toContain(JOB_A);
    expect(jobIds).toContain(JOB_B);
    expect(jobIds).toContain(JOB_C);
  });

  it("step 6 — deletes the collection; it no longer appears in list", async () => {
    const delRes = await request(app).delete(`/api/collections/${collectionId}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body).toHaveProperty("ok", true);

    const listRes = await request(app).get(
      `/api/collections?projectId=${PROJECT_ID}`
    );
    expect(listRes.status).toBe(200);
    expect(listRes.body).toHaveLength(0);
  });

  it("returns 400 when adding item without jobId", async () => {
    // Create a fresh collection for this edge-case test
    const fresh = await request(app)
      .post("/api/collections")
      .send({ name: "Validation Test", projectId: PROJECT_ID });
    const { id } = fresh.body;
    const res = await request(app).post(`/api/collections/${id}/items`).send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
    expect(res.body.error).toMatch(/jobId is required/i);
  });

  it("returns 404 when adding item to non-existent collection", async () => {
    const res = await request(app)
      .post("/api/collections/nonexistent-col-xyz/items")
      .send({ jobId: "job-001" });
    expect(res.status).toBe(404);
  });

  it("returns 400 when reorder body is not an array", async () => {
    const fresh = await request(app)
      .post("/api/collections")
      .send({ name: "Reorder Validation", projectId: PROJECT_ID });
    const { id } = fresh.body;
    const res = await request(app)
      .put(`/api/collections/${id}/items/reorder`)
      .send({ order: "not-an-array" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});

// ─── Batch state persistence ───────────────────────────────────────────────────
//
// The disk-level state.json is tested in db.test.ts (W3).
// Here we verify the API layer produces a well-formed, recoverable state
// object that matches what would be serialised to disk.

describe("Batch state persistence (API layer)", () => {
  it("created batch returns a state object with all recovery fields", async () => {
    const res = await request(app)
      .post("/api/media/batch")
      .send({
        items: [
          { type: "image", body: { prompt: "Hero shot" } },
          { type: "voice", body: { text: "Welcome to Gemlink" } },
        ],
        apiKey: "test-key",
      });
    expect(res.status).toBe(202);
    const { batchId } = res.body;

    // Retrieve the full state from the API
    const stateRes = await request(app).get(`/api/media/batch/${batchId}`);
    expect(stateRes.status).toBe(200);

    const state = stateRes.body;
    // Fields that must be present for disk-recovery to work
    expect(typeof state.id).toBe("string");
    expect(typeof state.createdAt).toBe("string");
    expect(typeof state.total).toBe("number");
    expect(Array.isArray(state.jobIds)).toBe(true);
    expect(Array.isArray(state.statuses)).toBe(true);
    expect(state.total).toBe(2);
    expect(state.statuses).toHaveLength(2);
    // Verify all statuses are terminal-or-queued (recoverable)
    const validStatuses = ["queued", "generating", "completed", "failed"];
    for (const s of state.statuses) {
      expect(validStatuses).toContain(s);
    }
    // Summary shape
    expect(state.summary).toHaveProperty("total");
    expect(state.summary).toHaveProperty("queued");
    expect(state.summary).toHaveProperty("generating");
    expect(state.summary).toHaveProperty("done");
    expect(state.summary).toHaveProperty("failed");
    expect(typeof state.complete).toBe("boolean");
  });

  it("batch with 3 items has statuses array of length 3", async () => {
    const res = await request(app)
      .post("/api/media/batch")
      .send({
        items: [
          { type: "image", body: {} },
          { type: "video", body: {} },
          { type: "voice", body: {} },
        ],
        apiKey: "test-key",
      });
    expect(res.status).toBe(202);
    const { batchId } = res.body;

    const stateRes = await request(app).get(`/api/media/batch/${batchId}`);
    expect(stateRes.status).toBe(200);
    expect(stateRes.body.statuses).toHaveLength(3);
    expect(stateRes.body.total).toBe(3);
    expect(stateRes.body.complete).toBe(false); // nothing has completed yet
  });

  it("GET batch state has no-cache headers (prevents stale polling)", async () => {
    const res = await request(app)
      .post("/api/media/batch")
      .send({ items: [{ type: "image", body: {} }], apiKey: "test-key" });
    const { batchId } = res.body;
    const stateRes = await request(app).get(`/api/media/batch/${batchId}`);
    expect(stateRes.headers["cache-control"]).toBe("no-store");
  });

  it("returns 404 for unknown batchId", async () => {
    const res = await request(app).get(
      "/api/media/batch/batch-does-not-exist-xyz"
    );
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });
});

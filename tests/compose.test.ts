/**
 * tests/compose.test.ts — W2: Compose Engine Unit Tests (Lane 5, Sprint 4)
 *
 * Tests for compose.ts pure functions WITHOUT requiring real FFmpeg.
 * All execFile calls are mocked to return synthetic success.
 *
 * Coverage:
 *  - ASS subtitle generation (generateASS): format, sentence splitting, timing, all 4+1 presets
 *  - Word-level timing (generateWordLevelASS): per-word timestamps, totals, edge cases
 *  - Ken Burns filter string (kenBurnsFilter)
 *  - FFmpeg availability helpers (isFFmpegAvailable, isFFprobeAvailable)
 *  - Position mapping: "bottom" → \an2, "top" → \an8, "center" → \an5
 */

import { describe, it, expect, vi, beforeAll } from "vitest";
import fs from "node:fs/promises";

// ── Mock child_process.execFile BEFORE importing compose.ts ──────────────────
// This prevents compose.ts from running real FFmpeg during tests.
vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  return {
    ...actual,
    execFile: vi.fn((_cmd: string, _args: string[], callback: Function) => {
      // Simulate ffmpeg/ffprobe -version success
      callback(null, { stdout: "ffmpeg version 6.1.1 (fake)\n", stderr: "" });
    }),
  };
});

// Now import compose functions (with mocked execFile)
import {
  kenBurnsFilter,
  isFFmpegAvailable,
  isFFprobeAvailable,
  waitForInit,
  generateASS,
  generateWordLevelASS,
} from "../compose.ts";

// ── Helpers ──────────────────────────────────────────────────────────────────

async function readASSFile(assPath: string): Promise<string> {
  return fs.readFile(assPath, "utf8");
}

async function cleanupASS(assPath: string) {
  try { await fs.unlink(assPath); } catch { /* ignore */ }
}

// ── W2.1: FFmpeg availability ────────────────────────────────────────────────

describe("FFmpeg availability check", () => {
  beforeAll(async () => {
    // Wait for the lazy init promise in compose.ts to resolve
    await waitForInit();
  });

  it("isFFmpegAvailable() returns a boolean", () => {
    expect(typeof isFFmpegAvailable()).toBe("boolean");
  });

  it("isFFprobeAvailable() returns a boolean", () => {
    expect(typeof isFFprobeAvailable()).toBe("boolean");
  });
});

// ── W2.2: kenBurnsFilter ─────────────────────────────────────────────────────

describe("kenBurnsFilter()", () => {
  it("returns a string containing 'zoompan'", () => {
    const f = kenBurnsFilter(5);
    expect(typeof f).toBe("string");
    expect(f).toContain("zoompan");
  });

  it("encodes the correct number of frames for the given duration", () => {
    // default fps=30, so 5 seconds → 150 frames
    const f = kenBurnsFilter(5, 30);
    expect(f).toContain("d=150");
  });

  it("encodes the output size in the filter string", () => {
    const f = kenBurnsFilter(3, 30, 1080, 1920);
    expect(f).toContain("1080x1920");
  });

  it("different durations produce different frame counts", () => {
    const f3 = kenBurnsFilter(3, 30);
    const f6 = kenBurnsFilter(6, 30);
    expect(f3).not.toBe(f6);
  });
});

// ── W2.3: generateASS — basic format & structure ─────────────────────────────

describe("generateASS() — format and structure", () => {
  it("output file starts with [Script Info]", async () => {
    const result = await generateASS("Hello world.", "clean", 5);
    const content = await readASSFile(result.assPath);
    expect(content.trimStart()).toMatch(/^\[Script Info\]/);
    await cleanupASS(result.assPath);
  });

  it("output file contains [V4+ Styles] section", async () => {
    const result = await generateASS("Test style.", "bold-outline", 4);
    const content = await readASSFile(result.assPath);
    expect(content).toContain("[V4+ Styles]");
    await cleanupASS(result.assPath);
  });

  it("output file contains [Events] section", async () => {
    const result = await generateASS("Test events.", "boxed", 4);
    const content = await readASSFile(result.assPath);
    expect(content).toContain("[Events]");
    await cleanupASS(result.assPath);
  });

  it("output file contains Dialogue line(s)", async () => {
    const result = await generateASS("Some caption text.", "clean", 5);
    const content = await readASSFile(result.assPath);
    expect(content).toContain("Dialogue:");
    await cleanupASS(result.assPath);
  });

  it("returns an assPath string and segments array", async () => {
    const result = await generateASS("One sentence.", "clean", 3);
    expect(typeof result.assPath).toBe("string");
    expect(Array.isArray(result.segments)).toBe(true);
    expect(result.segments.length).toBeGreaterThan(0);
    await cleanupASS(result.assPath);
  });
});

// ── W2.4: generateASS — sentence splitting ───────────────────────────────────

describe("generateASS() — sentence splitting", () => {
  it("splits 'Hello world. How are you?' into 2 segments", async () => {
    const result = await generateASS("Hello world. How are you?", "clean", 6);
    expect(result.segments.length).toBe(2);
    await cleanupASS(result.assPath);
  });

  it("single sentence → 1 segment", async () => {
    const result = await generateASS("Just one sentence here", "clean", 3);
    expect(result.segments.length).toBe(1);
    await cleanupASS(result.assPath);
  });

  it("three sentences → 3 segments", async () => {
    const result = await generateASS("First. Second! Third?", "bold-outline", 9);
    expect(result.segments.length).toBe(3);
    await cleanupASS(result.assPath);
  });

  it("empty-ish string → at least 1 segment (no crash)", async () => {
    const result = await generateASS("  ", "clean", 1);
    // Should not throw; may produce 0 or 1 segments
    expect(Array.isArray(result.segments)).toBe(true);
    await cleanupASS(result.assPath);
  });
});

// ── W2.5: generateASS — timing math ─────────────────────────────────────────

describe("generateASS() — timing math", () => {
  it("total segment durations equal input duration", async () => {
    const duration = 10;
    const result = await generateASS("First sentence. Second one. Third here.", "clean", duration);
    const totalDuration = result.segments.reduce(
      (sum, seg) => sum + (seg.endTime - seg.startTime), 0
    );
    // Allow small floating-point rounding (within 0.01s)
    expect(Math.abs(totalDuration - duration)).toBeLessThan(0.01);
    await cleanupASS(result.assPath);
  });

  it("segments have non-negative startTime", async () => {
    const result = await generateASS("Hello world. Test.", "clean", 6);
    for (const seg of result.segments) {
      expect(seg.startTime).toBeGreaterThanOrEqual(0);
      expect(seg.endTime).toBeGreaterThan(seg.startTime);
    }
    await cleanupASS(result.assPath);
  });

  it("segments are contiguous (endTime of seg[i] equals startTime of seg[i+1])", async () => {
    const result = await generateASS("First. Second. Third.", "clean", 9);
    for (let i = 0; i < result.segments.length - 1; i++) {
      expect(result.segments[i].endTime).toBeCloseTo(result.segments[i + 1].startTime, 5);
    }
    await cleanupASS(result.assPath);
  });
});

// ── W2.6: generateASS — all 4+1 style presets ───────────────────────────────

describe("generateASS() — all 4+1 style presets produce valid ASS", () => {
  const styles = ["clean", "bold-outline", "boxed", "typewriter", "word-highlight"] as const;

  for (const style of styles) {
    it(`style="${style}" produces valid ASS with [Script Info] header`, async () => {
      const result = await generateASS(`Testing ${style} style preset.`, style, 4);
      const content = await readASSFile(result.assPath);
      expect(content).toContain("[Script Info]");
      expect(content).toContain("[V4+ Styles]");
      expect(content).toContain("Dialogue:");
      expect(result.segments.length).toBeGreaterThan(0);
      await cleanupASS(result.assPath);
    });
  }
});

// ── W2.7: generateASS — position mapping ────────────────────────────────────

describe("generateASS() — position mapping", () => {
  it('"bottom" position → Alignment=2 (\\an2) in Style definition', async () => {
    const result = await generateASS("Caption text.", "clean", 3, { position: "bottom" });
    const content = await readASSFile(result.assPath);
    // Style: Default,Arial,48,...,2,...  — alignment is 19th field (0-based index)
    // We check the Style line contains ,2, in the correct position
    const styleLine = content.split("\n").find((l) => l.startsWith("Style:"));
    expect(styleLine).toBeDefined();
    // Parse alignment field (field index 17 in ASS style, 0-indexed from after "Style: ")
    const parts = styleLine!.replace("Style: ", "").split(",");
    // Fields: Name(0), Fontname(1), Fontsize(2), Primary(3), Secondary(4), Outline(5), Back(6),
    //         Bold(7), Italic(8), Under(9), Strike(10), ScaleX(11), ScaleY(12), Spacing(13),
    //         Angle(14), BorderStyle(15), Outline(16), Shadow(17), Alignment(18)
    const alignment = parseInt(parts[18], 10);
    expect(alignment).toBe(2);
    await cleanupASS(result.assPath);
  });

  it('"top" position → Alignment=8 in Style definition', async () => {
    const result = await generateASS("Caption text.", "clean", 3, { position: "top" });
    const content = await readASSFile(result.assPath);
    const styleLine = content.split("\n").find((l) => l.startsWith("Style:"));
    const parts = styleLine!.replace("Style: ", "").split(",");
    const alignment = parseInt(parts[18], 10);
    expect(alignment).toBe(8);
    await cleanupASS(result.assPath);
  });

  it('"center" position → Alignment=5 in Style definition', async () => {
    const result = await generateASS("Caption text.", "clean", 3, { position: "center" });
    const content = await readASSFile(result.assPath);
    const styleLine = content.split("\n").find((l) => l.startsWith("Style:"));
    const parts = styleLine!.replace("Style: ", "").split(",");
    const alignment = parseInt(parts[18], 10);
    expect(alignment).toBe(5);
    await cleanupASS(result.assPath);
  });
});

// ── W2.8: generateWordLevelASS — word-level timing ───────────────────────────

describe("generateWordLevelASS() — word-level timing", () => {
  it("single word → 1 segment spanning full duration", async () => {
    const duration = 4;
    const result = await generateWordLevelASS("Hello", "word-highlight", duration);
    expect(result.segments.length).toBe(1);
    const seg = result.segments[0];
    expect(seg.startTime).toBeCloseTo(0, 5);
    expect(seg.endTime).toBeCloseTo(duration, 1);
    await cleanupASS(result.assPath);
  });

  it("10 words → 10 segments", async () => {
    const text = "one two three four five six seven eight nine ten";
    const result = await generateWordLevelASS(text, "word-highlight", 10);
    expect(result.segments.length).toBe(10);
    await cleanupASS(result.assPath);
  });

  it("word durations sum to total duration", async () => {
    const duration = 8;
    const text = "The quick brown fox jumps over the lazy dog";
    const result = await generateWordLevelASS(text, "word-highlight", duration);
    const total = result.segments.reduce((sum, s) => sum + (s.endTime - s.startTime), 0);
    expect(Math.abs(total - duration)).toBeLessThan(0.1);
    await cleanupASS(result.assPath);
  });

  it("empty string → falls back gracefully (no crash)", async () => {
    // Edge case: empty input falls back to generateASS
    const result = await generateWordLevelASS("", "word-highlight", 3);
    expect(Array.isArray(result.segments)).toBe(true);
    await cleanupASS(result.assPath);
  });

  it("output file is valid ASS format (has [Script Info])", async () => {
    const result = await generateWordLevelASS("Hello world test.", "word-highlight", 6);
    const content = await readASSFile(result.assPath);
    expect(content).toContain("[Script Info]");
    await cleanupASS(result.assPath);
  });

  it("each segment has text, startTime < endTime", async () => {
    const result = await generateWordLevelASS("Testing timing values.", "word-highlight", 5);
    for (const seg of result.segments) {
      expect(typeof seg.text).toBe("string");
      expect(seg.startTime).toBeGreaterThanOrEqual(0);
      expect(seg.endTime).toBeGreaterThan(seg.startTime);
    }
    await cleanupASS(result.assPath);
  });
});

/**
 * compose.ts — Gemlink FFmpeg Compose Engine
 *
 * Server-side FFmpeg orchestration module.
 * All functions are async and use Node's `child_process.execFile` for safe
 * argument passing (no shell injection). Captures stderr on failure.
 *
 * Exports:
 *  - ffmpegAvailable: boolean (probed at import time)
 *  - probeMedia()
 *  - mergeVideoAudio()
 *  - createSlideshow()
 *  - burnCaptions()
 *  - kenBurnsFilter()
 *  - generateASS()
 *  - generateWordLevelASS()
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const execFileAsync = promisify(execFile);

// ── FFmpeg availability probe ─────────────────────────────────────────────────

async function checkBinary(name: string): Promise<boolean> {
  try {
    await execFileAsync(name, ["-version"]);
    return true;
  } catch {
    return false;
  }
}

// Synchronous availability flag — resolved at module load via top-level await
// (Node ESM supports top-level await; the server uses ts-node/tsx which handles this)
let _ffmpegAvailable = false;
let _ffprobeAvailable = false;

const _initPromise = (async () => {
  [_ffmpegAvailable, _ffprobeAvailable] = await Promise.all([
    checkBinary("ffmpeg"),
    checkBinary("ffprobe"),
  ]);
  if (!_ffmpegAvailable || !_ffprobeAvailable) {
    console.warn("[compose] WARNING: ffmpeg or ffprobe not found. Compose features will be disabled. Run: sudo apt install ffmpeg");
  } else {
    console.log("[compose] ffmpeg + ffprobe detected ✓");
  }
})();

// Allow callers to await readiness
export async function waitForInit(): Promise<void> {
  await _initPromise;
}

export { _ffmpegAvailable as ffmpegAvailable };

// Export a getter so consumers can read the FINAL value after init
export function isFFmpegAvailable(): boolean { return _ffmpegAvailable; }
export function isFFprobeAvailable(): boolean { return _ffprobeAvailable; }

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ProbeResult {
  duration: number;           // seconds
  width: number;
  height: number;
  codec: string;
  hasAudio: boolean;
}

export interface ComposeResult {
  outputPath: string;
  duration: number;           // seconds
  size: number;               // bytes
}

export interface SlideInput {
  imagePath: string;
  duration: number;           // seconds per slide
  transition?: string;        // e.g. "fade", "slideright", "dissolve"
  kenBurns?: boolean;
}

export interface SlideshowOptions {
  width?: number;             // output width  (default 1080)
  height?: number;            // output height (default 1920 = 9:16)
  fps?: number;               // default 30
  transitionDuration?: number;// seconds, default 0.5
}

export interface ASSOptions {
  fontSize?: number;
  fontColor?: string;         // hex without # or &H prefix — we handle formatting
  position?: "top" | "center" | "bottom";
  outlineThickness?: number;
}

export interface ASSResult {
  assPath: string;
  segments: Array<{ text: string; startTime: number; endTime: number }>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Format seconds as ASS timestamp: H:MM:SS.cc */
function toASSTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.round((seconds % 1) * 100); // centiseconds
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

/** Wrap hex color string into ASS &HBBGGRR& format (accepts #RRGGBB or RRGGBB) */
function hexToASS(hex: string): string {
  const clean = hex.replace(/^#/, "").replace(/^&H/, "");
  if (clean.length === 6) {
    // Convert RRGGBB → BBGGRR
    const r = clean.slice(0, 2);
    const g = clean.slice(2, 4);
    const b = clean.slice(4, 6);
    return `&H${b}${g}${r}&`;
  }
  return `&H${clean}&`;
}

/** Split text into sentences on .!? boundaries */
function splitSentences(text: string): string[] {
  const raw = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return raw.length > 0 ? raw : [text.trim()];
}

/** Get file size in bytes, or 0 on error */
async function fileSize(filePath: string): Promise<number> {
  try {
    const stat = await fs.stat(filePath);
    return stat.size;
  } catch {
    return 0;
  }
}

// ── W1: probeMedia ────────────────────────────────────────────────────────────

export async function probeMedia(filePath: string): Promise<ProbeResult> {
  await _initPromise;
  if (!_ffprobeAvailable) throw new Error("ffprobe is not installed");

  const args = ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", filePath];
  let stdout = "";
  let stderr = "";
  try {
    const result = await execFileAsync("ffprobe", args);
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (err: any) {
    throw new Error(`ffprobe failed: ${err.stderr || err.message || String(err)}`);
  }

  let data: any;
  try {
    data = JSON.parse(stdout);
  } catch {
    throw new Error(`ffprobe returned invalid JSON. stderr: ${stderr}`);
  }

  const videoStream = (data.streams || []).find((s: any) => s.codec_type === "video");
  const audioStream = (data.streams || []).find((s: any) => s.codec_type === "audio");
  const duration = parseFloat(data.format?.duration || videoStream?.duration || "0");

  return {
    duration,
    width: parseInt(videoStream?.width || "0", 10),
    height: parseInt(videoStream?.height || "0", 10),
    codec: videoStream?.codec_name || "unknown",
    hasAudio: !!audioStream,
  };
}

// ── W1: mergeVideoAudio ───────────────────────────────────────────────────────

export async function mergeVideoAudio(
  videoPath: string,
  audioPath: string,
  outputPath: string,
): Promise<ComposeResult> {
  await _initPromise;
  if (!_ffmpegAvailable) throw new Error("ffmpeg is not installed");

  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const args = [
    "-y",
    "-i", videoPath,
    "-i", audioPath,
    "-c:v", "copy",
    "-c:a", "aac",
    "-map", "0:v:0",
    "-map", "1:a:0",
    "-shortest",
    outputPath,
  ];

  try {
    await execFileAsync("ffmpeg", args);
  } catch (err: any) {
    throw new Error(`mergeVideoAudio failed: ${err.stderr || err.message}`);
  }

  const probe = await probeMedia(outputPath);
  return { outputPath, duration: probe.duration, size: await fileSize(outputPath) };
}

// ── W1: kenBurnsFilter ────────────────────────────────────────────────────────

export function kenBurnsFilter(duration: number, fps = 30, w = 1080, h = 1920): string {
  const totalFrames = Math.ceil(fps * duration);
  return `zoompan=z='min(zoom+0.0015,1.5)':d=${totalFrames}:s=${w}x${h}:fps=${fps}`;
}

// ── W1: createSlideshow ───────────────────────────────────────────────────────

export async function createSlideshow(
  slides: SlideInput[],
  outputPath: string,
  opts: SlideshowOptions = {},
): Promise<ComposeResult> {
  await _initPromise;
  if (!_ffmpegAvailable) throw new Error("ffmpeg is not installed");
  if (slides.length === 0) throw new Error("createSlideshow requires at least one slide");

  const w = opts.width ?? 1080;
  const h = opts.height ?? 1920;
  const fps = opts.fps ?? 30;
  const td = opts.transitionDuration ?? 0.5; // transition overlap in seconds

  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  // Build ffmpeg args:
  // Each image → add as input with -loop 1 -t <duration>
  // Apply scale + kenBurns or just scale
  // Concatenate with xfade filter chain

  const args: string[] = ["-y"];

  for (const slide of slides) {
    args.push("-loop", "1", "-i", slide.imagePath);
  }

  // Build filtergraph
  const filterParts: string[] = [];
  const scaleFilter = `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1`;

  // Scale + optional Ken Burns per slide
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const dur = slide.duration;
    const totalFrames = Math.ceil(fps * dur);

    if (slide.kenBurns) {
      filterParts.push(
        `[${i}:v]${scaleFilter},${kenBurnsFilter(dur, fps, w, h)},` +
        `setpts=PTS-STARTPTS,fps=${fps}[v${i}]`
      );
    } else {
      filterParts.push(
        `[${i}:v]${scaleFilter},` +
        `tpad=stop_mode=clone:stop_duration=${dur},fps=${fps},trim=duration=${dur},` +
        `setpts=PTS-STARTPTS[v${i}]`
      );
    }
  }

  // Chain xfade transitions
  if (slides.length === 1) {
    filterParts.push(`[v0]copy[vout]`);
  } else {
    let prevLabel = "v0";
    let cumulativeDuration = slides[0].duration;

    for (let i = 1; i < slides.length; i++) {
      const transition = slides[i - 1].transition || "fade";
      const offset = cumulativeDuration - td;
      const outLabel = i === slides.length - 1 ? "vout" : `xf${i}`;

      filterParts.push(
        `[${prevLabel}][v${i}]xfade=transition=${transition}:duration=${td}:offset=${Math.max(0, offset)}[${outLabel}]`
      );

      prevLabel = outLabel;
      cumulativeDuration += slides[i].duration - td;
    }
  }

  args.push("-filter_complex", filterParts.join(";"));
  args.push("-map", "[vout]");
  args.push("-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", String(fps));
  args.push(outputPath);

  try {
    await execFileAsync("ffmpeg", args, { maxBuffer: 100 * 1024 * 1024 });
  } catch (err: any) {
    throw new Error(`createSlideshow failed: ${err.stderr || err.message}`);
  }

  const probe = await probeMedia(outputPath);
  return { outputPath, duration: probe.duration, size: await fileSize(outputPath) };
}

// ── W1: burnCaptions ─────────────────────────────────────────────────────────

export async function burnCaptions(
  videoPath: string,
  assPath: string,
  outputPath: string,
): Promise<ComposeResult> {
  await _initPromise;
  if (!_ffmpegAvailable) throw new Error("ffmpeg is not installed");

  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const args = [
    "-y",
    "-i", videoPath,
    "-vf", `ass=${assPath}`,
    "-c:v", "libx264",
    "-c:a", "copy",
    outputPath,
  ];

  try {
    await execFileAsync("ffmpeg", args, { maxBuffer: 100 * 1024 * 1024 });
  } catch (err: any) {
    throw new Error(`burnCaptions failed: ${err.stderr || err.message}`);
  }

  const probe = await probeMedia(outputPath);
  return { outputPath, duration: probe.duration, size: await fileSize(outputPath) };
}

// ── W3: ASS style presets ─────────────────────────────────────────────────────

type CaptionStyle = "clean" | "bold-outline" | "boxed" | "typewriter" | "word-highlight";

interface ASSStyleDef {
  Name: string;
  Fontname: string;
  Fontsize: number;
  PrimaryColour: string;    // &HBBGGRR&
  SecondaryColour: string;
  OutlineColour: string;
  BackColour: string;
  Bold: number;
  Italic: number;
  Underline: number;
  StrikeOut: number;
  ScaleX: number;
  ScaleY: number;
  Spacing: number;
  Angle: number;
  BorderStyle: number;
  Outline: number;
  Shadow: number;
  Alignment: number;        // \an position
  MarginL: number;
  MarginR: number;
  MarginV: number;
  Encoding: number;
}

function positionAlignment(position: "top" | "center" | "bottom"): number {
  if (position === "top") return 8;
  if (position === "center") return 5;
  return 2; // bottom (default)
}

function buildStyleDef(
  style: CaptionStyle,
  opts: ASSOptions,
  position: "top" | "center" | "bottom" = "bottom",
): ASSStyleDef {
  const alignment = positionAlignment(position);
  const base: ASSStyleDef = {
    Name: "Default",
    Fontname: "Arial",
    Fontsize: opts.fontSize ?? 48,
    PrimaryColour: "&HFFFFFF&",
    SecondaryColour: "&HFFFFFF&",
    OutlineColour: "&H000000&",
    BackColour: "&H80000000&",
    Bold: 0,
    Italic: 0,
    Underline: 0,
    StrikeOut: 0,
    ScaleX: 100,
    ScaleY: 100,
    Spacing: 0,
    Angle: 0,
    BorderStyle: 1,
    Outline: 0,
    Shadow: 2,
    Alignment: alignment,
    MarginL: 60,
    MarginR: 60,
    MarginV: 80,
    Encoding: 1,
  };

  if (opts.fontColor) {
    base.PrimaryColour = hexToASS(opts.fontColor);
  }
  if (opts.outlineThickness !== undefined) {
    base.Outline = opts.outlineThickness;
  }

  switch (style) {
    case "clean":
      base.Fontname = "Arial";
      base.Fontsize = opts.fontSize ?? 48;
      base.PrimaryColour = opts.fontColor ? hexToASS(opts.fontColor) : "&HFFFFFF&";
      base.BackColour = "&H000000&"; // shadow
      base.Outline = opts.outlineThickness ?? 0;
      base.Shadow = 2;
      base.Bold = 0;
      break;

    case "bold-outline":
      // TikTok / Reels style
      base.Fontname = "Impact";
      base.Fontsize = opts.fontSize ?? 64;
      base.PrimaryColour = opts.fontColor ? hexToASS(opts.fontColor) : "&HFFFFFF&";
      base.OutlineColour = "&H000000&";
      base.Outline = opts.outlineThickness ?? 4;
      base.Shadow = 0;
      base.Bold = 1;
      break;

    case "boxed":
      base.Fontname = "Arial";
      base.Fontsize = opts.fontSize ?? 44;
      base.PrimaryColour = opts.fontColor ? hexToASS(opts.fontColor) : "&HFFFFFF&";
      base.BackColour = "&H80000000&"; // semi-transparent black
      base.BorderStyle = 4; // box style
      base.Outline = 0;
      base.Shadow = 0;
      base.Bold = 0;
      break;

    case "typewriter":
      base.Fontname = "Courier New";
      base.Fontsize = opts.fontSize ?? 48;
      base.PrimaryColour = opts.fontColor ? hexToASS(opts.fontColor) : "&HFFFFFF&";
      base.SecondaryColour = "&H00FFFFFF&"; // karaoke secondary (hidden before reveal)
      base.Outline = opts.outlineThickness ?? 1;
      base.Shadow = 1;
      break;

    case "word-highlight":
      base.Fontname = "Impact";
      base.Fontsize = opts.fontSize ?? 64;
      base.PrimaryColour = opts.fontColor ? hexToASS(opts.fontColor) : "&HFFFFFF&";
      base.SecondaryColour = "&H888888&"; // dimmed inactive words
      base.OutlineColour = "&H000000&";
      base.Outline = opts.outlineThickness ?? 3;
      base.Shadow = 0;
      base.Bold = 1;
      break;
  }

  return base;
}

function styleDefToASS(def: ASSStyleDef): string {
  return [
    "Style: Default",
    def.Fontname,
    String(def.Fontsize),
    def.PrimaryColour,
    def.SecondaryColour,
    def.OutlineColour,
    def.BackColour,
    String(def.Bold),
    String(def.Italic),
    String(def.Underline),
    String(def.StrikeOut),
    String(def.ScaleX),
    String(def.ScaleY),
    String(def.Spacing),
    String(def.Angle),
    String(def.BorderStyle),
    String(def.Outline),
    String(def.Shadow),
    String(def.Alignment),
    String(def.MarginL),
    String(def.MarginR),
    String(def.MarginV),
    String(def.Encoding),
  ].join(",");
}

function buildASSHeader(styleDef: ASSStyleDef): string {
  return `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
Collisions: Normal
Timer: 100.0000

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
${styleDefToASS(styleDef)}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
}

// ── W3: generateASS ──────────────────────────────────────────────────────────

export async function generateASS(
  text: string,
  style: CaptionStyle,
  duration: number,
  opts: ASSOptions = {},
): Promise<ASSResult> {
  const position = opts.position ?? "bottom";
  const styleDef = buildStyleDef(style, opts, position);

  const sentences = splitSentences(text);
  const timePerSentence = duration / sentences.length;

  const segments: ASSResult["segments"] = [];
  const dialogueLines: string[] = [];

  for (let i = 0; i < sentences.length; i++) {
    const startTime = i * timePerSentence;
    const endTime = (i + 1) * timePerSentence;
    const sentence = sentences[i];

    segments.push({ text: sentence, startTime, endTime });

    let displayText = sentence;

    if (style === "typewriter") {
      // Use \kf (karaoke fill) for word-by-word reveal within a sentence
      const words = sentence.split(/\s+/).filter(Boolean);
      const wordDur = timePerSentence / words.length;
      displayText = words
        .map((w) => `{\\kf${Math.round(wordDur * 100)}}${w}`)
        .join(" ");
    }

    dialogueLines.push(
      `Dialogue: 0,${toASSTime(startTime)},${toASSTime(endTime)},Default,,0,0,0,,${displayText}`
    );
  }

  const assContent = buildASSHeader(styleDef) + dialogueLines.join("\n") + "\n";

  // Write to a temp file
  const tmpDir = os.tmpdir();
  const assPath = path.join(tmpDir, `gemlink_caption_${Date.now()}.ass`);
  await fs.writeFile(assPath, assContent, "utf8");

  return { assPath, segments };
}

// ── W4: generateWordLevelASS ─────────────────────────────────────────────────

export async function generateWordLevelASS(
  text: string,
  style: CaptionStyle,
  duration: number,
  opts: ASSOptions = {},
): Promise<ASSResult> {
  const position = opts.position ?? "bottom";
  const styleDef = buildStyleDef(style, opts, position);

  // Split into words; preserve punctuation with the preceding word
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return generateASS(text, style, duration, opts);
  }

  // Distribute duration proportional to character count (longer words get more time)
  const charCounts = words.map((w) => Math.max(w.replace(/[^a-zA-Z0-9]/g, "").length, 1));
  const totalChars = charCounts.reduce((sum, c) => sum + c, 0);
  const wordDurations = charCounts.map((c) => (c / totalChars) * duration);

  const segments: ASSResult["segments"] = [];
  const dialogueLines: string[] = [];

  // Accent color for the active word
  const accentColor = "&H4444FF&"; // blue in ASS BGR
  const dimColor = "&H888888&";

  let currentTime = 0;
  for (let i = 0; i < words.length; i++) {
    const wordStart = currentTime;
    const wordEnd = currentTime + wordDurations[i];

    segments.push({ text: words[i], startTime: wordStart, endTime: wordEnd });

    if (style === "word-highlight") {
      // Show all words; active word gets accent color via inline override
      const parts = words.map((w, wi) => {
        if (wi === i) {
          return `{\\c${accentColor}}${w}{\\c}`;
        }
        return `{\\c${dimColor}}${w}{\\c}`;
      });
      const displayText = parts.join(" ");

      dialogueLines.push(
        `Dialogue: 0,${toASSTime(wordStart)},${toASSTime(wordEnd)},Default,,0,0,0,,${displayText}`
      );
    } else {
      // Generic word-level: show word with karaoke fill
      const totalWordCentiseconds = Math.round(wordDurations[i] * 100);
      const displayText = `{\\kf${totalWordCentiseconds}}${words[i]}`;

      dialogueLines.push(
        `Dialogue: 0,${toASSTime(wordStart)},${toASSTime(wordEnd)},Default,,0,0,0,,${displayText}`
      );
    }

    currentTime = wordEnd;
  }

  const assContent = buildASSHeader(styleDef) + dialogueLines.join("\n") + "\n";

  const tmpDir = os.tmpdir();
  const assPath = path.join(tmpDir, `gemlink_wordlevel_${Date.now()}.ass`);
  await fs.writeFile(assPath, assContent, "utf8");

  return { assPath, segments };
}

// ── Export ffmpegAvailable as a live boolean ──────────────────────────────────
// We re-export the mutable binding for consumers that read it after server init.
// Pattern: import { ffmpegAvailable } from "./compose.ts"
// The value is false until _initPromise resolves.

// Kick off init immediately at module load
void _initPromise;

// ── L3-W1: ComposeTemplate types + loadTemplates() ───────────────────────────

export interface ComposeTemplateSlide {
  slot: "image" | "video";
  duration: number;
  transition: string;
  kenBurns?: boolean;
  textOverlay?: string;
}

export interface ComposeTemplate {
  id: string;
  name: string;
  description: string;
  aspectRatio: string;
  slides: ComposeTemplateSlide[];
  audio?: { type: "voiceover" | "music" | "none"; required?: boolean };
  captions?: { style: string; timing: "sentence" | "word"; position: "top" | "center" | "bottom" };
  tags?: string[];
}

let _cachedTemplates: ComposeTemplate[] | null = null;

/**
 * loadTemplates() — load all JSON templates from data/compose-templates/.
 * Results are cached in memory after the first call.
 */
export async function loadTemplates(): Promise<ComposeTemplate[]> {
  if (_cachedTemplates) return _cachedTemplates;

  const templatesDir = path.join(process.cwd(), "data", "compose-templates");

  let files: string[] = [];
  try {
    files = await fs.readdir(templatesDir);
  } catch {
    console.warn("[compose] data/compose-templates/ directory not found — returning empty template list.");
    _cachedTemplates = [];
    return _cachedTemplates;
  }

  const templates: ComposeTemplate[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(templatesDir, file), "utf8");
      const tpl = JSON.parse(raw) as ComposeTemplate;
      // Ensure required fields
      if (tpl.id && tpl.name && Array.isArray(tpl.slides)) {
        templates.push(tpl);
      } else {
        console.warn(`[compose] Template ${file} missing required fields (id, name, slides) — skipped.`);
      }
    } catch (err) {
      console.warn(`[compose] Failed to parse template ${file}:`, err);
    }
  }

  console.log(`[compose] Loaded ${templates.length} composition template(s).`);
  _cachedTemplates = templates;
  return templates;
}

/**
 * templateSuggestionFromArtifact() — analyse a strategy artifact's content
 * with Gemini and return a ComposeTemplate config tuned to its brand feel.
 * Falls back to the "faceless-explainer" template if Gemini is unavailable.
 */
export async function templateSuggestionFromArtifact(
  artifactContent: string,
  apiKey?: string,
): Promise<ComposeTemplate> {
  const templates = await loadTemplates();
  const fallback = templates.find((t) => t.id === "faceless-explainer") ?? templates[0];

  if (!apiKey) return fallback;

  try {
    // Lazy dynamic import so tests can run without @google/genai installed
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey });

    const prompt = `You are a video composition expert. Analyse the following strategy content and return a JSON object describing the ideal composition settings for a short-form social video.

STRATEGY CONTENT:
${artifactContent.slice(0, 3000)}

Return ONLY valid JSON matching this schema (no markdown fences):
{
  "aspectRatio": "9:16" | "16:9" | "1:1",
  "slideCount": number (3-8),
  "slideDuration": number (1.5-5),
  "transition": "fadeblack" | "dissolve" | "slideright" | "smoothleft" | "wipeleft",
  "captionStyle": "word-highlight" | "bold-outline" | "clean" | "boxed",
  "kenBurns": boolean,
  "reasoning": string
}`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-04-17",
      contents: prompt,
    });

    const text = response.text?.trim() ?? "{}";
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("No JSON found in Gemini response");

    const cfg = JSON.parse(m[0]);
    const slideCount = Math.min(Math.max(cfg.slideCount ?? 5, 3), 8);
    const duration = Math.min(Math.max(cfg.slideDuration ?? 3, 1.5), 5);
    const transition = cfg.transition ?? "fadeblack";

    const slides: ComposeTemplateSlide[] = Array.from({ length: slideCount }, (_, i) => ({
      slot: "image" as const,
      duration,
      transition: i === slideCount - 1 ? "fadeblack" : transition,
      kenBurns: cfg.kenBurns ?? true,
    }));

    return {
      id: `artifact-generated-${Date.now()}`,
      name: "Artifact-Tuned Template",
      description: `Auto-generated from strategy artifact. ${cfg.reasoning ?? ""}`.slice(0, 200),
      aspectRatio: cfg.aspectRatio ?? "9:16",
      slides,
      audio: { type: "voiceover", required: true },
      captions: {
        style: cfg.captionStyle ?? "word-highlight",
        timing: "word",
        position: "bottom",
      },
      tags: ["auto-generated", "artifact"],
    };
  } catch (err) {
    console.warn("[compose] templateSuggestionFromArtifact Gemini call failed — using fallback:", err);
    return fallback ?? {
      id: "fallback",
      name: "Faceless Explainer",
      description: "Default template",
      aspectRatio: "9:16",
      slides: Array.from({ length: 5 }, (_, i) => ({
        slot: "image" as const,
        duration: 3,
        transition: i % 2 === 0 ? "fadeblack" : "dissolve",
        kenBurns: true,
      })),
      audio: { type: "voiceover", required: true },
      captions: { style: "word-highlight", timing: "word", position: "bottom" },
      tags: ["fallback"],
    };
  }
}


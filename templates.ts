/**
 * templates.ts — Composition template loader
 * Lane 3, Sprint 4 — W1
 *
 * Reads all JSON files from data/compose-templates/,
 * caches in memory, returns typed arrays.
 */

import fs from "fs/promises";
import path from "path";

// ── Types ────────────────────────────────────────────────────────────────────

export interface TemplateSlide {
  slot: "image" | "video";
  duration: number;
  transition?: string;
  kenBurns?: boolean;
  label?: string;
  textOverlay?: string;
}

export interface TemplateAudio {
  type: "voiceover" | "background-music" | "none";
  required: boolean;
}

export interface TemplateCaptions {
  style: "clean" | "bold-outline" | "boxed" | "typewriter" | "word-highlight";
  timing: "sentence" | "word";
  position: "top" | "center" | "bottom";
}

export interface ComposeTemplate {
  id: string;
  name: string;
  description: string;
  aspectRatio: "9:16" | "16:9" | "1:1" | "4:5";
  slides: TemplateSlide[];
  audio: TemplateAudio;
  captions: TemplateCaptions;
  tags: string[];
}

// ── In-memory cache ───────────────────────────────────────────────────────────

let templateCache: ComposeTemplate[] | null = null;

const TEMPLATES_DIR = path.join(process.cwd(), "data", "compose-templates");

// ── Loader ────────────────────────────────────────────────────────────────────

/**
 * loadTemplates() — reads all JSON files from data/compose-templates/,
 * validates structure, caches result in memory, returns typed array.
 */
export async function loadTemplates(): Promise<ComposeTemplate[]> {
  if (templateCache) return templateCache;

  let files: string[];
  try {
    files = await fs.readdir(TEMPLATES_DIR);
  } catch {
    console.warn("[templates] data/compose-templates/ directory not found — returning empty array.");
    templateCache = [];
    return templateCache;
  }

  const jsonFiles = files.filter((f) => f.endsWith(".json"));
  const loaded: ComposeTemplate[] = [];

  for (const file of jsonFiles) {
    try {
      const raw = await fs.readFile(path.join(TEMPLATES_DIR, file), "utf8");
      const parsed = JSON.parse(raw) as ComposeTemplate;

      // Basic required-field validation
      if (
        !parsed.id ||
        !parsed.name ||
        !parsed.aspectRatio ||
        !Array.isArray(parsed.slides) ||
        parsed.slides.length === 0
      ) {
        console.warn(`[templates] Skipping ${file} — missing required fields.`);
        continue;
      }

      loaded.push(parsed);
    } catch (err) {
      console.warn(`[templates] Failed to parse ${file}:`, err);
    }
  }

  // Sort deterministically by id for consistent ordering
  loaded.sort((a, b) => a.id.localeCompare(b.id));

  templateCache = loaded;
  console.log(`[templates] Loaded ${loaded.length} composition template(s).`);
  return templateCache;
}

/**
 * getTemplate(id) — returns a single template by id, or null if not found.
 * Triggers a load if the cache is cold.
 */
export async function getTemplate(id: string): Promise<ComposeTemplate | null> {
  const templates = await loadTemplates();
  return templates.find((t) => t.id === id) ?? null;
}

/**
 * clearTemplateCache() — useful in tests or when templates change on disk.
 */
export function clearTemplateCache(): void {
  templateCache = null;
}

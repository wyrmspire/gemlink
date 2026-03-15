import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Plus,
  Film,
  Mic,
  Image as ImageIcon,
  Tag,
  ChevronRight,
  Loader2,
  AlertCircle,
} from "lucide-react";

// ── Types (mirrored from templates.ts) ───────────────────────────────────────

export interface TemplateSlide {
  slot: "image" | "video";
  duration: number;
  transition?: string;
  kenBurns?: boolean;
  label?: string;
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

// ── Props ─────────────────────────────────────────────────────────────────────

interface TemplatePickerProps {
  onSelect: (template: ComposeTemplate | null) => void;
}

// ── Aspect Ratio Badge ────────────────────────────────────────────────────────

function AspectBadge({ ratio }: { ratio: string }) {
  const colorMap: Record<string, string> = {
    "9:16": "bg-violet-500/15 text-violet-300 border-violet-500/30",
    "16:9": "bg-sky-500/15 text-sky-300 border-sky-500/30",
    "1:1":  "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    "4:5":  "bg-amber-500/15 text-amber-300 border-amber-500/30",
  };
  const cls = colorMap[ratio] ?? "bg-zinc-700/40 text-zinc-300 border-zinc-600";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${cls}`}>
      {ratio}
    </span>
  );
}

// ── Audio Icon ────────────────────────────────────────────────────────────────

function AudioBadge({ type }: { type: TemplateAudio["type"] }) {
  if (type === "voiceover") return (
    <span className="inline-flex items-center gap-1 text-xs text-amber-300">
      <Mic className="w-3 h-3" /> Voiceover
    </span>
  );
  if (type === "background-music") return (
    <span className="inline-flex items-center gap-1 text-xs text-indigo-300">
      <Film className="w-3 h-3" /> Music
    </span>
  );
  return null;
}

// ── Caption Style Label ───────────────────────────────────────────────────────

function CaptionBadge({ style }: { style: string }) {
  const labels: Record<string, string> = {
    "word-highlight": "Word Highlight",
    "bold-outline": "Bold Outline",
    "clean": "Clean",
    "boxed": "Boxed",
    "typewriter": "Typewriter",
  };
  return (
    <span className="text-xs text-zinc-500">{labels[style] ?? style} captions</span>
  );
}

// ── Loading Skeleton ──────────────────────────────────────────────────────────

function TemplateSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="bg-zinc-950 border border-zinc-800 rounded-2xl p-5 animate-pulse h-48"
        >
          <div className="h-4 bg-zinc-800 rounded w-3/5 mb-3" />
          <div className="h-3 bg-zinc-800/70 rounded w-4/5 mb-1.5" />
          <div className="h-3 bg-zinc-800/70 rounded w-3/5 mb-4" />
          <div className="flex gap-2">
            <div className="h-5 w-12 bg-zinc-800 rounded-full" />
            <div className="h-5 w-16 bg-zinc-800 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Template Card ─────────────────────────────────────────────────────────────

function TemplateCard({ template, onSelect }: { template: ComposeTemplate; onSelect: () => void }) {
  return (
    <motion.button
      onClick={onSelect}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className="group relative text-left w-full bg-zinc-950 border border-zinc-800 hover:border-indigo-500/60 rounded-2xl p-5 flex flex-col gap-3 transition-all duration-200 shadow-sm hover:shadow-indigo-500/10 hover:shadow-lg"
    >
      {/* Glow on hover */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-indigo-500/0 to-violet-500/0 group-hover:from-indigo-500/5 group-hover:to-violet-500/5 transition-all duration-300 pointer-events-none" />

      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-white truncate group-hover:text-indigo-200 transition-colors">
            {template.name}
          </h3>
          <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{template.description}</p>
        </div>
        <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-indigo-400 shrink-0 mt-0.5 transition-colors" />
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-2 flex-wrap">
        <AspectBadge ratio={template.aspectRatio} />
        <span className="text-xs text-zinc-500">
          <ImageIcon className="inline w-3 h-3 mr-0.5 relative -top-px" />
          {template.slides.length} slides
        </span>
        <AudioBadge type={template.audio.type} />
      </div>

      {/* Caption */}
      <CaptionBadge style={template.captions.style} />

      {/* Tags */}
      {template.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-auto">
          {template.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-zinc-800 border border-zinc-700 text-zinc-400 text-xs"
            >
              <Tag className="w-2.5 h-2.5" />
              {tag}
            </span>
          ))}
          {template.tags.length > 4 && (
            <span className="text-zinc-600 text-xs">+{template.tags.length - 4}</span>
          )}
        </div>
      )}
    </motion.button>
  );
}

// ── Start from Scratch Card ───────────────────────────────────────────────────

function ScratchCard({ onSelect }: { onSelect: () => void }) {
  return (
    <motion.button
      onClick={onSelect}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className="group text-left w-full border-2 border-dashed border-zinc-700 hover:border-indigo-500/60 rounded-2xl p-5 flex flex-col items-center justify-center gap-3 transition-all duration-200 min-h-[160px]"
    >
      <div className="w-10 h-10 rounded-full bg-zinc-800 group-hover:bg-indigo-500/15 border border-zinc-700 group-hover:border-indigo-500/40 flex items-center justify-center transition-colors">
        <Plus className="w-5 h-5 text-zinc-400 group-hover:text-indigo-400 transition-colors" />
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-zinc-300 group-hover:text-white transition-colors">
          Start from Scratch
        </p>
        <p className="text-xs text-zinc-600 mt-0.5">Blank canvas — build your own composition</p>
      </div>
    </motion.button>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function TemplatePicker({ onSelect }: TemplatePickerProps) {
  const [templates, setTemplates] = useState<ComposeTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTemplates() {
      try {
        const res = await fetch("/api/compose/templates");
        if (!res.ok) throw new Error(`Server responded ${res.status}`);
        const data = await res.json();
        setTemplates(Array.isArray(data) ? data : []);
      } catch (err: any) {
        console.error("[TemplatePicker] fetch failed:", err);
        setError(err.message || "Failed to load templates");
      } finally {
        setLoading(false);
      }
    }
    fetchTemplates();
  }, []);

  return (
    <div className="w-full">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-white mb-1">Choose a Template</h2>
        <p className="text-sm text-zinc-400">
          Start with a pre-built format or build your own composition from scratch.
        </p>
      </div>

      {loading ? (
        <TemplateSkeleton />
      ) : error ? (
        <div className="flex items-center gap-3 p-5 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-300">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <div>
            <p className="text-sm font-medium">Failed to load templates</p>
            <p className="text-xs text-red-400/70 mt-0.5">{error}</p>
          </div>
        </div>
      ) : (
        <AnimatePresence>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
            {/* Start from Scratch — always first */}
            <ScratchCard onSelect={() => onSelect(null)} />

            {/* Template cards */}
            {templates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onSelect={() => onSelect(template)}
              />
            ))}

            {templates.length === 0 && (
              <div className="col-span-full text-center py-8 text-zinc-500 text-sm">
                <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                No templates available yet.
              </div>
            )}
          </div>
        </AnimatePresence>
      )}
    </div>
  );
}

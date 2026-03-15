import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence, Reorder } from "motion/react";
import {
  Loader2,
  ListOrdered,
  Plus,
  Trash2,
  GripVertical,
  Image as ImageIcon,
  Video,
  Mic,
  Sparkles,
  Play,
  CheckCircle2,
  Clock,
  AlertCircle,
  ChevronDown,
  Settings2,
  SquareCheck,
  Square,
  Eye,
  X,
  Edit3,
  FolderOpen,
  Users,
  Film,
  Layers,
  Music,
  Copy,
  RefreshCw,
  FolderPlus,
  BarChart3,
  Download,
  Upload,
  LayoutTemplate,
  Filter,
  ChevronRight,
  Timer,
} from "lucide-react";
import { useProject } from "../context/ProjectContext";
import { useToast } from "../context/ToastContext";
import { useNavigate } from "react-router-dom";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface GenerationConfig {
  model: string;
  size: string;
  aspectRatio: string;
  count: number;
  negativePrompt: string;
  voice?: string;
  duration?: number;
}

export interface MediaPlanItem {
  id: string;
  type: "image" | "video" | "voice" | "music";
  label: string;
  purpose: string;
  promptTemplate: string;
  status: "draft" | "queued" | "generating" | "review" | "approved" | "rejected";
  generatedJobIds: string[];
  rating?: number;
  tags?: string[];
  generationConfig: GenerationConfig;
  batchId?: string;
  batchIndex?: number;
  error?: string;
}

export interface MediaPlan {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  items: MediaPlanItem[];
}

// ─── Constants ──────────────────────────────────────────────────────────────

const PLANS_KEY = "gemlink-multi-plans";

const STATUS_ORDER: MediaPlanItem["status"][] = [
  "draft", "queued", "generating", "review", "approved", "rejected",
];

// ── L3-S4.5: Use real model names (env vars with stable fallbacks)
const MODELS = [
  { value: import.meta.env.VITE_MODEL_IMAGE || "gemini-3-pro-image-preview", label: "Nano Banana Pro (Default)" },
  { value: "gemini-3.1-flash-image-preview", label: "Nano Banana 2 (Fast)" },
  { value: "gemini-2.5-flash-image", label: "Nano Banana (Budget)" },
  { value: "imagen-4.0-generate-001", label: "Imagen 4" },
  { value: import.meta.env.VITE_MODEL_VIDEO || "veo-3.1-generate-preview", label: "Veo 3.1" },
  { value: "veo-3.1-fast-generate-preview", label: "Veo 3.1 Fast" },
  { value: "veo-2.0-generate-001", label: "Veo 2.0 (Budget)" },
  { value: import.meta.env.VITE_MODEL_TTS || "gemini-2.5-flash-preview-tts", label: "Gemini TTS (Voice)" },
  { value: "gemini-2.5-pro-preview-tts", label: "Gemini Pro TTS (Voice)" },
];

const SIZES = [
  { value: "512px", label: "512px" },
  { value: "1K", label: "1K" },
  { value: "2K", label: "2K" },
  { value: "4K", label: "4K" },
];

const ASPECT_RATIOS = [
  { value: "1:1", label: "1:1 Square" },
  { value: "4:5", label: "4:5 Portrait" },
  { value: "9:16", label: "9:16 Stories/Reels" },
  { value: "16:9", label: "16:9 Widescreen" },
  { value: "1.91:1", label: "1.91:1 Landscape" },
  { value: "21:9", label: "21:9 Ultra-wide" },
];

// Veo only supports 16:9 and 9:16
const VIDEO_ASPECT_RATIOS = [
  { value: "16:9", label: "16:9 Widescreen" },
  { value: "9:16", label: "9:16 Vertical" },
];

// ─── W1: Item Presets ──────────────────────────────────────────────────────

interface ItemPreset {
  label: string;
  type: MediaPlanItem["type"];
  aspectRatio?: string;
  purpose: string;
  promptTemplate: string;
}

const ITEM_PRESETS: ItemPreset[] = [
  {
    label: "Hero Image",
    type: "image",
    aspectRatio: "16:9",
    purpose: "Website hero / landing page",
    promptTemplate: "A stunning hero image for a modern brand website. Cinematic composition, vibrant yet professional.",
  },
  {
    label: "Instagram Post",
    type: "image",
    aspectRatio: "1:1",
    purpose: "Instagram feed post",
    promptTemplate: "Square format Instagram post image. Eye-catching, on-brand colours, clean composition.",
  },
  {
    label: "Instagram Story",
    type: "image",
    aspectRatio: "9:16",
    purpose: "Instagram / TikTok Story",
    promptTemplate: "Vertical story format. Bold typography space at top and bottom, vivid visuals in middle.",
  },
  {
    label: "YouTube Thumbnail",
    type: "image",
    aspectRatio: "16:9",
    purpose: "YouTube video thumbnail",
    promptTemplate: "High-contrast YouTube thumbnail. Bold subject, expressive face, minimal background, bright accents.",
  },
  {
    label: "YouTube Intro Video",
    type: "video",
    aspectRatio: "16:9",
    purpose: "YouTube channel intro clip",
    promptTemplate: "A short dynamic brand intro video. Logo reveal, energetic pacing, cinematic quality.",
  },
  {
    label: "Product Showcase",
    type: "image",
    aspectRatio: "4:5",
    purpose: "Product spotlight image",
    promptTemplate: "Clean product photography style. Soft studio lighting, minimal background, premium feel.",
  },
  {
    label: "Voiceover Script",
    type: "voice",
    purpose: "Narration / voiceover",
    promptTemplate: "Welcome to [brand]. We help you [value proposition]. Let's get started.",
  },
  {
    label: "Background Music",
    type: "music",
    purpose: "Ambient background track",
    promptTemplate: "Uplifting and energetic background music with a modern corporate feel. Steady beat, no lyrics.",
  },
];

// ─── W2: Plan Templates ─────────────────────────────────────────────────────

interface PlanTemplate {
  name: string;
  description: string;
  items: Array<Omit<ItemPreset, "label"> & { label: string }>;
}

const PLAN_TEMPLATES: PlanTemplate[] = [
  {
    name: "YouTube Launch Package",
    description: "Hero image, channel intro video, 3 thumbnails, background music",
    items: [
      {
        label: "Channel Hero Image",
        type: "image",
        aspectRatio: "16:9",
        purpose: "YouTube channel art banner",
        promptTemplate: "Professional YouTube channel banner. Brand name prominent, matching brand colours, modern design.",
      },
      {
        label: "Channel Intro Video",
        type: "video",
        aspectRatio: "16:9",
        purpose: "5-second channel intro animation",
        promptTemplate: "Short punchy channel intro. Brand logo reveal with dramatic flair, cinematic transitions.",
      },
      {
        label: "Thumbnail #1",
        type: "image",
        aspectRatio: "16:9",
        purpose: "YouTube video thumbnail",
        promptTemplate: "Bold YouTube thumbnail. High-contrast subject, expressive, clear message, bright colours.",
      },
      {
        label: "Thumbnail #2",
        type: "image",
        aspectRatio: "16:9",
        purpose: "YouTube video thumbnail variant",
        promptTemplate: "Eye-catching YouTube thumbnail. Different angle or style from Thumbnail #1 for A/B testing.",
      },
      {
        label: "Thumbnail #3",
        type: "image",
        aspectRatio: "16:9",
        purpose: "YouTube video thumbnail variant",
        promptTemplate: "Minimalist YouTube thumbnail. Clean design, typography focused, brand-aligned.",
      },
      {
        label: "Background Music",
        type: "music",
        purpose: "Background track for videos",
        promptTemplate: "Uplifting background music for a YouTube channel. Energetic, modern, no vocals.",
      },
    ],
  },
  {
    name: "Instagram Week",
    description: "7 varied Instagram posts for a full week of content",
    items: [
      {
        label: "Monday Post",
        type: "image",
        aspectRatio: "1:1",
        purpose: "Monday Instagram feed post",
        promptTemplate: "Motivational Monday image. Bold, inspiring composition, on-brand colour palette.",
      },
      {
        label: "Tuesday Post",
        type: "image",
        aspectRatio: "4:5",
        purpose: "Tuesday Instagram feed post",
        promptTemplate: "Educational Tuesday post. Clean infographic style, easy to read, brand colours.",
      },
      {
        label: "Wednesday Story",
        type: "image",
        aspectRatio: "9:16",
        purpose: "Mid-week Instagram Story",
        promptTemplate: "Vertical story format for Wednesday. Poll-friendly layout, engaging visual, minimal text area.",
      },
      {
        label: "Thursday Post",
        type: "image",
        aspectRatio: "1:1",
        purpose: "Thursday Instagram feed post",
        promptTemplate: "Behind-the-scenes Thursday image. Candid and authentic feel, warm tones.",
      },
      {
        label: "Friday Post",
        type: "image",
        aspectRatio: "4:5",
        purpose: "Friday Instagram feed post",
        promptTemplate: "TGIF Friday celebration image. Fun, energetic, vibrant colours.",
      },
      {
        label: "Weekend Story",
        type: "image",
        aspectRatio: "9:16",
        purpose: "Weekend Instagram Story",
        promptTemplate: "Weekend lifestyle vertical story. Relaxed, aspirational, brand-adjacent aesthetic.",
      },
      {
        label: "Sunday Post",
        type: "image",
        aspectRatio: "1:1",
        purpose: "Sunday Instagram feed post",
        promptTemplate: "Reflective Sunday post. Calm, elegant composition, soft colour palette.",
      },
    ],
  },
  {
    name: "Product Launch Kit",
    description: "Hero, 3 product shots, voiceover, promo video",
    items: [
      {
        label: "Hero Image",
        type: "image",
        aspectRatio: "16:9",
        purpose: "Website / landing page hero",
        promptTemplate: "Dramatic product launch hero image. Premium product photography, dark moody background, spotlight lighting.",
      },
      {
        label: "Product Shot A",
        type: "image",
        aspectRatio: "1:1",
        purpose: "Square product image for social",
        promptTemplate: "Clean product shot on white background. Studio quality, professional lighting, no shadows.",
      },
      {
        label: "Product Shot B",
        type: "image",
        aspectRatio: "4:5",
        purpose: "Portrait product image for Instagram",
        promptTemplate: "Lifestyle product photography. Product in real-world context, aspirational setting.",
      },
      {
        label: "Product Shot C",
        type: "image",
        aspectRatio: "9:16",
        purpose: "Story / Reels product image",
        promptTemplate: "Vertical format product showcase. Vibrant background, bold text space at bottom.",
      },
      {
        label: "Product Voiceover",
        type: "voice",
        purpose: "Product promo narration",
        promptTemplate: "Introducing [Product Name] — the [solution] that [benefit]. Available now.",
      },
      {
        label: "Promo Video",
        type: "video",
        aspectRatio: "16:9",
        purpose: "Product promo video clip",
        promptTemplate: "High-energy product reveal video. Dynamic cuts, brand-matching colour grade, modern motion.",
      },
    ],
  },
];

// ─── W5: Time estimate helper ────────────────────────────────────────────────

function itemTimeBadge(type: MediaPlanItem["type"]): string {
  if (type === "video") return "~4 min";
  if (type === "voice") return "~3s";
  if (type === "music") return "~30s";
  return "~5s"; // image
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function genId() {
  return `item_${Math.random().toString(36).slice(2, 10)}`;
}

function planId() {
  return `plan_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;
}

function defaultConfig(type: MediaPlanItem["type"] = "image"): GenerationConfig {
  return {
    model: type === "video"
      ? (import.meta.env.VITE_MODEL_VIDEO || "veo-3.1-generate-preview")
      : type === "music"
      ? (import.meta.env.VITE_MODEL_MUSIC || "lyria-realtime-exp")
      : type === "voice"
      ? (import.meta.env.VITE_MODEL_TTS || "gemini-2.5-flash-preview-tts")
      : (import.meta.env.VITE_MODEL_IMAGE || "gemini-3-pro-image-preview"),
    size: type === "video" ? "1080p" : "1K",
    aspectRatio: type === "video" ? "16:9" : "1:1",
    count: 1,
    negativePrompt: "",
    voice: "Kore",
    duration: 30,
  };
}

function newItem(overrides: Partial<MediaPlanItem> = {}): MediaPlanItem {
  const type = overrides.type || "image";
  return {
    id: genId(),
    type,
    label: "New Asset",
    purpose: "",
    promptTemplate: "",
    status: "draft",
    generatedJobIds: [],
    generationConfig: defaultConfig(type),
    ...overrides,
  };
}

function newPlan(name = "New Plan"): MediaPlan {
  const now = new Date().toISOString();
  return { id: planId(), name, createdAt: now, updatedAt: now, items: [] };
}

// ─── UI helpers ─────────────────────────────────────────────────────────────

function statusPill(status: MediaPlanItem["status"], error?: string) {
  const configs: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
    draft: { label: "Draft", className: "bg-zinc-700/40 text-zinc-300", icon: <ListOrdered className="w-3 h-3" /> },
    queued: { label: "Queued", className: "bg-amber-500/15 text-amber-300", icon: <Clock className="w-3 h-3" /> },
    generating: { label: "Generating", className: "bg-indigo-500/15 text-indigo-300", icon: <Loader2 className="w-3 h-3 animate-spin" /> },
    review: { label: "Review", className: "bg-sky-500/15 text-sky-300", icon: <CheckCircle2 className="w-3 h-3" /> },
    approved: { label: "Approved", className: "bg-emerald-500/15 text-emerald-300", icon: <CheckCircle2 className="w-3 h-3" /> },
    rejected: { label: "Rejected", className: "bg-red-500/15 text-red-300", icon: <AlertCircle className="w-3 h-3" /> },
  };
  const c = configs[status] ?? configs.draft;
  return (
    <span 
      title={error || (status === "rejected" ? "Generation failed - hover or check logs" : undefined)}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${c.className} ${error ? "cursor-help" : ""}`}
    >
      {c.icon}{c.label}
    </span>
  );
}

function typeIcon(type: string) {
  if (type === "video") return <Video className="w-4 h-4 text-emerald-400" />;
  if (type === "voice") return <Mic className="w-4 h-4 text-amber-400" />;
  if (type === "music") return <Music className="w-4 h-4 text-rose-400" />;
  return <ImageIcon className="w-4 h-4 text-indigo-400" />;
}

// ─── Generation Preview Modal ───────────────────────────────────────────────

interface PreviewModalProps {
  plan: MediaPlan;
  onClose: () => void;
  onStart: () => void;
}

function GenerationPreviewModal({ plan, onClose, onStart }: PreviewModalProps) {
  const approvedItems = plan.items.filter((i) => i.status === "draft" || i.status === "approved");
  const images = approvedItems.filter((i) => i.type === "image");
  const videos = approvedItems.filter((i) => i.type === "video");
  const voices = approvedItems.filter((i) => i.type === "voice");
  // W8/CHECK-007: count music items and include in estimates
  const musics = approvedItems.filter((i) => i.type === "music");

  const totalImages = images.reduce((s, i) => s + i.generationConfig.count, 0);
  const totalVideos = videos.reduce((s, i) => s + i.generationConfig.count, 0);
  const totalVoices = voices.reduce((s, i) => s + i.generationConfig.count, 0);
  const totalMusics = musics.reduce((s, i) => s + i.generationConfig.count, 0);

  const estimatedSeconds =
    totalImages * 5 + totalVideos * 240 + totalVoices * 3 + totalMusics * 30;
  const totalCalls = totalImages + totalVideos + totalVoices + totalMusics;

  const ratioBreakdown = ASPECT_RATIOS.map((ar) => ({
    label: ar.label,
    count: images.filter((i) => i.generationConfig.aspectRatio === ar.value).length,
  })).filter((r) => r.count > 0);

  function fmtTime(s: number) {
    if (s < 60) return `~${s}s`;
    const m = Math.round(s / 60);
    return m >= 60 ? `~${Math.round(m / 60)}h ${m % 60}m` : `~${m} min`;
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" role="presentation">
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Generation preview — review items before starting batch"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-lg"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-semibold text-white">Generation Preview</h2>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
            <p className="text-sm font-semibold text-white mb-3">
              {approvedItems.length} items approved for generation
            </p>
            <div className="space-y-2">
              {images.length > 0 && (
                <div className="flex items-center gap-3 text-sm">
                  <ImageIcon className="w-4 h-4 text-indigo-400 shrink-0" />
                  <span className="text-zinc-300">{images.length} image{images.length > 1 ? "s" : ""}</span>
                  <span className="text-zinc-500">→ {totalImages} generation{totalImages > 1 ? "s" : ""}</span>
                  <span className="ml-auto text-zinc-500 text-xs">{fmtTime(totalImages * 5)}</span>
                </div>
              )}
              {videos.length > 0 && (
                <div className="flex items-center gap-3 text-sm">
                  <Video className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-zinc-300">{videos.length} video{videos.length > 1 ? "s" : ""}</span>
                  <span className="text-zinc-500">→ {totalVideos} generation{totalVideos > 1 ? "s" : ""}</span>
                  <span className="ml-auto text-zinc-500 text-xs">{fmtTime(totalVideos * 240)}</span>
                </div>
              )}
              {voices.length > 0 && (
                <div className="flex items-center gap-3 text-sm">
                  <Mic className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="text-zinc-300">{voices.length} voice clip{voices.length > 1 ? "s" : ""}</span>
                  <span className="text-zinc-500">→ {totalVoices} generation{totalVoices > 1 ? "s" : ""}</span>
                  <span className="ml-auto text-zinc-500 text-xs">{fmtTime(totalVoices * 3)}</span>
                </div>
              )}
              {/* W8/CHECK-007: music count + time estimate */}
              {musics.length > 0 && (
                <div className="flex items-center gap-3 text-sm">
                  <Music className="w-4 h-4 text-rose-400 shrink-0" />
                  <span className="text-zinc-300">{musics.length} music track{musics.length > 1 ? "s" : ""}</span>
                  <span className="text-zinc-500">→ {totalMusics} generation{totalMusics > 1 ? "s" : ""}</span>
                  <span className="ml-auto text-zinc-500 text-xs">{fmtTime(totalMusics * 30)}</span>
                </div>
              )}
              <div className="border-t border-zinc-800 pt-2 flex items-center justify-between text-sm">
                <span className="text-zinc-400">Estimated total</span>
                <span className="text-white font-medium">{fmtTime(estimatedSeconds)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-400">Total API calls</span>
                <span className="text-white font-medium">{totalCalls}</span>
              </div>
            </div>
          </div>

          {ratioBreakdown.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-widest text-zinc-500 mb-2">Aspect Ratio Breakdown</p>
              <div className="space-y-1">
                {ratioBreakdown.map((r) => (
                  <div key={r.label} className="flex items-center justify-between text-xs">
                    <span className="text-zinc-400">{r.label}</span>
                    <span className="text-zinc-300">{r.count} item{r.count > 1 ? "s" : ""}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-zinc-800">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-zinc-700 text-zinc-300 text-sm hover:bg-zinc-800 transition-colors"
          >
            Edit Settings
          </button>
          <button
            onClick={() => { onClose(); onStart(); }}
            disabled={approvedItems.length === 0}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
          >
            <Play className="w-4 h-4" />
            Start Generation
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Batch Prompt Edit Modal ─────────────────────────────────────────────────

interface BatchPromptModalProps {
  onClose: () => void;
  onApply: (op: "append" | "prepend" | "replace", find: string, value: string) => void;
}

function BatchPromptModal({ onClose, onApply }: BatchPromptModalProps) {
  const [op, setOp] = useState<"append" | "prepend" | "replace">("append");
  const [value, setValue] = useState("");
  const [find, setFind] = useState("");

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-md"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Edit3 className="w-5 h-5 text-indigo-400" />
            <h2 className="text-base font-semibold text-white">Edit Prompts</h2>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex gap-2">
            {(["append", "prepend", "replace"] as const).map((o) => (
              <button
                key={o}
                onClick={() => setOp(o)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                  op === o ? "bg-indigo-600 text-white" : "bg-zinc-800 text-zinc-400 hover:text-white"
                }`}
              >
                {o === "replace" ? "Find & Replace" : o}
              </button>
            ))}
          </div>

          {op === "replace" && (
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Find</label>
              <input
                value={find}
                onChange={(e) => setFind(e.target.value)}
                placeholder="Text to find…"
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          )}

          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">
              {op === "append" ? "Text to append" : op === "prepend" ? "Text to prepend" : "Replace with"}
            </label>
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              rows={3}
              placeholder={
                op === "append"
                  ? "e.g. natural lighting, no artificial look"
                  : op === "prepend"
                  ? "e.g. Cinematic photography style,"
                  : "Replacement text…"
              }
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-zinc-800">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-xl border border-zinc-700 text-zinc-300 text-sm hover:bg-zinc-800 transition-colors">
            Cancel
          </button>
          <button
            onClick={() => { onApply(op, find, value); onClose(); }}
            disabled={!value.trim() || (op === "replace" && !find.trim())}
            className="flex-1 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
          >
            Apply to Selected
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function MediaPlan() {
  const { activeProject } = useProject();
  const { toast } = useToast();
  const navigate = useNavigate();

  // Multi-plan state
  const [plans, setPlans] = useState<MediaPlan[]>([]);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);

  // Item editing UI
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [configExpandedId, setConfigExpandedId] = useState<string | null>(null);

  // Selection (batch actions)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchAspectRatio, setBatchAspectRatio] = useState("");
  const [batchSize, setBatchSize] = useState("");
  const [batchModel, setBatchModel] = useState("");
  const [batchCount, setBatchCount] = useState("");
  const [showBatchPromptModal, setShowBatchPromptModal] = useState(false);

  // Suggest / generate
  const [naturalInput, setNaturalInput] = useState("");
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [boardroomLoading, setBoardroomLoading] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);

  // Preview modal
  const [showPreview, setShowPreview] = useState(false);

  // Auto-Compose (Lane 3)
  const [showAutoCompose, setShowAutoCompose] = useState(false);
  const [autoComposing, setAutoComposing] = useState(false);
  const [autoComposeResults, setAutoComposeResults] = useState<null | {
    compositions: Array<{
      title: string;
      template: { id: string; name: string; aspectRatio: string };
      slideJobIds: string[];
      voiceJobId?: string;
      captionText?: string;
      slideCount: number;
    }>;
  }>(null);

  // Rename plan
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Single-item generation
  const [generatingSingleId, setGeneratingSingleId] = useState<string | null>(null);

  // Collect approved
  const [collectingApproved, setCollectingApproved] = useState(false);

  // ── Lane 3 additions ────────────────────────────────────────────────────────

  // W1: preset dropdown open
  const [showPresetMenu, setShowPresetMenu] = useState(false);

  // W2: plan template modal
  const [showTemplateModal, setShowTemplateModal] = useState(false);

  // W3: import file ref
  const importFileRef = useRef<HTMLInputElement>(null);

  // W4: filter state
  const [filterType, setFilterType] = useState<"" | MediaPlanItem["type"]>("");
  const [filterStatus, setFilterStatus] = useState<"" | MediaPlanItem["status"]>("");

  // ── Persistence ────────────────────────────────────────────────────────────

  const storageKey = `${PLANS_KEY}-${activeProject?.id ?? "default"}`;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed: MediaPlan[] = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setPlans(parsed);
          setActivePlanId(parsed[0].id);
          return;
        }
      }
    } catch { /* ignore */ }
    const initial = newPlan("My First Plan");
    setPlans([initial]);
    setActivePlanId(initial.id);
  }, [storageKey]);

  // Absorb sessionStorage import (from Research.tsx or Boardroom.tsx)
  useEffect(() => {
    const pending = sessionStorage.getItem("pending-media-items") || sessionStorage.getItem("media-plan-import");
    const keyUsed = sessionStorage.getItem("pending-media-items") ? "pending-media-items" : "media-plan-import";
    if (!pending) return;
    try {
      const arr = JSON.parse(pending);
      if (Array.isArray(arr) && arr.length > 0) {
        const imported = arr.map((x: any) =>
          newItem({
            type: x.type ?? "image",
            label: x.label ?? "Imported item",
            purpose: x.purpose ?? "",
            promptTemplate: x.promptTemplate ?? x.promptIdea ?? "",
          })
        );
        setPlans((prev) => {
          const target = activePlanId ?? prev[0]?.id;
          const next = prev.map((p) =>
            p.id === target ? { ...p, items: [...p.items, ...imported] } : p
          );
          savePlans(next);
          return next;
        });
        toast(`Imported ${imported.length} item${imported.length > 1 ? "s" : ""} from ${keyUsed === "media-plan-import" ? "Boardroom" : "Research"}.`, "success");
      }
    } catch { /* ignore */ }
    finally {
      sessionStorage.removeItem("pending-media-items");
      sessionStorage.removeItem("media-plan-import");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const savePlans = useCallback((updated: MediaPlan[]) => {
    try { localStorage.setItem(storageKey, JSON.stringify(updated)); } catch { /* ignore */ }
  }, [storageKey]);

  function updatePlans(next: MediaPlan[]) {
    setPlans(next);
    savePlans(next);
  }

  // ── Active plan helper ─────────────────────────────────────────────────────

  const activePlan = plans.find((p) => p.id === activePlanId) ?? plans[0];

  function patchPlan(id: string, patch: Partial<MediaPlan>) {
    const next = plans.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p));
    updatePlans(next);
  }

  function saveItems(planId: string, items: MediaPlanItem[]) {
    patchPlan(planId, { items });
  }

  // ── Plan management ────────────────────────────────────────────────────────

  function createNewPlan() {
    const p = newPlan("New Plan");
    const next = [p, ...plans];
    updatePlans(next);
    setActivePlanId(p.id);
    setSelectedIds(new Set());
  }

  function deletePlan(id: string) {
    if (plans.length === 1) { toast("Can't delete the only plan.", "warning"); return; }
    if (!confirm("Delete this plan?")) return;
    const next = plans.filter((p) => p.id !== id);
    updatePlans(next);
    if (activePlanId === id) setActivePlanId(next[0]?.id ?? null);
  }

  // ── Item helpers ───────────────────────────────────────────────────────────

  function addItem() {
    if (!activePlan) return;
    const item = newItem();
    saveItems(activePlan.id, [...activePlan.items, item]);
    setExpandedId(item.id);
  }

  // W1: Add item from preset
  function addItemFromPreset(preset: ItemPreset) {
    if (!activePlan) return;
    const item = newItem({
      label: preset.label,
      type: preset.type,
      purpose: preset.purpose,
      promptTemplate: preset.promptTemplate,
      generationConfig: {
        ...defaultConfig(preset.type),
        aspectRatio: preset.aspectRatio ?? "1:1",
      },
    });
    saveItems(activePlan.id, [...activePlan.items, item]);
    setExpandedId(item.id);
    setShowPresetMenu(false);
    toast(`Added "${preset.label}" preset.`, "success");
  }

  // W2: Load plan template
  function loadPlanTemplate(template: PlanTemplate) {
    if (!activePlan) return;
    const items = template.items.map((t) =>
      newItem({
        label: t.label,
        type: t.type,
        purpose: t.purpose,
        promptTemplate: t.promptTemplate,
        generationConfig: {
          ...defaultConfig(t.type),
          aspectRatio: t.aspectRatio ?? "1:1",
        },
      })
    );
    saveItems(activePlan.id, [...activePlan.items, ...items]);
    setShowTemplateModal(false);
    toast(`Loaded "${template.name}" — added ${items.length} items.`, "success");
  }

  // W3: Export plan as JSON
  function exportPlan() {
    if (!activePlan) return;
    const json = JSON.stringify(activePlan, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activePlan.name.replace(/[^a-z0-9]/gi, "_")}.gemlink-plan.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast(`Exported "${activePlan.name}" as JSON.`, "success");
  }

  // W3: Import plan from JSON file
  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed: MediaPlan = JSON.parse(ev.target?.result as string);
        if (!parsed.id || !Array.isArray(parsed.items)) throw new Error("Invalid plan file.");
        // Give it a new ID to avoid collisions
        const imported: MediaPlan = {
          ...parsed,
          id: planId(),
          name: `${parsed.name} (Imported)`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          items: parsed.items.map((i) => ({ ...i, id: genId() })),
        };
        const next = [imported, ...plans];
        updatePlans(next);
        setActivePlanId(imported.id);
        toast(`Imported "${parsed.name}" with ${imported.items.length} items.`, "success");
      } catch (err: any) {
        toast(err.message || "Failed to import plan. Make sure it's a valid Gemlink plan JSON.", "error");
      }
    };
    reader.readAsText(file);
    // Reset input so same file can be re-imported
    e.target.value = "";
  }

  function removeItem(itemId: string) {
    if (!activePlan) return;
    saveItems(activePlan.id, activePlan.items.filter((i) => i.id !== itemId));
    if (expandedId === itemId) setExpandedId(null);
    setSelectedIds((s) => { const ns = new Set(s); ns.delete(itemId); return ns; });
  }

  function duplicateItem(itemId: string) {
    if (!activePlan) return;
    const source = activePlan.items.find((i) => i.id === itemId);
    if (!source) return;
    const copy = newItem({
      ...source,
      id: genId(),
      label: `Copy of ${source.label}`,
      status: "draft",
      generatedJobIds: [],
      batchId: undefined,
      batchIndex: undefined,
      error: undefined,
    });
    const idx = activePlan.items.findIndex((i) => i.id === itemId);
    const next = [...activePlan.items];
    next.splice(idx + 1, 0, copy);
    saveItems(activePlan.id, next);
    toast(`Duplicated "${source.label}".`, "success");
  }

  function patchItem(itemId: string, patch: Partial<MediaPlanItem>) {
    if (!activePlan) return;
    saveItems(activePlan.id, activePlan.items.map((i) => i.id === itemId ? { ...i, ...patch } : i));
  }

  function patchItemConfig(itemId: string, patch: Partial<GenerationConfig>) {
    if (!activePlan) return;
    saveItems(
      activePlan.id,
      activePlan.items.map((i) =>
        i.id === itemId ? { ...i, generationConfig: { ...i.generationConfig, ...patch } } : i
      )
    );
  }

  // ── Selection / batch ──────────────────────────────────────────────────────

  function toggleSelect(id: string) {
    setSelectedIds((s) => {
      const ns = new Set(s);
      ns.has(id) ? ns.delete(id) : ns.add(id);
      return ns;
    });
  }

  function selectAll() {
    if (!activePlan) return;
    if (selectedIds.size === activePlan.items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(activePlan.items.map((i) => i.id)));
    }
  }

  function applyBatchConfig(field: keyof GenerationConfig, value: string | number) {
    if (!activePlan || selectedIds.size === 0) return;
    saveItems(
      activePlan.id,
      activePlan.items.map((item) =>
        selectedIds.has(item.id)
          ? { ...item, generationConfig: { ...item.generationConfig, [field]: value } }
          : item
      )
    );
    toast(`Updated ${field} for ${selectedIds.size} items.`, "success");
  }

  function applyBatchPrompt(op: "append" | "prepend" | "replace", find: string, value: string) {
    if (!activePlan || selectedIds.size === 0) return;
    saveItems(
      activePlan.id,
      activePlan.items.map((item) => {
        if (!selectedIds.has(item.id)) return item;
        let next = item.promptTemplate;
        if (op === "append") next = next ? `${next} ${value}` : value;
        else if (op === "prepend") next = next ? `${value} ${next}` : value;
        else if (op === "replace" && find) next = next.split(find).join(value);
        return { ...item, promptTemplate: next };
      })
    );
    toast(`Prompt ${op} applied to ${selectedIds.size} items.`, "success");
  }

  // ── Suggest / Generate ────────────────────────────────────────────────────

  const handleSuggest = async () => {
    if (!naturalInput.trim() || !activePlan) return;
    setSuggestLoading(true);
    try {
      const res = await fetch("/api/media/plan/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: naturalInput,
          apiKey: import.meta.env.VITE_GEMINI_API_KEY || undefined,
          projectContext: {
            brandName: activeProject?.brandName,
            brandDescription: activeProject?.brandDescription,
            targetAudience: activeProject?.targetAudience,
            brandVoice: activeProject?.brandVoice,
            styleKeywords: activeProject?.styleKeywords,
          },
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Server error ${res.status}`);
      }
      const data = await res.json();
      const suggested = (data.items ?? []).map((x: any) => {
        // Merge any AI-suggested aspectRatio/size/model into generationConfig
        // (the plan/suggest endpoint returns them as top-level fields, not inside generationConfig)
        const cfg = defaultConfig(x.type);
        if (x.size) cfg.size = x.size;
        if (x.model) cfg.model = x.model;
        // Validate aspect ratio is compatible with the item type before applying it
        if (x.aspectRatio) {
          const isValidForVideo = x.type === "video"
            ? VIDEO_ASPECT_RATIOS.some((ar) => ar.value === x.aspectRatio)
            : true;
          if (isValidForVideo) cfg.aspectRatio = x.aspectRatio;
        }
        return newItem({ ...x, generationConfig: cfg });
      });
      if (suggested.length === 0) throw new Error("AI returned an empty plan — try a more detailed description.");
      saveItems(activePlan.id, [...activePlan.items, ...suggested]);
      toast(`Added ${suggested.length} AI-suggested items.`, "success");
      setNaturalInput("");
    } catch (err: any) {
      toast(err?.message || "Quick Plan failed — check your API key or try again.", "error");
    } finally {
      setSuggestLoading(false);
    }
  };

  // W7/CHECK-008: Use a ref to always hold the latest activePlan in the polling callback,
  // preventing stale closure issues when saveItems re-renders the component.
  const activePlanRef = useRef(activePlan);
  useEffect(() => { activePlanRef.current = activePlan; });

  // Polling for batch generation progress
  useEffect(() => {
    if (!activePlan) return;
    
    // Find all unique active batch IDs from the current plan snapshot
    const activeBatches = new Set<string>();
    activePlan.items.forEach(i => {
      if (i.status === "generating" && i.batchId) {
        activeBatches.add(i.batchId);
      }
    });

    if (activeBatches.size === 0) return;

    const interval = setInterval(() => {
      // Always read from the ref so we get the latest plan state, not a stale closure
      const currentPlan = activePlanRef.current;
      if (!currentPlan) return;

      activeBatches.forEach(async (batchId) => {
        try {
          const res = await fetch(`/api/media/batch/${batchId}`);
          if (!res.ok) return;
          const data = await res.json();
          
          let updatedItems = false;
          const newItems = currentPlan.items.map(item => {
            if (item.batchId !== batchId || item.batchIndex === undefined) return item;
            
            const batchStatus = data.statuses[item.batchIndex];
            const jobId = data.jobIds[item.batchIndex];
            const error = data.errors[item.batchIndex];
            
            if (batchStatus === "completed") {
              updatedItems = true;
              return { ...item, status: "review" as const, generatedJobIds: jobId ? [jobId] : item.generatedJobIds, error: undefined };
            } else if (batchStatus === "failed") {
              updatedItems = true;
              return { ...item, status: "rejected" as const, error: error || "Unknown batch error" };
            }
            return item;
          });

          if (updatedItems) {
            saveItems(currentPlan.id, newItems);
            if (data.complete) {
              toast(`Batch generation complete!`, "success");
            }
          }
        } catch (err) {
          console.error(`[mediaplan] Failed to poll batch ${batchId}:`, err);
        }
      });
    }, 5000);

    return () => clearInterval(interval);
  // Only re-create the interval when the SET of active batch IDs changes, not on every plan update
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePlan?.id, batchRunning, saveItems, toast]);

  // W4: Boardroom Plan handoff — stores description in sessionStorage and navigates to /boardroom.
  // Boardroom.tsx picks up 'boardroom-plan-handoff' on mount and pre-fills MEDIA_STRATEGY_TEMPLATE.
  const handleBoardroomPlan = useCallback(() => {
    if (!naturalInput.trim()) {
      toast("Please describe what media you need first.", "warning");
      return;
    }
    setBoardroomLoading(true);
    const brandName = activeProject?.brandName || "your brand";
    const goal = naturalInput.trim();
    try {
      sessionStorage.setItem("boardroom-plan-handoff", JSON.stringify({
        templateId: "media-strategy",
        topic: `What visual and media assets does ${brandName} need for: ${goal}? Consider website, social media, video, and presentation materials.`,
        context: [
          `Brand: ${brandName}`,
          `Description: ${activeProject?.brandDescription ?? ""}`,
          `Audience: ${activeProject?.targetAudience ?? ""}`,
          `Voice: ${activeProject?.brandVoice ?? ""}`,
          `Goal: ${goal}`,
          "Focus on concrete, actionable asset types. Recommend specific formats, dimensions, and use-cases.",
        ].filter(Boolean).join("\n"),
        returnTo: "plan",
      }));
      toast("Opening Boardroom with Media Strategy template…", "info");
      navigate("/boardroom");
    } catch (err: any) {
      toast(err.message || "Failed to launch Boardroom Plan.", "error");
      setBoardroomLoading(false);
    }
  }, [naturalInput, activeProject, navigate, toast]);

  const buildItemPayload = (i: MediaPlanItem) => {
    const cfg = i.generationConfig;
    if (i.type === "voice") {
      return { type: "voice", body: { text: i.promptTemplate, voice: cfg.voice || "Kore" } };
    }
    if (i.type === "video") {
      let vModel = cfg.model;
      if (!vModel || !vModel.includes("veo")) vModel = import.meta.env.VITE_MODEL_VIDEO || "veo-3.1-generate-preview";
      let vRes = cfg.size;
      if (vRes !== "720p" && vRes !== "1080p") vRes = "1080p";
      return {
        type: "video",
        body: {
          prompt: i.promptTemplate,
          model: vModel,
          resolution: vRes,
          size: vRes,
          aspectRatio: cfg.aspectRatio,
        },
      };
    }
    if (i.type === "music") {
      return { type: "music", body: { prompt: i.promptTemplate, duration: cfg.duration || 30 } };
    }
    return {
      type: "image",
      body: {
        prompt: i.promptTemplate,
        model: cfg.model,
        size: cfg.size,
        aspectRatio: cfg.aspectRatio,
        count: cfg.count,
        negativePrompt: cfg.negativePrompt,
      },
    };
  };

  const handleGenerateAll = async () => {
    if (!activePlan) return;
    const draftItems = activePlan.items.filter((i) => i.status === "draft" || i.status === "approved");
    if (draftItems.length === 0) { toast("No draft items to generate.", "warning"); return; }

    // Filter out items with empty prompts — they'll fail silently otherwise
    const readyItems = draftItems.filter((i) => i.promptTemplate.trim().length > 0);
    const skipped = draftItems.length - readyItems.length;
    if (skipped > 0) toast(`Skipped ${skipped} item(s) with empty prompts.`, "warning");
    if (readyItems.length === 0) { toast("All items have empty prompts — nothing to generate.", "warning"); return; }

    setBatchRunning(true);
    const queued = activePlan.items.map((i) =>
      i.status === "draft" ? { ...i, status: "queued" as const } : i
    );
    saveItems(activePlan.id, queued);
    let res: Response | null = null;
    try {
      res = await fetch("/api/media/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // W1/CHECK-004: include apiKey so batch endpoint can call Gemini even if server env var is absent
          apiKey: import.meta.env.VITE_GEMINI_API_KEY || undefined,
          items: readyItems.map(buildItemPayload),
        }),
      });
      // W5/CHECK-005: Read real error body and surface it as an error toast
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Batch failed (HTTP ${res.status}).`);
      }
      const data = await res.json();
      
      const updated = activePlan.items.map((item) => {
        const readyIdx = readyItems.findIndex(d => d.id === item.id);
        if (readyIdx !== -1) {
          return { ...item, status: "generating" as const, batchId: data.batchId, batchIndex: readyIdx };
        }
        return item;
      });
      saveItems(activePlan.id, updated);
      toast(`Batch started — ${readyItems.length} items queued.`, "success");
    } catch (err: any) {
      // W5/CHECK-005: show the real error, not a misleading placeholder
      toast(err?.message || "Batch generation failed — check server logs.", "error");
      saveItems(activePlan.id, activePlan.items.map((i) => i.status === "queued" ? { ...i, status: "draft" as const } : i));
    } finally {
      setBatchRunning(false);
    }
  };

  // ── Generate single item ───────────────────────────────────────────────────

  const handleGenerateSingle = async (itemId: string) => {
    if (!activePlan) return;
    const item = activePlan.items.find((i) => i.id === itemId);
    if (!item || (item.status !== "draft" && item.status !== "rejected")) return;
    setGeneratingSingleId(itemId);
    patchItem(itemId, { status: "queued", error: undefined });
    try {
      const res = await fetch("/api/media/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // W1/SOP-3: include apiKey for single-item batch too
          apiKey: import.meta.env.VITE_GEMINI_API_KEY || undefined,
          items: [buildItemPayload(item)],
        }),
      });
      // W5/SOP-4: read real error body
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Single generation failed (HTTP ${res.status})`);
      }
      const data = await res.json();
      patchItem(itemId, { status: "generating", batchId: data.batchId, batchIndex: 0 });
      toast(`Generating "${item.label}"…`, "success");
    } catch (err: any) {
      patchItem(itemId, { status: "draft" });
      toast(err?.message || "Generation failed — check server logs.", "error");
    } finally {
      setGeneratingSingleId(null);
    }
  };

  // ── Collect approved items into a new collection ───────────────────────────

  const handleCollectApproved = useCallback(async () => {
    if (!activePlan || !activeProject) return;
    const approvedJobIds = activePlan.items
      .filter((i) => i.status === "approved" && i.generatedJobIds.length > 0)
      .flatMap((i) => i.generatedJobIds);
    if (approvedJobIds.length === 0) {
      toast("No approved items with generated outputs to collect.", "warning");
      return;
    }
    setCollectingApproved(true);
    try {
      const createRes = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: activeProject.id,
          name: `${activePlan.name} — Approved`,
        }),
      });
      if (!createRes.ok) throw new Error("Failed to create collection");
      const { id: collectionId } = await createRes.json();
      await Promise.all(
        approvedJobIds.map((jobId) =>
          fetch(`/api/collections/${collectionId}/items`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jobId }),
          })
        )
      );
      toast(`Created collection "${activePlan.name} — Approved" with ${approvedJobIds.length} item${approvedJobIds.length !== 1 ? "s" : ""}.`, "success");
      navigate("/collections");
    } catch (err: any) {
      toast(err.message || "Failed to collect approved items.", "error");
    } finally {
      setCollectingApproved(false);
    }
  }, [activePlan, activeProject, navigate, toast]);

  const handleAutoCompose = useCallback(async () => {
    if (!activePlan) return;
    setAutoComposing(true);
    try {
      const res = await fetch(`/api/media/plan/${activePlan.id}/auto-compose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: activePlan.items }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Auto-compose failed");
      setAutoComposeResults(data);
      setShowAutoCompose(true);
    } catch (err: any) {
      toast(err.message || "Auto-compose failed.", "error");
    } finally {
      setAutoComposing(false);
    }
  }, [activePlan, toast]);

  // ── Status summary for plan sidebar ───────────────────────────────────────

  function planSummary(plan: MediaPlan) {
    const counts: Partial<Record<MediaPlanItem["status"], number>> = {};
    for (const item of plan.items) {
      counts[item.status] = (counts[item.status] ?? 0) + 1;
    }
    return Object.entries(counts)
      .map(([s, n]) => `${n} ${s}`)
      .join(", ") || "empty";
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const draftCount = activePlan?.items.filter((i) => i.status === "draft").length ?? 0;
  // completedCount: items with generated outputs (review | approved | generating) — used for Auto-Compose threshold
  const completedCount = activePlan?.items.filter(
    (i) => (i.status === "review" || i.status === "approved" || i.status === "generating") && i.generatedJobIds.length > 0
  ).length ?? 0;
  const approvedCount = activePlan?.items.filter((i) => i.status === "approved").length ?? 0;
  // progressCount: items that have been generated (review + approved), used for the progress bar only
  const progressCount = activePlan?.items.filter(
    (i) => i.status === "review" || i.status === "approved"
  ).length ?? 0;
  const totalCount = activePlan?.items.length ?? 0;

  // W4: filtered items for the item list
  const filteredItems = activePlan?.items.filter((i) => {
    if (filterType && i.type !== filterType) return false;
    if (filterStatus && i.status !== filterStatus) return false;
    return true;
  }) ?? [];
  const hasActiveFilter = filterType !== "" || filterStatus !== "";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex h-full"
    >
      {/* Plans Sidebar */}
      <aside className="hidden lg:flex flex-col w-60 shrink-0 border-r border-zinc-800 bg-zinc-950">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <span className="text-xs uppercase tracking-widest text-zinc-500 font-medium">Plans</span>
          <button
            onClick={createNewPlan}
            title="New Plan"
            className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`group relative rounded-xl cursor-pointer transition-colors ${
                plan.id === activePlan?.id
                  ? "bg-indigo-600/15 border border-indigo-500/30"
                  : "hover:bg-zinc-800/50 border border-transparent"
              }`}
            >
              {renamingId === plan.id ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => {
                    if (renameValue.trim()) patchPlan(plan.id, { name: renameValue.trim() });
                    setRenamingId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      if (renameValue.trim()) patchPlan(plan.id, { name: renameValue.trim() });
                      setRenamingId(null);
                    }
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                  className="w-full bg-transparent px-3 py-2 text-sm text-white focus:outline-none"
                />
              ) : (
                <button
                  onClick={() => { setActivePlanId(plan.id); setSelectedIds(new Set()); }}
                  onDoubleClick={() => { setRenamingId(plan.id); setRenameValue(plan.name); }}
                  className="w-full text-left px-3 py-2.5"
                >
                  <p className={`text-sm font-medium truncate ${plan.id === activePlan?.id ? "text-indigo-200" : "text-zinc-300"}`}>
                    {plan.name}
                  </p>
                  <p className="text-xs text-zinc-600 mt-0.5">
                    {plan.items.length} item{plan.items.length !== 1 ? "s" : ""}
                  </p>
                  <p className="text-xs text-zinc-600 truncate">{planSummary(plan)}</p>
                  <p className="text-xs text-zinc-700 mt-0.5">
                    {new Date(plan.createdAt).toLocaleDateString()}
                  </p>
                </button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); deletePlan(plan.id); }}
                className="absolute top-2 right-2 hidden group-hover:flex p-1 rounded text-zinc-600 hover:text-red-400 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 md:p-8 max-w-5xl mx-auto">
          {/* Header */}
          <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <FolderOpen className="w-4 h-4 text-zinc-500" />
                <h1 className="text-2xl font-bold tracking-tight text-white">
                  {activePlan?.name ?? "Media Plan"}
                </h1>
                {activePlan && (
                  <button
                    onClick={() => { setRenamingId(activePlan.id); setRenameValue(activePlan.name); }}
                    className="p-1 text-zinc-600 hover:text-zinc-300 transition-colors"
                    title="Rename plan"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <p className="text-zinc-400 text-sm">
                {activeProject?.name
                  ? `Planning assets for "${activeProject.name}"`
                  : "Define and batch-generate your media assets."}
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {/* Mobile plan selector */}
              {plans.length > 1 && (
                <select
                  value={activePlanId ?? ""}
                  onChange={(e) => { setActivePlanId(e.target.value); setSelectedIds(new Set()); }}
                  className="lg:hidden bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              )}
              {/* Mobile new plan */}
              <button
                onClick={createNewPlan}
                className="lg:hidden flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-sm text-zinc-200 hover:bg-zinc-700 transition-colors"
              >
                <FolderOpen className="w-4 h-4" />
                New Plan
              </button>

              {/* W3: Export / Import */}
              <button
                id="export-plan-btn"
                onClick={exportPlan}
                disabled={!activePlan || activePlan.items.length === 0}
                title="Export plan as JSON"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 disabled:opacity-40 transition-colors"
              >
                <Download className="w-4 h-4" />
                Export
              </button>
              <label
                htmlFor="import-plan-input"
                title="Import plan from JSON"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 cursor-pointer transition-colors"
              >
                <Upload className="w-4 h-4" />
                Import
              </label>
              <input
                id="import-plan-input"
                ref={importFileRef}
                type="file"
                accept=".json,.gemlink-plan.json"
                className="hidden"
                onChange={handleImportFile}
              />

              {/* W2: Plan Templates */}
              <button
                id="plan-templates-btn"
                onClick={() => setShowTemplateModal(true)}
                title="Load a plan template"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
              >
                <LayoutTemplate className="w-4 h-4" />
                Templates
              </button>

              {/* W1: Add Item + Preset dropdown */}
              <div className="relative">
                <div className="flex items-stretch rounded-xl overflow-hidden border border-zinc-700 bg-zinc-800">
                  <button
                    onClick={addItem}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Add Item
                  </button>
                  <button
                    id="preset-menu-btn"
                    onClick={() => setShowPresetMenu((v) => !v)}
                    title="Add from preset"
                    className="flex items-center px-2 py-2 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700 border-l border-zinc-700 transition-colors"
                  >
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showPresetMenu ? "rotate-180" : ""}`} />
                  </button>
                </div>
                {showPresetMenu && (
                  <div className="absolute right-0 top-full mt-1 z-30 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl min-w-[200px] overflow-hidden">
                    <p className="px-3 py-2 text-[10px] uppercase tracking-widest text-zinc-500 border-b border-zinc-800">Quick Presets</p>
                    {ITEM_PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        onClick={() => addItemFromPreset(preset)}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left text-zinc-200 hover:bg-indigo-600/20 transition-colors"
                      >
                        {preset.type === "video" && <Video className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                        {preset.type === "voice" && <Mic className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                        {preset.type === "music" && <Music className="w-3.5 h-3.5 text-rose-400 shrink-0" />}
                        {preset.type === "image" && <ImageIcon className="w-3.5 h-3.5 text-indigo-400 shrink-0" />}
                        <span>{preset.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* Collect Approved button: visible when ≥1 approved item with outputs */}
              {approvedCount > 0 && (
                <button
                  onClick={handleCollectApproved}
                  disabled={collectingApproved}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-sm text-white font-medium transition-colors"
                  title={`Save ${approvedCount} approved item${approvedCount !== 1 ? "s" : ""} to a new collection`}
                >
                  {collectingApproved ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <FolderPlus className="w-4 h-4" />
                  )}
                  Collect Approved ({approvedCount})
                </button>
              )}
              {/* Lane 3 — Auto-Compose button: visible when ≥3 completed items */}
              {completedCount >= 3 && (
                <button
                  id="auto-compose-btn"
                  onClick={handleAutoCompose}
                  disabled={autoComposing}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-sm text-white font-medium transition-colors"
                  title={`Auto-group ${completedCount} completed items into compositions`}
                >
                  {autoComposing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Film className="w-4 h-4" />
                  )}
                  🎬 Auto-Compose ({completedCount})
                </button>
              )}
              <button
                onClick={() => draftCount > 0 && setShowPreview(true)}
                disabled={draftCount === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-sm text-white font-medium transition-colors"
              >
                <Eye className="w-4 h-4" />
                Preview & Generate ({draftCount})
              </button>
            </div>
          </div>

          {/* Progress overview bar */}
          {totalCount > 0 && (
            <div className="mb-6 bg-zinc-950 border border-zinc-800 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 className="w-4 h-4 text-zinc-400" />
                <span className="text-xs font-medium text-zinc-400 uppercase tracking-widest">Plan Progress</span>
                <span className="ml-auto text-xs text-zinc-500">{progressCount}/{totalCount} generated</span>
              </div>
              {/* Progress bar */}
              <div className="h-2 bg-zinc-800 rounded-full overflow-hidden mb-3">
                <div
                  className="h-full bg-gradient-to-r from-indigo-600 to-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: totalCount > 0 ? `${Math.round((progressCount / totalCount) * 100)}%` : "0%" }}
                />
              </div>
              {/* Status breakdown chips */}
              <div className="flex flex-wrap gap-2">
                {(["draft", "queued", "generating", "review", "approved", "rejected"] as const).map((s) => {
                  const n = activePlan?.items.filter((i) => i.status === s).length ?? 0;
                  if (n === 0) return null;
                  const colors: Record<string, string> = {
                    draft: "bg-zinc-700/40 text-zinc-400",
                    queued: "bg-amber-500/15 text-amber-300",
                    generating: "bg-indigo-500/15 text-indigo-300",
                    review: "bg-sky-500/15 text-sky-300",
                    approved: "bg-emerald-500/15 text-emerald-300",
                    rejected: "bg-red-500/15 text-red-300",
                  };
                  return (
                    <span key={s} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${colors[s]}`}>
                      {n} {s}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Natural language input */}
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6 mb-6">
            <label className="block text-sm font-medium text-zinc-300 mb-3">
              <Sparkles className="inline w-4 h-4 text-indigo-400 mr-1.5 relative -top-px" />
              Describe what media you need
            </label>
            <div className="flex gap-3 flex-wrap">
              <textarea
                value={naturalInput}
                onChange={(e) => setNaturalInput(e.target.value)}
                rows={2}
                placeholder='e.g. "I need assets for a SaaS product launch — website hero, 3 social posts, and a video intro"'
                className="flex-1 min-w-0 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
              <div className="self-start flex flex-col gap-2">
                <button
                  onClick={handleSuggest}
                  disabled={suggestLoading || boardroomLoading || !naturalInput.trim()}
                  className="px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium transition-colors flex items-center gap-2"
                >
                  {suggestLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Quick Plan
                </button>
                <button
                  onClick={handleBoardroomPlan}
                  disabled={suggestLoading || boardroomLoading || !naturalInput.trim()}
                  className="px-5 py-3 rounded-xl bg-violet-700 hover:bg-violet-600 border border-violet-500/30 disabled:opacity-50 text-white text-sm font-medium transition-colors flex items-center gap-2"
                  title="Open a Boardroom session to strategically plan your media assets — results come back to this plan"
                >
                  {boardroomLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
                  Boardroom Plan
                </button>
              </div>
            </div>
            {suggestLoading && (
              <div className="mt-4 space-y-2 animate-pulse">
                <p className="text-xs text-indigo-400 mb-2 flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  AI is planning your media…
                </p>
                {[90, 75, 82, 68, 55].map((w, i) => (
                  <div key={i} className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                    <div className="w-4 h-4 rounded bg-zinc-800" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 rounded bg-zinc-800" style={{ width: `${w}%` }} />
                      <div className="h-2 w-1/3 rounded bg-zinc-800/60" />
                    </div>
                    <div className="h-5 w-16 rounded-full bg-zinc-800" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Batch action bar */}
          {selectedIds.size > 0 && activePlan && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="sticky top-0 z-20 bg-zinc-900 border border-indigo-500/30 rounded-2xl p-3 mb-4 flex flex-wrap items-center gap-2"
            >
              <span className="text-sm font-medium text-indigo-300 mr-1">
                {selectedIds.size} selected
              </span>

              {/* Aspect Ratio */}
              <select
                value={batchAspectRatio}
                onChange={(e) => { setBatchAspectRatio(e.target.value); if (e.target.value) applyBatchConfig("aspectRatio", e.target.value); }}
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Set Aspect Ratio</option>
                {ASPECT_RATIOS.map((ar) => (
                  <option key={ar.value} value={ar.value}>{ar.label}</option>
                ))}
              </select>

              {/* Size */}
              <select
                value={batchSize}
                onChange={(e) => { setBatchSize(e.target.value); if (e.target.value) applyBatchConfig("size", e.target.value); }}
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Set Size</option>
                {SIZES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>

              {/* Model */}
              <select
                value={batchModel}
                onChange={(e) => { setBatchModel(e.target.value); if (e.target.value) applyBatchConfig("model", e.target.value); }}
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Set Model</option>
                {MODELS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>

              {/* Count */}
              <select
                value={batchCount}
                onChange={(e) => { setBatchCount(e.target.value); if (e.target.value) applyBatchConfig("count", parseInt(e.target.value)); }}
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Set Count</option>
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>{n} variant{n > 1 ? "s" : ""}</option>
                ))}
              </select>

              <button
                onClick={() => setShowBatchPromptModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs hover:bg-zinc-700 transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" /> Edit Prompts…
              </button>

              <button
                onClick={() => setSelectedIds(new Set())}
                className="ml-auto flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 text-xs transition-colors"
              >
                <X className="w-3.5 h-3.5" /> Clear
              </button>
            </motion.div>
          )}

          {/* Select all row + W4 filter bar */}
          {activePlan && activePlan.items.length > 0 && (
            <div className="flex items-center gap-2 mb-3 px-1 flex-wrap">
              <button
                onClick={selectAll}
                className="flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
              >
                {selectedIds.size === activePlan.items.length ? (
                  <SquareCheck className="w-4 h-4 text-indigo-400" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
                Select all
              </button>
              <span className="text-xs text-zinc-600">
                {activePlan.items.length} item{activePlan.items.length !== 1 ? "s" : ""}
                {" · "}{draftCount} draft
              </span>

              {/* W4: Filter bar */}
              <div className="ml-auto flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-zinc-600" />
                <select
                  id="filter-type-select"
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value as "" | MediaPlanItem["type"])}
                  className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">All types</option>
                  <option value="image">Image</option>
                  <option value="video">Video</option>
                  <option value="voice">Voice</option>
                  <option value="music">Music</option>
                </select>
                <select
                  id="filter-status-select"
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as "" | MediaPlanItem["status"])}
                  className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">All statuses</option>
                  {STATUS_ORDER.map((s) => (
                    <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                  ))}
                </select>
                {hasActiveFilter && (
                  <button
                    onClick={() => { setFilterType(""); setFilterStatus(""); }}
                    title="Clear filters"
                    className="text-zinc-600 hover:text-zinc-300 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}
          {/* Show filter summary when filters are active */}
          {hasActiveFilter && (
            <p className="text-xs text-indigo-400 mb-2 px-1">
              Showing {filteredItems.length} of {totalCount} items
              {filterType && ` · type: ${filterType}`}
              {filterStatus && ` · status: ${filterStatus}`}
            </p>
          )}

          {/* Plan items */}
          {!activePlan || activePlan.items.length === 0 ? (
            <div className="text-center py-16 bg-zinc-950 border border-zinc-800 rounded-2xl text-zinc-500">
              <ListOrdered className="w-12 h-12 mx-auto mb-4 opacity-40" />
              <p className="text-lg font-medium text-white mb-2">No plan items yet</p>
              <p className="text-sm">Describe your media needs above or click "Add Item".</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-12 bg-zinc-950 border border-zinc-800 rounded-2xl text-zinc-500">
              <Filter className="w-8 h-8 mx-auto mb-3 opacity-40" />
              <p className="text-sm font-medium text-zinc-400">No items match the current filters.</p>
              <button
                onClick={() => { setFilterType(""); setFilterStatus(""); }}
                className="mt-2 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >Clear filters</button>
            </div>
          ) : (
            <Reorder.Group
              axis="y"
              values={activePlan.items}
              onReorder={(items) => saveItems(activePlan.id, items)}
              className="space-y-3"
            >
              {filteredItems.map((item) => (
                <Reorder.Item key={item.id} value={item}>
                  <motion.div layout className={`bg-zinc-950 border rounded-2xl overflow-hidden transition-colors ${selectedIds.has(item.id) ? "border-indigo-500/40" : "border-zinc-800"}`}>
                    {/* Item header row */}
                    <div className="flex items-center gap-3 px-4 py-4">
                      <button onClick={() => toggleSelect(item.id)} className="shrink-0 text-zinc-600 hover:text-indigo-400 transition-colors">
                        {selectedIds.has(item.id) ? (
                          <SquareCheck className="w-4 h-4 text-indigo-400" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                      <GripVertical className="w-4 h-4 text-zinc-600 cursor-grab shrink-0" />
                      {typeIcon(item.type)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-white truncate">{item.label}</span>
                          {statusPill(item.status, item.error)}
                          {/* W5: per-item estimated time badge */}
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-zinc-500 bg-zinc-800/60 border border-zinc-700/50"
                            title={`Estimated generation time for this ${item.type}`}
                          >
                            <Timer className="w-2.5 h-2.5" />
                            {itemTimeBadge(item.type)}
                          </span>
                        </div>
                        {item.purpose && (
                          <p className="text-xs text-zinc-500 mt-0.5 truncate">{item.purpose}</p>
                        )}
                      </div>
                      {/* Config toggle */}
                      <button
                        onClick={() => setConfigExpandedId(configExpandedId === item.id ? null : item.id)}
                        title="Generation settings"
                        className="text-zinc-500 hover:text-zinc-200 transition-colors"
                      >
                        <Settings2 className="w-4 h-4" />
                      </button>
                      {/* Duplicate item */}
                      <button
                        onClick={() => duplicateItem(item.id)}
                        title="Duplicate item"
                        className="text-zinc-600 hover:text-zinc-300 transition-colors"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      {/* Re-draft on rejected */}
                      {item.status === "rejected" && (
                        <button
                          onClick={() => patchItem(item.id, { status: "draft", error: undefined })}
                          title="Reset to draft so you can edit and re-queue"
                          className="text-red-400 hover:text-amber-300 transition-colors"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                      )}
                      {/* Generate single item */}
                      {(item.status === "draft" || item.status === "rejected") && (
                        <button
                          onClick={() => handleGenerateSingle(item.id)}
                          disabled={generatingSingleId === item.id}
                          title="Generate this item only"
                          className="text-zinc-600 hover:text-emerald-400 disabled:opacity-50 transition-colors"
                        >
                          {generatingSingleId === item.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Play className="w-4 h-4" />
                          )}
                        </button>
                      )}
                      <button
                        onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                        className="text-zinc-500 hover:text-zinc-200 transition-colors"
                      >
                        <ChevronDown className={`w-4 h-4 transition-transform ${expandedId === item.id ? "rotate-180" : ""}`} />
                      </button>
                      <button
                        onClick={() => removeItem(item.id)}
                        className="text-zinc-600 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Generation config panel */}
                    <AnimatePresence>
                      {configExpandedId === item.id && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="border-t border-zinc-800/60 overflow-hidden"
                        >
                          <div className="p-4 bg-zinc-900/40">
                            <p className="text-xs text-indigo-400 font-medium mb-3 flex items-center gap-1.5">
                              <Settings2 className="w-3.5 h-3.5" /> Generation Settings
                            </p>
                            {item.type === "voice" ? (
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div>
                                  <label className="block text-xs text-zinc-500 mb-1">Voice</label>
                                  <select
                                    value={item.generationConfig.voice || "Kore"}
                                    onChange={(e) => patchItemConfig(item.id, { voice: e.target.value })}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                  >
                                    {["Puck", "Charon", "Kore", "Fenrir", "Zephyr"].map((v) => (
                                      <option key={v} value={v}>{v}</option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-xs text-zinc-500 mb-1">Variants</label>
                                  <select
                                    value={item.generationConfig.count}
                                    onChange={(e) => patchItemConfig(item.id, { count: parseInt(e.target.value) })}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                  >
                                    {[1, 2, 3, 4].map((n) => (
                                      <option key={n} value={n}>{n}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            ) : item.type === "music" ? (
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-xs text-zinc-500 mb-1">Duration (seconds)</label>
                                  <input
                                    type="number"
                                    min={5} max={120} step={5}
                                    value={item.generationConfig.duration || 30}
                                    onChange={(e) => patchItemConfig(item.id, { duration: parseInt(e.target.value) || 30 })}
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                  />
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                  {/* Model */}
                                  <div>
                                    <label className="block text-xs text-zinc-500 mb-1">Model</label>
                                    <select
                                      value={item.type === "video" && (!item.generationConfig.model || !item.generationConfig.model.includes("veo")) ? (import.meta.env.VITE_MODEL_VIDEO || "veo-3.1-generate-preview") : item.generationConfig.model}
                                      onChange={(e) => patchItemConfig(item.id, { model: e.target.value })}
                                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    >
                                      {MODELS.filter(m => item.type === "video" ? m.value.includes("veo") : !m.value.includes("veo") && !m.value.includes("tts")).map((m) => (
                                        <option key={m.value} value={m.value}>{m.label}</option>
                                      ))}
                                    </select>
                                  </div>
                                  {/* Size / Resolution */}
                                  <div>
                                    <label className="block text-xs text-zinc-500 mb-1">{item.type === "video" ? "Resolution" : "Size"}</label>
                                    <select
                                      value={item.type === "video" && !["720p","1080p"].includes(item.generationConfig.size) ? "1080p" : item.generationConfig.size}
                                      onChange={(e) => patchItemConfig(item.id, { size: e.target.value })}
                                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    >
                                      {(item.type === "video" ? [{value: "1080p", label: "1080p"}, {value: "720p", label: "720p"}] : SIZES).map((s) => (
                                        <option key={s.value} value={s.value}>{s.label}</option>
                                      ))}
                                    </select>
                                  </div>
                                  {/* Aspect Ratio */}
                                  <div>
                                    <label className="block text-xs text-zinc-500 mb-1">Aspect Ratio</label>
                                    <select
                                      value={
                                        item.type === "video" && !VIDEO_ASPECT_RATIOS.some((ar) => ar.value === item.generationConfig.aspectRatio)
                                          ? "16:9"
                                          : item.generationConfig.aspectRatio
                                      }
                                      onChange={(e) => patchItemConfig(item.id, { aspectRatio: e.target.value })}
                                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    >
                                      {(item.type === "video" ? VIDEO_ASPECT_RATIOS : ASPECT_RATIOS).map((ar) => (
                                        <option key={ar.value} value={ar.value}>{ar.label}</option>
                                      ))}
                                    </select>
                                  </div>
                                  {/* Count */}
                                  <div>
                                    <label className="block text-xs text-zinc-500 mb-1">Variants</label>
                                    <select
                                      value={item.generationConfig.count}
                                      onChange={(e) => patchItemConfig(item.id, { count: parseInt(e.target.value) })}
                                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    >
                                      {[1, 2, 3, 4].map((n) => (
                                        <option key={n} value={n}>{n}</option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                                {/* Negative prompt */}
                                <div className="mt-3">
                                  <label className="block text-xs text-zinc-500 mb-1">Negative Prompt</label>
                                  <input
                                    value={item.generationConfig.negativePrompt}
                                    onChange={(e) => patchItemConfig(item.id, { negativePrompt: e.target.value })}
                                    placeholder="e.g. no text, no watermarks, no blurry…"
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                  />
                                </div>
                              </>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Item edit panel */}
                    <AnimatePresence>
                      {expandedId === item.id && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="border-t border-zinc-800 overflow-hidden"
                        >
                          <div className="p-4 space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                              <div>
                                <label className="block text-xs text-zinc-400 mb-1.5">Label</label>
                                <input
                                  value={item.label}
                                  onChange={(e) => patchItem(item.id, { label: e.target.value })}
                                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-zinc-400 mb-1.5">Type</label>
                                <select
                                  value={item.type}
                                  onChange={(e) => {
                                    const newType = e.target.value as MediaPlanItem["type"];
                                    // Reset generationConfig to type-appropriate defaults when type changes
                                    patchItem(item.id, { type: newType, generationConfig: defaultConfig(newType) });
                                  }}
                                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                  <option value="image">Image</option>
                                  <option value="video">Video</option>
                                  <option value="voice">Voice</option>
                                  <option value="music">Music</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs text-zinc-400 mb-1.5">Status</label>
                                <select
                                  value={item.status}
                                  onChange={(e) => patchItem(item.id, { status: e.target.value as MediaPlanItem["status"] })}
                                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                  {STATUS_ORDER.map((s) => (
                                    <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs text-zinc-400 mb-1.5">Purpose</label>
                              <input
                                value={item.purpose}
                                onChange={(e) => patchItem(item.id, { purpose: e.target.value })}
                                placeholder="e.g. Website hero, Instagram post, Pitch deck slide"
                                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-zinc-400 mb-1.5">
                                {item.type === "voice" ? "Voiceover Script" : item.type === "music" ? "Music Description" : "Prompt / Template"}
                              </label>
                              <textarea
                                value={item.promptTemplate}
                                onChange={(e) => patchItem(item.id, { promptTemplate: e.target.value })}
                                rows={3}
                                placeholder={
                                  item.type === "voice" ? "The text to be spoken as a voiceover…"
                                  : item.type === "music" ? "Describe the mood, genre, and feel of the music…"
                                  : "The actual generation prompt for this asset…"
                                }
                                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                              />
                            </div>

                            {/* Type-specific config */}
                            {item.type === "voice" && (
                              <div>
                                <label className="block text-xs text-zinc-400 mb-1.5">Voice</label>
                                <select
                                  value={item.generationConfig.voice || "Kore"}
                                  onChange={(e) => patchItem(item.id, { generationConfig: { ...item.generationConfig, voice: e.target.value } })}
                                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                  {["Kore", "Puck", "Charon", "Fenrir", "Zephyr", "Aoede", "Leda", "Orus", "Perseus"].map((v) => (
                                    <option key={v} value={v}>{v}</option>
                                  ))}
                                </select>
                              </div>
                            )}
                            {item.type === "music" && (
                              <div>
                                <label className="block text-xs text-zinc-400 mb-1.5">
                                  Duration: {item.generationConfig.duration || 30}s
                                </label>
                                <input
                                  type="range"
                                  min={5}
                                  max={120}
                                  step={5}
                                  value={item.generationConfig.duration || 30}
                                  onChange={(e) => patchItem(item.id, { generationConfig: { ...item.generationConfig, duration: Number(e.target.value) } })}
                                  className="w-full accent-indigo-500"
                                />
                                <div className="flex justify-between text-[10px] text-zinc-700 mt-0.5">
                                  <span>5s</span>
                                  <span>120s</span>
                                </div>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                </Reorder.Item>
              ))}
            </Reorder.Group>
          )}

          {activePlan && activePlan.items.length > 0 && (
            <div className="mt-6 flex items-center justify-between text-sm text-zinc-500 px-1">
              <span>{activePlan.items.length} items · {draftCount} draft</span>
              <button
                onClick={() => saveItems(activePlan.id, [])}
                className="text-red-400 hover:text-red-300 transition-colors flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />Clear plan
              </button>
            </div>
          )}
        </div>
      </div>

      {/* W2: Plan Templates Modal — Added by Lane 3 */}
      <AnimatePresence>
        {showTemplateModal && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
                <div className="flex items-center gap-2">
                  <LayoutTemplate className="w-5 h-5 text-indigo-400" />
                  <h2 className="text-lg font-semibold text-white">Plan Templates</h2>
                </div>
                <button onClick={() => setShowTemplateModal(false)} className="text-zinc-500 hover:text-zinc-200 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-5 space-y-3">
                <p className="text-sm text-zinc-400 mb-4">Choose a template to pre-populate your plan with a curated set of items.</p>
                {PLAN_TEMPLATES.map((tpl) => (
                  <div key={tpl.name} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-600 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-white">{tpl.name}</p>
                        <p className="text-xs text-zinc-400 mt-0.5">{tpl.description}</p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {tpl.items.map((it, idx) => (
                            <span key={idx} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-400">
                              {it.type === "image" && <ImageIcon className="w-2.5 h-2.5" />}
                              {it.type === "video" && <Video className="w-2.5 h-2.5" />}
                              {it.type === "voice" && <Mic className="w-2.5 h-2.5" />}
                              {it.type === "music" && <Music className="w-2.5 h-2.5" />}
                              {it.label}
                            </span>
                          ))}
                        </div>
                      </div>
                      <button
                        onClick={() => loadPlanTemplate(tpl)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium transition-colors shrink-0"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                        Use Template
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-6 py-4 border-t border-zinc-800 shrink-0">
                <button
                  onClick={() => setShowTemplateModal(false)}
                  className="w-full px-4 py-2.5 rounded-xl border border-zinc-700 text-zinc-300 text-sm hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Close preset menu on outside click — Added by Lane 3 */}
      {showPresetMenu && (
        <div className="fixed inset-0 z-20" onClick={() => setShowPresetMenu(false)} />
      )}

      {/* Generation Preview Modal */}
      <AnimatePresence>
        {showPreview && activePlan && (
          <GenerationPreviewModal
            plan={activePlan}
            onClose={() => setShowPreview(false)}
            onStart={handleGenerateAll}
          />
        )}
      </AnimatePresence>

      {/* Batch Prompt Edit Modal */}
      <AnimatePresence>
        {showBatchPromptModal && (
          <BatchPromptModal
            onClose={() => setShowBatchPromptModal(false)}
            onApply={applyBatchPrompt}
          />
        )}
      </AnimatePresence>

      {/* Auto-Compose Results Modal (Lane 3) */}
      <AnimatePresence>
        {showAutoCompose && autoComposeResults && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-xl max-h-[80vh] flex flex-col"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
                <div className="flex items-center gap-2">
                  <Film className="w-5 h-5 text-violet-400" />
                  <h2 className="text-lg font-semibold text-white">Auto-Compose Groups</h2>
                </div>
                <button onClick={() => setShowAutoCompose(false)} className="text-zinc-500 hover:text-zinc-200 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-3">
                <p className="text-sm text-zinc-400 mb-4">
                  Your completed items have been grouped into{" "}
                  <span className="text-white font-medium">{autoComposeResults.compositions.length} composition{autoComposeResults.compositions.length !== 1 ? "s" : ""}</span>.
                  Review groups below, then click Compose All to open the Compose editor.
                </p>

                {autoComposeResults.compositions.map((comp, idx) => (
                  <div
                    key={idx}
                    className="bg-zinc-900 border border-zinc-800 rounded-xl p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-white">{comp.title}</p>
                        <p className="text-xs text-zinc-400 mt-0.5">
                          Template: <span className="text-violet-300">{comp.template?.name ?? comp.template?.id ?? "Default"}</span>
                          {" · "}{comp.template?.aspectRatio}
                        </p>
                        <p className="text-xs text-zinc-500 mt-1">
                          {comp.slideCount} slide{comp.slideCount !== 1 ? "s" : ""}
                          {comp.voiceJobId && " · voiceover matched"}
                          {comp.captionText && ` · ${String(comp.captionText).slice(0, 40)}…`}
                        </p>
                      </div>
                      <Layers className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-3 px-5 py-4 border-t border-zinc-800 shrink-0">
                <button
                  onClick={() => setShowAutoCompose(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-zinc-700 text-zinc-300 text-sm hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    // Store compositions in sessionStorage so Compose page can load them
                    sessionStorage.setItem(
                      "auto-compose-groups",
                      JSON.stringify(autoComposeResults.compositions)
                    );
                    setShowAutoCompose(false);
                    navigate("/compose");
                  }}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors"
                >
                  <Film className="w-4 h-4" />
                  Compose All
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

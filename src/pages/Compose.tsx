import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Clapperboard,
  Film,
  Layers,
  Captions,
  ChevronLeft,
  ChevronRight,
  Play,
  Loader2,
  Video as VideoIcon,
  Music,
  Mic,
  MonitorPlay,
  AlertTriangle,
  CheckCircle2,
  WifiOff,
} from "lucide-react";
import { useProject } from "../context/ProjectContext";
import { useToast } from "../context/ToastContext";
import MediaPickerPanel, { type MediaJob } from "../components/MediaPickerPanel";
import SlideTimeline, { type Slide } from "../components/SlideTimeline";
import CaptionEditor, {
  type CaptionConfig,
  DEFAULT_CAPTION_CONFIG,
} from "../components/CaptionEditor";
import ComposePreview from "../components/ComposePreview";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ComposeMode = "slideshow" | "merge" | "captions";

export interface OutputConfig {
  aspectRatio: "9:16" | "16:9" | "1:1" | "4:5";
  resolution: "720p" | "1080p";
  fps: number;
}

export interface ComposeProject {
  mode: ComposeMode;
  title: string;
  slides: Slide[];
  voiceJobId?: string;
  videoJobId?: string;
  audioJobId?: string;
  captionConfig?: CaptionConfig;
  outputConfig: OutputConfig;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function genId(): string {
  return `slide_${Math.random().toString(36).slice(2, 10)}`;
}

function defaultProject(): ComposeProject {
  return {
    mode: "slideshow",
    title: "Untitled Composition",
    slides: [],
    outputConfig: {
      aspectRatio: "16:9",
      resolution: "720p",
      fps: 30,
    },
  };
}

function jobToSlide(job: MediaJob): Slide {
  const thumb = job.outputs?.[0] ?? job.outputPath ?? null;
  return {
    id: genId(),
    jobId: job.id,
    thumbnail: job.type === "image" ? (thumb ?? null) : null,
    jobType: job.type,
    duration: 3,
    transition: "fade",
    kenBurns: false,
  };
}

// ─── Mode tabs config ─────────────────────────────────────────────────────────

const MODE_TABS: { key: ComposeMode; label: string; icon: React.ReactNode }[] = [
  { key: "slideshow", label: "Slideshow", icon: <Film className="w-4 h-4" /> },
  { key: "merge",     label: "Merge",     icon: <Layers className="w-4 h-4" /> },
  { key: "captions",  label: "Captions Only", icon: <Captions className="w-4 h-4" /> },
];

const ASPECT_RATIOS: { value: OutputConfig["aspectRatio"]; label: string }[] = [
  { value: "9:16",  label: "9:16 Reels" },
  { value: "16:9",  label: "16:9 Wide" },
  { value: "1:1",   label: "1:1 Square" },
  { value: "4:5",   label: "4:5 Portrait" },
];

// ─── Drop zone component ──────────────────────────────────────────────────────

function DropZone({
  label,
  description,
  icon,
  selectedJobId,
  onSelect,
}: {
  label: string;
  description: string;
  icon: React.ReactNode;
  selectedJobId?: string;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-2xl p-8 text-center transition-all w-full ${
        selectedJobId
          ? "border-indigo-500/50 bg-indigo-500/5 text-indigo-300"
          : "border-zinc-700 hover:border-zinc-500 text-zinc-500"
      }`}
    >
      <div className={`p-4 rounded-2xl ${selectedJobId ? "bg-indigo-600/20" : "bg-zinc-800"}`}>
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold text-white">{label}</p>
        <p className="text-xs mt-1 opacity-70">{description}</p>
        {selectedJobId && (
          <p className="text-xs mt-2 text-indigo-300 flex items-center gap-1 justify-center">
            <CheckCircle2 className="w-3 h-3" />
            Selected
          </p>
        )}
      </div>
    </button>
  );
}

// ─── Main Compose page ────────────────────────────────────────────────────────

export default function Compose() {
  const { activeProject } = useProject();
  const { toast } = useToast();

  const storageKey = `gemlink-compose-${activeProject?.id ?? "default"}`;

  // ── State ─────────────────────────────────────────────────────────────────

  const [project, setProject] = useState<ComposeProject>(defaultProject);
  const [panelOpen, setPanelOpen] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [renderJobId, setRenderJobId] = useState<string | null>(null);

  // For merge/captions drop zone pickers
  const [pickerTarget, setPickerTarget] = useState<
    "slide" | "voice" | "video" | "audio" | null
  >(null);

  // ── Persistence ──────────────────────────────────────────────────────────

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as ComposeProject;
        setProject(parsed);
      }
    } catch { /* ignore */ }
  }, [storageKey]);

  const saveProject = useCallback(
    (next: ComposeProject) => {
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ }
    },
    [storageKey]
  );

  function patch(partial: Partial<ComposeProject>) {
    const next = { ...project, ...partial };
    setProject(next);
    saveProject(next);
  }

  // ── Slide operations ──────────────────────────────────────────────────────

  function addSlideFromJob(job: MediaJob) {
    const slide = jobToSlide(job);
    const next = { ...project, slides: [...project.slides, slide] };
    setProject(next);
    saveProject(next);
    setPickerTarget(null);
    toast(`Added slide from ${job.type} job.`, "success");
  }

  function handleMediaSelect(job: MediaJob) {
    if (pickerTarget === "slide" || project.mode === "slideshow") {
      addSlideFromJob(job);
    } else if (pickerTarget === "voice") {
      patch({ voiceJobId: job.id });
      toast("Voiceover selected.", "success");
      setPickerTarget(null);
    } else if (pickerTarget === "video") {
      patch({ videoJobId: job.id });
      toast("Video selected.", "success");
      setPickerTarget(null);
    } else if (pickerTarget === "audio") {
      patch({ audioJobId: job.id });
      toast("Audio selected.", "success");
      setPickerTarget(null);
    }
  }

  function reorderSlides(slides: Slide[]) {
    patch({ slides });
  }

  function updateSlide(id: string, p: Partial<Slide>) {
    patch({
      slides: project.slides.map((s) => (s.id === id ? { ...s, ...p } : s)),
    });
  }

  function deleteSlide(id: string) {
    patch({ slides: project.slides.filter((s) => s.id !== id) });
    toast("Slide removed.", "info");
  }

  // ── Render ────────────────────────────────────────────────────────────────

  async function handleRender() {
    setRendering(true);
    setRenderJobId(null);

    // Build the request body following the ComposeRequest API spec in editor.md
    const body: Record<string, unknown> = {
      type: project.mode === "captions" ? "caption" : project.mode,
      output: {
        aspectRatio: project.outputConfig.aspectRatio,
        resolution: project.outputConfig.resolution,
        fps: project.outputConfig.fps,
      },
      projectId: activeProject?.id,
      title: project.title,
    };

    if (project.mode === "slideshow") {
      body.slides = project.slides.map((s) => ({
        jobId: s.jobId,
        duration: s.duration,
        transition: s.transition,
        kenBurns: s.kenBurns,
        textOverlay: s.textOverlay,
      }));
      if (project.voiceJobId) body.voiceJobId = project.voiceJobId;
    } else if (project.mode === "merge") {
      body.videoJobId = project.videoJobId;
      body.audioJobId = project.audioJobId ?? project.voiceJobId;
    } else {
      body.videoJobId = project.videoJobId;
    }

    if (project.captionConfig?.text) {
      body.captions = {
        text: project.captionConfig.text,
        style: project.captionConfig.style,
        fontSize: project.captionConfig.fontSize,
        color: project.captionConfig.color,
        position: project.captionConfig.position,
      };
    }

    try {
      const res = await fetch("/api/media/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.status === 503) {
        toast("Render engine not ready — FFmpeg may not be installed on the server.", "warning");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      setRenderJobId(data.composeId ?? data.jobId ?? "unknown");
      toast("🎬 Render started! Check the Library when done.", "success");
    } catch {
      toast("Render endpoint not yet live. Build the compose engine in Lane 1.", "info");
    } finally {
      setRendering(false);
    }
  }

  // ── Render UI ─────────────────────────────────────────────────────────────

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex h-full overflow-hidden"
    >
      {/* ── Left: Media Picker Panel ─────────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {panelOpen && (
          <motion.aside
            key="picker-panel"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 220, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="shrink-0 overflow-hidden border-r border-zinc-800"
            style={{ width: 220 }}
          >
            <MediaPickerPanel
              onSelect={handleMediaSelect}
              projectId={activeProject?.id}
              className="h-full"
            />
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Toggle panel button */}
      <button
        onClick={() => setPanelOpen((p) => !p)}
        className="shrink-0 flex items-center justify-center w-5 bg-zinc-900 hover:bg-zinc-800 border-r border-zinc-800 text-zinc-600 hover:text-zinc-300 transition-colors"
        title={panelOpen ? "Collapse media panel" : "Expand media panel"}
      >
        {panelOpen ? (
          <ChevronLeft className="w-3.5 h-3.5" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5" />
        )}
      </button>

      {/* ── Main editor area ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="shrink-0 px-4 py-3 border-b border-zinc-800 flex items-center gap-3 flex-wrap">
          <Clapperboard className="w-5 h-5 text-indigo-400 shrink-0" />
          <input
            type="text"
            value={project.title}
            onChange={(e) => patch({ title: e.target.value })}
            className="text-lg font-semibold bg-transparent text-white focus:outline-none placeholder-zinc-600 min-w-0 flex-1"
            placeholder="Composition title…"
          />

          {/* Mode tabs */}
          <div className="flex border border-zinc-800 rounded-xl overflow-hidden bg-zinc-900 shrink-0">
            {MODE_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => patch({ mode: tab.key })}
                className={`flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors ${
                  project.mode === tab.key
                    ? "bg-indigo-600 text-white"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                }`}
              >
                {tab.icon}
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable editor */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* ── SLIDESHOW mode ──────────────────────────────────────────── */}
          {project.mode === "slideshow" && (
            <>
              {/* Slide timeline */}
              <section className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Film className="w-4 h-4 text-indigo-400" />
                    Slide Storyboard
                  </h2>
                  <span className="text-xs text-zinc-500">
                    {project.slides.length} slide{project.slides.length !== 1 ? "s" : ""} ·{" "}
                    {project.slides.reduce((s, sl) => s + sl.duration, 0).toFixed(1)}s
                  </span>
                </div>
                <SlideTimeline
                  slides={project.slides}
                  onReorder={reorderSlides}
                  onUpdateSlide={updateSlide}
                  onDeleteSlide={deleteSlide}
                  onAddSlide={() => setPickerTarget("slide")}
                />
              </section>

              {/* Voiceover picker */}
              <section className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Mic className="w-4 h-4 text-amber-400" />
                    Voiceover
                  </h2>
                  {project.voiceJobId && (
                    <button
                      onClick={() => patch({ voiceJobId: undefined })}
                      className="text-xs text-zinc-500 hover:text-red-400 transition-colors"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <DropZone
                  label="Add Voiceover"
                  description="Click to select a voice job from your library"
                  icon={<Mic className="w-8 h-8" />}
                  selectedJobId={project.voiceJobId}
                  onSelect={() => setPickerTarget("voice")}
                />
              </section>

              {/* Caption editor */}
              <CaptionEditor
                value={project.captionConfig ?? DEFAULT_CAPTION_CONFIG}
                onChange={(cfg) => patch({ captionConfig: cfg })}
              />
            </>
          )}

          {/* ── MERGE mode ──────────────────────────────────────────────── */}
          {project.mode === "merge" && (
            <section className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 space-y-4">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-400" />
                Merge Video + Audio
              </h2>
              <p className="text-xs text-zinc-500">
                Combine a generated video clip with a voiceover / audio track using FFmpeg.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <DropZone
                  label="Video Clip"
                  description="Select a video from your library"
                  icon={<VideoIcon className="w-8 h-8" />}
                  selectedJobId={project.videoJobId}
                  onSelect={() => setPickerTarget("video")}
                />
                <DropZone
                  label="Audio / Voiceover"
                  description="Select a voice or music job"
                  icon={<Music className="w-8 h-8" />}
                  selectedJobId={project.audioJobId ?? project.voiceJobId}
                  onSelect={() => setPickerTarget("audio")}
                />
              </div>
            </section>
          )}

          {/* ── CAPTIONS mode ────────────────────────────────────────────── */}
          {project.mode === "captions" && (
            <>
              <section className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 space-y-4">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <VideoIcon className="w-4 h-4 text-indigo-400" />
                  Source Video
                </h2>
                <DropZone
                  label="Video Clip"
                  description="Select a video to burn captions onto"
                  icon={<VideoIcon className="w-8 h-8" />}
                  selectedJobId={project.videoJobId}
                  onSelect={() => setPickerTarget("video")}
                />
              </section>
              <CaptionEditor
                value={project.captionConfig ?? DEFAULT_CAPTION_CONFIG}
                onChange={(cfg) => patch({ captionConfig: cfg })}
              />
            </>
          )}

          {/* Picker instruction banner */}
          <AnimatePresence>
            {pickerTarget && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex items-center gap-3 bg-indigo-600/15 border border-indigo-500/30 rounded-2xl px-4 py-3"
              >
                <MonitorPlay className="w-5 h-5 text-indigo-400 shrink-0" />
                <p className="text-sm text-indigo-200">
                  Click a media item in the left panel to select it
                  {pickerTarget === "slide" ? " as a slide" : ` as ${pickerTarget}`}.
                </p>
                <button
                  onClick={() => setPickerTarget(null)}
                  className="ml-auto text-zinc-500 hover:text-white text-xs transition-colors"
                >
                  Cancel
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Render success banner */}
          <AnimatePresence>
            {renderJobId && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-3 bg-emerald-600/10 border border-emerald-500/30 rounded-2xl px-4 py-3"
              >
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <p className="text-sm text-emerald-200">
                  Render started! Job ID: <code className="font-mono text-xs">{renderJobId}</code>
                  . Check the Library for output.
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Preview section */}
          {project.mode === "slideshow" && project.slides.length > 0 && (
            <div>
              <button
                onClick={() => setShowPreview((p) => !p)}
                className="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 transition-colors mb-3"
              >
                <Play className="w-4 h-4" />
                {showPreview ? "Hide Preview" : "Show Preview"}
              </button>
              <AnimatePresence>
                {showPreview && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <ComposePreview project={project} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* ── Bottom bar ───────────────────────────────────────────────── */}
        <div className="shrink-0 border-t border-zinc-800 bg-zinc-950 px-4 py-3 flex items-center gap-3 flex-wrap">
          {/* Aspect ratio */}
          <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
            {ASPECT_RATIOS.map((ar) => (
              <button
                key={ar.value}
                onClick={() =>
                  patch({
                    outputConfig: { ...project.outputConfig, aspectRatio: ar.value },
                  })
                }
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  project.outputConfig.aspectRatio === ar.value
                    ? "bg-indigo-600 text-white"
                    : "text-zinc-500 hover:text-white hover:bg-zinc-800"
                }`}
              >
                {ar.label}
              </button>
            ))}
          </div>

          {/* Resolution */}
          <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
            {(["720p", "1080p"] as const).map((res) => (
              <button
                key={res}
                onClick={() =>
                  patch({
                    outputConfig: { ...project.outputConfig, resolution: res },
                  })
                }
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  project.outputConfig.resolution === res
                    ? "bg-indigo-600 text-white"
                    : "text-zinc-500 hover:text-white hover:bg-zinc-800"
                }`}
              >
                {res}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2">
            {/* Preview button */}
            {project.mode === "slideshow" && (
              <button
                onClick={() => setShowPreview((p) => !p)}
                disabled={project.slides.length === 0}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-700 text-zinc-300 text-sm font-medium hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Play className="w-4 h-4" />
                Preview
              </button>
            )}

            {/* Render button */}
            <button
              onClick={handleRender}
              disabled={rendering || (project.mode === "slideshow" && project.slides.length === 0)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors shadow-lg shadow-indigo-500/20"
            >
              {rendering ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Clapperboard className="w-4 h-4" />
              )}
              {rendering ? "Rendering…" : "🎬 Render"}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

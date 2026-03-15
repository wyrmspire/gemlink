import { useState, useEffect, useCallback, useRef } from "react";

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
  RefreshCw,
  Trash2,
  RotateCcw,
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
  musicJobId?: string;
  voiceVolume?: number;
  musicVolume?: number;
  videoJobId?: string;
  audioJobId?: string;
  trimPoints?: { start?: number; end?: number };
  watermarkJobId?: string;
  watermarkOpacity?: number;
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

// ── Confirm clear modal (W4 Lane 5) ─────────────────────────────────────────────

function ConfirmClearModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 rounded-xl bg-red-500/15 text-red-400">
            <Trash2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">Start Fresh?</h2>
            <p className="text-xs text-zinc-400">This will clear all slides, audio, and settings.</p>
          </div>
        </div>
        <p className="text-sm text-zinc-400 mb-6">
          Your current composition cannot be recovered after clearing. Are you sure you want to start over?
        </p>
        <div className="flex gap-3">
          <button
            onClick={onConfirm}
            className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
          >
            <RotateCcw className="w-4 h-4" />
            Clear Everything
          </button>
          <button
            onClick={onCancel}
            className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium py-2.5 rounded-xl transition-colors text-sm"
          >
            Keep Working
          </button>
        </div>
      </motion.div>
    </div>
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
  const [showClearModal, setShowClearModal] = useState(false);  // W4 Lane5

  // For merge/captions drop zone pickers
  const [pickerTarget, setPickerTarget] = useState<
    "slide" | "voice" | "video" | "audio" | "music" | "watermark" | null
  >(null);

  // ── Audio preview URLs (W2) ──────────────────────────────────────────────
  // Map from jobId → resolved audio URL (output[0] from history)
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});
  const fetchedAudioIds = useRef<Set<string>>(new Set());

  const resolveAudioUrl = useCallback(async (jobId: string) => {
    if (fetchedAudioIds.current.has(jobId)) return;
    fetchedAudioIds.current.add(jobId);
    try {
      const res = await fetch("/api/media/history", { cache: "no-store" });
      if (!res.ok) return;
      const jobs: MediaJob[] = await res.json();
      const job = jobs.find((j) => j.id === jobId);
      const url = job?.outputs?.[0] ?? job?.outputPath;
      if (url) setAudioUrls((prev) => ({ ...prev, [jobId]: url }));
    } catch {
      console.error("[compose] Failed to resolve audio URL for job", jobId);
    }
  }, []);

  // Resolve URLs whenever voice/music jobIds change
  useEffect(() => {
    if (project.voiceJobId) resolveAudioUrl(project.voiceJobId);
  }, [project.voiceJobId, resolveAudioUrl]);

  useEffect(() => {
    if (project.musicJobId) resolveAudioUrl(project.musicJobId);
  }, [project.musicJobId, resolveAudioUrl]);

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

  // ── W3: Read "Send to Compose" from sessionStorage on mount ───────────────
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("compose-send-item");
      if (!raw) return;
      sessionStorage.removeItem("compose-send-item");
      const job = JSON.parse(raw) as MediaJob;
      // Route by type
      if (job.type === "voice") {
        patch({ voiceJobId: job.id });
        toast("Voiceover added from Library.", "success");
      } else if (job.type === "music") {
        patch({ musicJobId: job.id });
        toast("Background music added from Library.", "success");
      } else {
        // image or video → add as slide
        const slide = jobToSlide(job);
        setProject((prev) => {
          const next = { ...prev, slides: [...prev.slides, slide] };
          saveProject(next);
          return next;
        });
        toast(`${job.type === "video" ? "Video" : "Image"} added as slide from Library.`, "success");
      }
    } catch {
      console.error("[compose] Failed to read compose-send-item from sessionStorage");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    } else if (pickerTarget === "music") {
      patch({ musicJobId: job.id });
      toast("Background music selected.", "success");
      setPickerTarget(null);
    } else if (pickerTarget === "watermark") {
      patch({ watermarkJobId: job.id });
      toast("Watermark selected.", "success");
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

  function duplicateSlide(id: string) {
    const idx = project.slides.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const clone = { ...project.slides[idx], id: `slide_${Math.random().toString(36).slice(2, 10)}` };
    const next = [...project.slides];
    next.splice(idx + 1, 0, clone);
    patch({ slides: next });
    toast("Slide duplicated.", "success");
  }

  function setAllDurations(duration: number) {
    patch({ slides: project.slides.map((s) => ({ ...s, duration })) });
  }

  function setAllTransitions(transition: string) {
    patch({ slides: project.slides.map((s) => ({ ...s, transition })) });
  }

  // ── W4 (Lane 5): Clear composition ────────────────────────────────────
  function handleClearAll() {
    const fresh = defaultProject();
    setProject(fresh);
    try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
    setShowClearModal(false);
    toast("Composition cleared. Starting fresh!", "info");
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

    // Build audio tracks array (Sprint 5 Multi-track support)
    const audioTracks: Array<{ jobId: string; volume: number }> = [];
    if (project.voiceJobId) {
      audioTracks.push({ jobId: project.voiceJobId, volume: project.voiceVolume ?? 1.0 });
    }
    if (project.musicJobId) {
      audioTracks.push({ jobId: project.musicJobId, volume: project.musicVolume ?? 0.15 });
    }

    if (project.mode === "slideshow") {
      body.slides = project.slides.map((s) => ({
        jobId: s.jobId,
        duration: s.duration,
        transition: s.transition,
        kenBurns: s.kenBurns,
        textOverlay: s.textOverlay,
      }));
      if (audioTracks.length > 0) body.audioTracks = audioTracks;
    } else if (project.mode === "merge") {
      body.videoJobId = project.videoJobId;
      if (audioTracks.length > 0) body.audioTracks = audioTracks;
      
      if (project.trimPoints?.start !== undefined || project.trimPoints?.end !== undefined) {
        body.trimPoints = {
          inPoint: project.trimPoints.start ?? 0,
          outPoint: project.trimPoints.end ?? 0,
        };
      }
    } else {
      body.videoJobId = project.videoJobId;
    }

    // Global Watermark
    if (project.watermarkJobId) {
      body.watermarkJobId = project.watermarkJobId;
      body.watermarkOpacity = project.watermarkOpacity ?? 1.0;
    }

    if (project.captionConfig?.text) {
      body.captions = {
        text: project.captionConfig.text,
        style: project.captionConfig.style,
        fontSize: project.captionConfig.fontSize,
        color: project.captionConfig.color,
        position: project.captionConfig.position,
        timing: project.captionConfig.timing, // W3: sentence vs word timing
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
              filterType={
                pickerTarget === "voice" ? "voice"
                : pickerTarget === "music" ? "music"
                : pickerTarget === "video" ? "video"
                : pickerTarget === "watermark" ? "image"
                : undefined
              }
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

          {/* W4 (Lane 5): Start Fresh button */}
          <button
            onClick={() => setShowClearModal(true)}
            title="Clear everything and start fresh"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-zinc-500 hover:text-red-400 hover:bg-red-400/10 transition-colors text-xs font-medium border border-zinc-800 shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Start Fresh</span>
          </button>

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
                <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                  <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Film className="w-4 h-4 text-indigo-400" />
                    Slide Storyboard
                  </h2>
                  {project.slides.length > 1 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Set All Durations */}
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-zinc-600">All:</span>
                        {[2, 3, 5].map((d) => (
                          <button
                            key={d}
                            onClick={() => setAllDurations(d)}
                            className="text-[10px] px-1.5 py-0.5 rounded border border-zinc-700 text-zinc-500 hover:text-white hover:border-zinc-500 transition-colors"
                            title={`Set all slides to ${d}s`}
                          >
                            {d}s
                          </button>
                        ))}
                      </div>
                      {/* Set All Transitions */}
                      <select
                        onChange={(e) => e.target.value && setAllTransitions(e.target.value)}
                        defaultValue=""
                        className="text-[10px] bg-zinc-900 border border-zinc-700 rounded px-1.5 py-0.5 text-zinc-500 hover:text-white cursor-pointer focus:outline-none"
                        title="Apply one transition to all slides"
                      >
                        <option value="" disabled>All transitions…</option>
                        <option value="fade">Fade</option>
                        <option value="fadeblack">Fade Black</option>
                        <option value="dissolve">Dissolve</option>
                        <option value="slideright">Slide Right</option>
                        <option value="slideleft">Slide Left</option>
                        <option value="slideup">Slide Up</option>
                        <option value="smoothleft">Smooth Left</option>
                        <option value="wiperight">Wipe Right</option>
                      </select>
                    </div>
                  )}
                  <span className="text-xs text-zinc-500 ml-auto">
                    {project.slides.length} slide{project.slides.length !== 1 ? "s" : ""} ·{" "}
                    {project.slides.reduce((s, sl) => s + sl.duration, 0).toFixed(1)}s
                  </span>
                </div>
                <SlideTimeline
                  slides={project.slides}
                  onReorder={reorderSlides}
                  onUpdateSlide={updateSlide}
                  onDeleteSlide={deleteSlide}
                  onDuplicateSlide={duplicateSlide}
                  onAddSlide={() => setPickerTarget("slide")}
                />
              </section>

              {/* Multi-Track Audio */}
              <section className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Music className="w-4 h-4 text-amber-400" />
                    Multi-Track Audio
                  </h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-zinc-300">Voiceover</span>
                      <div className="flex gap-2">
                        {project.voiceJobId && (
                          <>
                            <button
                              onClick={() => setPickerTarget("voice")}
                              className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                            >
                              Swap
                            </button>
                            <button
                              onClick={() => patch({ voiceJobId: undefined })}
                              className="text-xs text-zinc-500 hover:text-red-400 transition-colors"
                            >
                              Remove
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    <DropZone
                      label="Select Voiceover"
                      description="Click to select a voice job"
                      icon={<Mic className="w-6 h-6" />}
                      selectedJobId={project.voiceJobId}
                      onSelect={() => setPickerTarget("voice")}
                    />
                    {/* W2: Audio preview player */}
                    {project.voiceJobId && audioUrls[project.voiceJobId] && (
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-zinc-500">Preview voiceover:</span>
                        <audio
                          controls
                          src={audioUrls[project.voiceJobId]}
                          className="w-full h-8"
                          style={{ colorScheme: "dark" }}
                        />
                      </div>
                    )}
                    {project.voiceJobId && !audioUrls[project.voiceJobId] && (
                      <div className="flex items-center gap-1.5 text-[10px] text-zinc-600">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        Resolving audio…
                      </div>
                    )}
                    {project.voiceJobId && (
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-zinc-400 w-10">Vol:</span>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={project.voiceVolume ?? 1}
                          onChange={(e) => patch({ voiceVolume: parseFloat(e.target.value) })}
                          className="flex-1 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                        />
                        <span className="text-xs text-zinc-400 w-8 text-right">
                          {Math.round((project.voiceVolume ?? 1) * 100)}%
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-zinc-300">Background Music</span>
                      <div className="flex gap-2">
                        {project.musicJobId && (
                          <>
                            <button
                              onClick={() => setPickerTarget("music")}
                              className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                            >
                              Swap
                            </button>
                            <button
                              onClick={() => patch({ musicJobId: undefined })}
                              className="text-xs text-zinc-500 hover:text-red-400 transition-colors"
                            >
                              Remove
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    <DropZone
                      label="Select Music"
                      description="Click to select a music job"
                      icon={<Music className="w-6 h-6" />}
                      selectedJobId={project.musicJobId}
                      onSelect={() => setPickerTarget("music")}
                    />
                    {/* W2: Audio preview player */}
                    {project.musicJobId && audioUrls[project.musicJobId] && (
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-zinc-500">Preview music:</span>
                        <audio
                          controls
                          src={audioUrls[project.musicJobId]}
                          className="w-full h-8"
                          style={{ colorScheme: "dark" }}
                        />
                      </div>
                    )}
                    {project.musicJobId && !audioUrls[project.musicJobId] && (
                      <div className="flex items-center gap-1.5 text-[10px] text-zinc-600">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        Resolving audio…
                      </div>
                    )}
                    {project.musicJobId && (
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-zinc-400 w-10">Vol:</span>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={project.musicVolume ?? 0.15}
                          onChange={(e) => patch({ musicVolume: parseFloat(e.target.value) })}
                          className="flex-1 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                        />
                        <span className="text-xs text-zinc-400 w-8 text-right">
                          {Math.round((project.musicVolume ?? 0.15) * 100)}%
                        </span>
                      </div>
                    )}
                  </div>
                </div>
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
                <div className="space-y-4">
                  <DropZone
                    label="Select Voiceover"
                    description="Optional voice track"
                    icon={<Mic className="w-8 h-8" />}
                    selectedJobId={project.voiceJobId}
                    onSelect={() => setPickerTarget("voice")}
                  />
                  {/* W4: Swap button for merge mode voiceover */}
                  {project.voiceJobId && (
                    <div className="flex items-center gap-2 -mt-2">
                      <button
                        onClick={() => setPickerTarget("voice")}
                        className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                      >
                        Swap
                      </button>
                      <button
                        onClick={() => patch({ voiceJobId: undefined })}
                        className="text-xs text-zinc-500 hover:text-red-400 transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                  {/* W2: Audio preview in merge mode */}
                  {project.voiceJobId && audioUrls[project.voiceJobId] && (
                    <audio
                      controls
                      src={audioUrls[project.voiceJobId]}
                      className="w-full h-8"
                      style={{ colorScheme: "dark" }}
                    />
                  )}
                  {project.voiceJobId && (
                    <div className="flex items-center gap-3 mt-2">
                       <span className="text-xs text-zinc-400 w-10">Vol:</span>
                       <input
                         type="range"
                         min="0"
                         max="1"
                         step="0.05"
                         value={project.voiceVolume ?? 1}
                         onChange={(e) => patch({ voiceVolume: parseFloat(e.target.value) })}
                         className="flex-1 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                       />
                       <span className="text-xs text-zinc-400 w-8 text-right">
                         {Math.round((project.voiceVolume ?? 1) * 100)}%
                       </span>
                    </div>
                  )}

                  <DropZone
                    label="Select Music"
                    description="Optional background music"
                    icon={<Music className="w-8 h-8" />}
                    selectedJobId={project.musicJobId}
                    onSelect={() => setPickerTarget("music")}
                  />
                  {/* W4: Swap button for merge mode music */}
                  {project.musicJobId && (
                    <div className="flex items-center gap-2 -mt-2">
                      <button
                        onClick={() => setPickerTarget("music")}
                        className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                      >
                        Swap
                      </button>
                      <button
                        onClick={() => patch({ musicJobId: undefined })}
                        className="text-xs text-zinc-500 hover:text-red-400 transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                  {/* W2: Audio preview in merge mode */}
                  {project.musicJobId && audioUrls[project.musicJobId] && (
                    <audio
                      controls
                      src={audioUrls[project.musicJobId]}
                      className="w-full h-8"
                      style={{ colorScheme: "dark" }}
                    />
                  )}
                  {project.musicJobId && (
                    <div className="flex items-center gap-3 mt-2">
                       <span className="text-xs text-zinc-400 w-10">Vol:</span>
                       <input
                         type="range"
                         min="0"
                         max="1"
                         step="0.05"
                         value={project.musicVolume ?? 0.15}
                         onChange={(e) => patch({ musicVolume: parseFloat(e.target.value) })}
                         className="flex-1 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                       />
                       <span className="text-xs text-zinc-400 w-8 text-right">
                         {Math.round((project.musicVolume ?? 0.15) * 100)}%
                       </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Trim Controls */}
              {project.videoJobId && (
                <div className="pt-4 border-t border-zinc-800">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      Trim Source Video
                    </h3>
                    {(project.trimPoints?.start !== undefined || project.trimPoints?.end !== undefined) && (
                      <button
                        onClick={() => patch({ trimPoints: undefined })}
                        className="text-xs text-red-400 hover:text-red-300 transition-colors font-medium"
                      >
                        Clear Trim
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1">Start Time (sec)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={project.trimPoints?.start ?? ""}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          patch({
                            trimPoints: { ...project.trimPoints, start: isNaN(val) ? undefined : val },
                          });
                        }}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        placeholder="e.g. 2.5"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-1">End Time (sec)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={project.trimPoints?.end ?? ""}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          patch({
                            trimPoints: { ...project.trimPoints, end: isNaN(val) ? undefined : val },
                          });
                        }}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        placeholder="e.g. 10.0"
                      />
                    </div>
                  </div>
                </div>
              )}
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

          {/* ── SHARED: Watermark Section ─────────────────────────────────── */}
          <section className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-400" />
                Image Watermark / Overlay
              </h2>
              {project.watermarkJobId && (
                <button
                  onClick={() => patch({ watermarkJobId: undefined })}
                  className="text-xs text-zinc-500 hover:text-red-400 transition-colors"
                >
                  Remove
                </button>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-6">
              <div className="flex-1 sm:max-w-[200px]">
                <DropZone
                  label="Select Image"
                  description="Pick a watermark image"
                  icon={<MonitorPlay className="w-6 h-6" />}
                  selectedJobId={project.watermarkJobId}
                  onSelect={() => setPickerTarget("watermark")}
                />
              </div>
              {project.watermarkJobId && (
                <div className="flex-1 space-y-2 flex flex-col justify-center">
                  <label className="text-xs font-medium text-zinc-300">Opacity</label>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min="0.1"
                      max="1"
                      step="0.05"
                      value={project.watermarkOpacity ?? 1}
                      onChange={(e) => patch({ watermarkOpacity: parseFloat(e.target.value) })}
                      className="flex-1 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                    />
                    <span className="text-xs text-zinc-400 w-10 text-right">
                      {Math.round((project.watermarkOpacity ?? 1) * 100)}%
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-2">
                    The image will be overlaid over the video based on your selected opacity.
                  </p>
                </div>
              )}
            </div>
          </section>

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

      {/* W4 (Lane 5): Confirm clear modal */}
      <AnimatePresence>
        {showClearModal && (
          <ConfirmClearModal
            onConfirm={handleClearAll}
            onCancel={() => setShowClearModal(false)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

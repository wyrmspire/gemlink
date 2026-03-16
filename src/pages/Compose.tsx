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

export interface OutputConfig {
  aspectRatio: "9:16" | "16:9" | "1:1" | "4:5";
  resolution: "720p" | "1080p";
  fps: number;
}

export interface ComposeProject {
  title: string;
  slides: Slide[];
  voiceJobId?: string;
  musicJobId?: string;
  voiceVolume?: number;
  musicVolume?: number;
  // W5: Audio fades
  voiceFadeIn?: number;
  voiceFadeOut?: number;
  musicFadeIn?: number;
  musicFadeOut?: number;
  // W3: Voice duration for mismatch warning
  voiceDuration?: number;
  videoJobId?: string;
  audioJobId?: string;
  trimPoints?: { start?: number; end?: number };
  watermarkJobId?: string;
  watermarkOpacity?: number;
  // W2: Watermark position
  watermarkPosition?: string;
  captionConfig?: CaptionConfig;
  outputConfig: OutputConfig;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function genId(): string {
  return `slide_${Math.random().toString(36).slice(2, 10)}`;
}

function defaultProject(): ComposeProject {
  return {
    title: "Untitled Composition",
    slides: [],
    outputConfig: {
      aspectRatio: "9:16",
      resolution: "720p",
      fps: 30,
    },
  };
}

function deriveMode(project: ComposeProject): "slideshow" | "merge" | "caption" {
  if (project.slides.length > 0) return "slideshow";
  if (project.videoJobId) {
    if (project.captionConfig?.text && !project.voiceJobId && !project.musicJobId) {
      return "caption";
    }
    return "merge";
  }
  return "slideshow";
}

function jobToSlide(job: MediaJob): Slide {
  const thumb = job.outputs?.[0] ?? job.outputPath ?? null;
  // W5: Use job.duration for video slides, fallback 8s
  return {
    id: genId(),
    jobId: job.id,
    thumbnail: thumb,
    jobType: job.type,
    duration: job.duration ?? (job.type === "video" ? 8 : 3),
    transition: "fade",
    kenBurns: job.type !== "video", // W5: Disable Ken Burns for video
    aspectRatio: job.aspectRatio,
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

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
  const [renderStatus, setRenderStatus] = useState<string | null>(null);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
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

  // ── Render Polling (W5) ───────────────────────────────────────────────────
  useEffect(() => {
    if (!renderJobId || renderStatus === "done" || renderStatus === "failed") return;

    let timer: NodeJS.Timeout;
    const poll = async () => {
      try {
        const res = await fetch(`/api/media/compose/${renderJobId}`);
        if (!res.ok) return;
        const data = await res.json();
        setRenderStatus(data.status);
        if (data.status === "done" && data.outputPath) {
          setOutputUrl(data.outputPath);
          toast("✅ Rendering complete!", "success");
        } else if (data.status === "failed") {
          toast(`❌ Rendering failed: ${data.error || "Unknown error"}`, "error");
        } else {
          timer = setTimeout(poll, 3000);
        }
      } catch (err) {
        console.error("[compose] Polling failed:", err);
      }
    };

    poll();
    return () => clearTimeout(timer);
  }, [renderJobId, renderStatus, toast]);

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

  // ── W3: Read "auto-compose-groups" from sessionStorage on mount ───────────
  useEffect(() => {
    const rawGroups = sessionStorage.getItem("auto-compose-groups");
    if (rawGroups) {
      sessionStorage.removeItem("auto-compose-groups");
      try {
        const groups = JSON.parse(rawGroups);
        if (groups.length > 0) {
          const first = groups[0];
          const slides = (first.slideJobIds || []).map((jobId: string, i: number) => ({
            id: genId(),
            jobId,
            thumbnail: null,
            duration: first.template?.slides?.[i]?.duration ?? 3,
            transition: first.template?.slides?.[i]?.transition ?? "fade",
            kenBurns: first.template?.slides?.[i]?.kenBurns ?? false,
          }));

          const newProject: ComposeProject = {
            ...defaultProject(),
            title: first.title || "Auto-Composed",
            slides,
            voiceJobId: first.voiceJobId || undefined,
            captionConfig: first.captionText ? {
              ...DEFAULT_CAPTION_CONFIG,
              text: first.captionText,
              style: first.template?.captions?.style ?? "bold-outline",
              timing: first.template?.captions?.timing ?? "word",
              position: first.template?.captions?.position ?? "bottom",
            } : undefined,
            outputConfig: {
              aspectRatio: first.template?.aspectRatio ?? "9:16",
              resolution: "1080p",
              fps: 30,
            },
          };
          setProject(newProject);
          saveProject(newProject);
          toast(`Loaded "${first.title}" — ${slides.length} slides ready.`, "success");
          return;
        }
      } catch (err) {
        console.error("[compose] Failed to parse auto-compose-groups", err);
      }
    }

    // Existing "Send to Compose" logic
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
    if (job.type === "voice" || job.type === "music") {
      toast("Voice and music jobs cannot be used as slides. Use them as audio tracks instead.", "warning");
      setPickerTarget(null);
      return;
    }
    const slide = jobToSlide(job);
    
    // W5: Match aspect ratio on first slide
    let nextOutputConfig = project.outputConfig;
    if (project.slides.length === 0 && job.aspectRatio) {
      const ar = job.aspectRatio.replace(":", "x") === "9x16" ? "9:16" : 
                 job.aspectRatio.replace(":", "x") === "16x9" ? "16:9" : 
                 job.aspectRatio.replace(":", "x") === "1x1" ? "1:1" : 
                 job.aspectRatio.replace(":", "x") === "4x5" ? "4:5" : null;
      if (ar && ar !== project.outputConfig.aspectRatio) {
        nextOutputConfig = { ...project.outputConfig, aspectRatio: ar as any };
        toast(`Composition aspect ratio matched to first slide (${ar}).`, "info");
      }
    } else if (project.slides.length > 0 && job.aspectRatio) {
      // Warning for mismatch
      const projAR = project.outputConfig.aspectRatio;
      const jobAR = job.aspectRatio.replace(":", "x") === "9x16" ? "9:16" : 
                    job.aspectRatio.replace(":", "x") === "16x9" ? "16:9" : 
                    job.aspectRatio.replace(":", "x") === "1x1" ? "1:1" : 
                    job.aspectRatio.replace(":", "x") === "4x5" ? "4:5" : null;
      if (jobAR && jobAR !== projAR) {
        toast(`Mismatch: This media is ${jobAR} but your composition is ${projAR}.`, "warning");
      }
    }

    const next = { ...project, slides: [...project.slides, slide], outputConfig: nextOutputConfig };
    setProject(next);
    saveProject(next);
    setPickerTarget(null);
    toast("Slide added.", "success");
  }

  function handleMediaSelect(job: MediaJob) {
    // Explicit picker target always wins
    if (pickerTarget === "voice") {
      // W2: Voice → Caption Auto-Fill
      const voiceText = job.text || job.prompt || "";
      const shouldFill = voiceText && (!project.captionConfig?.text || project.captionConfig.text.trim() === "");
      
      patch({ 
        voiceJobId: job.id,
        ...(shouldFill ? {
          captionConfig: {
            ...(project.captionConfig || DEFAULT_CAPTION_CONFIG),
            text: voiceText,
            style: "bold-outline",
            timing: "word",
          }
        } : {})
      });
      
      toast(shouldFill ? "Voiceover added. Captions auto-filled from narration text." : "Voiceover selected.", "success");
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
    } else if (pickerTarget === "slide") {
      addSlideFromJob(job);
    } else {
      // No explicit target — auto-route by media type
      if (job.type === "voice") {
        patch({ voiceJobId: job.id });
        toast("Voiceover added to audio track.", "success");
      } else if (job.type === "music") {
        patch({ musicJobId: job.id });
        toast("Music added to audio track.", "success");
      } else {
        // Image or video → add as slide
        addSlideFromJob(job);
      }
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
    const currentMode = deriveMode(project);
    
    // Validate required fields client-side
    if (currentMode === "merge" && !project.voiceJobId && !project.musicJobId) {
      toast("Merge mode requires at least one audio track (voiceover or music).", "warning");
      return;
    }
    if (currentMode === "caption" && (!project.captionConfig?.text || !project.captionConfig.text.trim())) {
      toast("Captions mode requires caption text. Add text in the captions section.", "warning");
      return;
    }

    setRendering(true);
    setRenderJobId(null);

    // Build the request body following the ComposeRequest API spec in editor.md
    const body: Record<string, unknown> = {
      apiKey: import.meta.env.VITE_GEMINI_API_KEY || undefined,
      type: currentMode,
      output: {
        aspectRatio: project.outputConfig.aspectRatio,
        resolution: project.outputConfig.resolution,
        fps: project.outputConfig.fps,
      },
      projectId: activeProject?.id,
      title: project.title,
    };

    // Build audio tracks array (Sprint 5 Multi-track support)
    const audioTracks: Array<{ jobId: string; volume: number; fadeIn?: number; fadeOut?: number }> = [];
    if (project.voiceJobId) {
      audioTracks.push({
        jobId: project.voiceJobId,
        volume: project.voiceVolume ?? 1.0,
        fadeIn: project.voiceFadeIn,
        fadeOut: project.voiceFadeOut,
      });
    }
    if (project.musicJobId) {
      audioTracks.push({
        jobId: project.musicJobId,
        volume: project.musicVolume ?? 0.15,
        fadeIn: project.musicFadeIn,
        fadeOut: project.musicFadeOut,
      });
    }

    if (currentMode === "slideshow") {
      body.slides = project.slides.map((s) => ({
        jobId: s.jobId,
        jobType: s.jobType,
        duration: s.duration,
        transition: s.transition,
        kenBurns: s.kenBurns,
        kenBurnsDirection: s.kenBurnsDirection,
        textOverlay: s.textOverlay,
      }));
      if (audioTracks.length > 0) body.audioTracks = audioTracks;
    } else if (currentMode === "merge") {
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
      body.watermarkPosition = project.watermarkPosition ?? "bottom-right";
    }

    if (project.captionConfig?.text) {
      body.captions = {
        text: project.captionConfig.text,
        style: project.captionConfig.style,
        fontSize: project.captionConfig.fontSize,
        color: project.captionConfig.color,
        position: project.captionConfig.position,
        timing: project.captionConfig.timing, // W3: sentence vs word timing
        animation: (project.captionConfig as any).animation,
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
      // W5/SOP-4: Read real error body instead of throwing generic message
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Compose failed (HTTP ${res.status})`);
      }

      const data = await res.json();
      setRenderJobId(data.composeId ?? data.jobId ?? "unknown");
      setRenderStatus("processing");
      setOutputUrl(null);
      toast("🎬 Render started!", "success");
    } catch (err: any) {
      toast(err?.message || "Compose render failed — check server logs.", "error");
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
        </div>

        {/* Scrollable editor */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* ── W4: Smart Empty State ───────────────────────────────────── */}
          {project.slides.length === 0 && !project.videoJobId && !project.voiceJobId && !project.musicJobId && (
            <div className="flex flex-col items-center justify-center py-12 px-4">
              <div className="text-center mb-10">
                <h2 className="text-2xl font-bold text-white mb-2">What do you want to make?</h2>
                <p className="text-zinc-400 max-w-md mx-auto">
                  Select a quick-start template or add media from your library to begin.
                </p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl">
                {[
                  {
                    id: "short-form",
                    title: "Short-Form Video",
                    desc: "Slide montages for Reels/TikTok",
                    icon: <Film className="w-6 h-6 text-indigo-400" />,
                    onClick: () => {
                      patch({ outputConfig: { ...project.outputConfig, aspectRatio: "9:16" } });
                      setPickerTarget("slide");
                    }
                  },
                  {
                    id: "video-voice",
                    title: "Video + Voice",
                    desc: "Narration over a video clip",
                    icon: <Mic className="w-6 h-6 text-amber-400" />,
                    onClick: () => {
                      patch({ 
                        outputConfig: { ...project.outputConfig, aspectRatio: "9:16" },
                        captionConfig: { ...DEFAULT_CAPTION_CONFIG, style: "bold-outline", timing: "word" }
                      });
                      setPickerTarget("video");
                    }
                  },
                  {
                    id: "add-captions",
                    title: "Add Captions",
                    desc: "Burn subtitles onto a video",
                    icon: <Captions className="w-6 h-6 text-emerald-400" />,
                    onClick: () => {
                      patch({ 
                        outputConfig: { ...project.outputConfig, aspectRatio: "9:16" },
                        captionConfig: { ...DEFAULT_CAPTION_CONFIG, style: "clean", timing: "sentence" }
                      });
                      setPickerTarget("video");
                    }
                  }
                ].map(card => (
                  <button
                    key={card.id}
                    onClick={card.onClick}
                    className="flex flex-col items-start p-6 text-left bg-zinc-900 border border-zinc-800 rounded-2xl hover:border-indigo-500/50 hover:bg-zinc-800/50 transition-all group"
                  >
                    <div className="p-3 rounded-xl bg-zinc-950 mb-4 group-hover:scale-110 transition-transform">
                      {card.icon}
                    </div>
                    <h3 className="text-base font-semibold text-white mb-1">{card.title}</h3>
                    <p className="text-xs text-zinc-500 leading-relaxed">{card.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Adaptive visual tracks ────────────────────────────────────── */}
          
          {/* Slide timeline section - shows if slides exist, or if user is adding first slides */}
          {(project.slides.length > 0 || (pickerTarget === "slide" && !project.videoJobId)) && (
            <section className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Film className="w-4 h-4 text-indigo-400" />
                  Slide Storyboard
                </h2>
                {/* ... existing header logic ... */}
                {project.slides.length > 1 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-zinc-600">All:</span>
                      {[2, 3, 5].map((d) => (
                        <button
                          key={d}
                          onClick={() => setAllDurations(d)}
                          className="text-[10px] px-1.5 py-0.5 rounded border border-zinc-700 text-zinc-500 hover:text-white hover:border-zinc-500 transition-colors"
                        >
                          {d}s
                        </button>
                      ))}
                    </div>
                    <select
                      onChange={(e) => e.target.value && setAllTransitions(e.target.value)}
                      defaultValue=""
                      className="text-[10px] bg-zinc-900 border border-zinc-700 rounded px-1.5 py-0.5 text-zinc-500 hover:text-white cursor-pointer focus:outline-none"
                    >
                      <option value="" disabled>All transitions…</option>
                      <option value="fade">Fade</option>
                      <option value="fadeblack">Fade Black</option>
                      <option value="dissolve">Dissolve</option>
                      <option value="slideright">Slide Right</option>
                    </select>
                  </div>
                )}
                {/* Duration warning */}
                {(() => {
                  const slideTotalDur = project.slides.reduce((s, sl) => s + sl.duration, 0);
                  const voiceDur = project.voiceDuration;
                  const mismatch = voiceDur !== undefined && Math.abs(slideTotalDur - voiceDur) > 2;
                  return (
                    <div className="flex items-center gap-2 ml-auto">
                      {mismatch && (
                        <div className="flex items-center gap-1 text-amber-400" title={`Mismatch: ${Math.abs(slideTotalDur - voiceDur!).toFixed(1)}s`}>
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span className="text-[10px] hidden sm:inline">{slideTotalDur.toFixed(1)}s slides · {voiceDur!.toFixed(1)}s voice</span>
                        </div>
                      )}
                      <span className="text-xs text-zinc-500">{project.slides.length} slides · {slideTotalDur.toFixed(1)}s</span>
                    </div>
                  );
                })()}
              </div>

              <SlideTimeline
                slides={project.slides}
                onReorder={reorderSlides}
                onUpdateSlide={updateSlide}
                onDeleteSlide={deleteSlide}
                onDuplicateSlide={duplicateSlide}
                onAddSlide={() => setPickerTarget("slide")}
                targetAspectRatio={project.outputConfig.aspectRatio}
              />
            </section>
          )}

          {/* Merge video section - shows if video selected and no slides, or explicitly picking video */}
          {project.videoJobId && project.slides.length === 0 && (
            <section className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 space-y-4">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <VideoIcon className="w-4 h-4 text-indigo-400" />
                Video Source
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <DropZone
                  label="Video Clip"
                  description="Primary video content"
                  icon={<VideoIcon className="w-8 h-8" />}
                  selectedJobId={project.videoJobId}
                  onSelect={() => setPickerTarget("video")}
                />
                
                {/* Trim controls if video exists */}
                {project.videoJobId && (
                  <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-white">Trim Points</span>
                      <button onClick={() => patch({ trimPoints: undefined })} className="text-[10px] text-red-400">Clear</button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number" step="0.1" placeholder="Start"
                        value={project.trimPoints?.start ?? ""}
                        onChange={(e) => patch({ trimPoints: { ...project.trimPoints, start: parseFloat(e.target.value) || undefined } })}
                        className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs text-white"
                      />
                      <input
                        type="number" step="0.1" placeholder="End"
                        value={project.trimPoints?.end ?? ""}
                        onChange={(e) => patch({ trimPoints: { ...project.trimPoints, end: parseFloat(e.target.value) || undefined } })}
                        className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs text-white"
                      />
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Audio Tracks - shows if any audio exists or if user picking audio */}
          {(project.voiceJobId || project.musicJobId || pickerTarget === "voice" || pickerTarget === "music" || project.slides.length > 0 || project.videoJobId) && (
            <section className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Mic className="w-4 h-4 text-amber-400" />
                  Audio Tracks
                </h2>
              </div>
              
              <div className="space-y-3">
                {/* Voiceover Track */}
                <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Mic className="w-3 h-3 text-amber-400" />
                    <span className="text-[10px] uppercase font-bold text-zinc-500">Voiceover</span>
                  </div>
                  {project.voiceJobId ? (
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        {audioUrls[project.voiceJobId] ? (
                          <audio controls src={audioUrls[project.voiceJobId]} className="w-full h-7" onLoadedMetadata={(e) => patch({ voiceDuration: (e.target as HTMLAudioElement).duration })} />
                        ) : <div className="text-[10px] text-zinc-600">Loading audio...</div>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <input type="range" min="0" max="1" step="0.05" value={project.voiceVolume ?? 1} onChange={(e) => patch({ voiceVolume: parseFloat(e.target.value) })} className="w-16 h-1 accent-amber-500" />
                        <button onClick={() => setPickerTarget("voice")} className="text-[10px] text-indigo-400">Swap</button>
                        <button onClick={() => patch({ voiceJobId: undefined, voiceDuration: undefined })} className="text-[10px] text-zinc-500">✕</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setPickerTarget("voice")} className="w-full h-10 border border-dashed border-zinc-800 rounded-lg text-xs text-zinc-600 hover:text-amber-400 hover:border-amber-400/30 transition-all">Add Voiceover</button>
                  )}
                </div>

                {/* Music Track */}
                <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Music className="w-3 h-3 text-emerald-400" />
                    <span className="text-[10px] uppercase font-bold text-zinc-500">Music</span>
                  </div>
                  {project.musicJobId ? (
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        {audioUrls[project.musicJobId] ? (
                          <audio controls src={audioUrls[project.musicJobId]} className="w-full h-7" />
                        ) : <div className="text-[10px] text-zinc-600">Loading audio...</div>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <input type="range" min="0" max="1" step="0.05" value={project.musicVolume ?? 0.15} onChange={(e) => patch({ musicVolume: parseFloat(e.target.value) })} className="w-16 h-1 accent-emerald-500" />
                        <button onClick={() => setPickerTarget("music")} className="text-[10px] text-indigo-400">Swap</button>
                        <button onClick={() => patch({ musicJobId: undefined })} className="text-[10px] text-zinc-500">✕</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setPickerTarget("music")} className="w-full h-10 border border-dashed border-zinc-800 rounded-lg text-xs text-zinc-600 hover:text-emerald-400 hover:border-emerald-400/30 transition-all">Add Music</button>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Caption Editor - shows if voiceover exists or manual captions started */}
          {(project.voiceJobId || project.captionConfig?.text || (project.videoJobId && !project.slides.length)) && (
            <CaptionEditor
              value={project.captionConfig ?? DEFAULT_CAPTION_CONFIG}
              onChange={(cfg) => patch({ captionConfig: cfg })}
            />
          )}

          {/* Watermark Section */}
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
                <div className="flex-1 space-y-4 flex flex-col justify-center">
                  {/* Opacity slider */}
                  <div className="space-y-2">
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
                  </div>
                  {/* W2: Position picker 3×3 grid */}
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-zinc-300">Position</label>
                    <div
                      style={{ display: "grid", gridTemplateColumns: "repeat(3, 28px)", gap: "4px" }}
                    >
                      {([
                        "top-left",    "top-center",    "top-right",
                        "middle-left", "center",        "middle-right",
                        "bottom-left", "bottom-center", "bottom-right",
                      ] as const).map((pos) => (
                        <button
                          key={pos}
                          onClick={() => patch({ watermarkPosition: pos })}
                          title={pos.replace(/-/g, " ")}
                          className={`w-7 h-7 rounded border transition-colors ${
                            (project.watermarkPosition ?? "bottom-right") === pos
                              ? "bg-indigo-600 border-indigo-500"
                              : "bg-zinc-800 border-zinc-700 hover:border-zinc-500"
                          }`}
                        />
                      ))}
                    </div>
                    <p className="text-[10px] text-zinc-500 capitalize">
                      {(project.watermarkPosition ?? "bottom-right").replace(/-/g, " ")}
                    </p>
                  </div>
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

          {/* Render status and output (W5) */}
          <AnimatePresence>
            {renderJobId && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`p-4 rounded-2xl border transition-all ${
                  renderStatus === "done" 
                    ? "bg-emerald-600/10 border-emerald-500/30" 
                    : renderStatus === "failed"
                    ? "bg-red-600/10 border-red-500/30"
                    : "bg-indigo-600/10 border-indigo-500/30"
                }`}
              >
                <div className="flex items-center gap-3 mb-3">
                  {renderStatus === "done" ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  ) : renderStatus === "failed" ? (
                    <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
                  ) : (
                    <Loader2 className="w-5 h-5 text-indigo-400 animate-spin shrink-0" />
                  )}
                  <div className="flex-1">
                    <p className={`text-sm font-semibold ${
                      renderStatus === "done" ? "text-emerald-200" : renderStatus === "failed" ? "text-red-200" : "text-indigo-200"
                    }`}>
                      {renderStatus === "done" ? "Rendering Complete!" : renderStatus === "failed" ? "Rendering Failed" : "Rendering in Progress..."}
                    </p>
                    <p className="text-[10px] opacity-60 font-mono">Job ID: {renderJobId}</p>
                  </div>
                  {renderStatus === "done" && (
                    <button 
                      onClick={() => setRenderJobId(null)}
                      className="text-xs text-zinc-500 hover:text-white"
                    >
                      Dismiss
                    </button>
                  )}
                </div>

                {renderStatus === "done" && outputUrl && (
                  <div className="mt-4 rounded-xl overflow-hidden border border-zinc-800 bg-black aspect-video relative group">
                    <video 
                      src={outputUrl} 
                      controls 
                      className="w-full h-full"
                    />
                    <div className="absolute inset-0 pointer-events-none border border-white/5 rounded-xl shadow-inner" />
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Preview section */}
          {deriveMode(project) === "slideshow" && project.slides.length > 0 && (
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
            <button
              onClick={() => setShowPreview((p) => !p)}
              disabled={project.slides.length === 0 && !project.videoJobId}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-700 text-zinc-300 text-sm font-medium hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Play className="w-4 h-4" />
              Preview
            </button>

            {/* Render button */}
            <button
              onClick={handleRender}
              disabled={rendering || (project.slides.length === 0 && !project.videoJobId)}
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

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Play, Pause, RotateCcw, Info } from "lucide-react";
import type { ComposeProject } from "../pages/Compose";

// ─── Props ────────────────────────────────────────────────────────────────────

interface ComposePreviewProps {
  project: ComposeProject;
  className?: string;
}

// ─── Aspect ratio dimensions ──────────────────────────────────────────────────

const RATIO_STYLES: Record<string, { paddingBottom: string }> = {
  "9:16": { paddingBottom: "177.78%" },
  "16:9": { paddingBottom: "56.25%" },
  "1:1":  { paddingBottom: "100%" },
  "4:5":  { paddingBottom: "125%" },
};

// ─── CSS transition variants (match FFmpeg filter names) ─────────────────────

type SlideState = "entering" | "active" | "exiting";

function getSlideAnimation(
  transition: string,
  state: SlideState
): React.CSSProperties {
  const isEntering = state === "entering";
  const isExiting = state === "exiting";

  switch (transition) {
    case "fadeblack":
    case "fade":
    case "fadewhite":
    case "dissolve":
      return {
        opacity: isEntering ? 0 : isExiting ? 0 : 1,
        transition: "opacity 0.6s ease",
      };
    case "slideright":
      return {
        transform: isEntering ? "translateX(-100%)" : isExiting ? "translateX(100%)" : "translateX(0)",
        transition: "transform 0.5s ease",
      };
    case "slideleft":
      return {
        transform: isEntering ? "translateX(100%)" : isExiting ? "translateX(-100%)" : "translateX(0)",
        transition: "transform 0.5s ease",
      };
    case "slideup":
      return {
        transform: isEntering ? "translateY(100%)" : isExiting ? "translateY(-100%)" : "translateY(0)",
        transition: "transform 0.5s ease",
      };
    case "slidedown":
      return {
        transform: isEntering ? "translateY(-100%)" : isExiting ? "translateY(100%)" : "translateY(0)",
        transition: "transform 0.5s ease",
      };
    case "wiperight":
    case "wipeleft":
    case "circlecrop":
    case "radial":
      return {
        opacity: isEntering ? 0 : isExiting ? 0 : 1,
        transform: isEntering ? "scale(0.95)" : isExiting ? "scale(1.05)" : "scale(1)",
        transition: "opacity 0.5s ease, transform 0.5s ease",
      };
    default:
      return {
        opacity: isEntering ? 0 : isExiting ? 0 : 1,
        transition: "opacity 0.4s ease",
      };
  }
}

// ─── Caption styling ──────────────────────────────────────────────────────────

function getCaptionCSS(config: ComposeProject["captionConfig"]): React.CSSProperties {
  if (!config) return {};
  const base: React.CSSProperties = {
    position: "absolute",
    left: "5%",
    right: "5%",
    textAlign: "center",
    color: config.color,
    fontSize: `${Math.round(config.fontSize * 0.4)}px`,
    fontWeight: 700,
    fontFamily: "system-ui, sans-serif",
    lineHeight: 1.3,
    zIndex: 20,
    pointerEvents: "none",
    transition: "opacity 0.3s",
  };

  const pos = config.position;
  if (pos === "top") { base.top = "8%"; base.bottom = "auto"; }
  else if (pos === "center") { base.top = "50%"; /* transform handled inline */ base.bottom = "auto"; }
  else { base.bottom = "8%"; base.top = "auto"; }

  switch (config.style) {
    case "clean":
      base.textShadow = "0 2px 8px rgba(0,0,0,0.9)";
      break;
    case "bold-outline":
      base.textShadow = "-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000";
      break;
    case "boxed":
      base.backgroundColor = "rgba(0,0,0,0.7)";
      base.padding = "4px 12px";
      base.borderRadius = "6px";
      break;
    default:
      base.textShadow = "0 2px 6px rgba(0,0,0,0.8)";
  }

  return base;
}

// ─── Main Component ───────────────────────────────────────────────────────────

// Ken Burns animation name per direction
function kenBurnsAnimationName(dir?: string): string {
  switch (dir) {
    case "zoom-out":  return "kenBurnsZoomOut";
    case "pan-left":  return "kenBurnsPanLeft";
    case "pan-right": return "kenBurnsPanRight";
    default:          return "kenBurnsZoomIn";
  }
}

export default function ComposePreview({ project, className = "" }: ComposePreviewProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [slideState, setSlideState] = useState<SlideState>("active");
  const [elapsed, setElapsed] = useState(0);
  const [voiceAudioUrl, setVoiceAudioUrl] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const slides = project.slides;
  const totalDuration = slides.reduce((s, sl) => s + sl.duration, 0);
  const currentSlide = slides[currentSlideIndex];
  const ar = project.outputConfig?.aspectRatio ?? "9:16";
  const ratioStyle = RATIO_STYLES[ar] ?? RATIO_STYLES["9:16"];
  const isVertical = ar === "9:16" || ar === "4:5";
  const previewMaxWidth = isVertical ? 200 : 400;

  // ── Playback logic ─────────────────────────────────────────────────────────

  const resetPlayback = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setIsPlaying(false);
    setCurrentSlideIndex(0);
    setSlideState("active");
    setElapsed(0);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, []);

  const advanceSlide = useCallback(() => {
    const nextIdx = currentSlideIndex + 1;
    if (nextIdx < slides.length) {
      setSlideState("exiting");
      setTimeout(() => {
        setCurrentSlideIndex(nextIdx);
        setSlideState("entering");
        setTimeout(() => setSlideState("active"), 100);
      }, 400);
    } else {
      setIsPlaying(false);
    }
  }, [currentSlideIndex, slides.length]);

  useEffect(() => {
    if (!isPlaying) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    if (!currentSlide) return;

    let slideElapsed = 0;
    intervalRef.current = setInterval(() => {
      slideElapsed += 0.1;
      setElapsed((p) => Math.min(p + 0.1, totalDuration));
      if (slideElapsed >= currentSlide.duration) {
        slideElapsed = 0;
        advanceSlide();
      }
    }, 100);

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isPlaying, currentSlide, totalDuration, advanceSlide]);

  // Reset when slides change
  useEffect(() => {
    resetPlayback();
  }, [slides.length, resetPlayback]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resolve voice audio URL from job history when voiceJobId changes
  useEffect(() => {
    if (!project.voiceJobId) { setVoiceAudioUrl(null); return; }
    fetch("/api/media/history", { cache: "no-store" })
      .then((r) => r.ok ? r.json() : [])
      .then((jobs: Array<{ id: string; outputs?: string[]; type?: string }>) => {
        const job = jobs.find((j) => j.id === project.voiceJobId);
        setVoiceAudioUrl(job?.outputs?.[0] ?? null);
      })
      .catch(() => setVoiceAudioUrl(null));
  }, [project.voiceJobId]);

  function togglePlay() {
    if (!isPlaying && currentSlideIndex >= slides.length - 1 && elapsed >= totalDuration - 0.2) {
      resetPlayback();
      setTimeout(() => setIsPlaying(true), 50);
    } else {
      const next = !isPlaying;
      setIsPlaying(next);
      if (next && audioRef.current && project.voiceJobId) {
        audioRef.current.play().catch(() => {});
      } else if (audioRef.current) {
        audioRef.current.pause();
      }
    }
  }

  // W1: Track video element for play/pause sync
  const videoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (!videoRef.current) return;
    if (isPlaying) videoRef.current.play().catch(() => {});
    else videoRef.current.pause();
  }, [isPlaying, currentSlideIndex]);

  if (slides.length === 0) {
    return (
      <div className={`flex items-center justify-center bg-zinc-950 border border-zinc-800 rounded-2xl p-8 ${className}`}>
        <p className="text-zinc-600 text-sm text-center">
          Add slides to the timeline to preview your composition
        </p>
      </div>
    );
  }

  const progressPct = totalDuration > 0 ? (elapsed / totalDuration) * 100 : 0;

  // W2/W3: Timed captions logic
  const [audioTime, setAudioTime] = useState(0);
  useEffect(() => {
    let frame: number;
    const update = () => {
      if (audioRef.current && !audioRef.current.paused) {
        setAudioTime(audioRef.current.currentTime);
      }
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, []);

  const captionTime = (voiceAudioUrl && isPlaying) ? audioTime : elapsed;
  
  const captionWords = useMemo(() => {
    if (!project.captionConfig?.text) return [];
    return project.captionConfig.text.split(/\s+/).filter(Boolean);
  }, [project.captionConfig?.text]);

  const activeWordIndex = useMemo(() => {
    if (captionWords.length === 0 || totalDuration === 0) return -1;
    const perWord = totalDuration / captionWords.length;
    return Math.floor(captionTime / perWord);
  }, [captionWords.length, totalDuration, captionTime]);

  return (
    <div className={`bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800">
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
          Preview
        </span>
        <span className="text-xs text-zinc-600 flex items-center gap-1">
          <Info className="w-3.5 h-3.5" />
          {project.outputConfig?.aspectRatio ?? "9:16"} · {project.outputConfig?.resolution ?? "720p"}
        </span>
      </div>

      {/* Video frame */}
      <div className="flex justify-center p-4 bg-black">
        <div
          className="relative w-full overflow-hidden rounded-xl bg-zinc-900 shadow-2xl"
          style={{ paddingBottom: ratioStyle.paddingBottom, maxWidth: previewMaxWidth }}
        >
          <div className="absolute inset-0">
            {/* Slides */}
            <AnimatePresence mode="wait">
              {currentSlide && (
                <div
                  key={currentSlide.id}
                  style={{
                    position: "absolute",
                    inset: 0,
                    ...getSlideAnimation(currentSlide.transition, slideState),
                  }}
                >
                  {currentSlide.thumbnail ? (
                    (() => {
                      const isVideo = currentSlide.jobType === "video" || 
                                     currentSlide.thumbnail.endsWith(".mp4") || 
                                     currentSlide.thumbnail.endsWith(".webm");
                      
                      if (isVideo) {
                        return (
                          <video
                            ref={videoRef}
                            src={currentSlide.thumbnail}
                            poster={currentSlide.thumbnail} // best effort poster
                            autoPlay={isPlaying}
                            muted
                            loop
                            playsInline
                            className="w-full h-full object-cover"
                          />
                        );
                      }
                      
                      return (
                        <img
                          src={currentSlide.thumbnail}
                          alt={`Slide ${currentSlideIndex + 1}`}
                          className="w-full h-full object-cover"
                          style={
                            currentSlide.kenBurns && isPlaying
                              ? {
                                  animation: `${kenBurnsAnimationName(currentSlide.kenBurnsDirection)} ${currentSlide.duration}s ease-out forwards`,
                                }
                              : {}
                          }
                        />
                      );
                    })()
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-zinc-900 text-zinc-700">
                      <span className="text-xs">Slide {currentSlideIndex + 1}</span>
                    </div>
                  )}

                  {/* Text overlay */}
                  {currentSlide.textOverlay?.text && (
                    <div
                      style={{
                        position: "absolute",
                        left: "5%",
                        right: "5%",
                        textAlign: "center",
                        color: "#ffffff",
                        fontWeight: 700,
                        fontSize: "14px",
                        textShadow: "0 2px 8px rgba(0,0,0,0.9)",
                        ...(currentSlide.textOverlay.position === "top"
                          ? { top: "8%" }
                          : currentSlide.textOverlay.position === "center"
                          ? { top: "50%", transform: "translateY(-50%)" }
                          : { bottom: "8%" }),
                      }}
                    >
                      {currentSlide.textOverlay.text}
                    </div>
                  )}
                </div>
              )}
            </AnimatePresence>

            {/* Caption overlay (timed) */}
            {project.captionConfig?.text && (
              <div 
                style={{
                  ...getCaptionCSS(project.captionConfig),
                  display: "flex",
                  flexWrap: "wrap",
                  justifyContent: "center",
                  gap: "0.2em",
                  padding: "0 10px",
                  ...(project.captionConfig.position === "center" ? { transform: "translateY(-50%)" } : {})
                }}
              >
                {captionWords.map((word, i) => {
                  const isActive = i === activeWordIndex;
                  const isPast = i < activeWordIndex;
                  const animationStyle = (project.captionConfig as any)?.animation ?? "none";
                  
                  return (
                    <span
                      key={i}
                      style={{
                        color: isActive ? "#6366f1" : "inherit",
                        opacity: isActive ? 1 : isPast ? 0.8 : 0.4,
                        transition: "all 0.2s ease",
                        animation: (isActive && animationStyle !== "none") 
                          ? `${animationStyle === "pop" ? "captionPop" : animationStyle === "fade" ? "captionFade" : "captionBlur"} 0.3s ease-out forwards`
                          : "none"
                      }}
                    >
                      {word}
                    </span>
                  );
                })}
              </div>
            )}

            {/* Slide indicator dots */}
            <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1 z-30">
              {slides.map((_, i) => (
                <div
                  key={i}
                  className={`rounded-full transition-all ${
                    i === currentSlideIndex
                      ? "w-4 h-1.5 bg-white"
                      : "w-1.5 h-1.5 bg-white/30"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="px-4 pb-4 space-y-2">
        {/* Progress bar */}
        <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
          <motion.div
            className="h-full bg-indigo-500 rounded-full"
            style={{ width: `${progressPct}%` }}
            transition={{ duration: 0.1 }}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={togglePlay}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
            <button
              onClick={resetPlayback}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          <span className="text-xs text-zinc-500 font-mono">
            Slide {currentSlideIndex + 1}/{slides.length} ·{" "}
            {elapsed.toFixed(1)}s / {totalDuration.toFixed(1)}s
          </span>
        </div>

        {/* Disclaimer */}
        <p className="text-[10px] text-zinc-700 text-center leading-relaxed">
          Approximate preview — final render uses FFmpeg
        </p>
      </div>

      {/* Hidden audio for voiceover preview */}
      {voiceAudioUrl && (
        <audio ref={audioRef} src={voiceAudioUrl} preload="auto" style={{ display: "none" }} />
      )}

      {/* Ken Burns keyframe styles — one per direction */}
      <style>{`
        @keyframes kenBurnsZoomIn {
          from { transform: scale(1) translate(0, 0); }
          to   { transform: scale(1.12) translate(2%, -2%); }
        }
        @keyframes kenBurnsZoomOut {
          from { transform: scale(1.12) translate(-2%, 2%); }
          to   { transform: scale(1) translate(0, 0); }
        }
        @keyframes kenBurnsPanLeft {
          from { transform: scale(1.08) translateX(4%); }
          to   { transform: scale(1.08) translateX(-4%); }
        }
        @keyframes kenBurnsPanRight {
          from { transform: scale(1.08) translateX(-4%); }
          to   { transform: scale(1.08) translateX(4%); }
        }
        @keyframes captionPop {
          0% { transform: scale(0.8); opacity: 0; }
          70% { transform: scale(1.05); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes captionFade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes captionBlur {
          from { filter: blur(4px); opacity: 0; }
          to { filter: blur(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

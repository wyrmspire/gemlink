/**
 * Lane 4 — Presentation Mode (Sprint 9)
 *
 * W1. Presentation Controls   — chrome-less display, prev/next, slide counter
 * W2. Auto-Advance with Timing — Play/Pause using each slide's duration
 * W3. Keyboard Navigation     — ← → arrows, Spacebar play/pause, Escape exit
 * W4. Fullscreen Toggle       — Fullscreen API, F key shortcut
 * W5. Transition Effects      — Framer Motion fade variants per slide.transition
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import type { TargetAndTransition } from "motion/react";
import {
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  Maximize,
  Minimize,
  X,
  Image as ImageIcon,
  Video,
  Mic,
  FolderOpen,
  Zap,
} from "lucide-react";
import type { Collection, CollectionItem } from "./Collections";

// ─── Constants ────────────────────────────────────────────────────────────────

const COLLECTIONS_KEY = "gemlink-collections";

/** Default slide duration when no duration metadata is available (seconds). */
const DEFAULT_SLIDE_DURATION_S = 4;

/** Progress bar update tick (ms) — smooth at 60fps. */
const PROGRESS_TICK_MS = 50;

// ─── Transition variant map (W5) ─────────────────────────────────────────────
//
// Maps each slide.transition value to Motion initial/animate/exit variants.
// The exit direction mirrors the initial direction so the viewport always
// "pushes" content in the right direction.

type VariantSet = {
  initial: TargetAndTransition;
  animate: TargetAndTransition;
  exit:    TargetAndTransition;
};

const TRANSITION_DURATION = 0.4;

function getVariants(transition: string, direction: 1 | -1 = 1): VariantSet {
  const fast = { duration: TRANSITION_DURATION, ease: "easeInOut" as const };
  switch (transition) {
    case "fadeblack":
      return {
        initial: { opacity: 0, backgroundColor: "#000" },
        animate: { opacity: 1 },
        exit:    { opacity: 0, backgroundColor: "#000" },
      };
    case "fadewhite":
      return {
        initial: { opacity: 0, backgroundColor: "#fff" },
        animate: { opacity: 1 },
        exit:    { opacity: 0, backgroundColor: "#fff" },
      };
    case "dissolve":
      return {
        initial: { opacity: 0, scale: 1.04 },
        animate: { opacity: 1,  scale: 1    },
        exit:    { opacity: 0,  scale: 0.96 },
      };
    case "slideright":
      return {
        initial: { x:  direction * 100 + "%", opacity: 0 },
        animate: { x: "0%",                   opacity: 1 },
        exit:    { x: -direction * 100 + "%", opacity: 0 },
      };
    case "slideleft":
      return {
        initial: { x: -direction * 100 + "%", opacity: 0 },
        animate: { x: "0%",                    opacity: 1 },
        exit:    { x:  direction * 100 + "%",  opacity: 0 },
      };
    case "slideup":
      return {
        initial: { y:  direction * 100 + "%", opacity: 0 },
        animate: { y: "0%",                   opacity: 1 },
        exit:    { y: -direction * 100 + "%", opacity: 0 },
      };
    case "slidedown":
      return {
        initial: { y: -direction * 100 + "%", opacity: 0 },
        animate: { y: "0%",                    opacity: 1 },
        exit:    { y:  direction * 100 + "%",  opacity: 0 },
      };
    case "wiperight":
      return {
        initial: { clipPath: "inset(0 100% 0 0)", opacity: 1 },
        animate: { clipPath: "inset(0 0% 0 0)",   opacity: 1 },
        exit:    { clipPath: "inset(0 0 0 100%)",  opacity: 1 },
      };
    case "wipeleft":
      return {
        initial: { clipPath: "inset(0 0 0 100%)", opacity: 1 },
        animate: { clipPath: "inset(0 0% 0 0)",   opacity: 1 },
        exit:    { clipPath: "inset(0 100% 0 0)",  opacity: 1 },
      };
    case "radial":
      return {
        initial: { clipPath: "circle(0% at 50% 50%)",   opacity: 1 },
        animate: { clipPath: "circle(100% at 50% 50%)",  opacity: 1 },
        exit:    { clipPath: "circle(0% at 50% 50%)",    opacity: 0 },
      };
    case "circlecrop":
      return {
        initial: { clipPath: "ellipse(0% 0% at 50% 50%)", opacity: 1 },
        animate: { clipPath: "ellipse(75% 75% at 50% 50%)", opacity: 1 },
        exit:    { clipPath: "ellipse(0% 0% at 50% 50%)",   opacity: 0 },
      };
    case "fade":
    default:
      return {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit:    { opacity: 0 },
      };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function loadCollections(): Collection[] {
  try {
    const raw = localStorage.getItem(COLLECTIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function slideDuration(item: CollectionItem): number {
  // CollectionItem doesn't carry duration — use a sensible default.
  // Video items get a bit longer so the viewer can watch some.
  return item.type === "video" ? DEFAULT_SLIDE_DURATION_S * 2 : DEFAULT_SLIDE_DURATION_S;
}

// ─── Type icon helper ─────────────────────────────────────────────────────────

function TypeIcon({ type }: { type: string }) {
  if (type === "video") return <Video className="w-6 h-6 text-emerald-400" />;
  if (type === "voice") return <Mic  className="w-6 h-6 text-amber-400"  />;
  return <ImageIcon className="w-6 h-6 text-indigo-400" />;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Presentation() {
  const { collectionId } = useParams<{ collectionId: string }>();
  const navigate = useNavigate();

  // ── Collection state ───────────────────────────────────────────────────────
  const [collection, setCollection] = useState<Collection | null>(null);
  const [slideIndex, setSlideIndex] = useState(0);

  // ── W2: Auto-advance state ─────────────────────────────────────────────────
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0-1 progress through current slide

  // ── W4: Fullscreen state ───────────────────────────────────────────────────
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── W5: Slide direction (for directional transitions) ─────────────────────
  const [direction, setDirection] = useState<1 | -1>(1);

  // ── W2: Progress timer refs ────────────────────────────────────────────────
  const progressRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedMsRef  = useRef(0);

  // ── Load collection from localStorage ─────────────────────────────────────
  useEffect(() => {
    const cols = loadCollections();
    const col = cols.find((c) => c.id === collectionId) ?? null;
    setCollection(col);
  }, [collectionId]);

  const items = collection?.items ?? [];
  const current: CollectionItem | undefined = items[slideIndex];

  // ── Navigation helpers ─────────────────────────────────────────────────────

  const goTo = useCallback(
    (index: number, dir: 1 | -1 = 1) => {
      setDirection(dir);
      setSlideIndex(index);
      elapsedMsRef.current = 0;
      setProgress(0);
    },
    []
  );

  const prev = useCallback(() => {
    setSlideIndex((i) => {
      if (i === 0) return i;
      goTo(i - 1, -1);
      return i - 1;
    });
    setPlaying(false);
  }, [goTo]);

  const next = useCallback(() => {
    setSlideIndex((i) => {
      if (i >= items.length - 1) {
        setPlaying(false);
        return i;
      }
      goTo(i + 1, 1);
      return i + 1;
    });
  }, [items.length, goTo]);

  // ── W2: Auto-advance play/pause ────────────────────────────────────────────

  const clearTimer = useCallback(() => {
    if (progressRef.current) {
      clearInterval(progressRef.current);
      progressRef.current = null;
    }
  }, []);

  useEffect(() => {
    clearTimer();
    if (!playing || !current) return;

    const durationMs = slideDuration(current) * 1000;

    progressRef.current = setInterval(() => {
      elapsedMsRef.current += PROGRESS_TICK_MS;
      const pct = Math.min(elapsedMsRef.current / durationMs, 1);
      setProgress(pct);

      if (pct >= 1) {
        clearTimer();
        // Advance to next or stop at end
        setSlideIndex((i) => {
          if (i >= items.length - 1) {
            setPlaying(false);
            return i;
          }
          setDirection(1);
          elapsedMsRef.current = 0;
          setProgress(0);
          return i + 1;
        });
      }
    }, PROGRESS_TICK_MS);

    return clearTimer;
  }, [playing, current, items.length, clearTimer]);

  // Reset progress when slide changes externally (manual nav)
  useEffect(() => {
    elapsedMsRef.current = 0;
    setProgress(0);
  }, [slideIndex]);

  // ── W4: Fullscreen API ─────────────────────────────────────────────────────

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await containerRef.current?.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      console.error("[presentation] Fullscreen API failed — browser may not support it.");
    }
  }, []);

  useEffect(() => {
    function onFullscreenChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  // ── W3: Keyboard navigation ────────────────────────────────────────────────

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // Don't intercept when typing in inputs
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          prev();
          break;
        case "ArrowRight":
          e.preventDefault();
          next();
          break;
        case " ":
          e.preventDefault();
          setPlaying((p) => !p);
          break;
        case "Escape":
          if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
          } else {
            navigate("/collections");
          }
          break;
        case "f":
        case "F":
          e.preventDefault();
          toggleFullscreen();
          break;
        default:
          break;
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [prev, next, navigate, toggleFullscreen]);

  // ── Not found / empty states ───────────────────────────────────────────────

  if (!collection) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-zinc-950 text-zinc-400 gap-4 select-none">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <FolderOpen className="w-16 h-16 opacity-30" />
          <p className="text-xl font-semibold text-white">Collection not found</p>
          <p className="text-sm text-zinc-500">
            The collection may have been deleted or the link is invalid.
          </p>
          <button
            onClick={() => navigate("/collections")}
            className="mt-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors"
          >
            ← Back to Collections
          </button>
        </motion.div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-zinc-950 text-zinc-400 gap-4 select-none">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <ImageIcon className="w-16 h-16 opacity-30" />
          <p className="text-xl font-semibold text-white">No slides in this collection</p>
          <p className="text-sm text-zinc-500">Add some media items first.</p>
          <button
            onClick={() => navigate("/collections")}
            className="mt-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors"
          >
            ← Back to Collections
          </button>
        </motion.div>
      </div>
    );
  }

  // ── W5: Resolve transition variants for current slide ─────────────────────
  const variants = getVariants(/* slide transition is not stored on CollectionItem, use fade */ "fade", direction);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-black flex flex-col select-none"
      aria-label="Presentation mode"
    >
      {/* ── W2: Slide progress bar ──────────────────────────────────────── */}
      {playing && (
        <div className="absolute top-0 left-0 right-0 h-0.5 z-20 bg-white/10">
          <motion.div
            className="h-full bg-indigo-400"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      )}

      {/* ── Top chrome ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-4 z-10 shrink-0">
        {/* Left: collection name + slide counter */}
        <div className="flex items-center gap-3">
          <FolderOpen className="w-4 h-4 text-zinc-500 shrink-0" />
          <span className="text-white font-semibold truncate max-w-xs">
            {collection.name}
          </span>
          <span
            className="text-zinc-500 text-sm tabular-nums shrink-0"
            aria-live="polite"
            aria-label={`Slide ${slideIndex + 1} of ${items.length}`}
          >
            {slideIndex + 1} / {items.length}
          </span>
        </div>

        {/* Right: controls */}
        <div className="flex items-center gap-2">
          {/* W4: Fullscreen */}
          <button
            id="presentation-fullscreen-btn"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            title={isFullscreen ? "Exit fullscreen (F)" : "Enter fullscreen (F)"}
            className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            {isFullscreen ? (
              <Minimize className="w-5 h-5" />
            ) : (
              <Maximize className="w-5 h-5" />
            )}
          </button>

          {/* Exit / close */}
          <button
            id="presentation-exit-btn"
            onClick={() => navigate("/collections")}
            aria-label="Exit presentation"
            title="Exit presentation (Esc)"
            className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ── Slide area ──────────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center relative overflow-hidden px-4 md:px-20">
        {/* Prev button */}
        <button
          id="presentation-prev-btn"
          onClick={prev}
          disabled={slideIndex === 0}
          aria-label="Previous slide"
          title="Previous slide (←)"
          className="
            absolute left-3 md:left-6 z-10
            p-3 rounded-full
            bg-white/5 hover:bg-white/15
            disabled:opacity-20 disabled:cursor-default
            text-white transition-all
            backdrop-blur-sm
          "
        >
          <ChevronLeft className="w-7 h-7" />
        </button>

        {/* W5: AnimatePresence for transitions between slides */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={slideIndex}
            initial={variants.initial}
            animate={variants.animate}
            exit={variants.exit}
            transition={{ duration: TRANSITION_DURATION, ease: "easeInOut" }}
            className="max-w-5xl w-full flex flex-col items-center gap-6"
          >
            {/* Slide media */}
            <div
              className="w-full rounded-2xl overflow-hidden bg-zinc-900 flex items-center justify-center shadow-2xl ring-1 ring-white/5"
              style={{ maxHeight: "65vh" }}
            >
              {current?.type === "image" ? (
                <img
                  src={current.url}
                  alt={current.prompt}
                  className="max-w-full max-h-[65vh] object-contain"
                  draggable={false}
                />
              ) : current?.type === "video" ? (
                <video
                  src={current.url}
                  controls
                  autoPlay={playing}
                  className="max-w-full max-h-[65vh] rounded-2xl"
                />
              ) : current?.type === "voice" ? (
                <div className="flex flex-col items-center justify-center p-16 gap-6">
                  <div className="w-20 h-20 rounded-full bg-amber-500/10 flex items-center justify-center">
                    <Mic className="w-10 h-10 text-amber-400" />
                  </div>
                  <audio src={current.url} controls autoPlay={playing} className="w-72" />
                </div>
              ) : (
                <div className="p-16 flex flex-col items-center gap-3 text-zinc-600">
                  <ImageIcon className="w-16 h-16 opacity-30" />
                  <p className="text-sm">No preview available</p>
                </div>
              )}
            </div>

            {/* Prompt label */}
            {current?.prompt && (
              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="text-zinc-400 text-sm text-center max-w-2xl px-6 line-clamp-3"
              >
                {current.prompt}
              </motion.p>
            )}

            {/* Type badge */}
            {current && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-zinc-500 font-medium">
                <TypeIcon type={current.type} />
                <span className="capitalize">{current.type}</span>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Next button */}
        <button
          id="presentation-next-btn"
          onClick={next}
          disabled={slideIndex === items.length - 1}
          aria-label="Next slide"
          title="Next slide (→)"
          className="
            absolute right-3 md:right-6 z-10
            p-3 rounded-full
            bg-white/5 hover:bg-white/15
            disabled:opacity-20 disabled:cursor-default
            text-white transition-all
            backdrop-blur-sm
          "
        >
          <ChevronRight className="w-7 h-7" />
        </button>
      </div>

      {/* ── Bottom chrome ────────────────────────────────────────────────── */}
      <div className="shrink-0 pb-4 pt-2 flex flex-col items-center gap-3">
        {/* W1: Dot indicators */}
        <div className="flex items-center gap-2 flex-wrap justify-center px-8">
          {items.map((_, i) => (
            <button
              key={i}
              onClick={() => { setPlaying(false); goTo(i, i > slideIndex ? 1 : -1); }}
              aria-label={`Go to slide ${i + 1}`}
              title={`Slide ${i + 1}`}
              className={`
                rounded-full transition-all duration-200
                ${i === slideIndex
                  ? "w-6 h-2 bg-indigo-400"
                  : "w-2 h-2 bg-zinc-700 hover:bg-zinc-500"
                }
              `}
            />
          ))}
        </div>

        {/* W2: Play / Pause button */}
        <div className="flex items-center gap-3">
          <button
            id="presentation-play-btn"
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? "Pause auto-advance" : "Play auto-advance"}
            title={playing ? "Pause (Space)" : "Auto-advance (Space)"}
            className={`
              flex items-center gap-2 px-5 py-2.5 rounded-xl
              text-sm font-medium transition-all
              ${playing
                ? "bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25"
                : "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-600/30"
              }
            `}
          >
            {playing ? (
              <>
                <Pause className="w-4 h-4" />
                Pause
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Auto-Advance
              </>
            )}
          </button>
        </div>

        {/* Keyboard hints */}
        <p className="text-zinc-700 text-xs pb-1 flex items-center gap-3">
          <span>← → navigate</span>
          <span>·</span>
          <span>Space play/pause</span>
          <span>·</span>
          <Zap className="w-3 h-3 inline" />
          <span>F fullscreen</span>
          <span>·</span>
          <span>Esc exit</span>
        </p>
      </div>
    </div>
  );
}

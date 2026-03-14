import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  ChevronLeft,
  ChevronRight,
  X,
  Image as ImageIcon,
  Video,
  Mic,
  FolderOpen,
} from "lucide-react";
import type { Collection, CollectionItem } from "./Collections";

const COLLECTIONS_KEY = "gemlink-collections";

function loadCollections(): Collection[] {
  try {
    const raw = localStorage.getItem(COLLECTIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export default function Present() {
  const { collectionId } = useParams<{ collectionId: string }>();
  const [collection, setCollection] = useState<Collection | null>(null);
  const [slideIndex, setSlideIndex] = useState(0);

  useEffect(() => {
    const cols = loadCollections();
    const col = cols.find((c) => c.id === collectionId) ?? null;
    setCollection(col);
  }, [collectionId]);

  const items = collection?.items ?? [];
  const current: CollectionItem | undefined = items[slideIndex];

  const prev = useCallback(() => {
    setSlideIndex((i) => Math.max(0, i - 1));
  }, []);

  const next = useCallback(() => {
    setSlideIndex((i) => Math.min(items.length - 1, i + 1));
  }, [items.length]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [prev, next]);

  if (!collection) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-black text-zinc-400 gap-4">
        <FolderOpen className="w-12 h-12 opacity-40" />
        <p className="text-lg font-medium text-white">Collection not found</p>
        <Link to="/collections" className="text-sm text-indigo-400 hover:text-indigo-300">← Back to Collections</Link>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-black text-zinc-400 gap-4">
        <p className="text-lg font-medium text-white">This collection is empty</p>
        <Link to="/collections" className="text-sm text-indigo-400 hover:text-indigo-300">← Back to Collections</Link>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black flex flex-col select-none">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 z-10">
        <div className="flex items-center gap-3">
          <FolderOpen className="w-4 h-4 text-zinc-500" />
          <span className="text-white font-semibold truncate">{collection.name}</span>
          <span className="text-zinc-500 text-sm">{slideIndex + 1} / {items.length}</span>
        </div>
        <Link to="/collections" aria-label="Exit presentation" className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors">
          <X className="w-5 h-5" />
        </Link>
      </div>

      {/* Slide area */}
      <div className="flex-1 flex items-center justify-center relative px-4 md:px-16">
        <button onClick={prev} disabled={slideIndex === 0} aria-label="Previous slide" className="absolute left-4 md:left-8 p-3 rounded-full bg-white/5 hover:bg-white/10 disabled:opacity-20 transition-all text-white z-10">
          <ChevronLeft className="w-7 h-7" />
        </button>

        <AnimatePresence mode="wait">
          <motion.div
            key={slideIndex}
            initial={{ opacity: 0, x: 40, scale: 0.97 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -40, scale: 0.97 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="max-w-4xl w-full flex flex-col items-center gap-6"
          >
            <div className="w-full rounded-2xl overflow-hidden bg-zinc-900 flex items-center justify-center" style={{ maxHeight: "65vh" }}>
              {current?.type === "image" ? (
                <img src={current.url} alt={current.prompt} className="max-w-full max-h-[65vh] object-contain" draggable={false} />
              ) : current?.type === "video" ? (
                <video src={current.url} controls autoPlay className="max-w-full max-h-[65vh]" />
              ) : current?.type === "voice" ? (
                <div className="flex flex-col items-center justify-center p-16 gap-6">
                  <Mic className="w-16 h-16 text-amber-400 opacity-70" />
                  <audio src={current.url} controls className="w-64" />
                </div>
              ) : (
                <div className="p-16 text-zinc-500"><ImageIcon className="w-16 h-16 opacity-30 mx-auto" /></div>
              )}
            </div>

            {current?.prompt && (
              <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="text-zinc-400 text-sm text-center max-w-xl px-4 line-clamp-3">
                {current.prompt}
              </motion.p>
            )}
          </motion.div>
        </AnimatePresence>

        <button onClick={next} disabled={slideIndex === items.length - 1} aria-label="Next slide" className="absolute right-4 md:right-8 p-3 rounded-full bg-white/5 hover:bg-white/10 disabled:opacity-20 transition-all text-white z-10">
          <ChevronRight className="w-7 h-7" />
        </button>
      </div>

      {/* Dot indicators */}
      <div className="flex items-center justify-center gap-2 py-5">
        {items.map((_, i) => (
          <button
            key={i}
            onClick={() => setSlideIndex(i)}
            aria-label={`Go to slide ${i + 1}`}
            className={`rounded-full transition-all ${i === slideIndex ? "w-5 h-2 bg-indigo-400" : "w-2 h-2 bg-zinc-700 hover:bg-zinc-500"}`}
          />
        ))}
      </div>

      <p className="text-center text-zinc-700 text-xs pb-3">← → keyboard navigation</p>
    </div>
  );
}

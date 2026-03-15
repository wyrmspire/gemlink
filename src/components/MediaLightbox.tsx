import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, ChevronLeft, ChevronRight, Star, Calendar, Download } from "lucide-react";
import { useFocusTrap } from "../hooks/useFocusTrap";

interface MediaScore {
  brandAlignment: number;
  purposeFit: number;
  technicalQuality: number;
  audienceMatch: number;
  uniqueness: number;
  overall: number;
  reasoning?: string;
  suggestions?: string[];
}

export interface LightboxJob {
  id: string;
  type: string;
  prompt?: string;
  text?: string;
  createdAt: string;
  outputs: string[];
  tags?: string[];
  score?: MediaScore;
}

interface MediaLightboxProps {
  job: LightboxJob | null;
  onClose: () => void;
  onNext?: () => void;
  onPrev?: () => void;
}

export default function MediaLightbox({ job, onClose, onNext, onPrev }: MediaLightboxProps) {
  // W4: Focus trap keeps Tab/Shift+Tab within the lightbox
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(containerRef, !!job);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && onNext) onNext();
      if (e.key === "ArrowLeft" && onPrev) onPrev();
    };
    if (job) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden"; // Prevent scrolling
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "auto";
    };
  }, [job, onClose, onNext, onPrev]);

  if (!job) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-zinc-950/90 backdrop-blur-sm"
          onClick={onClose}
        />
        
        <motion.div
          ref={containerRef}
          role="dialog"
          aria-modal="true"
          aria-label="Media lightbox preview"
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-6xl max-h-full flex flex-col md:flex-row bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl z-10"
        >
          {/* Main Media Area */}
          <div className="flex-1 bg-black relative flex items-center justify-center overflow-hidden min-h-[300px] md:min-h-[500px]">
            {onPrev && (
              <button
                onClick={(e) => { e.stopPropagation(); onPrev(); }}
                aria-label="Previous media item"
                className="absolute left-4 z-20 p-2 rounded-full bg-zinc-900/50 hover:bg-zinc-800 text-white transition-colors"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}
            
            {job.type === "image" && job.outputs?.[0] ? (
              <img src={job.outputs[0]} alt={job.prompt} className="max-w-full max-h-[80vh] object-contain" />
            ) : job.type === "video" || job.type === "compose" ? (
              <video src={job.outputs[0]} controls autoPlay className="max-w-full max-h-[80vh] object-contain" />
            ) : job.type === "voice" || job.type === "music" ? (
              <div className="w-full h-full flex items-center justify-center p-8 bg-zinc-900">
                <audio src={job.outputs[0]} controls className="w-full max-w-md" />
              </div>
            ) : (
              <p className="text-zinc-500">Preview not available</p>
            )}
            
            {onNext && (
              <button
                onClick={(e) => { e.stopPropagation(); onNext(); }}
                aria-label="Next media item"
                className="absolute right-4 z-20 p-2 rounded-full bg-zinc-900/50 hover:bg-zinc-800 text-white transition-colors"
                >
                <ChevronRight className="w-6 h-6" />
              </button>
            )}
          </div>

          {/* Sidebar Info Area */}
          <div className="w-full md:w-80 lg:w-96 flex flex-col bg-zinc-950 border-l border-zinc-800">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <h3 className="font-semibold text-white capitalize">{job.type} Details</h3>
              <div className="flex items-center gap-2">
                <a
                  href={job.outputs?.[0]}
                  download
                  className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                  title="Download"
                >
                  <Download className="w-4 h-4" />
                </a>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm">
              <div>
                <dt className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Prompt</dt>
                <dd className="text-zinc-300 leading-relaxed">{job.prompt || job.text || "No prompt available"}</dd>
              </div>
              
              {job.tags && job.tags.length > 0 && (
                <div>
                  <dt className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Tags</dt>
                  <dd className="flex flex-wrap gap-1.5">
                    {job.tags.map(tag => (
                      <span key={tag} className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 text-xs">
                        {tag}
                      </span>
                    ))}
                  </dd>
                </div>
              )}

              {job.score && (
                <div>
                  <dt className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Score</dt>
                  <dd>
                    <div className="flex items-center gap-2 text-amber-400">
                      <Star className="w-4 h-4 fill-amber-400" />
                      <span className="font-semibold text-lg">{job.score.overall.toFixed(1)}</span>
                      <span className="text-zinc-500 text-sm">/ 5.0</span>
                    </div>
                    {job.score.reasoning && (
                      <p className="mt-2 text-zinc-400 bg-zinc-900 p-3 rounded-xl border border-zinc-800/50">
                        {job.score.reasoning}
                      </p>
                    )}
                  </dd>
                </div>
              )}

              <div>
                <dt className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Metadata</dt>
                <dd className="space-y-2">
                  <div className="flex items-center gap-2 text-zinc-400">
                    <Calendar className="w-4 h-4" />
                    <span>{new Date(job.createdAt).toLocaleString()}</span>
                  </div>
                </dd>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

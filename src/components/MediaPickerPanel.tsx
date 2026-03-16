import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Image as ImageIcon,
  Film,
  Mic,
  Music,
  Search,
  Loader2,
  RefreshCw,
  LayoutGrid,
  AlertCircle,
  Check,
  X,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MediaJob {
  id: string;
  type: "image" | "video" | "voice" | "music";
  prompt?: string;
  text?: string;
  outputPath?: string;
  outputs?: string[];
  tags?: string[];
  score?: number;
  duration?: number;
  width?: number;
  height?: number;
  aspectRatio?: string;
  createdAt?: string;
}

type FilterType = "all" | "image" | "video" | "voice" | "music";

interface MediaPickerPanelProps {
  onSelect: (job: MediaJob) => void;
  filterType?: FilterType;
  projectId?: string;
  className?: string;
}

// ─── Filter tabs config ───────────────────────────────────────────────────────

const FILTER_TABS: { key: FilterType; label: string; icon: React.ReactNode }[] = [
  { key: "all", label: "All", icon: <LayoutGrid className="w-3.5 h-3.5" /> },
  { key: "image", label: "Images", icon: <ImageIcon className="w-3.5 h-3.5" /> },
  { key: "video", label: "Videos", icon: <Film className="w-3.5 h-3.5" /> },
  { key: "voice", label: "Voice", icon: <Mic className="w-3.5 h-3.5" /> },
  { key: "music", label: "Music", icon: <Music className="w-3.5 h-3.5" /> },
];

// ─── Thumbnail helpers ────────────────────────────────────────────────────────

function getJobThumbnail(job: MediaJob): string | null {
  // Try outputs array first
  if (job.outputs && job.outputs.length > 0 && job.type === "image") {
    return job.outputs[0];
  }
  // Try outputPath if image
  if (job.outputPath && job.type === "image") {
    return job.outputPath;
  }
  return null;
}

function TypeBadge({ type }: { type: MediaJob["type"] }) {
  const configs: Record<string, { label: string; className: string }> = {
    image: { label: "IMG", className: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30" },
    video: { label: "VID", className: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
    voice: { label: "VOX", className: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
    music: { label: "MUS", className: "bg-pink-500/20 text-pink-300 border-pink-500/30" },
  };
  const c = configs[type] ?? { label: type.slice(0, 3).toUpperCase(), className: "bg-zinc-500/20 text-zinc-300 border-zinc-500/30" };
  return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${c.className}`}>
      {c.label}
    </span>
  );
}

function TypeIconPlaceholder({ type }: { type: MediaJob["type"] }) {
  if (type === "video") return <Film className="w-8 h-8 text-emerald-400/60" />;
  if (type === "voice") return <Mic className="w-8 h-8 text-amber-400/60" />;
  if (type === "music") return <Music className="w-8 h-8 text-pink-400/60" />;
  return <ImageIcon className="w-8 h-8 text-indigo-400/60" />;
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-3 gap-2 p-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="aspect-square rounded-xl bg-zinc-800 animate-pulse" />
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MediaPickerPanel({
  onSelect,
  filterType: initialFilter,
  projectId,
  className = "",
}: MediaPickerPanelProps) {
  const [jobs, setJobs] = useState<MediaJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>(initialFilter ?? "all");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);

  // Sync filter when parent changes pickerTarget (e.g., voice → only voice)
  useEffect(() => {
    if (initialFilter !== undefined) {
      setFilter(initialFilter);
    }
  }, [initialFilter]);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch all media history without projectId filter — matches Library.tsx behavior.
      // Server-side projectId tagging is a Lane 1 concern; filtering here would return
      // empty results for jobs generated before the project system existed.
      const res = await fetch("/api/media/history", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setJobs(Array.isArray(data) ? data : []);
    } catch {
      setError("Could not load media library.");
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // ── Filtering ──────────────────────────────────────────────────────────────

  const filtered = jobs.filter((job) => {
    if (filter !== "all" && job.type !== filter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const inPrompt = (job.prompt ?? "").toLowerCase().includes(q);
      const inText = (job.text ?? "").toLowerCase().includes(q);
      const inTags = (job.tags ?? []).some((t) => t.toLowerCase().includes(q));
      if (!inPrompt && !inText && !inTags) return false;
    }
    return true;
  });

  const handleItemClick = (job: MediaJob, e: React.MouseEvent) => {
    const isMultiSelect = e.ctrlKey || e.metaKey;
    const isRangeSelect = e.shiftKey;

    if (isRangeSelect && lastSelectedId) {
      const currentIdx = filtered.findIndex((j) => j.id === job.id);
      const lastIdx = filtered.findIndex((j) => j.id === lastSelectedId);
      if (currentIdx !== -1 && lastIdx !== -1) {
        const start = Math.min(currentIdx, lastIdx);
        const end = Math.max(currentIdx, lastIdx);
        const rangeIds = filtered.slice(start, end + 1).map((j) => j.id);
        setSelectedIds((prev) => {
          const next = new Set(prev);
          rangeIds.forEach((rid) => next.add(rid));
          return next;
        });
      }
    } else if (isMultiSelect) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(job.id)) next.delete(job.id);
        else next.add(job.id);
        return next;
      });
    } else {
      // If we have a selection, regular click toggles/adds?
      // For picker, usually regular click selects one and closes.
      // But if we want multi-select, maybe it should just be part of the selection.
      if (selectedIds.size > 0) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(job.id)) next.delete(job.id);
          else next.add(job.id);
          return next;
        });
      } else {
        onSelect(job);
      }
    }
    setLastSelectedId(job.id);
  };

  const handleBatchSelect = () => {
    const selectedJobs = jobs.filter(j => selectedIds.has(j.id));
    selectedJobs.forEach(job => onSelect(job));
    setSelectedIds(new Set());
    setLastSelectedId(null);
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setLastSelectedId(null);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className={`flex flex-col h-full bg-zinc-950 border-r border-zinc-800 ${className}`}>
      {/* Header */}
      <div className="px-3 pt-3 pb-2 border-b border-zinc-800 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs uppercase tracking-widest text-zinc-500 font-medium">
            Media Library
          </span>
          <button
            onClick={fetchJobs}
            title="Refresh"
            className="p-1 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search media…"
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              disabled={initialFilter !== undefined && initialFilter !== "all" && tab.key !== initialFilter && tab.key !== "all"}
              className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === tab.key
                  ? "bg-indigo-600 text-white"
                  : initialFilter !== undefined && initialFilter !== "all" && tab.key !== initialFilter && tab.key !== "all"
                  ? "bg-zinc-900/40 text-zinc-700 cursor-not-allowed"
                  : "bg-zinc-900 text-zinc-500 hover:text-white hover:bg-zinc-800"
              }`}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Locked filter notice */}
        {initialFilter !== undefined && initialFilter !== "all" && (
          <p className="text-[10px] text-amber-400/70 mt-1.5 px-0.5">
            Showing {initialFilter} items only for this selection.
          </p>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <SkeletonGrid />
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center gap-2">
            <AlertCircle className="w-8 h-8 text-red-400/60" />
            <p className="text-xs text-zinc-500">{error}</p>
            <button
              onClick={fetchJobs}
              className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              Try again
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center gap-2">
            <ImageIcon className="w-10 h-10 text-zinc-700" />
            <p className="text-sm font-medium text-zinc-400">
              {jobs.length === 0 ? "No media yet" : "No results"}
            </p>
            <p className="text-xs text-zinc-600">
              {jobs.length === 0
                ? "Generate some first"
                : "Try a different filter or search term"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1.5 p-2">
            <AnimatePresence mode="popLayout">
              {filtered.map((job, i) => {
                const thumb = getJobThumbnail(job);
                const label = job.prompt ?? job.text ?? "";
                return (
                  <motion.button
                    key={job.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ delay: i * 0.02 }}
                    onClick={(e) => handleItemClick(job, e)}
                    title={label}
                    className={`group relative aspect-square rounded-xl overflow-hidden bg-zinc-900 border transition-all hover:scale-[1.03] focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                      selectedIds.has(job.id) ? "border-indigo-500 ring-2 ring-indigo-500/20" : "border-zinc-800 hover:border-indigo-500/60"
                    }`}
                  >
                    {/* Selection Checkbox Overlay */}
                    <div className={`absolute top-1.5 right-1.5 z-20 w-4 h-4 rounded border flex items-center justify-center transition-all ${
                      selectedIds.has(job.id) 
                        ? "bg-indigo-600 border-indigo-500 scale-110" 
                        : "bg-black/40 border-white/20 opacity-0 group-hover:opacity-100"
                    }`}>
                      {selectedIds.has(job.id) && <Check className="w-2.5 h-2.5 text-white" />}
                    </div>
                    {thumb ? (
                      job.type === "video" ? (
                        <video
                          src={thumb}
                          className="w-full h-full object-cover"
                          muted
                          playsInline
                          onMouseOver={(e) => e.currentTarget.play()}
                          onMouseOut={(e) => {
                            e.currentTarget.pause();
                            e.currentTarget.currentTime = 0;
                          }}
                        />
                      ) : (
                        <img
                          src={thumb}
                          alt={label}
                          className="w-full h-full object-cover"
                        />
                      )
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <TypeIconPlaceholder type={job.type} />
                      </div>
                    )}

                    {/* Type badge overlay */}
                    <div className="absolute top-1 left-1 flex flex-col gap-1 items-start">
                      <TypeBadge type={job.type} />
                      {job.duration !== undefined && job.type !== "image" && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border bg-black/60 text-white border-white/20">
                          {job.duration.toFixed(1)}s
                        </span>
                      )}
                    </div>

                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-end">
                      {label && (
                        <p className="w-full px-1.5 pb-1 text-[10px] text-white/0 group-hover:text-white/90 transition-colors line-clamp-2 leading-tight">
                          {label.slice(0, 60)}
                        </p>
                      )}
                    </div>
                  </motion.button>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Footer count */}
      {!loading && !error && (
        <div className="px-3 py-2 border-t border-zinc-800 shrink-0">
          <p className="text-[10px] text-zinc-600">
            {filtered.length} of {jobs.length} item{jobs.length !== 1 ? "s" : ""}
          </p>
        </div>
      )}

      {/* Floating Selection Badge */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-12 left-2 right-2 z-30 flex items-center justify-between gap-2 bg-indigo-600 px-3 py-2 rounded-xl shadow-xl border border-indigo-400/30"
          >
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold bg-white text-indigo-600 px-1.5 py-0.5 rounded-full">
                {selectedIds.size}
              </span>
              <span className="text-[11px] font-semibold text-white">Selected</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={clearSelection}
                className="text-[10px] text-indigo-100 hover:text-white underline underline-offset-2"
              >
                Clear
              </button>
              <button
                onClick={handleBatchSelect}
                className="text-[10px] bg-white text-indigo-600 font-bold px-2 py-1 rounded-lg hover:bg-zinc-100 transition-colors"
              >
                Add Items
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

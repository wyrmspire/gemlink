import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Image as ImageIcon,
  Video,
  Mic,
  Clock,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Search,
  Copy,
  RotateCcw,
  Check,
  Star,
  SortAsc,
} from "lucide-react";
import { useToast } from "../context/ToastContext";

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

interface Job {
  id: string;
  type: "image" | "video" | "voice";
  prompt?: string;
  text?: string;
  createdAt: string;
  updatedAt?: string;
  status?: "pending" | "completed" | "failed";
  outputs: string[];
  error?: string;
  logs?: string[];
  tags?: string[];
  score?: MediaScore;
}

type SortMode = "newest" | "highest";

export default function Library() {
  const { toast } = useToast();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("newest");

  const fetchHistory = useCallback(async (silent = false) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const response = await fetch("/api/media/history", { cache: "no-store" });
      if (!response.ok) throw new Error("Failed to load history");
      const data = await response.json();
      setJobs(data);
    } catch (error) {
      console.error("Failed to fetch history:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  useEffect(() => {
    const hasPending = jobs.some((job) => job.status === "pending");
    if (!hasPending) return;
    const interval = window.setInterval(() => fetchHistory(true), 10000);
    return () => window.clearInterval(interval);
  }, [jobs, fetchHistory]);

  // Client-side search filter + sort
  const filtered = useMemo(() => {
    let result = jobs;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((j) =>
        (j.prompt ?? j.text ?? "").toLowerCase().includes(q) ||
        (j.tags ?? []).some((t) => t.toLowerCase().includes(q))
      );
    }
    if (sortMode === "highest") {
      result = [...result].sort((a, b) => {
        const sa = a.score?.overall ?? 0;
        const sb = b.score?.overall ?? 0;
        return sb - sa;
      });
    } else {
      // newest first (default server order, but ensure it)
      result = [...result].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    }
    return result;
  }, [jobs, search, sortMode]);

  const getIcon = (type: string) => {
    switch (type) {
      case "image": return <ImageIcon className="w-5 h-5 text-indigo-400" />;
      case "video": return <Video className="w-5 h-5 text-emerald-400" />;
      case "voice": return <Mic className="w-5 h-5 text-amber-400" />;
      default: return <Clock className="w-5 h-5 text-zinc-400" />;
    }
  };

  const getStatusPill = (job: Job) => {
    switch (job.status) {
      case "pending":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-1 text-xs text-amber-300">
            <Clock className="w-3 h-3" />Pending
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-1 text-xs text-red-300">
            <AlertCircle className="w-3 h-3" />Failed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300">
            <CheckCircle2 className="w-3 h-3" />Ready
          </span>
        );
    }
  };

  const handleCopyPrompt = (job: Job) => {
    const text = job.prompt ?? job.text ?? "";
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(job.id);
      toast("Prompt copied to clipboard.", "success");
      setTimeout(() => setCopiedId(null), 2000);
    }).catch(() => toast("Failed to copy prompt.", "error"));
  };

  const handleRegenerate = async (job: Job) => {
    const promptText = job.prompt ?? job.text ?? "";
    if (!promptText) { toast("No prompt to regenerate from.", "warning"); return; }
    try {
      let endpoint = "/api/media/image";
      let body: Record<string, unknown> = { prompt: promptText };

      if (job.type === "video") endpoint = "/api/media/video";
      else if (job.type === "voice") {
        endpoint = "/api/media/voice";
        body = { text: promptText };
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Regeneration failed");
      toast("Regeneration started — check back shortly.", "info");
      setTimeout(() => fetchHistory(true), 2000);
    } catch (e: any) {
      toast(e.message || "Failed to regenerate.", "error");
    }
  };

  const lastLog = (job: Job) => job.logs?.[job.logs.length - 1];

  /** Render a star-rating badge for the overall score */
  const scoreBadge = (score: MediaScore) => {
    const val = score.overall.toFixed(1);
    const pct = (score.overall / 5) * 100;
    return (
      <span
        title={`Score: ${val}/5\n${score.reasoning ?? ""}`}
        className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-300 border border-amber-500/20"
      >
        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
        {val}
        <span className="sr-only">out of 5, {pct.toFixed(0)}%</span>
      </span>
    );
  };

  /** Render AI-generated tag pills */
  const tagPills = (tags: string[]) => (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {tags.slice(0, 5).map((tag) => (
        <span
          key={tag}
          className="px-1.5 py-0.5 rounded-md bg-zinc-800 border border-zinc-700 text-zinc-400 text-xs"
        >
          {tag}
        </span>
      ))}
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 md:p-8 max-w-6xl mx-auto"
    >
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white mb-2">Media Library</h1>
          <p className="text-zinc-400 text-sm md:text-base">
            Browse your generated images, videos, and voice assets.
          </p>
        </div>
        <button
          onClick={() => fetchHistory(true)}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-900"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Search + Sort toolbar */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            id="library-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search prompts or tags…"
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-11 pr-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        {/* Sort toggle */}
        <div className="flex items-center gap-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2">
          <SortAsc className="w-4 h-4 text-zinc-500 shrink-0" />
          <span className="text-xs text-zinc-500 mr-1 hidden sm:block">Sort:</span>
          <button
            id="sort-newest"
            onClick={() => setSortMode("newest")}
            className={`text-xs px-2 py-1 rounded-lg transition-colors ${
              sortMode === "newest"
                ? "bg-indigo-600 text-white"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            Newest
          </button>
          <button
            id="sort-highest"
            onClick={() => setSortMode("highest")}
            className={`text-xs px-2 py-1 rounded-lg transition-colors ${
              sortMode === "highest"
                ? "bg-amber-600 text-white"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            ★ Highest Rated
          </button>
        </div>
      </div>

      {loading ? (
        /* D1: Skeleton loader */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden flex flex-col animate-pulse"
            >
              <div className="aspect-square bg-zinc-800/60" />
              <div className="p-4 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded bg-zinc-700/60" />
                  <div className="h-3 w-16 rounded bg-zinc-700/60" />
                  <div className="ml-auto h-5 w-14 rounded-full bg-zinc-700/60" />
                </div>
                <div className="space-y-1.5">
                  <div className="h-3 w-full rounded bg-zinc-800/80" />
                  <div className="h-3 w-4/5 rounded bg-zinc-800/80" />
                </div>
                {/* tag pill skeletons */}
                <div className="flex gap-1">
                  <div className="h-4 w-12 rounded-md bg-zinc-800/80" />
                  <div className="h-4 w-14 rounded-md bg-zinc-800/80" />
                  <div className="h-4 w-10 rounded-md bg-zinc-800/80" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-zinc-950 border border-zinc-800 rounded-2xl">
          <ImageIcon className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">
            {search ? "No results found" : "No media yet"}
          </h3>
          <p className="text-zinc-400">
            {search ? "Try a different search term." : "Your generated assets will appear here."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          <AnimatePresence>
            {filtered.map((job) => (
              <motion.div
                key={job.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden flex flex-col"
              >
                {/* Media area */}
                <div className="aspect-square bg-zinc-900 relative flex items-center justify-center overflow-hidden">
                  {job.type === "image" && job.outputs.length > 0 ? (
                    <img src={job.outputs[0]} alt={job.prompt} className="w-full h-full object-cover" />
                  ) : job.type === "video" && job.status === "completed" && job.outputs.length > 0 ? (
                    <video src={job.outputs[0]} controls className="w-full h-full object-cover" />
                  ) : job.type === "voice" && job.status === "completed" && job.outputs.length > 0 ? (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-900 p-4">
                      <Mic className="w-12 h-12 text-amber-400 mb-6 opacity-80" />
                      <audio src={job.outputs[0]} controls className="w-full max-w-[240px]" />
                    </div>
                  ) : (
                    <div className="flex flex-col items-center px-6 text-center text-zinc-500">
                      {getIcon(job.type)}
                      <span className="mt-3 text-sm font-medium uppercase tracking-wider">
                        {job.status || "pending"}
                      </span>
                      {lastLog(job) && <p className="mt-2 text-xs text-zinc-500">{lastLog(job)}</p>}
                    </div>
                  )}

                  {/* Score overlay badge (top-right corner) */}
                  {job.score && (
                    <div className="absolute top-2 right-2">
                      {scoreBadge(job.score)}
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="p-4 flex-1 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    {getIcon(job.type)}
                    <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                      {job.type}
                    </span>
                    <span className="ml-auto">{getStatusPill(job)}</span>
                  </div>

                  <p className="text-sm text-zinc-300 line-clamp-3">
                    {job.prompt || job.text || "No description available"}
                  </p>

                  {/* Tags */}
                  {job.tags && job.tags.length > 0 && tagPills(job.tags)}

                  <div className="text-xs text-zinc-500 space-y-1 mt-auto pt-1">
                    <p>Created {new Date(job.createdAt).toLocaleString()}</p>
                    {job.updatedAt && <p>Updated {new Date(job.updatedAt).toLocaleString()}</p>}
                    {job.error && <p className="text-red-300">{job.error}</p>}
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2 pt-1">
                    <button
                      id={`copy-prompt-${job.id}`}
                      onClick={() => handleCopyPrompt(job)}
                      title="Copy prompt"
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-zinc-700 text-xs text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors"
                    >
                      {copiedId === job.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      Copy Prompt
                    </button>
                    <button
                      id={`regen-${job.id}`}
                      onClick={() => handleRegenerate(job)}
                      title="Regenerate"
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-zinc-700 text-xs text-zinc-400 hover:text-white hover:border-indigo-500 transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Regenerate
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}

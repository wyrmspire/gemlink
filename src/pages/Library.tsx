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
  BarChart2,
  Film,
  Layers,
  ExternalLink,
  Trash2,
  SendHorizonal,
  Music,
  Download,
  FolderPlus,
  X,
} from "lucide-react";
import { useToast } from "../context/ToastContext";
import { useProject } from "../context/ProjectContext";
import { useNavigate } from "react-router-dom";
import MediaLightbox from "../components/MediaLightbox";

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
  type: "image" | "video" | "voice" | "music" | "compose";
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
  // Compose-specific fields (from compose job manifest)
  slideCount?: number;
  templateName?: string;
  sourceDescription?: string;
  composeConfig?: Record<string, any>;
  duration?: number;
  aspectRatio?: string;
}

type SortMode = "newest" | "highest";
type FilterType = "all" | "image" | "video" | "voice" | "music" | "compose";

export default function Library() {
  const { toast } = useToast();
  const { activeProject } = useProject();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [savingInsights, setSavingInsights] = useState(false);
  const [collections, setCollections] = useState<{ id: string, name: string }[]>([]);
  const [showCollectionPicker, setShowCollectionPicker] = useState(false);

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

  const fetchCollections = useCallback(async () => {
    try {
      const projId = activeProject?.id ?? "default";
      const res = await fetch(`/api/collections?projectId=${encodeURIComponent(projId)}`);
      if (res.ok) {
        setCollections(await res.json());
      }
    } catch (e) {
      console.error("Failed to fetch collections", e);
    }
  }, [activeProject?.id]);

  useEffect(() => {
    fetchHistory();
    fetchCollections();
  }, [fetchHistory, fetchCollections]);

  useEffect(() => {
    const hasPending = jobs.some((job) => job.status === "pending");
    if (!hasPending) return;
    const interval = window.setInterval(() => fetchHistory(true), 10000);
    return () => window.clearInterval(interval);
  }, [jobs, fetchHistory]);

  // Client-side search filter + sort + type filter
  const filtered = useMemo(() => {
    let result = jobs;

    // Type filter (Lane 3: includes "compose")
    if (filterType !== "all") {
      result = result.filter((j) => j.type === filterType);
    }

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
  }, [jobs, search, sortMode, filterType]);

  const selectedJobIndex = useMemo(() => {
    return selectedJobId ? filtered.findIndex(j => j.id === selectedJobId) : -1;
  }, [filtered, selectedJobId]);
  
  const selectedJob = selectedJobIndex >= 0 ? filtered[selectedJobIndex] : null;

  const handleNext = () => {
    if (selectedJobIndex < filtered.length - 1) {
      setSelectedJobId(filtered[selectedJobIndex + 1].id);
    }
  };

  const handlePrev = () => {
    if (selectedJobIndex > 0) {
      setSelectedJobId(filtered[selectedJobIndex - 1].id);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "image": return <ImageIcon className="w-5 h-5 text-indigo-400" />;
      case "video": return <Video className="w-5 h-5 text-emerald-400" />;
      case "voice": return <Mic className="w-5 h-5 text-amber-400" />;
      case "compose": return <Film className="w-5 h-5 text-violet-400" />;
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

  const handleDelete = async (job: Job) => {
    if (!confirm("Are you sure you want to delete this item?")) return;
    try {
      const res = await fetch(`/api/media/job/${job.type}/${job.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      toast("Item deleted.", "success");
      fetchHistory(true);
    } catch (e: any) {
      toast(e.message || "Failed to delete.", "error");
    }
  };

  const handleSelect = (id: string, e: React.MouseEvent) => {
    const isMultiSelect = e.ctrlKey || e.metaKey;
    const isRangeSelect = e.shiftKey;

    if (isRangeSelect && lastSelectedId) {
      const currentIdx = filtered.findIndex((j) => j.id === id);
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
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    } else {
      // Regular click - open lightbox
      setSelectedJobId(id);
    }
    setLastSelectedId(id);
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setLastSelectedId(null);
  };

  const handleBatchDownload = async () => {
    const selectedJobs = jobs.filter(j => selectedIds.has(j.id));
    toast(`Starting download of ${selectedJobs.length} items...`, "info");
    for (const job of selectedJobs) {
      if (job.outputs?.[0]) {
        const link = document.createElement("a");
        link.href = job.outputs[0];
        const url = job.outputs[0];
        link.download = (typeof url === "string" ? url.split("/").pop() : "download") || "download";
        link.target = "_blank";
        link.click();
        await new Promise(r => setTimeout(r, 150));
      }
    }
  };

  const handleBatchSendToCompose = () => {
    const selectedJobs = jobs.filter(j => selectedIds.has(j.id));
    const current = JSON.parse(sessionStorage.getItem("compose-batch-items") || "[]");
    const next = [...current, ...selectedJobs.map(j => ({
      id: j.id,
      type: j.type,
      url: j.outputs[0],
      prompt: j.prompt || j.text
    }))];
    sessionStorage.setItem("compose-batch-items", JSON.stringify(next));
    toast(`Sent ${selectedJobs.length} items to Compose.`, "success");
    navigate("/compose");
  };

  const handleBatchDelete = async () => {
    const idsToDelete = Array.from(selectedIds);
    const previousJobs = [...jobs];
    setJobs(prev => prev.filter(j => !selectedIds.has(j.id)));
    const count = selectedIds.size;
    clearSelection();

    try {
      const res = await fetch("/api/media/bulk-delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: idsToDelete })
      });
      if (!res.ok) throw new Error();

      toast(`${count} items archived.`, "info", {
        duration: 10000,
        action: {
          label: "Undo",
          onClick: async () => {
             await fetch("/api/media/unarchive", {
               method: "POST",
               headers: { "Content-Type": "application/json" },
               body: JSON.stringify({ ids: idsToDelete })
             });
             setJobs(previousJobs);
             toast("Archived items restored.", "success");
          }
        }
      });
    } catch {
      setJobs(previousJobs);
      toast("Failed to archive items.", "error");
    }
  };

  const handleAddToCollection = async (collectionId: string) => {
    const selectedJobs = jobs.filter(j => selectedIds.has(j.id));
    let successCount = 0;
    
    for (const job of selectedJobs) {
      try {
        const item = {
          jobId: job.id,
          type: job.type === "compose" ? "video" : job.type,
          url: job.outputs[0],
          prompt: job.prompt || job.text || "",
          addedAt: new Date().toISOString(),
        };
        const res = await fetch(`/api/collections/${collectionId}/items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item),
        });
        if (res.ok) successCount++;
      } catch (e) {
        console.error(e);
      }
    }
    
    toast(`Added ${successCount} items to collection.`, "success");
    setShowCollectionPicker(false);
    clearSelection();
  };

  /** W3 (L2): Send a Library item directly to the Compose page */
  const handleSendToCompose = (job: Job) => {
    try {
      // Store a compact job descriptor; Compose reads this on mount
      const payload = {
        id: job.id,
        type: job.type,
        prompt: job.prompt,
        text: job.text,
        outputs: job.outputs,
        outputPath: job.outputs?.[0],
        tags: job.tags,
      };
      sessionStorage.setItem("compose-send-item", JSON.stringify(payload));
      navigate("/compose");
    } catch {
      toast("Failed to send to Compose.", "error");
    }
  };

  const lastLog = (job: Job) => job.logs?.[job.logs.length - 1];

  /** W4 (L6): Save scoring insights as a strategy artifact */
  const handleSaveScoringInsights = async () => {
    const projectId = activeProject?.id;
    if (!projectId) {
      toast("Select an active project first.", "warning");
      return;
    }
    setSavingInsights(true);
    try {
      const res = await fetch("/api/media/scoring-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scoring insights failed");
      toast(`📊 Scoring insights saved as strategy artifact (${data.mediaAnalyzed} media analyzed)`, "success");
    } catch (e: any) {
      toast(e.message || "Failed to save scoring insights.", "error");
    } finally {
      setSavingInsights(false);
    }
  };

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

  // Filter type tabs config
  const TYPE_TABS: { value: FilterType; label: string }[] = [
    { value: "all", label: "All" },
    { value: "image", label: "Images" },
    { value: "video", label: "Videos" },
    { value: "voice", label: "Voice" },
    { value: "music", label: "Music" },
    { value: "compose", label: "Composed" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 md:p-8 max-w-6xl mx-auto"
    >
      {/* Sticky Batch Actions Bar */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="sticky top-0 z-[60] bg-indigo-600 shadow-xl border-b border-indigo-500/50 -mx-4 md:-mx-8 px-4 md:px-8 py-3 flex items-center justify-between mb-4 backdrop-blur-md bg-opacity-95"
          >
            <div className="flex items-center gap-4">
              <button 
                onClick={clearSelection}
                className="p-1.5 hover:bg-white/20 rounded-lg transition-colors text-white"
                title="Clear selection"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-bold text-white leading-none">
                  {selectedIds.size}
                </span>
                <span className="text-sm font-medium text-indigo-100 uppercase tracking-wider">
                  Selected
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleBatchDownload}
                className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm font-medium transition-all"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Download</span>
              </button>
              <button
                onClick={() => setShowCollectionPicker(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm font-medium transition-all"
              >
                <FolderPlus className="w-4 h-4" />
                <span className="hidden sm:inline">Add to Collection</span>
              </button>
              <button
                onClick={handleBatchSendToCompose}
                className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm font-medium transition-all"
              >
                <SendHorizonal className="w-4 h-4" />
                <span className="hidden sm:inline">Compose</span>
              </button>
              <div className="w-px h-6 bg-white/20 mx-1" />
              <button
                onClick={handleBatchDelete}
                className="flex items-center gap-2 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/40 text-red-100 rounded-xl text-sm font-medium transition-all border border-red-400/20"
              >
                <Trash2 className="w-4 h-4" />
                <span className="hidden sm:inline">Delete</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white mb-2">Media Library</h1>
          <p className="text-zinc-400 text-sm md:text-base">
            Browse your generated images, videos, voice, music, and composed videos.
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

      {/* Search + Sort + Filter toolbar */}
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

        {/* Type filter tabs — W5 (Lane 3): includes Composed */}
        <div className="flex items-center gap-1 bg-zinc-950 border border-zinc-800 rounded-xl px-2 py-1.5">
          {TYPE_TABS.map((tab) => (
            <button
              key={tab.value}
              id={`filter-${tab.value}`}
              onClick={() => setFilterType(tab.value)}
              className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${
                filterType === tab.value
                  ? tab.value === "compose"
                    ? "bg-violet-600 text-white"
                    : "bg-indigo-600 text-white"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
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

        {/* W4 (L6): Save Scoring Insights button — only visible in Highest Rated mode */}
        {sortMode === "highest" && (
          <button
            id="save-scoring-insights"
            onClick={handleSaveScoringInsights}
            disabled={savingInsights}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600/15 hover:bg-amber-600/25 border border-amber-500/30 text-amber-300 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Analyze scoring trends and save as a strategy artifact"
          >
            {savingInsights ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <BarChart2 className="w-4 h-4" />
            )}
            📊 Save Scoring Insights
          </button>
        )}
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
            {search || filterType !== "all" ? "No results found" : "No media yet"}
          </h3>
          <p className="text-zinc-400">
            {search || filterType !== "all"
              ? "Try a different search term or filter."
              : "Your generated assets will appear here."}
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
                className={`bg-zinc-950 border transition-all duration-200 rounded-2xl overflow-hidden flex flex-col ${
                  selectedIds.has(job.id) ? "border-indigo-500 ring-2 ring-indigo-500/20" : "border-zinc-800"
                }`}
              >
                {/* Media area */}
                <div 
                  className={`relative flex items-center justify-center overflow-hidden bg-zinc-900 group ${
                    job.status === "completed" && job.outputs && job.outputs.length > 0 ? "cursor-pointer" : ""
                  } ${(() => {
                    const isAudio = job.type === "voice" || job.type === "music";
                    if (isAudio) return "aspect-square";
                    
                    const ar = job.aspectRatio || (job as any).composeConfig?.output?.aspectRatio;
                    if (ar === "9:16") return "aspect-[9/16]";
                    if (ar === "16:9") return "aspect-video";
                    if (ar === "4:5") return "aspect-[4/5]";
                    if (ar === "1:1") return "aspect-square";
                    
                    if (job.type === "image") return "aspect-auto max-h-[460px]";
                    return "aspect-video";
                  })()}`}
                  onClick={(e) => handleSelect(job.id, e)}
                >
                  {/* Selection Checkbox Overlay */}
                  <div 
                    id={`select-${job.id}`}
                    className={`absolute top-2 right-2 z-20 w-5 h-5 rounded-lg border flex items-center justify-center transition-all ${
                      selectedIds.has(job.id) 
                        ? "bg-indigo-600 border-indigo-500 scale-110" 
                        : "bg-black/40 border-white/20 opacity-0 group-hover:opacity-100"
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelect(job.id, { ...e, ctrlKey: true } as any);
                    }}
                  >
                    {selectedIds.has(job.id) && <Check className="w-3.5 h-3.5 text-white" />}
                  </div>
                  {job.type === "image" && job.outputs.length > 0 ? (
                    <img src={job.outputs[0]} alt={job.prompt} className="w-full h-full object-contain" />
                  ) : (job.type === "video" || job.type === "compose" || job.tags?.includes("compose")) && job.status === "completed" && job.outputs.length > 0 ? (
                    <video src={job.outputs[0]} controls className="w-full h-full object-contain" />
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

                  {/* Aspect ratio badge (top-left corner) - W5 Lane 3 */}
                  {(job.type === "video" || job.type === "image" || job.type === "compose" || job.tags?.includes("compose")) && (job.aspectRatio || (job as any).composeConfig?.output?.aspectRatio) && (
                    <div className="absolute top-2 left-2 z-10">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-zinc-950/80 text-zinc-300 border border-zinc-800 backdrop-blur-md">
                        {job.aspectRatio || (job as any).composeConfig?.output?.aspectRatio}
                      </span>
                    </div>
                  )}

                  {/* Score overlay badge (top-right corner) */}
                  {job.score && (
                    <div className="absolute top-2 right-2">
                      {scoreBadge(job.score)}
                    </div>
                  )}

                  {/* Compose type indicator (top-left if aspect badge missing, else below) */}
                  {(job.type === "compose" || job.tags?.includes("compose")) && (
                    <div className={`absolute left-2 ${ (job.aspectRatio || (job as any).composeConfig?.output?.aspectRatio) ? "top-8" : "top-2"}`}>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-violet-600/80 text-white backdrop-blur-sm">
                        <Film className="w-2.5 h-2.5" /> Composed
                      </span>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="p-4 flex-1 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    {getIcon((job.type === "compose" || job.tags?.includes("compose")) ? "compose" : job.type)}
                    <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                      {(job.type === "compose" || job.tags?.includes("compose")) ? "Composed Video" : job.type}
                    </span>
                    <span className="ml-auto">{getStatusPill(job)}</span>
                  </div>

                  {/* Compose-specific badges (W5 Lane 3) */}
                  {(job.type === "compose" || job.tags?.includes("compose")) && (
                    <div className="flex items-center gap-2 flex-wrap">
                      {job.slideCount && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-violet-500/15 text-violet-300 border border-violet-500/20">
                          <Layers className="w-2.5 h-2.5" />{job.slideCount} slides
                        </span>
                      )}
                      {job.templateName && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-indigo-500/15 text-indigo-300 border border-indigo-500/20">
                          {job.templateName}
                        </span>
                      )}
                      {job.duration && (
                        <span className="text-xs text-zinc-500">{job.duration.toFixed(1)}s</span>
                      )}
                    </div>
                  )}

                  <p className="text-sm text-zinc-300 line-clamp-3">
                    {job.prompt || job.text || "No description available"}
                  </p>

                  {/* Tags */}
                  {job.tags && job.tags.length > 0 && tagPills(job.tags)}

                  {/* Compose source indicator */}
                  {job.type === "compose" && job.sourceDescription && (
                    <p className="text-xs text-zinc-500 italic">{job.sourceDescription}</p>
                  )}

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

                    {/* W5 (Lane 3): Compose jobs get Re-edit instead of Regenerate */}
                    {(job.type === "compose" || job.tags?.includes("compose")) ? (
                      <button
                        id={`re-edit-${job.id}`}
                        onClick={() => {
                          if (job.composeConfig) {
                            sessionStorage.setItem("compose-re-edit", JSON.stringify(job.composeConfig));
                          }
                          navigate("/compose");
                        }}
                        title="Re-edit this composition"
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-violet-700/50 text-xs text-violet-400 hover:text-white hover:border-violet-500 transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Re-edit
                      </button>
                    ) : (
                      <button
                        id={`regen-${job.id}`}
                        onClick={() => handleRegenerate(job)}
                        title="Regenerate"
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-zinc-700 text-xs text-zinc-400 hover:text-white hover:border-indigo-500 transition-colors"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Regenerate
                      </button>
                    )}
                    
                    {/* W3 (L2): Send to Compose — for non-compose jobs only */}
                    {!(job.type === "compose" || job.tags?.includes("compose")) && job.status !== "pending" && (
                      <button
                        id={`send-compose-${job.id}`}
                        onClick={() => handleSendToCompose(job)}
                        title={
                          job.type === "voice" ? "Use as voiceover in Compose"
                          : job.type === "music" ? "Use as background music in Compose"
                          : "Add as slide in Compose"
                        }
                        className="flex items-center justify-center p-1.5 rounded-lg border border-indigo-900/50 text-indigo-500/70 hover:text-indigo-400 hover:border-indigo-500/60 transition-colors"
                      >
                        {job.type === "voice" || job.type === "music" ? (
                          <Music className="w-3.5 h-3.5" />
                        ) : (
                          <SendHorizonal className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}

                    {job.status === "completed" && job.outputs && job.outputs.length > 0 && (
                      <a
                        id={`download-${job.id}`}
                        href={job.outputs[0]}
                        download
                        title="Download"
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center justify-center p-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </a>
                    )}

                    <button
                      id={`delete-${job.id}`}
                      onClick={() => handleDelete(job)}
                      title="Delete"
                      className="flex items-center justify-center p-1.5 rounded-lg border border-red-900/40 text-red-500/60 hover:text-red-400 hover:border-red-500/60 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Selection badge replaced by sticky bar */}

      {/* Collection Picker Modal */}
      <AnimatePresence>
        {showCollectionPicker && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-zinc-900 border border-zinc-700 p-6 rounded-2xl w-full max-w-md shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <FolderPlus className="w-5 h-5 text-indigo-400" />
                  Add to Collection
                </h2>
                <button onClick={() => setShowCollectionPicker(false)} className="text-zinc-500 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
                {collections.length === 0 ? (
                  <p className="text-zinc-500 text-center py-8 border border-dashed border-zinc-800 rounded-xl">
                    No collections found. Create one in the Collections page first.
                  </p>
                ) : (
                  collections.map(col => (
                    <button
                      key={col.id}
                      onClick={() => handleAddToCollection(col.id)}
                      className="w-full text-left px-4 py-3 rounded-xl border border-zinc-800 bg-zinc-800/50 hover:bg-indigo-600/20 hover:border-indigo-500/40 text-zinc-300 hover:text-white transition-all flex items-center justify-between group"
                    >
                      <span className="font-medium">{col.name}</span>
                      <CheckCircle2 className="w-4 h-4 opacity-0 group-hover:opacity-100 text-indigo-400 transition-opacity" />
                    </button>
                  ))
                )}
              </div>
              
              <div className="mt-6 pt-4 border-t border-zinc-800 flex justify-end">
                <button
                  onClick={() => setShowCollectionPicker(false)}
                  className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Lightbox */}
      <MediaLightbox
        job={selectedJob as any}
        onClose={() => setSelectedJobId(null)}
        onNext={selectedJobIndex < filtered.length - 1 ? handleNext : undefined}
        onPrev={selectedJobIndex > 0 ? handlePrev : undefined}
      />
    </motion.div>
  );
}

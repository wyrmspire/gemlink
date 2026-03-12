import { useState, useEffect, useCallback } from "react";
import { motion } from "motion/react";
import { Loader2, Image as ImageIcon, Video, Mic, Clock, RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react";

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
}

export default function Library() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchHistory = useCallback(async (silent = false) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const response = await fetch("/api/media/history", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Failed to load history");
      }
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

    const interval = window.setInterval(() => {
      fetchHistory(true);
    }, 10000);

    return () => window.clearInterval(interval);
  }, [jobs, fetchHistory]);

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
        return <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-1 text-xs text-amber-300"><Clock className="w-3 h-3" />Pending</span>;
      case "failed":
        return <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-1 text-xs text-red-300"><AlertCircle className="w-3 h-3" />Failed</span>;
      default:
        return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300"><CheckCircle2 className="w-3 h-3" />Ready</span>;
    }
  };

  const lastLog = (job: Job) => job.logs?.[job.logs.length - 1];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 md:p-8 max-w-6xl mx-auto"
    >
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white mb-2">Media Library</h1>
          <p className="text-zinc-400 text-sm md:text-base">Browse your generated images, videos, and voice assets.</p>
        </div>
        <button
          onClick={() => fetchHistory(true)}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-900"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        </div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-16 bg-zinc-950 border border-zinc-800 rounded-2xl">
          <ImageIcon className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">No media yet</h3>
          <p className="text-zinc-400">Your generated assets will appear here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {jobs.map((job) => (
            <motion.div
              key={job.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden flex flex-col"
            >
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
                    <span className="mt-3 text-sm font-medium uppercase tracking-wider">{job.status || "pending"}</span>
                    {lastLog(job) && <p className="mt-2 text-xs text-zinc-500">{lastLog(job)}</p>}
                  </div>
                )}
              </div>
              <div className="p-4 flex-1 flex flex-col gap-3">
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

                <div className="text-xs text-zinc-500 space-y-1 mt-auto">
                  <p>Created {new Date(job.createdAt).toLocaleString()}</p>
                  {job.updatedAt && <p>Updated {new Date(job.updatedAt).toLocaleString()}</p>}
                  {job.error && <p className="text-red-300">{job.error}</p>}
                  {lastLog(job) && <p className="line-clamp-2">{lastLog(job)}</p>}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

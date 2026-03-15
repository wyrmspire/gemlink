import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Pin,
  PinOff,
  X,
  Copy,
  Check,
  ChevronRight,
  FileText,
  Search,
  Loader2,
} from "lucide-react";
import { useProject } from "../context/ProjectContext";
import { useToast } from "../context/ToastContext";

export interface StrategyArtifact {
  id: string;
  projectId: string;
  type:
    | "boardroom_insight"
    | "research_finding"
    | "strategy_brief"
    | "style_direction"
    | "scoring_analysis"
    | "custom";
  title: string;
  summary: string;
  content: string;
  tags: string[];
  source: { type: string; sessionId?: string; timestamp: string };
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

const TYPE_LABELS: Record<StrategyArtifact["type"], string> = {
  boardroom_insight: "Boardroom",
  research_finding: "Research",
  strategy_brief: "Strategy",
  style_direction: "Style",
  scoring_analysis: "Scoring",
  custom: "Custom",
};

const TYPE_COLORS: Record<StrategyArtifact["type"], string> = {
  boardroom_insight: "bg-violet-500/15 text-violet-300 border-violet-500/20",
  research_finding: "bg-sky-500/15 text-sky-300 border-sky-500/20",
  strategy_brief: "bg-indigo-500/15 text-indigo-300 border-indigo-500/20",
  style_direction: "bg-emerald-500/15 text-emerald-300 border-emerald-500/20",
  scoring_analysis: "bg-amber-500/15 text-amber-300 border-amber-500/20",
  custom: "bg-zinc-500/15 text-zinc-300 border-zinc-500/20",
};

export default function ArtifactPanel() {
  const { activeProject } = useProject();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [artifacts, setArtifacts] = useState<StrategyArtifact[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchArtifacts = useCallback(async () => {
    if (!activeProject?.id) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/artifacts?projectId=${activeProject.id}&pinned=true`
      );
      if (res.ok) {
        const data = await res.json();
        setArtifacts(Array.isArray(data) ? data : []);
      } else {
        // Fallback: load from localStorage
        const raw = localStorage.getItem(`gemlink-artifacts-${activeProject.id}`);
        if (raw) {
          const all: StrategyArtifact[] = JSON.parse(raw);
          setArtifacts(all.filter((a) => a.pinned));
        }
      }
    } catch {
      try {
        const raw = localStorage.getItem(`gemlink-artifacts-${activeProject.id}`);
        if (raw) {
          const all: StrategyArtifact[] = JSON.parse(raw);
          setArtifacts(all.filter((a) => a.pinned));
        }
      } catch { /* ignore */ }
    } finally {
      setLoading(false);
    }
  }, [activeProject?.id]);

  useEffect(() => {
    if (open) fetchArtifacts();
  }, [open, fetchArtifacts]);

  const pinnedCount = artifacts.length;

  const filtered = artifacts.filter((a) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      a.title.toLowerCase().includes(q) ||
      a.summary.toLowerCase().includes(q) ||
      a.tags.some((t) => t.toLowerCase().includes(q))
    );
  });

  async function togglePin(artifact: StrategyArtifact) {
    const newPinned = !artifact.pinned;
    // Optimistic update
    setArtifacts((prev) =>
      prev.map((a) => (a.id === artifact.id ? { ...a, pinned: newPinned } : a))
    );
    try {
      await fetch(`/api/artifacts/${artifact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: newPinned }),
      });
      toast(newPinned ? "Artifact pinned." : "Artifact unpinned.", "success");
    } catch {
      // Persist locally
      if (activeProject?.id) {
        const key = `gemlink-artifacts-${activeProject.id}`;
        try {
          const raw = localStorage.getItem(key);
          const all: StrategyArtifact[] = raw ? JSON.parse(raw) : [];
          const updated = all.map((a) =>
            a.id === artifact.id ? { ...a, pinned: newPinned } : a
          );
          localStorage.setItem(key, JSON.stringify(updated));
        } catch { /* ignore */ }
      }
    }
  }

  function useInPrompt(artifact: StrategyArtifact) {
    const text = `[${artifact.title}]\n${artifact.summary}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(artifact.id);
      toast("Artifact summary copied to clipboard — paste it into your prompt.", "success");
      setTimeout(() => setCopied(null), 2000);
    }).catch(() => toast("Failed to copy.", "error"));
  }

  return (
    <>
      {/* Floating trigger button */}
      <button
        id="artifact-panel-toggle"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xl shadow-indigo-900/40 transition-all hover:scale-105 active:scale-95"
        title="Open Artifact Reference Panel"
      >
        <Pin className="w-4 h-4" />
        <span className="text-sm font-medium hidden sm:inline">Artifacts</span>
        {pinnedCount > 0 && (
          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-white/20 text-xs font-bold">
            {pinnedCount}
          </span>
        )}
      </button>

      {/* Slide-out backdrop */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-40"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", bounce: 0, duration: 0.35 }}
              className="fixed top-0 right-0 bottom-0 w-80 sm:w-96 bg-zinc-950 border-l border-zinc-800 z-50 flex flex-col shadow-2xl"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
                <div className="flex items-center gap-2">
                  <Pin className="w-4 h-4 text-indigo-400" />
                  <h2 className="text-base font-semibold text-white">
                    Pinned Artifacts
                  </h2>
                  {pinnedCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-indigo-600/20 text-indigo-300 text-xs font-medium">
                      {pinnedCount}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="text-zinc-500 hover:text-zinc-200 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Search */}
              <div className="px-4 py-3 border-b border-zinc-800/60 shrink-0">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search artifacts…"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="text-center py-12">
                    <FileText className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
                    <p className="text-sm font-medium text-zinc-400 mb-1">
                      {search ? "No matches" : "No pinned artifacts"}
                    </p>
                    <p className="text-xs text-zinc-600">
                      {search
                        ? "Try a different search term."
                        : "Pin artifacts in the Briefs page to reference them here."}
                    </p>
                  </div>
                ) : (
                  filtered.map((artifact) => (
                    <div
                      key={artifact.id}
                      className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden"
                    >
                      <div className="p-3">
                        <div className="flex items-start gap-2 mb-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                              <span
                                className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-xs font-medium border ${TYPE_COLORS[artifact.type]}`}
                              >
                                {TYPE_LABELS[artifact.type]}
                              </span>
                            </div>
                            <p className="text-sm font-medium text-white truncate">
                              {artifact.title}
                            </p>
                          </div>
                          <button
                            onClick={() => togglePin(artifact)}
                            title={artifact.pinned ? "Unpin" : "Pin"}
                            className="shrink-0 text-zinc-500 hover:text-amber-400 transition-colors mt-0.5"
                          >
                            {artifact.pinned ? (
                              <Pin className="w-4 h-4 text-amber-400" />
                            ) : (
                              <PinOff className="w-4 h-4" />
                            )}
                          </button>
                        </div>

                        <p className="text-xs text-zinc-400 line-clamp-2 mb-2">
                          {artifact.summary}
                        </p>

                        {/* Tags */}
                        {artifact.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-2">
                            {artifact.tags.slice(0, 4).map((tag) => (
                              <span
                                key={tag}
                                className="px-1.5 py-0.5 rounded-md bg-zinc-800 text-zinc-500 text-xs border border-zinc-700"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => useInPrompt(artifact)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-indigo-600/15 border border-indigo-500/20 text-indigo-300 text-xs hover:bg-indigo-600/25 transition-colors"
                          >
                            {copied === artifact.id ? (
                              <><Check className="w-3.5 h-3.5" /> Copied!</>
                            ) : (
                              <><Copy className="w-3.5 h-3.5" /> Use in prompt</>
                            )}
                          </button>
                          <button
                            onClick={() =>
                              setExpandedId(
                                expandedId === artifact.id ? null : artifact.id
                              )
                            }
                            className="flex items-center gap-1.5 py-1.5 px-2 rounded-lg border border-zinc-700 text-zinc-400 text-xs hover:text-white hover:border-zinc-500 transition-colors"
                          >
                            <ChevronRight
                              className={`w-3.5 h-3.5 transition-transform ${expandedId === artifact.id ? "rotate-90" : ""}`}
                            />
                          </button>
                        </div>
                      </div>

                      {/* Expanded content */}
                      <AnimatePresence>
                        {expandedId === artifact.id && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden border-t border-zinc-800"
                          >
                            <div className="p-3 bg-zinc-950">
                              <p className="text-xs text-zinc-400 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                                {artifact.content}
                              </p>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))
                )}
              </div>

              {/* Footer */}
              <div className="px-4 py-3 border-t border-zinc-800 shrink-0">
                <a
                  href="/briefs"
                  className="block w-full text-center py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-300 text-sm hover:bg-zinc-800 hover:text-white transition-colors"
                  onClick={() => setOpen(false)}
                >
                  Manage all artifacts →
                </a>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

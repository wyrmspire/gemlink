import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Pin,
  PinOff,
  X,
  Copy,
  Check,
  ChevronDown,
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
      {/* ── Top drawer trigger bar ───────────────────────────────────────── */}
      {/* Anchored to the top of the main content pane (outside sidebar) */}
      <div className="fixed top-0 right-0 left-64 z-40 flex justify-center pointer-events-none md:flex hidden">
        <button
          id="artifact-panel-toggle"
          onClick={() => setOpen((o) => !o)}
          className={`pointer-events-auto flex items-center gap-2 px-5 py-1.5 rounded-b-2xl text-sm font-medium transition-all shadow-lg ${
            open
              ? "bg-zinc-900 border border-zinc-700 border-t-0 text-white"
              : "bg-zinc-900/90 border border-zinc-800 border-t-0 text-zinc-400 hover:text-white hover:bg-zinc-800"
          }`}
          title={open ? "Close artifact drawer" : "Open pinned artifacts"}
        >
          <Pin className={`w-3.5 h-3.5 transition-colors ${open ? "text-indigo-400" : ""}`} />
          <span className="hidden sm:inline">Artifacts</span>
          {pinnedCount > 0 && (
            <span className="flex items-center justify-center w-4 h-4 rounded-full bg-indigo-600/60 text-[10px] font-bold text-white">
              {pinnedCount}
            </span>
          )}
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {/* Mobile: keep a small floating button */}
      <button
        id="artifact-panel-toggle-mobile"
        onClick={() => setOpen((o) => !o)}
        className="md:hidden fixed bottom-6 right-6 z-40 flex items-center gap-2 px-3 py-2.5 rounded-2xl bg-zinc-900 border border-zinc-700 text-zinc-300 shadow-xl hover:bg-zinc-800 transition-all"
        title="Open artifact drawer"
      >
        <Pin className="w-4 h-4 text-indigo-400" />
        {pinnedCount > 0 && (
          <span className="w-4 h-4 flex items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white">
            {pinnedCount}
          </span>
        )}
      </button>

      {/* ── Top drawer panel ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-30"
              onClick={() => setOpen(false)}
            />

            {/* Drawer — slides down from the top of the main area */}
            <motion.div
              initial={{ y: "-100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "-100%", opacity: 0 }}
              transition={{ type: "spring", bounce: 0.1, duration: 0.4 }}
              className="fixed top-0 right-0 left-0 md:left-64 z-40 bg-zinc-950 border-b border-zinc-800 shadow-2xl"
              style={{ maxHeight: "70vh" }}
            >
              {/* Drawer header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                  <Pin className="w-4 h-4 text-indigo-400" />
                  <h2 className="text-sm font-semibold text-white">Pinned Artifacts</h2>
                  {pinnedCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-indigo-600/20 text-indigo-300 text-xs font-medium">
                      {pinnedCount}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  {/* Search */}
                  <div className="relative hidden sm:block">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search…"
                      className="w-48 bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <a
                    href="/briefs"
                    className="text-xs text-zinc-500 hover:text-indigo-300 transition-colors hidden sm:inline"
                    onClick={() => setOpen(false)}
                  >
                    Manage →
                  </a>
                  <button
                    onClick={() => setOpen(false)}
                    className="text-zinc-500 hover:text-white transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Artifact cards — horizontal scroll strip */}
              <div className="overflow-y-auto" style={{ maxHeight: "calc(70vh - 52px)" }}>
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="text-center py-10">
                    <FileText className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
                    <p className="text-sm text-zinc-400">
                      {search ? "No matches" : "No pinned artifacts"}
                    </p>
                    <p className="text-xs text-zinc-600 mt-1">
                      {search
                        ? "Try a different search term."
                        : "Pin artifacts in the Briefs page to reference them here."}
                    </p>
                    <a
                      href="/briefs"
                      className="inline-block mt-3 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                      onClick={() => setOpen(false)}
                    >
                      Go to Briefs →
                    </a>
                  </div>
                ) : (
                  <div className="flex gap-3 p-4 overflow-x-auto pb-4">
                    {filtered.map((artifact) => (
                      <div
                        key={artifact.id}
                        className="shrink-0 w-64 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex flex-col"
                      >
                        <div className="p-3 flex-1">
                          {/* Type badge + pin */}
                          <div className="flex items-center justify-between mb-2">
                            <span
                              className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium border ${TYPE_COLORS[artifact.type]}`}
                            >
                              {TYPE_LABELS[artifact.type]}
                            </span>
                            <button
                              onClick={() => togglePin(artifact)}
                              title={artifact.pinned ? "Unpin" : "Pin"}
                              className="text-zinc-500 hover:text-amber-400 transition-colors"
                            >
                              {artifact.pinned ? (
                                <Pin className="w-3.5 h-3.5 text-amber-400" />
                              ) : (
                                <PinOff className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>

                          {/* Title */}
                          <p className="text-xs font-semibold text-white mb-1 line-clamp-1">
                            {artifact.title}
                          </p>

                          {/* Summary */}
                          <p
                            className={`text-[11px] text-zinc-400 leading-relaxed ${
                              expandedId === artifact.id ? "" : "line-clamp-3"
                            }`}
                          >
                            {expandedId === artifact.id ? artifact.content : artifact.summary}
                          </p>

                          {/* Tags */}
                          {artifact.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {artifact.tags.slice(0, 3).map((tag) => (
                                <span
                                  key={tag}
                                  className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-600 text-[10px] border border-zinc-700"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex border-t border-zinc-800">
                          <button
                            onClick={() => useInPrompt(artifact)}
                            className="flex-1 flex items-center justify-center gap-1 py-2 text-[11px] text-indigo-400 hover:bg-indigo-600/10 transition-colors"
                          >
                            {copied === artifact.id ? (
                              <><Check className="w-3 h-3" /> Copied</>
                            ) : (
                              <><Copy className="w-3 h-3" /> Copy</>
                            )}
                          </button>
                          <div className="w-px bg-zinc-800" />
                          <button
                            onClick={() =>
                              setExpandedId(expandedId === artifact.id ? null : artifact.id)
                            }
                            className="flex-1 flex items-center justify-center gap-1 py-2 text-[11px] text-zinc-500 hover:text-white hover:bg-zinc-800/50 transition-colors"
                          >
                            <ChevronDown
                              className={`w-3 h-3 transition-transform ${
                                expandedId === artifact.id ? "rotate-180" : ""
                              }`}
                            />
                            {expandedId === artifact.id ? "Less" : "More"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useNavigate } from "react-router-dom";
import {
  FileText,
  Pin,
  PinOff,
  Trash2,
  Edit3,
  Eye,
  Plus,
  Search,
  Loader2,
  X,
  Send,
  ChevronDown,
  BookOpen,
  Lightbulb,
  BarChart2,
  Palette,
  Pencil,
  ListOrdered,
} from "lucide-react";
import { useProject } from "../context/ProjectContext";
import { useToast } from "../context/ToastContext";
import type { StrategyArtifact } from "../components/ArtifactPanel";

const ARTIFACT_TYPES = [
  { value: "all", label: "All Types", icon: FileText },
  { value: "boardroom_insight", label: "Boardroom", icon: BookOpen },
  { value: "research_finding", label: "Research", icon: Search },
  { value: "strategy_brief", label: "Strategy Brief", icon: Lightbulb },
  { value: "style_direction", label: "Style", icon: Palette },
  { value: "scoring_analysis", label: "Scoring", icon: BarChart2 },
  { value: "custom", label: "Custom", icon: Pencil },
] as const;

const TYPE_LABELS: Record<string, string> = {
  boardroom_insight: "Boardroom",
  research_finding: "Research",
  strategy_brief: "Strategy",
  style_direction: "Style",
  scoring_analysis: "Scoring",
  custom: "Custom",
};

const TYPE_COLORS: Record<string, string> = {
  boardroom_insight: "bg-violet-500/15 text-violet-300 border-violet-500/20",
  research_finding: "bg-sky-500/15 text-sky-300 border-sky-500/20",
  strategy_brief: "bg-indigo-500/15 text-indigo-300 border-indigo-500/20",
  style_direction: "bg-emerald-500/15 text-emerald-300 border-emerald-500/20",
  scoring_analysis: "bg-amber-500/15 text-amber-300 border-amber-500/20",
  custom: "bg-zinc-500/15 text-zinc-300 border-zinc-500/20",
};

function genId() {
  return `art_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;
}

function emptyArtifact(projectId: string): StrategyArtifact {
  const now = new Date().toISOString();
  return {
    id: genId(),
    projectId,
    type: "custom",
    title: "",
    summary: "",
    content: "",
    tags: [],
    source: { type: "manual", timestamp: now },
    pinned: false,
    createdAt: now,
    updatedAt: now,
  };
}

interface EditModalProps {
  artifact: StrategyArtifact | null;
  onClose: () => void;
  onSave: (a: StrategyArtifact) => void;
}

function EditModal({ artifact, onClose, onSave }: EditModalProps) {
  const [form, setForm] = useState<StrategyArtifact | null>(artifact);
  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    setForm(artifact);
    setTagInput("");
  }, [artifact]);

  if (!form) return null;

  function patch(k: keyof StrategyArtifact, v: unknown) {
    setForm((f) => (f ? { ...f, [k]: v } : f));
  }

  function addTag() {
    const tag = tagInput.trim();
    if (!tag || form!.tags.includes(tag)) { setTagInput(""); return; }
    patch("tags", [...form!.tags, tag]);
    setTagInput("");
  }

  function removeTag(tag: string) {
    patch("tags", form!.tags.filter((t) => t !== tag));
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 sticky top-0 bg-zinc-950 z-10">
          <h2 className="text-lg font-semibold text-white">
            {form.title ? "Edit Artifact" : "New Artifact"}
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Title</label>
              <input
                value={form.title}
                onChange={(e) => patch("title", e.target.value)}
                placeholder="e.g. Gen Z Brand Voice Notes"
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Type</label>
              <select
                value={form.type}
                onChange={(e) => patch("type", e.target.value as StrategyArtifact["type"])}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {ARTIFACT_TYPES.filter((t) => t.value !== "all").map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">Summary (2–3 sentences)</label>
            <textarea
              value={form.summary}
              onChange={(e) => patch("summary", e.target.value)}
              rows={2}
              placeholder="A brief summary of this artifact…"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">Content (markdown)</label>
            <textarea
              value={form.content}
              onChange={(e) => patch("content", e.target.value)}
              rows={8}
              placeholder="Full content, research notes, strategy principles…"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none font-mono text-xs"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">Tags</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {form.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs"
                >
                  {tag}
                  <button onClick={() => removeTag(tag)} className="text-zinc-500 hover:text-red-400">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                placeholder="Add tag…"
                className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={addTag}
                className="px-3 py-2 bg-zinc-800 border border-zinc-700 text-zinc-300 text-sm rounded-lg hover:bg-zinc-700 transition-colors"
              >
                Add
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.pinned}
                onChange={(e) => patch("pinned", e.target.checked)}
                className="w-4 h-4 rounded accent-indigo-600"
              />
              <span className="text-sm text-zinc-300">Pin to project (auto-inject into generation)</span>
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-zinc-800 sticky bottom-0 bg-zinc-950">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-zinc-700 text-zinc-300 text-sm hover:bg-zinc-800 transition-colors">
            Cancel
          </button>
          <button
            onClick={() => { onSave({ ...form, updatedAt: new Date().toISOString() }); onClose(); }}
            disabled={!form.title.trim()}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
          >
            Save Artifact
          </button>
        </div>
      </motion.div>
    </div>
  );
}

interface ViewModalProps {
  artifact: StrategyArtifact | null;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onPin: () => void;
  onSendToPlan: () => void;
}

function ViewModal({ artifact, onClose, onEdit, onDelete, onPin, onSendToPlan }: ViewModalProps) {
  if (!artifact) return null;
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 sticky top-0 bg-zinc-950 z-10">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border shrink-0 ${TYPE_COLORS[artifact.type]}`}>
              {TYPE_LABELS[artifact.type]}
            </span>
            <h2 className="text-base font-semibold text-white truncate">{artifact.title}</h2>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 transition-colors shrink-0 ml-2">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {artifact.summary && (
            <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
              <p className="text-sm text-zinc-300 leading-relaxed italic">{artifact.summary}</p>
            </div>
          )}

          {artifact.content && (
            <div>
              <h3 className="text-xs uppercase tracking-widest text-zinc-500 mb-3">Full Content</h3>
              <pre className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap font-sans bg-zinc-900 rounded-xl p-4 border border-zinc-800 max-h-64 overflow-y-auto">
                {artifact.content}
              </pre>
            </div>
          )}

          {artifact.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {artifact.tags.map((tag) => (
                <span key={tag} className="px-2 py-0.5 rounded-md bg-zinc-800 border border-zinc-700 text-zinc-400 text-xs">
                  {tag}
                </span>
              ))}
            </div>
          )}

          <p className="text-xs text-zinc-600">
            Created {new Date(artifact.createdAt).toLocaleString()} · Source: {artifact.source.type}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 px-6 py-4 border-t border-zinc-800 sticky bottom-0 bg-zinc-950">
          <button
            onClick={onSendToPlan}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600/15 border border-emerald-500/20 text-emerald-300 text-sm hover:bg-emerald-600/25 transition-colors"
          >
            <ListOrdered className="w-4 h-4" /> Send to Plan
          </button>
          <button
            onClick={onPin}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-zinc-700 text-zinc-300 text-sm hover:bg-zinc-800 transition-colors"
          >
            {artifact.pinned ? <><PinOff className="w-4 h-4" /> Unpin</> : <><Pin className="w-4 h-4" /> Pin</>}
          </button>
          <button
            onClick={onEdit}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-zinc-700 text-zinc-300 text-sm hover:bg-zinc-800 transition-colors"
          >
            <Edit3 className="w-4 h-4" /> Edit
          </button>
          <button
            onClick={onDelete}
            className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-500/20 text-red-400 text-sm hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="w-4 h-4" /> Delete
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main Briefs page
// ─────────────────────────────────────────────

export default function Briefs() {
  const { activeProject } = useProject();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [artifacts, setArtifacts] = useState<StrategyArtifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [viewArtifact, setViewArtifact] = useState<StrategyArtifact | null>(null);
  const [editArtifact, setEditArtifact] = useState<StrategyArtifact | null>(null);
  const [newMenuOpen, setNewMenuOpen] = useState(false);

  const storageKey = `gemlink-artifacts-${activeProject?.id ?? "default"}`;

  const loadLocal = useCallback(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      setArtifacts(raw ? JSON.parse(raw) : []);
    } catch {
      setArtifacts([]);
    }
  }, [storageKey]);

  const saveLocal = (arr: StrategyArtifact[]) => {
    try { localStorage.setItem(storageKey, JSON.stringify(arr)); } catch { /* ignore */ }
    setArtifacts(arr);
  };

  const fetchArtifacts = useCallback(async () => {
    if (!activeProject?.id) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/artifacts?projectId=${activeProject.id}`);
      if (res.ok) {
        const data = await res.json();
        setArtifacts(Array.isArray(data) ? data : []);
      } else {
        loadLocal();
      }
    } catch {
      loadLocal();
    } finally {
      setLoading(false);
    }
  }, [activeProject?.id, loadLocal]);

  useEffect(() => { fetchArtifacts(); }, [fetchArtifacts]);

  // Sync to localStorage as fallback whenever artifacts change
  useEffect(() => {
    if (artifacts.length > 0) {
      try { localStorage.setItem(storageKey, JSON.stringify(artifacts)); } catch { /* ignore */ }
    }
  }, [artifacts, storageKey]);

  const filtered = artifacts.filter((a) => {
    if (typeFilter !== "all" && a.type !== typeFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        a.title.toLowerCase().includes(q) ||
        a.summary.toLowerCase().includes(q) ||
        a.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    return true;
  });

  async function saveArtifact(art: StrategyArtifact) {
    const isNew = !artifacts.some((a) => a.id === art.id);
    const next = isNew
      ? [art, ...artifacts]
      : artifacts.map((a) => (a.id === art.id ? art : a));
    saveLocal(next);
    try {
      if (isNew) {
        await fetch("/api/artifacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(art),
        });
      } else {
        await fetch(`/api/artifacts/${art.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(art),
        });
      }
    } catch { /* server may not be ready; local save sufficient */ }
    toast(isNew ? "Artifact created." : "Artifact updated.", "success");
  }

  async function deleteArtifact(id: string) {
    if (!confirm("Delete this artifact?")) return;
    const next = artifacts.filter((a) => a.id !== id);
    saveLocal(next);
    setViewArtifact(null);
    try {
      await fetch(`/api/artifacts/${id}`, { method: "DELETE" });
    } catch { /* ignore */ }
    toast("Artifact deleted.", "success");
  }

  async function togglePin(art: StrategyArtifact) {
    const updated = { ...art, pinned: !art.pinned, updatedAt: new Date().toISOString() };
    await saveArtifact(updated);
    setViewArtifact((v) => (v?.id === art.id ? updated : v));
    toast(updated.pinned ? "Pinned — will influence generation." : "Unpinned.", "success");
  }

  function sendToPlan(art: StrategyArtifact) {
    const items = [
      {
        type: "image",
        label: `From brief: ${art.title}`,
        purpose: art.summary || art.title,
        promptTemplate: art.content || art.summary,
      },
    ];
    try {
      const existing = sessionStorage.getItem("pending-media-items");
      const prev = existing ? JSON.parse(existing) : [];
      sessionStorage.setItem("pending-media-items", JSON.stringify([...prev, ...items]));
    } catch { /* ignore */ }
    toast("Sent to Media Plan.", "success");
    setViewArtifact(null);
    navigate("/plan");
  }

  const pinnedCount = artifacts.filter((a) => a.pinned).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex h-full"
    >
      {/* Sidebar */}
      <aside className="hidden lg:flex flex-col w-56 shrink-0 border-r border-zinc-800 bg-zinc-950 p-4 gap-1">
        <p className="text-xs uppercase tracking-widest text-zinc-500 mb-3 px-2">Filter by Type</p>
        {ARTIFACT_TYPES.map(({ value, label, icon: Icon }) => {
          const count =
            value === "all"
              ? artifacts.length
              : artifacts.filter((a) => a.type === value).length;
          return (
            <button
              key={value}
              onClick={() => setTypeFilter(value)}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left ${
                typeFilter === value
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="flex-1 truncate">{label}</span>
              {count > 0 && (
                <span className="text-xs text-zinc-600 ml-auto">{count}</span>
              )}
            </button>
          );
        })}
        {pinnedCount > 0 && (
          <div className="mt-4 pt-4 border-t border-zinc-800">
            <p className="text-xs text-zinc-500 px-2">
              <Pin className="inline w-3 h-3 text-amber-400 mr-1 -mt-px" />
              {pinnedCount} pinned
            </p>
          </div>
        )}
      </aside>

      {/* Main */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 md:p-8 max-w-6xl">
          {/* Header */}
          <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Strategy Briefs</h1>
              <p className="text-zinc-400 text-sm">
                {activeProject?.name
                  ? `Artifacts for "${activeProject.name}"`
                  : "All strategy artifacts for the active project."}
              </p>
            </div>
            <div className="relative">
              <button
                id="new-artifact-btn"
                onClick={() => setNewMenuOpen((o) => !o)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors"
              >
                <Plus className="w-4 h-4" />
                New Artifact
                <ChevronDown className={`w-4 h-4 transition-transform ${newMenuOpen ? "rotate-180" : ""}`} />
              </button>
              <AnimatePresence>
                {newMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.97 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-1.5 w-64 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl z-30 overflow-hidden"
                  >
                    <button
                      onClick={() => {
                        setNewMenuOpen(false);
                        setEditArtifact(emptyArtifact(activeProject?.id ?? "default"));
                      }}
                      className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-zinc-800 transition-colors"
                    >
                      <Pencil className="w-4 h-4 text-zinc-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm text-white font-medium">Manual</p>
                        <p className="text-xs text-zinc-500">Write title + content directly</p>
                      </div>
                    </button>
                    <button
                      onClick={() => {
                        setNewMenuOpen(false);
                        navigate("/boardroom");
                        toast("Opening Boardroom — select the Strategy Analysis template.", "info");
                      }}
                      className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-zinc-800 transition-colors border-t border-zinc-800"
                    >
                      <Lightbulb className="w-4 h-4 text-violet-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm text-white font-medium">Describe a Strategy</p>
                        <p className="text-xs text-zinc-500">Navigate to Boardroom with Strategy Analysis template</p>
                      </div>
                    </button>
                    <button
                      onClick={() => {
                        setNewMenuOpen(false);
                        toast("Session import: go to Boardroom → completed session → Save as Artifact.", "info");
                      }}
                      className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-zinc-800 transition-colors border-t border-zinc-800"
                    >
                      <BookOpen className="w-4 h-4 text-sky-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm text-white font-medium">Import from Session</p>
                        <p className="text-xs text-zinc-500">Pick a completed boardroom session</p>
                      </div>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Search + mobile type filter */}
          <div className="flex gap-3 mb-6 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search artifacts…"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-11 pr-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            {/* Mobile type select */}
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="lg:hidden bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {ARTIFACT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Cards */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-zinc-950 border border-zinc-800 rounded-2xl p-5 animate-pulse space-y-3">
                  <div className="flex gap-2">
                    <div className="h-5 w-20 rounded-md bg-zinc-800" />
                    <div className="h-5 w-5 rounded-full bg-zinc-800 ml-auto" />
                  </div>
                  <div className="h-4 w-3/4 rounded bg-zinc-800" />
                  <div className="h-3 w-full rounded bg-zinc-800/60" />
                  <div className="h-3 w-4/5 rounded bg-zinc-800/60" />
                  <div className="flex gap-1.5">
                    <div className="h-4 w-12 rounded-md bg-zinc-800" />
                    <div className="h-4 w-10 rounded-md bg-zinc-800" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 bg-zinc-950 border border-zinc-800 rounded-2xl">
              <FileText className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
              <p className="text-lg font-medium text-white mb-2">
                {search || typeFilter !== "all" ? "No matching artifacts" : "No artifacts yet"}
              </p>
              <p className="text-sm text-zinc-500">
                {search || typeFilter !== "all"
                  ? "Try adjusting your filters."
                  : "Create your first artifact using the \"New Artifact\" button."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              <AnimatePresence>
                {filtered.map((art) => (
                  <motion.div
                    key={art.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-zinc-950 border border-zinc-800 rounded-2xl p-5 flex flex-col gap-3 group hover:border-zinc-600 transition-colors"
                  >
                    {/* Top row */}
                    <div className="flex items-start gap-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${TYPE_COLORS[art.type]}`}>
                        {TYPE_LABELS[art.type]}
                      </span>
                      {art.pinned && (
                        <span title="Pinned" className="ml-0.5">
                          <Pin className="w-3.5 h-3.5 text-amber-400" />
                        </span>
                      )}
                      <p className="text-xs text-zinc-600 ml-auto">
                        {new Date(art.createdAt).toLocaleDateString()}
                      </p>
                    </div>

                    {/* Title */}
                    <h3 className="text-sm font-semibold text-white leading-snug">{art.title}</h3>

                    {/* Summary */}
                    {art.summary && (
                      <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">{art.summary}</p>
                    )}

                    {/* Tags */}
                    {art.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {art.tags.slice(0, 5).map((tag) => (
                          <span key={tag} className="px-1.5 py-0.5 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-500 text-xs">
                            {tag}
                          </span>
                        ))}
                        {art.tags.length > 5 && (
                          <span className="text-xs text-zinc-600">+{art.tags.length - 5}</span>
                        )}
                      </div>
                    )}

                    {/* Source */}
                    <p className="text-xs text-zinc-600">
                      Source: {art.source.type}
                    </p>

                    {/* Actions */}
                    <div className="flex gap-1.5 mt-auto pt-1">
                      <button
                        onClick={() => setViewArtifact(art)}
                        title="View"
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-zinc-800 text-zinc-400 text-xs hover:text-white hover:border-zinc-600 transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" /> View
                      </button>
                      <button
                        onClick={() => setEditArtifact(art)}
                        title="Edit"
                        className="flex items-center justify-center gap-1.5 p-1.5 rounded-lg border border-zinc-800 text-zinc-400 text-xs hover:text-white hover:border-zinc-600 transition-colors"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => togglePin(art)}
                        title={art.pinned ? "Unpin" : "Pin"}
                        className="flex items-center justify-center gap-1.5 p-1.5 rounded-lg border border-zinc-800 text-xs hover:border-amber-500/40 transition-colors"
                      >
                        {art.pinned ? (
                          <PinOff className="w-3.5 h-3.5 text-amber-400" />
                        ) : (
                          <Pin className="w-3.5 h-3.5 text-zinc-400 hover:text-amber-400" />
                        )}
                      </button>
                      <button
                        onClick={() => sendToPlan(art)}
                        title="Send to Plan"
                        className="flex items-center justify-center gap-1.5 p-1.5 rounded-lg border border-zinc-800 text-emerald-400 text-xs hover:border-emerald-500/40 hover:bg-emerald-600/10 transition-colors"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => deleteArtifact(art.id)}
                        title="Delete"
                        className="flex items-center justify-center gap-1.5 p-1.5 rounded-lg border border-zinc-800 text-red-400 text-xs hover:border-red-500/40 hover:bg-red-600/10 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {viewArtifact && (
          <ViewModal
            artifact={viewArtifact}
            onClose={() => setViewArtifact(null)}
            onEdit={() => { setEditArtifact(viewArtifact); setViewArtifact(null); }}
            onDelete={() => deleteArtifact(viewArtifact.id)}
            onPin={() => togglePin(viewArtifact)}
            onSendToPlan={() => sendToPlan(viewArtifact)}
          />
        )}
        {editArtifact && (
          <EditModal
            artifact={editArtifact}
            onClose={() => setEditArtifact(null)}
            onSave={saveArtifact}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

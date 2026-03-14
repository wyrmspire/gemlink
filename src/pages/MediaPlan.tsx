import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence, Reorder } from "motion/react";
import {
  Loader2,
  ListOrdered,
  Plus,
  Trash2,
  GripVertical,
  Image as ImageIcon,
  Video,
  Mic,
  Sparkles,
  Play,
  CheckCircle2,
  Clock,
  AlertCircle,
  ChevronDown,
} from "lucide-react";
import { useProject } from "../context/ProjectContext";
import { useToast } from "../context/ToastContext";

export interface MediaPlanItem {
  id: string;
  type: "image" | "video" | "voice";
  label: string;
  purpose: string;
  promptTemplate: string;
  status: "draft" | "queued" | "generating" | "review" | "approved" | "rejected";
  generatedJobIds: string[];
  rating?: number;
  tags?: string[];
}

const STORAGE_KEY = "gemlink-media-plans";
const STATUS_ORDER: MediaPlanItem["status"][] = [
  "draft", "queued", "generating", "review", "approved", "rejected",
];

function statusPill(status: MediaPlanItem["status"]) {
  const configs: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
    draft: { label: "Draft", className: "bg-zinc-700/40 text-zinc-300", icon: <ListOrdered className="w-3 h-3" /> },
    queued: { label: "Queued", className: "bg-amber-500/15 text-amber-300", icon: <Clock className="w-3 h-3" /> },
    generating: { label: "Generating", className: "bg-indigo-500/15 text-indigo-300", icon: <Loader2 className="w-3 h-3 animate-spin" /> },
    review: { label: "Review", className: "bg-sky-500/15 text-sky-300", icon: <CheckCircle2 className="w-3 h-3" /> },
    approved: { label: "Approved", className: "bg-emerald-500/15 text-emerald-300", icon: <CheckCircle2 className="w-3 h-3" /> },
    rejected: { label: "Rejected", className: "bg-red-500/15 text-red-300", icon: <AlertCircle className="w-3 h-3" /> },
  };
  const c = configs[status] ?? configs.draft;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${c.className}`}>
      {c.icon}{c.label}
    </span>
  );
}

function typeIcon(type: string) {
  if (type === "video") return <Video className="w-4 h-4 text-emerald-400" />;
  if (type === "voice") return <Mic className="w-4 h-4 text-amber-400" />;
  return <ImageIcon className="w-4 h-4 text-indigo-400" />;
}

function genId() {
  return `item_${Math.random().toString(36).slice(2, 10)}`;
}

function newItem(overrides: Partial<MediaPlanItem> = {}): MediaPlanItem {
  return {
    id: genId(),
    type: "image",
    label: "New Asset",
    purpose: "",
    promptTemplate: "",
    status: "draft",
    generatedJobIds: [],
    ...overrides,
  };
}

export default function MediaPlan() {
  const { activeProject } = useProject();
  const { toast } = useToast();
  const [items, setItems] = useState<MediaPlanItem[]>([]);
  const [naturalInput, setNaturalInput] = useState("");
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const storageKey = `${STORAGE_KEY}-${activeProject?.id ?? "default"}`;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        setItems(Array.isArray(parsed) ? parsed : []);
      } else {
        setItems([]);
      }
    } catch {
      setItems([]);
    }
  }, [storageKey]);

  // Absorb items passed from Research.tsx via sessionStorage
  useEffect(() => {
    const pending = sessionStorage.getItem("pending-media-items");
    if (!pending) return;
    try {
      const arr = JSON.parse(pending);
      if (Array.isArray(arr) && arr.length > 0) {
        const imported = arr.map((x: any) => newItem({
          type: x.type ?? "image",
          label: x.label ?? "Imported item",
          purpose: x.purpose ?? "",
          promptTemplate: x.promptTemplate ?? "",
        }));
        setItems((prev) => {
          const merged = [...prev, ...imported];
          try { localStorage.setItem(storageKey, JSON.stringify(merged)); } catch { /* ignore */ }
          return merged;
        });
        toast(`Imported ${imported.length} item${imported.length > 1 ? "s" : ""} from Research.`, "success");
      }
    } catch { /* ignore */ } finally {
      sessionStorage.removeItem("pending-media-items");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function save(next: MediaPlanItem[]) {
    setItems(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ }
  }

  const handleSuggest = async () => {
    if (!naturalInput.trim()) return;
    setSuggestLoading(true);
    try {
      const res = await fetch("/api/media/plan/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: naturalInput,
          brandContext: {
            brandName: activeProject?.brandName,
            brandDescription: activeProject?.brandDescription,
            targetAudience: activeProject?.targetAudience,
            brandVoice: activeProject?.brandVoice,
          },
        }),
      });
      if (!res.ok) throw new Error("unavailable");
      const data = await res.json();
      const suggested: MediaPlanItem[] = (data.items ?? []).map((x: any) => newItem(x));
      save([...items, ...suggested]);
      toast(`Added ${suggested.length} suggested items.`, "success");
    } catch {
      // Graceful mock fallback
      const opts = naturalInput.toLowerCase();
      const mock: MediaPlanItem[] = [
        newItem({ type: "image", label: "Hero Banner", purpose: "Website hero", promptTemplate: `${opts} — hero banner, wide format, no text` }),
        newItem({ type: "image", label: "Social Post #1", purpose: "Instagram feed", promptTemplate: `${opts} — bold square social post, vibrant` }),
        newItem({ type: "image", label: "Social Post #2", purpose: "LinkedIn post", promptTemplate: `${opts} — professional LinkedIn visual` }),
        newItem({ type: "video", label: "Intro Video", purpose: "YouTube intro", promptTemplate: `Cinematic 16:9 intro for: ${opts}` }),
        newItem({ type: "voice", label: "Voiceover", purpose: "Ad spot", promptTemplate: `30-second voiceover for: ${opts}` }),
      ];
      save([...items, ...mock]);
      toast("Plan generated using contextual suggestions (Lane 1 endpoint coming soon).", "info");
    } finally {
      setSuggestLoading(false);
      setNaturalInput("");
    }
  };

  const handleGenerateAll = async () => {
    const draftItems = items.filter((i) => i.status === "draft");
    if (draftItems.length === 0) { toast("No draft items to generate.", "warning"); return; }
    setBatchRunning(true);
    const queued = items.map((i) => i.status === "draft" ? { ...i, status: "queued" as const } : i);
    save(queued);
    try {
      const res = await fetch("/api/media/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: draftItems.map((i) => ({ id: i.id, type: i.type, prompt: i.promptTemplate })) }),
      });
      if (!res.ok) throw new Error("unavailable");
      const data = await res.json();
      const updated = items.map((item) => {
        const result = data.results?.find((r: any) => r.id === item.id);
        if (!result) return item;
        return { ...item, status: "generating" as const, generatedJobIds: [result.jobId] };
      });
      save(updated);
      toast(`Batch started — ${draftItems.length} items queued.`, "success");
    } catch {
      toast("Batch endpoint not yet live (Lane 1 in progress). Items left in draft.", "info");
      save(items.map((i) => (i.status === "queued" ? { ...i, status: "draft" as const } : i)));
    } finally {
      setBatchRunning(false);
    }
  };

  function addItem() {
    const item = newItem();
    const next = [...items, item];
    save(next);
    setEditingId(item.id);
  }

  function removeItem(id: string) {
    save(items.filter((i) => i.id !== id));
    if (editingId === id) setEditingId(null);
  }

  function patchItem(id: string, patch: Partial<MediaPlanItem>) {
    save(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  const draftCount = items.filter((i) => i.status === "draft").length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 md:p-8 max-w-5xl mx-auto"
    >
      <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Media Plan</h1>
          <p className="text-zinc-400">
            {activeProject?.name
              ? `Planning assets for "${activeProject.name}"`
              : "Define and batch-generate your media assets."}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={addItem}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-sm text-zinc-200 hover:bg-zinc-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Item
          </button>
          <button
            onClick={handleGenerateAll}
            disabled={batchRunning || draftCount === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-sm text-white font-medium transition-colors"
          >
            {batchRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Generate All ({draftCount})
          </button>
        </div>
      </div>

      {/* Natural language input */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6 mb-8">
        <label className="block text-sm font-medium text-zinc-300 mb-3">
          <Sparkles className="inline w-4 h-4 text-indigo-400 mr-1.5 relative -top-px" />
          Describe what media you need
        </label>
        <div className="flex gap-3 flex-wrap">
          <textarea
            value={naturalInput}
            onChange={(e) => setNaturalInput(e.target.value)}
            rows={2}
            placeholder='e.g. "I need assets for a SaaS product launch — website hero, 3 social posts, and a video intro"'
            className="flex-1 min-w-0 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
          <button
            onClick={handleSuggest}
            disabled={suggestLoading || !naturalInput.trim()}
            className="self-start px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium transition-colors flex items-center gap-2"
          >
            {suggestLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Suggest Plan
          </button>
        </div>
      </div>

      {/* Plan items */}
      {items.length === 0 ? (
        <div className="text-center py-16 bg-zinc-950 border border-zinc-800 rounded-2xl text-zinc-500">
          <ListOrdered className="w-12 h-12 mx-auto mb-4 opacity-40" />
          <p className="text-lg font-medium text-white mb-2">No plan items yet</p>
          <p className="text-sm">Describe your media needs above or click "Add Item".</p>
        </div>
      ) : (
        <Reorder.Group axis="y" values={items} onReorder={save} className="space-y-3">
          {items.map((item) => (
            <Reorder.Item key={item.id} value={item}>
              <motion.div layout className="bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-4">
                  <GripVertical className="w-4 h-4 text-zinc-600 cursor-grab shrink-0" />
                  {typeIcon(item.type)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-white truncate">{item.label}</span>
                      {statusPill(item.status)}
                    </div>
                    {item.purpose && (
                      <p className="text-xs text-zinc-500 mt-0.5 truncate">{item.purpose}</p>
                    )}
                  </div>
                  <button
                    onClick={() => setEditingId(editingId === item.id ? null : item.id)}
                    className="text-zinc-500 hover:text-zinc-200 transition-colors"
                  >
                    <ChevronDown className={`w-4 h-4 transition-transform ${editingId === item.id ? "rotate-180" : ""}`} />
                  </button>
                  <button
                    onClick={() => removeItem(item.id)}
                    className="text-zinc-600 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <AnimatePresence>
                  {editingId === item.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="border-t border-zinc-800 overflow-hidden"
                    >
                      <div className="p-4 space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div>
                            <label className="block text-xs text-zinc-400 mb-1.5">Label</label>
                            <input
                              value={item.label}
                              onChange={(e) => patchItem(item.id, { label: e.target.value })}
                              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-zinc-400 mb-1.5">Type</label>
                            <select
                              value={item.type}
                              onChange={(e) => patchItem(item.id, { type: e.target.value as MediaPlanItem["type"] })}
                              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                              <option value="image">Image</option>
                              <option value="video">Video</option>
                              <option value="voice">Voice</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs text-zinc-400 mb-1.5">Status</label>
                            <select
                              value={item.status}
                              onChange={(e) => patchItem(item.id, { status: e.target.value as MediaPlanItem["status"] })}
                              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                              {STATUS_ORDER.map((s) => (
                                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-zinc-400 mb-1.5">Purpose</label>
                          <input
                            value={item.purpose}
                            onChange={(e) => patchItem(item.id, { purpose: e.target.value })}
                            placeholder="e.g. Website hero, Instagram post, Pitch deck slide"
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-zinc-400 mb-1.5">Prompt / Template</label>
                          <textarea
                            value={item.promptTemplate}
                            onChange={(e) => patchItem(item.id, { promptTemplate: e.target.value })}
                            rows={3}
                            placeholder="The actual generation prompt for this asset…"
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            </Reorder.Item>
          ))}
        </Reorder.Group>
      )}

      {items.length > 0 && (
        <div className="mt-6 flex items-center justify-between text-sm text-zinc-500 px-1">
          <span>{items.length} items · {draftCount} draft</span>
          <button onClick={() => save([])} className="text-red-400 hover:text-red-300 transition-colors flex items-center gap-1">
            <Trash2 className="w-3.5 h-3.5" />Clear plan
          </button>
        </div>
      )}
    </motion.div>
  );
}

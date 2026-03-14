import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence, Reorder } from "motion/react";
import { Link } from "react-router-dom";
import {
  FolderOpen,
  Plus,
  Trash2,
  GripVertical,
  Image as ImageIcon,
  Video,
  Mic,
  Presentation,
  X,
  RefreshCw,
  Check,
} from "lucide-react";
import { useToast } from "../context/ToastContext";
import { useProject } from "../context/ProjectContext";

const COLLECTIONS_KEY = "gemlink-collections";

export interface CollectionItem {
  jobId: string;
  type: "image" | "video" | "voice";
  url: string;
  prompt: string;
  addedAt: string;
}

export interface Collection {
  id: string;
  name: string;
  projectId: string;
  items: CollectionItem[];
  createdAt: string;
  updatedAt: string;
}

function genId() {
  return `col_${Math.random().toString(36).slice(2, 10)}`;
}

function loadCollections(): Collection[] {
  try {
    const raw = localStorage.getItem(COLLECTIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveCollections(cols: Collection[]) {
  try { localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(cols)); } catch { /* ignore */ }
}

interface LibraryJob {
  id: string;
  type: "image" | "video" | "voice";
  prompt?: string;
  text?: string;
  outputs: string[];
  status?: string;
}

export default function Collections() {
  const { toast } = useToast();
  const { activeProject } = useProject();
  const [collections, setCollections] = useState<Collection[]>(loadCollections);
  const [activeColId, setActiveColId] = useState<string | null>(null);
  const [showNewCol, setShowNewCol] = useState(false);
  const [newColName, setNewColName] = useState("");
  const [libraryJobs, setLibraryJobs] = useState<LibraryJob[]>([]);
  const [libLoading, setLibLoading] = useState(false);
  const [showLibPicker, setShowLibPicker] = useState(false);

  const projectId = activeProject?.id ?? "default";
  const projectCols = collections.filter((c) => c.projectId === projectId);
  const activeCol = collections.find((c) => c.id === activeColId) ?? projectCols[0] ?? null;

  useEffect(() => {
    if (!activeColId && projectCols.length > 0) setActiveColId(projectCols[0].id);
  }, [projectId]);

  function persist(next: Collection[]) {
    setCollections(next);
    saveCollections(next);
  }

  function createCollection() {
    if (!newColName.trim()) return;
    const col: Collection = {
      id: genId(),
      name: newColName.trim(),
      projectId,
      items: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    persist([...collections, col]);
    setActiveColId(col.id);
    setNewColName("");
    setShowNewCol(false);
    toast(`Created collection "${col.name}".`, "success");
  }

  function deleteCollection(id: string) {
    persist(collections.filter((c) => c.id !== id));
    if (activeColId === id) {
      const remaining = projectCols.filter((c) => c.id !== id);
      setActiveColId(remaining[0]?.id ?? null);
    }
    toast("Collection deleted.", "info");
  }

  function reorderItems(newItems: CollectionItem[]) {
    if (!activeCol) return;
    persist(collections.map((c) => c.id === activeCol.id ? { ...c, items: newItems, updatedAt: new Date().toISOString() } : c));
  }

  function removeFromCollection(jobId: string) {
    if (!activeCol) return;
    persist(collections.map((c) =>
      c.id === activeCol.id
        ? { ...c, items: c.items.filter((i) => i.jobId !== jobId), updatedAt: new Date().toISOString() }
        : c
    ));
  }

  async function fetchLibrary() {
    setLibLoading(true);
    try {
      const res = await fetch("/api/media/history", { cache: "no-store" });
      if (!res.ok) throw new Error("fetch_failed");
      const data = await res.json();
      setLibraryJobs(data.filter((j: LibraryJob) => j.outputs?.length > 0));
    } catch {
      toast("Failed to load library.", "error");
    } finally {
      setLibLoading(false);
    }
  }

  function openLibPicker() {
    setShowLibPicker(true);
    fetchLibrary();
  }

  function addFromLibrary(job: LibraryJob) {
    if (!activeCol) return;
    if (activeCol.items.some((i) => i.jobId === job.id)) {
      toast("Already in this collection.", "warning");
      return;
    }
    const item: CollectionItem = {
      jobId: job.id,
      type: job.type as CollectionItem["type"],
      url: job.outputs[0],
      prompt: job.prompt ?? job.text ?? "",
      addedAt: new Date().toISOString(),
    };
    persist(collections.map((c) =>
      c.id === activeCol.id
        ? { ...c, items: [...c.items, item], updatedAt: new Date().toISOString() }
        : c
    ));
    toast("Added to collection.", "success");
  }

  const typeIcon = (type: string) => {
    if (type === "video") return <Video className="w-4 h-4 text-emerald-400" />;
    if (type === "voice") return <Mic className="w-4 h-4 text-amber-400" />;
    return <ImageIcon className="w-4 h-4 text-indigo-400" />;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 md:p-8 max-w-6xl mx-auto"
    >
      <div className="mb-8 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Collections</h1>
          <p className="text-zinc-400">Curate approved media into named collections. Drag to reorder.</p>
        </div>
        <button
          onClick={() => setShowNewCol(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-sm text-white font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Collection
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="md:col-span-1 space-y-2">
          {projectCols.length === 0 ? (
            <div className="text-zinc-500 text-sm text-center py-8 border border-zinc-800 rounded-xl">No collections yet</div>
          ) : (
            projectCols.map((col) => (
              <button
                key={col.id}
                onClick={() => setActiveColId(col.id)}
                className={`w-full text-left px-4 py-3 rounded-xl border transition-all flex items-center gap-2 ${
                  (activeColId ?? projectCols[0]?.id) === col.id
                    ? "bg-indigo-600/15 border-indigo-500/40 text-white"
                    : "border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-white"
                }`}
              >
                <FolderOpen className="w-4 h-4 shrink-0" />
                <span className="truncate flex-1 text-sm font-medium">{col.name}</span>
                <span className="text-xs text-zinc-500 shrink-0">{col.items.length}</span>
              </button>
            ))
          )}
        </div>

        {/* Main */}
        <div className="md:col-span-3">
          {!activeCol ? (
            <div className="text-center py-24 bg-zinc-950 border border-zinc-800 rounded-2xl text-zinc-500">
              <FolderOpen className="w-12 h-12 mx-auto mb-4 opacity-40" />
              <p className="text-lg font-medium text-white mb-2">No collection selected</p>
              <p className="text-sm">Create a collection on the left to get started.</p>
            </div>
          ) : (
            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden">
              <div className="p-5 border-b border-zinc-800 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <FolderOpen className="w-5 h-5 text-indigo-400" />
                  <div>
                    <h2 className="text-lg font-semibold text-white">{activeCol.name}</h2>
                    <p className="text-xs text-zinc-500">{activeCol.items.length} items</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {activeCol.items.length > 0 && (
                    <Link
                      to={`/present/${activeCol.id}`}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-sm text-zinc-200 hover:bg-zinc-700 transition-colors"
                    >
                      <Presentation className="w-4 h-4" />
                      Present
                    </Link>
                  )}
                  <button
                    onClick={openLibPicker}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-sm text-white transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Add from Library
                  </button>
                  <button
                    onClick={() => deleteCollection(activeCol.id)}
                    className="p-2 rounded-xl text-zinc-600 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {activeCol.items.length === 0 ? (
                <div className="text-center py-16 text-zinc-500">
                  <p className="text-sm">No media in this collection yet.</p>
                  <button onClick={openLibPicker} className="mt-3 text-indigo-400 hover:text-indigo-300 text-sm">+ Add from Library</button>
                </div>
              ) : (
                <div className="p-4">
                  <Reorder.Group axis="y" values={activeCol.items} onReorder={reorderItems} className="space-y-2">
                    {activeCol.items.map((item) => (
                      <Reorder.Item key={item.jobId} value={item}>
                        <motion.div layout className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl p-3 cursor-grab active:cursor-grabbing">
                          <GripVertical className="w-4 h-4 text-zinc-600 shrink-0" />
                          <div className="w-12 h-12 rounded-lg overflow-hidden bg-zinc-800 shrink-0">
                            {item.type === "image" ? (
                              <img src={item.url} alt={item.prompt} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">{typeIcon(item.type)}</div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              {typeIcon(item.type)}
                              <span className="text-xs text-zinc-400 uppercase tracking-wider">{item.type}</span>
                            </div>
                            <p className="text-sm text-zinc-300 truncate mt-0.5">{item.prompt || "No description"}</p>
                          </div>
                          <button onClick={() => removeFromCollection(item.jobId)} className="text-zinc-600 hover:text-red-400 transition-colors shrink-0">
                            <X className="w-4 h-4" />
                          </button>
                        </motion.div>
                      </Reorder.Item>
                    ))}
                  </Reorder.Group>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* New collection modal */}
      <AnimatePresence>
        {showNewCol && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
              <h2 className="text-lg font-semibold text-white mb-4">New Collection</h2>
              <input autoFocus type="text" value={newColName} onChange={(e) => setNewColName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") createCollection(); if (e.key === "Escape") setShowNewCol(false); }} placeholder="e.g. Website Launch Assets" className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4" />
              <div className="flex gap-3">
                <button onClick={createCollection} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 rounded-xl transition-colors">Create</button>
                <button onClick={() => setShowNewCol(false)} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium py-2.5 rounded-xl transition-colors">Cancel</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Library picker modal */}
      <AnimatePresence>
        {showLibPicker && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden max-h-[80vh] flex flex-col">
              <div className="flex items-center justify-between p-5 border-b border-zinc-800">
                <h2 className="text-lg font-semibold text-white">Add from Library</h2>
                <div className="flex items-center gap-2">
                  <button onClick={fetchLibrary} className="p-2 text-zinc-400 hover:text-white transition-colors">
                    <RefreshCw className={`w-4 h-4 ${libLoading ? "animate-spin" : ""}`} />
                  </button>
                  <button onClick={() => setShowLibPicker(false)} className="text-zinc-500 hover:text-white transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {libLoading ? (
                  <div className="flex items-center justify-center py-12 text-zinc-400">
                    <RefreshCw className="w-6 h-6 animate-spin" />
                  </div>
                ) : libraryJobs.length === 0 ? (
                  <div className="text-center py-12 text-zinc-500">No media in library.</div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {libraryJobs.map((job) => {
                      const alreadyAdded = activeCol?.items.some((i) => i.jobId === job.id);
                      return (
                        <button key={job.id} onClick={() => !alreadyAdded && addFromLibrary(job)} className={`relative rounded-xl overflow-hidden aspect-square border transition-all ${alreadyAdded ? "border-emerald-500/50 opacity-60 cursor-default" : "border-zinc-700 hover:border-indigo-500/60"}`}>
                          {job.type === "image" ? (
                            <img src={job.outputs[0]} alt={job.prompt} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-zinc-800 flex items-center justify-center">{typeIcon(job.type)}</div>
                          )}
                          {alreadyAdded && (
                            <div className="absolute inset-0 bg-emerald-900/30 flex items-center justify-center">
                              <Check className="w-6 h-6 text-emerald-400" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="p-4 border-t border-zinc-800">
                <button onClick={() => setShowLibPicker(false)} className="w-full py-2.5 rounded-xl bg-zinc-800 text-zinc-300 text-sm hover:bg-zinc-700 transition-colors">Done</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Plus, Trash2, Save, FolderOpen } from "lucide-react";
import { useProject } from "../context/ProjectContext";
import { useToast } from "../context/ToastContext";

export default function Setup() {
  const { activeProject, updateProject, createProject, deleteProject, projects } = useProject();
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: "",
    brandName: "",
    brandDescription: "",
    targetAudience: "",
    brandVoice: "",
    styleKeywords: "",
  });
  const [showNewModal, setShowNewModal] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    if (!activeProject) return;
    setForm({
      name: activeProject.name,
      brandName: activeProject.brandName,
      brandDescription: activeProject.brandDescription,
      targetAudience: activeProject.targetAudience,
      brandVoice: activeProject.brandVoice,
      styleKeywords: (activeProject.styleKeywords ?? []).join(", "),
    });
  }, [activeProject?.id]);

  function handleSave() {
    if (!activeProject) return;
    updateProject(activeProject.id, {
      name: form.name,
      brandName: form.brandName,
      brandDescription: form.brandDescription,
      targetAudience: form.targetAudience,
      brandVoice: form.brandVoice,
      styleKeywords: form.styleKeywords
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    });
    toast("Project settings saved.", "success");
  }

  function handleDelete() {
    if (!activeProject) return;
    if (projects.length <= 1) {
      toast("Cannot delete the only project.", "warning");
      return;
    }
    deleteProject(activeProject.id);
    toast(`Deleted "${activeProject.name}".`, "info");
  }

  function handleCreate() {
    if (!newName.trim()) return;
    createProject({
      name: newName.trim(),
      brandName: newName.trim(),
      brandDescription: "",
      targetAudience: "",
      brandVoice: "",
    });
    setNewName("");
    setShowNewModal(false);
    toast(`Created project "${newName.trim()}".`, "success");
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 md:p-8 max-w-3xl mx-auto"
    >
      <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Brand Setup</h1>
          <p className="text-zinc-400">
            Configure the active project's brand identity. All AI tools use this context.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setShowNewModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-sm text-zinc-200 hover:bg-zinc-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Project
          </button>
          <button
            onClick={handleDelete}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-900/30 border border-red-700/40 text-sm text-red-300 hover:bg-red-900/50 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        </div>
      </div>

      {!activeProject ? (
        <div className="text-zinc-500 text-center py-16">No project selected.</div>
      ) : (
        <div className="space-y-6 bg-zinc-950 p-6 rounded-2xl border border-zinc-800 shadow-xl">
          <div className="flex items-center gap-3 mb-2">
            <FolderOpen className="w-5 h-5 text-indigo-400" />
            <span className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">
              Active Project
            </span>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Project Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g. Q2 SaaS Launch"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Brand Name</label>
            <input
              type="text"
              value={form.brandName}
              onChange={(e) => setForm((f) => ({ ...f, brandName: e.target.value }))}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g. Acme Corp"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Brand Description</label>
            <textarea
              value={form.brandDescription}
              onChange={(e) => setForm((f) => ({ ...f, brandDescription: e.target.value }))}
              rows={4}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="What does your business do?"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Target Audience</label>
            <input
              type="text"
              value={form.targetAudience}
              onChange={(e) => setForm((f) => ({ ...f, targetAudience: e.target.value }))}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Who are you selling to?"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Brand Voice & Tone</label>
            <input
              type="text"
              value={form.brandVoice}
              onChange={(e) => setForm((f) => ({ ...f, brandVoice: e.target.value }))}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g. Professional, witty, educational"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Style Keywords{" "}
              <span className="text-zinc-500 font-normal">(comma-separated)</span>
            </label>
            <input
              type="text"
              value={form.styleKeywords}
              onChange={(e) => setForm((f) => ({ ...f, styleKeywords: e.target.value }))}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g. minimalist, bold, corporate"
            />
          </div>

          <button
            onClick={handleSave}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 rounded-xl transition-colors"
          >
            <Save className="w-4 h-4" />
            Save Project Settings
          </button>

          <p className="text-xs text-zinc-600 text-center">
            Last updated: {new Date(activeProject.updatedAt).toLocaleString()}
          </p>
        </div>
      )}

      {/* New Project Modal */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl"
          >
            <h2 className="text-lg font-semibold text-white mb-4">New Project</h2>
            <input
              autoFocus
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setShowNewModal(false); }}
              placeholder="Project name"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={handleCreate}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 rounded-xl transition-colors"
              >
                Create
              </button>
              <button
                onClick={() => setShowNewModal(false)}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium py-2.5 rounded-xl transition-colors"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}

import { useProject } from "../context/ProjectContext";
import { useBrand } from "../context/BrandContext";
import { motion, AnimatePresence } from "motion/react";
import {
  PhoneCall,
  Copy,
  CheckCircle2,
  Sparkles,
  Save,
  Loader2,
  ImageIcon,
  FolderOpen,
  AlertCircle,
  RefreshCw,
  ChevronRight,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TwilioAgentConfig {
  brandName: string;
  brandDescription: string;
  targetAudience: string;
  brandVoice: string;
  projectId?: string;
  projectName?: string;
  mediaCount?: number;
  updatedAt: string;
}

interface MediaJob {
  id: string;
  type: "image" | "video" | "voice";
  status: "pending" | "completed" | "failed";
  prompt?: string;
  text?: string;
  outputs: string[];
  createdAt: string;
  brandContext?: unknown;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isSalesMedia(job: MediaJob): boolean {
  const text = ((job.prompt || job.text || "") + " " + JSON.stringify(job.brandContext || "")).toLowerCase();
  return (
    text.includes("sales") ||
    text.includes("promotional") ||
    text.includes("promo") ||
    text.includes("campaign") ||
    text.includes("offer") ||
    text.includes("product") ||
    text.includes("launch") ||
    text.includes("marketing")
  );
}

function timeAgo(iso: string): string {
  const delta = (Date.now() - new Date(iso).getTime()) / 1000;
  if (delta < 60) return "just now";
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
  return `${Math.floor(delta / 86400)}d ago`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SalesAgent() {
  // Primary: ProjectContext (G1); fallback: BrandContext for legacy data.
  const { activeProject } = useProject();
  const brand = useBrand();

  // Resolve brand fields: activeProject wins, BrandContext is the fallback.
  const brandName       = activeProject?.brandName       ?? brand.brandName;
  const brandDescription= activeProject?.brandDescription?? brand.brandDescription;
  const targetAudience  = activeProject?.targetAudience  ?? brand.targetAudience;
  const brandVoice      = activeProject?.brandVoice      ?? brand.brandVoice;
  const projectId       = activeProject?.id;
  const projectName     = activeProject?.name;

  // Webhook URL
  const webhookUrl = `${import.meta.env.VITE_APP_URL || window.location.origin}/api/twilio/sms`;

  // Copy state
  const [copied, setCopied] = useState(false);

  // Config persistence state
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [savedConfig, setSavedConfig] = useState<TwilioAgentConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);

  // Media library state
  const [mediaJobs, setMediaJobs] = useState<MediaJob[]>([]);
  const [mediaLoading, setMediaLoading] = useState(true);
  const [mediaError, setMediaError] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Load existing config on mount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    setConfigLoading(true);
    fetch("/api/twilio/config")
      .then((r) => r.json())
      .then((cfg: TwilioAgentConfig) => setSavedConfig(cfg))
      .catch(() => setSavedConfig(null))
      .finally(() => setConfigLoading(false));
  }, []);

  // ---------------------------------------------------------------------------
  // Load media library — filter by active project if one is selected
  // ---------------------------------------------------------------------------

  const loadMedia = useCallback(() => {
    setMediaLoading(true);
    setMediaError(null);
    const url = projectId
      ? `/api/media/history?projectId=${encodeURIComponent(projectId)}`
      : "/api/media/history";
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error("Failed to fetch media");
        return r.json();
      })
      .then((jobs: MediaJob[]) => setMediaJobs(jobs))
      .catch((e: Error) => setMediaError(e.message))
      .finally(() => setMediaLoading(false));
  }, [projectId]);

  useEffect(() => {
    loadMedia();
  }, [loadMedia]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const copyToClipboard = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const saveConfig = async () => {
    setSaving(true);
    setSaveStatus("idle");

    // Count completed media jobs to inform the SMS agent
    const completedCount = mediaJobs.filter((j) => j.status === "completed").length;

    try {
      const res = await fetch("/api/twilio/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandName,
          brandDescription,
          targetAudience,
          brandVoice,
          // Send active project context (G1 — ProjectContext)
          projectId,
          projectName,
          mediaCount: completedCount,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Unknown error");
      }

      const { config } = await res.json();
      setSavedConfig(config);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch (e) {
      console.error("Save config error:", e);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 4000);
    } finally {
      setSaving(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------

  const salesMedia = mediaJobs.filter((j) => j.type === "image" && j.status === "completed" && isSalesMedia(j));
  const recentSalesMedia = salesMedia.slice(0, 6);
  const totalCompleted = mediaJobs.filter((j) => j.status === "completed").length;

  const configInSync =
    savedConfig &&
    savedConfig.brandName === brandName &&
    savedConfig.brandDescription === brandDescription &&
    savedConfig.targetAudience === targetAudience &&
    savedConfig.brandVoice === brandVoice;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 md:p-8 max-w-5xl mx-auto"
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="mb-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Twilio Sales Agent</h1>
            <p className="text-zinc-400">Deploy an AI sales agent via SMS using Twilio.</p>
          </div>

          {/* Project badge — fed from activeProject (ProjectContext / G1) */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/25 rounded-xl px-4 py-2">
              <FolderOpen className="w-4 h-4 text-indigo-400" />
              <span className="text-indigo-300 text-sm font-medium">
                {projectName ?? brandName}
              </span>
              <span className="text-indigo-400/50 text-xs ml-1">
                {activeProject ? "active project" : "brand (no project)"}
              </span>
            </div>
            {!configInSync && !configLoading && (
              <div
                className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3 py-2"
                title="Brand context not synced to SMS agent"
              >
                <AlertCircle className="w-4 h-4 text-amber-400" />
                <span className="text-amber-300 text-xs font-medium">Not synced</span>
              </div>
            )}
            {configInSync && !configLoading && (
              <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/25 rounded-xl px-3 py-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="text-emerald-300 text-xs font-medium">Synced</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Brand Context Sync Card ─────────────────────────────── */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6 mb-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-400">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Agent Brand Context</h2>
            <p className="text-sm text-zinc-400">
              Push your brand config to the SMS agent so it replies in your brand voice.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
          {[
            { label: "Brand Name", value: brandName },
            { label: "Target Audience", value: targetAudience },
            { label: "Description", value: brandDescription },
            { label: "Brand Voice", value: brandVoice },
          ].map(({ label, value }) => (
            <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-xs text-zinc-500 mb-1">{label}</p>
              <p className="text-sm text-zinc-200 leading-snug line-clamp-2">{value}</p>
            </div>
          ))}
        </div>

        {/* Project context indicator */}
        {activeProject && (
          <div className="flex items-center gap-2 mb-5 text-xs text-zinc-500">
            <FolderOpen className="w-3.5 h-3.5 text-indigo-400" />
            <span>
              Sourced from project{" "}
              <span className="text-indigo-300 font-medium">{activeProject.name}</span>
              {" "}(id: <code className="text-zinc-400">{activeProject.id}</code>)
            </span>
          </div>
        )}

        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="text-sm text-zinc-500">
            {configLoading ? (
              "Loading saved config…"
            ) : savedConfig ? (
              <>
                Last synced:{" "}
                <span className="text-zinc-400">{timeAgo(savedConfig.updatedAt)}</span>
                {savedConfig.projectName && (
                  <span className="ml-3 text-indigo-400/70">
                    · project: {savedConfig.projectName}
                  </span>
                )}
                {savedConfig.mediaCount !== undefined && (
                  <span className="ml-3 text-zinc-500">
                    · {savedConfig.mediaCount} media asset{savedConfig.mediaCount !== 1 ? "s" : ""} referenced
                  </span>
                )}
              </>
            ) : (
              <span className="text-amber-400">No config saved yet — agent is using placeholder brand data.</span>
            )}
          </div>

          <button
            id="save-agent-config-btn"
            onClick={saveConfig}
            disabled={saving}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm transition-all ${
              saveStatus === "saved"
                ? "bg-emerald-600/20 text-emerald-300 border border-emerald-600/30"
                : saveStatus === "error"
                ? "bg-red-600/20 text-red-300 border border-red-600/30"
                : "bg-indigo-600 hover:bg-indigo-500 text-white border border-transparent"
            } disabled:opacity-60 disabled:cursor-not-allowed`}
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : saveStatus === "saved" ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : saveStatus === "error" ? (
              <AlertCircle className="w-4 h-4" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving
              ? "Saving…"
              : saveStatus === "saved"
              ? "Saved to Agent!"
              : saveStatus === "error"
              ? "Save Failed"
              : "Save to Agent"}
          </button>
        </div>
      </div>

      {/* ── Webhook Config Card ─────────────────────────────────── */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6 mb-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-400">
            <PhoneCall className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">SMS Webhook Configuration</h2>
            <p className="text-sm text-zinc-400">Connect your Twilio number to this workspace.</p>
          </div>
        </div>

        <div className="space-y-5">
          {/* Webhook URL */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <h3 className="text-sm font-medium text-zinc-300 mb-3">1. Copy your Webhook URL</h3>
            <div className="flex items-center gap-3">
              <code className="flex-1 bg-black px-4 py-3 rounded-lg text-emerald-400 font-mono text-sm border border-zinc-800 overflow-x-auto">
                {webhookUrl}
              </code>
              <button
                id="copy-webhook-url-btn"
                onClick={copyToClipboard}
                className="bg-zinc-800 hover:bg-zinc-700 text-white p-3 rounded-lg transition-colors flex-shrink-0"
                title="Copy webhook URL"
              >
                {copied ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Twilio instructions */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <h3 className="text-sm font-medium text-zinc-300 mb-3">2. Configure Twilio</h3>
            <ol className="list-decimal list-inside space-y-2 text-zinc-400 text-sm">
              <li>Log in to your Twilio Console</li>
              <li>Navigate to Phone Numbers &gt; Manage &gt; Active numbers</li>
              <li>Click on your desired phone number</li>
              <li>
                Scroll down to the <strong>Messaging</strong> section
              </li>
              <li>Under "A MESSAGE COMES IN", select "Webhook"</li>
              <li>Paste the URL above and select "HTTP POST"</li>
              <li>Save changes</li>
            </ol>
          </div>

          {/* Agent context summary */}
          <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-5">
            <h3 className="text-sm font-medium text-indigo-300 mb-2">Agent Context Preview</h3>
            <p className="text-sm text-indigo-200/70 leading-relaxed">
              When users text your Twilio number, the AI will respond as a sales agent for{" "}
              <strong>{brandName}</strong>. It uses your brand description, target audience (
              {targetAudience}), and brand voice to craft responses.
              {activeProject && (
                <>
                  {" "}
                  Representing project <strong>{activeProject.name}</strong>.
                </>
              )}
              {totalCompleted > 0 && (
                <>
                  {" "}
                  The agent knows your media library has{" "}
                  <strong>{totalCompleted} completed asset{totalCompleted !== 1 ? "s" : ""}</strong> available to
                  reference in conversations.
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* ── Sales Media Library ─────────────────────────────────── */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6">
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-violet-500/10 rounded-xl flex items-center justify-center text-violet-400">
              <ImageIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Sales &amp; Promotional Media</h2>
              <p className="text-sm text-zinc-400">
                Media assets tagged as sales, promotional, or campaign-related.
                {activeProject && (
                  <span className="ml-1 text-indigo-400/70">
                    · filtered to <span className="font-medium">{activeProject.name}</span>
                  </span>
                )}
              </p>
            </div>
          </div>

          <button
            id="refresh-media-btn"
            onClick={loadMedia}
            disabled={mediaLoading}
            className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-50"
            title="Refresh media library"
          >
            <RefreshCw className={`w-4 h-4 ${mediaLoading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {mediaLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="aspect-square rounded-xl bg-zinc-900 border border-zinc-800 animate-pulse"
              />
            ))}
          </div>
        ) : mediaError ? (
          <div className="flex items-center gap-3 text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-4">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm">{mediaError}</p>
          </div>
        ) : recentSalesMedia.length === 0 ? (
          <div className="text-center py-12">
            <ImageIcon className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
            <p className="text-zinc-500 text-sm mb-1">No sales or promotional media found.</p>
            <p className="text-zinc-600 text-xs">
              Generate images with prompts containing "sales", "promo", "campaign", "product", or "marketing"
              — they'll appear here automatically.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
              <AnimatePresence>
                {recentSalesMedia.map((job) => (
                  <motion.div
                    key={job.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="group relative aspect-square rounded-xl overflow-hidden border border-zinc-800 bg-zinc-900"
                  >
                    {job.outputs[0] && (
                      <img
                        src={job.outputs[0]}
                        alt={job.prompt || "Sales media"}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-3">
                      <p className="text-white text-xs line-clamp-2 leading-snug">
                        {job.prompt || job.text || "Untitled"}
                      </p>
                      <p className="text-zinc-400 text-xs mt-1">{timeAgo(job.createdAt)}</p>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {salesMedia.length > 6 && (
              <a
                href="/library"
                className="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                View all {salesMedia.length} sales media assets in Library
                <ChevronRight className="w-4 h-4" />
              </a>
            )}
          </>
        )}

        {/* Stats bar */}
        <div className="mt-5 pt-5 border-t border-zinc-800 flex flex-wrap gap-6">
          <div>
            <p className="text-xs text-zinc-500 mb-0.5">Total Media</p>
            <p className="text-lg font-semibold text-white">{totalCompleted}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500 mb-0.5">Sales / Promo</p>
            <p className="text-lg font-semibold text-violet-400">{salesMedia.length}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500 mb-0.5">Images</p>
            <p className="text-lg font-semibold text-white">
              {mediaJobs.filter((j) => j.type === "image" && j.status === "completed").length}
            </p>
          </div>
          <div>
            <p className="text-xs text-zinc-500 mb-0.5">Videos</p>
            <p className="text-lg font-semibold text-white">
              {mediaJobs.filter((j) => j.type === "video" && j.status === "completed").length}
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

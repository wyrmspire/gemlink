/**
 * Settings.tsx — /settings page
 * Lane 3, Sprint 4.5
 *
 * Sections:
 *  1. 🧠 AI Models      — 7 model rows with dropdown + test button
 *  2. 🎨 Gen Defaults   — aspect ratio, image size, count, voice, resolution
 *  3. ⚡ Features        — auto-score, auto-tag, confirm-before-gen toggles
 *  4. 🔑 API & Info     — API key, server port, FFmpeg status, health check
 *  5. 📊 Usage & Info   — version, export/import settings
 */

import { useState, useEffect, useCallback } from "react";
import { motion } from "motion/react";
import {
  Brain,
  Palette,
  Zap,
  KeyRound,
  BarChart2,
  CheckCircle2,
  XCircle,
  Loader2,
  FlaskConical,
  Save,
  RefreshCw,
  Download,
  Upload,
  Server,
  Cpu,
} from "lucide-react";
import { useToast } from "../context/ToastContext";

// ── Types ───────────────────────────────────────────────────────────────────

interface SettingsModels {
  text: string;
  multimodal: string;
  image: string;
  video: string;
  tts: string;
  creative: string;
  boardroom: string;
}

interface SettingsDefaults {
  imageCount: number;
  aspectRatio: string;
  imageSize: string;
  videoResolution: string;
  videoAspectRatio: string;
  voice: string;
  captionStyle?: string;
}

interface SettingsFeatures {
  autoScore: boolean;
  autoTag: boolean;
  autoSavePlans: boolean;
  confirmBeforeGenerate: boolean;
  kenBurnsDefault: boolean;
}

interface AppSettings {
  models: SettingsModels;
  defaults: SettingsDefaults;
  features: SettingsFeatures;
  ffmpeg?: boolean;
  version?: string;
}

// ── Default values (used if server unreachable) ─────────────────────────────

const DEFAULT_SETTINGS: AppSettings = {
  models: {
    text:       import.meta.env.VITE_MODEL_TEXT       || "gemini-2.5-flash",
    multimodal: import.meta.env.VITE_MODEL_MULTIMODAL || "gemini-2.5-flash",
    image:      import.meta.env.VITE_MODEL_IMAGE      || "gemini-2.5-flash-preview-image",
    video:      import.meta.env.VITE_MODEL_VIDEO      || "veo-2.0-generate-001",
    tts:        import.meta.env.VITE_MODEL_TTS        || "gemini-2.5-flash-preview-tts",
    creative:   import.meta.env.VITE_MODEL_CREATIVE   || "gemini-2.5-flash",
    boardroom:  import.meta.env.VITE_MODEL_BOARDROOM  || "gemini-2.5-flash",
  },
  defaults: {
    imageCount: 1,
    aspectRatio: "1:1",
    imageSize: "1K",
    videoResolution: "720p",
    videoAspectRatio: "16:9",
    voice: "Kore",
    captionStyle: "clean",
  },
  features: {
    autoScore: true,
    autoTag: true,
    autoSavePlans: true,
    confirmBeforeGenerate: true,
    kenBurnsDefault: true,
  },
};

// ── Model option lists ──────────────────────────────────────────────────────

const TEXT_MODELS = [
  "gemini-2.0-flash",
  "gemini-2.0-pro",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-3-flash-preview",
  "gemini-3-pro-preview",
];
const IMAGE_MODELS = [
  "imagen-3",
  "imagen-3.1",
  "imagen-4",
  "gemini-2.5-flash-image",
  "gemini-3-pro-image-preview",
];
const VIDEO_MODELS = [
  "veo-2.0-generate-001",
  "veo-3.1-fast-generate-preview",
  "veo-3.1-pro-preview",
];
const TTS_MODELS = [
  "gemini-2.5-flash-preview-tts",
  "gemini-2.5-pro-preview-tts",
];

const MODEL_OPTIONS: Record<keyof SettingsModels, string[]> = {
  text:       TEXT_MODELS,
  multimodal: TEXT_MODELS,
  image:      IMAGE_MODELS,
  video:      VIDEO_MODELS,
  tts:        TTS_MODELS,
  creative:   TEXT_MODELS,
  boardroom:  TEXT_MODELS,
};

const MODEL_LABELS: Record<keyof SettingsModels, { label: string; description: string }> = {
  text:       { label: "Text Model",       description: "Planning, scoring, grading, analysis" },
  multimodal: { label: "Multimodal Model", description: "Image/video analysis with visual input" },
  image:      { label: "Image Model",      description: "Generates images from prompts" },
  video:      { label: "Video Model",      description: "Generates video clips" },
  tts:        { label: "TTS Model",        description: "Text-to-speech voice generation" },
  creative:   { label: "Creative Model",   description: "Prompt expansion, variants" },
  boardroom:  { label: "Boardroom Model",  description: "Multi-turn discussion sessions" },
};

const VOICES = ["Kore", "Charon", "Fenrir", "Aoede", "Puck"];
const CAPTION_STYLES = ["clean", "bold-outline", "boxed", "typewriter", "word-highlight"];

// ── Section tab type ─────────────────────────────────────────────────────────

type SectionId = "models" | "defaults" | "features" | "api" | "info";

const SECTIONS: { id: SectionId; label: string; icon: React.ReactNode }[] = [
  { id: "models",   label: "AI Models",    icon: <Brain className="w-4 h-4" /> },
  { id: "defaults", label: "Defaults",     icon: <Palette className="w-4 h-4" /> },
  { id: "features", label: "Features",     icon: <Zap className="w-4 h-4" /> },
  { id: "api",      label: "API & Info",   icon: <KeyRound className="w-4 h-4" /> },
  { id: "info",     label: "Usage & Info", icon: <BarChart2 className="w-4 h-4" /> },
];

// ── Toggle component ─────────────────────────────────────────────────────────

function Toggle({ checked, onChange, id }: { checked: boolean; onChange: (v: boolean) => void; id: string }) {
  return (
    <button
      id={id}
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-zinc-950 ${
        checked ? "bg-indigo-600" : "bg-zinc-700"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

// ── ModelRow component ────────────────────────────────────────────────────────

type TestStatus = "idle" | "testing" | "ok" | "fail";

function ModelRow({
  roleKey,
  value,
  onChange,
}: {
  roleKey: keyof SettingsModels;
  value: string;
  onChange: (v: string) => void;
}) {
  const { label, description } = MODEL_LABELS[roleKey];
  const options = MODEL_OPTIONS[roleKey];
  const isCustom = !options.includes(value);
  const [showCustom, setShowCustom] = useState(isCustom);
  const [customValue, setCustomValue] = useState(isCustom ? value : "");
  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const { toast } = useToast();

  function handleSelectChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value;
    if (v === "__custom__") {
      setShowCustom(true);
    } else {
      setShowCustom(false);
      onChange(v);
    }
  }

  function handleCustomBlur() {
    if (customValue.trim()) onChange(customValue.trim());
  }

  async function handleTest() {
    const modelToTest = showCustom ? customValue.trim() : value;
    if (!modelToTest) return;
    setTestStatus("testing");
    try {
      const res = await fetch("/api/settings/test-model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelToTest }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ok) {
          setTestStatus("ok");
          toast(`✅ ${modelToTest} responded in ${data.responseTime}ms`, "success");
        } else {
          setTestStatus("fail");
          toast(`❌ ${modelToTest}: ${data.error}`, "error");
        }
      } else {
        // Endpoint not yet live — show a friendly stub toast
        setTestStatus("idle");
        toast(`🧪 Test endpoint not yet live (Lane 1 W4 needed)`, "info");
      }
    } catch {
      setTestStatus("idle");
      toast("🧪 Test endpoint not yet reachable", "info");
    }
    setTimeout(() => setTestStatus("idle"), 4000);
  }

  return (
    <div className="flex items-start gap-4 py-4 border-b border-zinc-800 last:border-0">
      {/* Label */}
      <div className="w-40 shrink-0">
        <p className="text-sm font-medium text-white">{label}</p>
        <p className="text-xs text-zinc-500 mt-0.5 leading-snug">{description}</p>
      </div>

      {/* Controls */}
      <div className="flex-1 flex flex-wrap gap-2 items-center">
        <select
          id={`model-select-${roleKey}`}
          value={showCustom ? "__custom__" : value}
          onChange={handleSelectChange}
          className="flex-1 min-w-[200px] bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {options.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
          <option value="__custom__">Custom…</option>
        </select>

        {showCustom && (
          <input
            id={`model-custom-${roleKey}`}
            type="text"
            value={customValue}
            onChange={(e) => setCustomValue(e.target.value)}
            onBlur={handleCustomBlur}
            placeholder="e.g. gemini-2.5-flash-preview-04-17"
            className="flex-1 min-w-[240px] bg-zinc-900 border border-indigo-500/50 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        )}

        {/* Test button */}
        <button
          id={`model-test-${roleKey}`}
          onClick={handleTest}
          disabled={testStatus === "testing"}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-xs font-medium transition-colors disabled:opacity-50"
        >
          {testStatus === "testing" ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : testStatus === "ok" ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          ) : testStatus === "fail" ? (
            <XCircle className="w-3.5 h-3.5 text-red-400" />
          ) : (
            <FlaskConical className="w-3.5 h-3.5" />
          )}
          Test
        </button>
      </div>
    </div>
  );
}

// ── Segmented control ────────────────────────────────────────────────────────

function Segmented<T extends string>({
  options,
  value,
  onChange,
  id,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  id: string;
}) {
  return (
    <div id={id} className="inline-flex bg-zinc-900 border border-zinc-800 rounded-xl p-1 gap-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            value === opt.value
              ? "bg-indigo-600 text-white"
              : "text-zinc-400 hover:text-white hover:bg-zinc-800"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── Settings row ────────────────────────────────────────────────────────────

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-4 border-b border-zinc-800 last:border-0">
      <div>
        <p className="text-sm font-medium text-white">{label}</p>
        {description && <p className="text-xs text-zinc-500 mt-0.5">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

// ── Section card ────────────────────────────────────────────────────────────

function SectionCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-zinc-950 border border-zinc-800 rounded-2xl p-6 ${className}`}>
      {children}
    </div>
  );
}

// ── Main Settings page ───────────────────────────────────────────────────────

export default function Settings() {
  const { toast } = useToast();
  const [activeSection, setActiveSection] = useState<SectionId>("models");
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState(false);
  const [healthStatus, setHealthStatus] = useState<"idle" | "ok" | "fail" | "checking">("idle");
  const [healthMs, setHealthMs] = useState<number | null>(null);
  const [ffmpegAvailable, setFfmpegAvailable] = useState<boolean | null>(null);
  const [apiKeyMasked, setApiKeyMasked] = useState("••••••••••••••••••••••••");
  const [showApiKey, setShowApiKey] = useState(false);

  // ── Fetch settings from server ─────────────────────────────────────────────
  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as Partial<AppSettings> & { ffmpeg?: boolean; version?: string };
      setSettings((prev) => ({
        models:   { ...DEFAULT_SETTINGS.models,   ...(data.models   ?? {}) },
        defaults: { ...DEFAULT_SETTINGS.defaults, ...(data.defaults ?? {}) },
        features: { ...DEFAULT_SETTINGS.features, ...(data.features ?? {}) },
      }));
      setFfmpegAvailable(data.ffmpeg ?? null);
      setServerError(false);
    } catch {
      // Fall back to localStorage if server unreachable
      try {
        const cached = localStorage.getItem("gemlink-settings");
        if (cached) setSettings(JSON.parse(cached) as AppSettings);
      } catch { /* ignore */ }
      setServerError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  // ── Save settings to server ────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          models:   settings.models,
          defaults: settings.defaults,
          features: settings.features,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Also save to localStorage as fallback cache
      localStorage.setItem("gemlink-settings", JSON.stringify(settings));
      toast("Settings saved ✓", "success");
    } catch {
      // Save to localStorage even if server fails
      localStorage.setItem("gemlink-settings", JSON.stringify(settings));
      toast("Server unreachable — settings cached locally", "warning");
    } finally {
      setSaving(false);
    }
  }

  // ── Health check ───────────────────────────────────────────────────────────
  async function handleHealthCheck() {
    setHealthStatus("checking");
    setHealthMs(null);
    const t0 = Date.now();
    try {
      const res = await fetch("/api/health");
      const ms = Date.now() - t0;
      if (res.ok) {
        setHealthStatus("ok");
        setHealthMs(ms);
      } else {
        setHealthStatus("fail");
      }
    } catch {
      setHealthStatus("fail");
    }
  }

  // ── Export settings ────────────────────────────────────────────────────────
  function handleExport() {
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gemlink-settings-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Settings exported", "success");
  }

  // ── Import settings ────────────────────────────────────────────────────────
  function handleImport() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const imported = JSON.parse(text) as Partial<AppSettings>;
        setSettings((prev) => ({
          models:   { ...prev.models,   ...(imported.models   ?? {}) },
          defaults: { ...prev.defaults, ...(imported.defaults ?? {}) },
          features: { ...prev.features, ...(imported.features ?? {}) },
        }));
        toast("Settings imported — click Save to apply", "info");
      } catch {
        toast("Failed to parse settings file", "error");
      }
    };
    input.click();
  }

  // ── Patch helpers ─────────────────────────────────────────────────────────
  function patchModels(patch: Partial<SettingsModels>) {
    setSettings((s) => ({ ...s, models: { ...s.models, ...patch } }));
  }
  function patchDefaults(patch: Partial<SettingsDefaults>) {
    setSettings((s) => ({ ...s, defaults: { ...s.defaults, ...patch } }));
  }
  function patchFeatures(patch: Partial<SettingsFeatures>) {
    setSettings((s) => ({ ...s, features: { ...s.features, ...patch } }));
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="min-h-full bg-zinc-900 p-4 md:p-8"
    >
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Cpu className="w-6 h-6 text-indigo-400" />
              Settings
            </h1>
            <p className="text-sm text-zinc-400 mt-1">
              Configure AI models, generation defaults, and app behavior.
            </p>
          </div>

          {serverError && (
            <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs">
              <Server className="w-4 h-4" />
              Server unreachable — showing cached values
            </div>
          )}

          <button
            id="settings-save-btn"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors shadow-lg shadow-indigo-500/20"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>

        {/* Section tabs */}
        <div className="flex gap-1 mb-6 bg-zinc-950 border border-zinc-800 rounded-2xl p-1.5 flex-wrap">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              id={`settings-tab-${s.id}`}
              onClick={() => setActiveSection(s.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                activeSection === s.id
                  ? "bg-indigo-600 text-white shadow-md"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-800"
              }`}
            >
              {s.icon}
              <span className="hidden sm:inline">{s.label}</span>
            </button>
          ))}
        </div>

        {/* Loading skeleton */}
        {loading ? (
          <SectionCard>
            <div className="space-y-4 animate-pulse">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="flex gap-4 py-4 border-b border-zinc-800 last:border-0">
                  <div className="w-40 space-y-2">
                    <div className="h-4 bg-zinc-800 rounded w-3/4" />
                    <div className="h-3 bg-zinc-800/60 rounded w-full" />
                  </div>
                  <div className="flex-1 h-9 bg-zinc-800 rounded-xl" />
                </div>
              ))}
            </div>
          </SectionCard>
        ) : (
          <>
            {/* ── Section: AI Models ─────────────────────────────────────────── */}
            {activeSection === "models" && (
              <SectionCard>
                <h2 className="text-base font-semibold text-white mb-1 flex items-center gap-2">
                  <Brain className="w-5 h-5 text-indigo-400" /> AI Models
                </h2>
                <p className="text-xs text-zinc-500 mb-4">
                  Choose which Gemini/Veo model powers each task. Changes take effect on next server restart unless saved via PUT /api/settings.
                </p>

                {(Object.keys(MODEL_LABELS) as (keyof SettingsModels)[]).map((roleKey) => (
                  <ModelRow
                    key={roleKey}
                    roleKey={roleKey}
                    value={settings.models[roleKey]}
                    onChange={(v) => patchModels({ [roleKey]: v })}
                  />
                ))}
              </SectionCard>
            )}

            {/* ── Section: Generation Defaults ───────────────────────────────── */}
            {activeSection === "defaults" && (
              <SectionCard>
                <h2 className="text-base font-semibold text-white mb-1 flex items-center gap-2">
                  <Palette className="w-5 h-5 text-indigo-400" /> Generation Defaults
                </h2>
                <p className="text-xs text-zinc-500 mb-4">
                  Applied when creating new media plan items or generating media.
                </p>

                <SettingRow label="Default Aspect Ratio" description="Applied to new image items">
                  <Segmented
                    id="default-aspect-ratio"
                    value={settings.defaults.aspectRatio as "1:1" | "16:9" | "9:16" | "4:5"}
                    onChange={(v) => patchDefaults({ aspectRatio: v })}
                    options={[
                      { value: "1:1",  label: "1:1" },
                      { value: "16:9", label: "16:9" },
                      { value: "9:16", label: "9:16" },
                      { value: "4:5",  label: "4:5" },
                    ]}
                  />
                </SettingRow>

                <SettingRow label="Default Image Size" description="Resolution preset">
                  <select
                    id="default-image-size"
                    value={settings.defaults.imageSize}
                    onChange={(e) => patchDefaults({ imageSize: e.target.value })}
                    className="bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="512">512px</option>
                    <option value="1K">1K</option>
                    <option value="2K">2K</option>
                  </select>
                </SettingRow>

                <SettingRow label="Default Image Count" description="Variants per generation (1–4)">
                  <div className="flex items-center gap-2">
                    <button
                      id="image-count-dec"
                      onClick={() => patchDefaults({ imageCount: Math.max(1, settings.defaults.imageCount - 1) })}
                      className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-lg flex items-center justify-center transition-colors"
                    >−</button>
                    <span id="image-count-value" className="w-6 text-center text-sm font-semibold text-white">
                      {settings.defaults.imageCount}
                    </span>
                    <button
                      id="image-count-inc"
                      onClick={() => patchDefaults({ imageCount: Math.min(4, settings.defaults.imageCount + 1) })}
                      className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-lg flex items-center justify-center transition-colors"
                    >+</button>
                  </div>
                </SettingRow>

                <SettingRow label="Default Video Resolution">
                  <Segmented
                    id="default-video-resolution"
                    value={settings.defaults.videoResolution as "720p" | "1080p"}
                    onChange={(v) => patchDefaults({ videoResolution: v })}
                    options={[
                      { value: "720p",  label: "720p" },
                      { value: "1080p", label: "1080p" },
                    ]}
                  />
                </SettingRow>

                <SettingRow label="Default Video Aspect Ratio">
                  <Segmented
                    id="default-video-aspect-ratio"
                    value={settings.defaults.videoAspectRatio as "16:9" | "9:16" | "1:1"}
                    onChange={(v) => patchDefaults({ videoAspectRatio: v })}
                    options={[
                      { value: "16:9", label: "16:9" },
                      { value: "9:16", label: "9:16" },
                      { value: "1:1",  label: "1:1" },
                    ]}
                  />
                </SettingRow>

                <SettingRow label="Default TTS Voice">
                  <select
                    id="default-voice"
                    value={settings.defaults.voice}
                    onChange={(e) => patchDefaults({ voice: e.target.value })}
                    className="bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {VOICES.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </SettingRow>

                <SettingRow label="Default Caption Style" description="For Compose captions">
                  <select
                    id="default-caption-style"
                    value={settings.defaults.captionStyle ?? "clean"}
                    onChange={(e) => patchDefaults({ captionStyle: e.target.value })}
                    className="bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {CAPTION_STYLES.map((s) => (
                      <option key={s} value={s}>{s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</option>
                    ))}
                  </select>
                </SettingRow>
              </SectionCard>
            )}

            {/* ── Section: Features & Behavior ────────────────────────────────── */}
            {activeSection === "features" && (
              <SectionCard>
                <h2 className="text-base font-semibold text-white mb-1 flex items-center gap-2">
                  <Zap className="w-5 h-5 text-indigo-400" /> Features & Behavior
                </h2>
                <p className="text-xs text-zinc-500 mb-4">
                  Toggle optional behaviors. Changes take effect immediately after saving.
                </p>

                <SettingRow label="Auto-Score" description="Score media after batch generation completes">
                  <Toggle
                    id="toggle-auto-score"
                    checked={settings.features.autoScore}
                    onChange={(v) => patchFeatures({ autoScore: v })}
                  />
                </SettingRow>

                <SettingRow label="Auto-Tag" description="Tag images with AI after generation">
                  <Toggle
                    id="toggle-auto-tag"
                    checked={settings.features.autoTag}
                    onChange={(v) => patchFeatures({ autoTag: v })}
                  />
                </SettingRow>

                <SettingRow label="Auto-Save Plans" description="Persist media plans to localStorage">
                  <Toggle
                    id="toggle-auto-save-plans"
                    checked={settings.features.autoSavePlans}
                    onChange={(v) => patchFeatures({ autoSavePlans: v })}
                  />
                </SettingRow>

                <SettingRow label="Confirm Before Generate" description="Show preview modal before batch generation">
                  <Toggle
                    id="toggle-confirm-before-gen"
                    checked={settings.features.confirmBeforeGenerate}
                    onChange={(v) => patchFeatures({ confirmBeforeGenerate: v })}
                  />
                </SettingRow>

                <SettingRow label="Ken Burns Default" description="Enable Ken Burns effect on new slideshow slides">
                  <Toggle
                    id="toggle-ken-burns"
                    checked={settings.features.kenBurnsDefault}
                    onChange={(v) => patchFeatures({ kenBurnsDefault: v })}
                  />
                </SettingRow>
              </SectionCard>
            )}

            {/* ── Section: API & Info ──────────────────────────────────────────── */}
            {activeSection === "api" && (
              <SectionCard>
                <h2 className="text-base font-semibold text-white mb-1 flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-indigo-400" /> API & Connection
                </h2>
                <p className="text-xs text-zinc-500 mb-4">
                  Connection details and server health. API key is managed via <code className="text-xs bg-zinc-800 px-1 rounded">.env.local</code> — not stored here.
                </p>

                <SettingRow label="Gemini API Key" description="Managed via .env.local — read-only display">
                  <div className="flex items-center gap-2">
                    <code className="text-xs bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-400 font-mono">
                      {showApiKey ? "Set in .env.local" : apiKeyMasked}
                    </code>
                    <button
                      onClick={() => setShowApiKey((p) => !p)}
                      className="text-xs text-zinc-500 hover:text-white transition-colors"
                    >
                      {showApiKey ? "Hide" : "Show"}
                    </button>
                  </div>
                </SettingRow>

                <SettingRow label="FFmpeg Status" description="Required for composition (slideshow, merge, captions)">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${
                      ffmpegAvailable === null ? "bg-zinc-600" :
                      ffmpegAvailable ? "bg-emerald-400" : "bg-red-400"
                    }`} />
                    <span className="text-sm text-zinc-300">
                      {ffmpegAvailable === null ? "Unknown" :
                       ffmpegAvailable ? "Installed" : "Not installed"}
                    </span>
                  </div>
                </SettingRow>

                <SettingRow label="Server Health" description="Ping the API server">
                  <div className="flex items-center gap-3">
                    {healthStatus === "ok" && (
                      <span className="text-xs text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {healthMs}ms
                      </span>
                    )}
                    {healthStatus === "fail" && (
                      <span className="text-xs text-red-400 flex items-center gap-1">
                        <XCircle className="w-3.5 h-3.5" />
                        Unreachable
                      </span>
                    )}
                    <button
                      id="health-check-btn"
                      onClick={handleHealthCheck}
                      disabled={healthStatus === "checking"}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-xs font-medium transition-colors disabled:opacity-50"
                    >
                      {healthStatus === "checking" ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                      Check Health
                    </button>
                  </div>
                </SettingRow>
              </SectionCard>
            )}

            {/* ── Section: Usage & Info ────────────────────────────────────────── */}
            {activeSection === "info" && (
              <SectionCard>
                <h2 className="text-base font-semibold text-white mb-1 flex items-center gap-2">
                  <BarChart2 className="w-5 h-5 text-indigo-400" /> Usage & Info
                </h2>
                <p className="text-xs text-zinc-500 mb-4">
                  App information, and settings backup/restore.
                </p>

                <SettingRow label="App Version">
                  <span className="text-sm text-zinc-300 font-mono bg-zinc-900 px-3 py-1.5 rounded-xl border border-zinc-700">
                    v0.4.5
                  </span>
                </SettingRow>

                <SettingRow label="Export Settings" description="Download current settings as JSON">
                  <button
                    id="export-settings-btn"
                    onClick={handleExport}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-sm font-medium transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Export JSON
                  </button>
                </SettingRow>

                <SettingRow label="Import Settings" description="Upload a previously exported settings JSON">
                  <button
                    id="import-settings-btn"
                    onClick={handleImport}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-sm font-medium transition-colors"
                  >
                    <Upload className="w-4 h-4" />
                    Import JSON
                  </button>
                </SettingRow>

                <SettingRow label="Refresh from Server" description="Re-fetch settings from API">
                  <button
                    id="refresh-settings-btn"
                    onClick={fetchSettings}
                    disabled={loading}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Refresh
                  </button>
                </SettingRow>
              </SectionCard>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}

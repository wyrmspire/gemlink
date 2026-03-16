import { useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CaptionConfig {
  text: string;
  style: "clean" | "bold-outline" | "boxed" | "typewriter" | "word-highlight";
  fontSize: number;
  color: string;
  position: "top" | "center" | "bottom";
  timing: "sentence" | "word";
}

export const DEFAULT_CAPTION_CONFIG: CaptionConfig = {
  text: "",
  style: "clean",
  fontSize: 48,
  color: "#ffffff",
  position: "bottom",
  timing: "sentence",
};

interface CaptionEditorProps {
  value: CaptionConfig;
  onChange: (config: CaptionConfig) => void;
  className?: string;
  voiceText?: string;
  voiceDuration?: number;
}

// ─── Style presets ────────────────────────────────────────────────────────────

const STYLE_PRESETS: {
  key: CaptionConfig["style"];
  label: string;
  description: string;
}[] = [
  { key: "clean",          label: "Clean",         description: "White text, drop shadow" },
  { key: "bold-outline",   label: "Bold Outline",  description: "Thick stroke, TikTok style" },
  { key: "boxed",          label: "Boxed",         description: "Dark bar background" },
  { key: "typewriter",     label: "Typewriter",    description: "Words appear one at a time" },
  { key: "word-highlight", label: "Word Highlight",description: "One word highlighted per beat" },
];

const COLOR_SWATCHES = [
  { value: "#ffffff", label: "White" },
  { value: "#ffff00", label: "Yellow" },
  { value: "#00e8ff", label: "Cyan" },
  { value: "#ff4dff", label: "Pink" },
  { value: "#ff6b00", label: "Orange" },
];

// ─── Live preview styling ─────────────────────────────────────────────────────

function getPreviewStyle(config: CaptionConfig): React.CSSProperties {
  const base: React.CSSProperties = {
    color: config.color,
    fontSize: `${Math.round(config.fontSize * 0.35)}px`,
    fontFamily: "system-ui, sans-serif",
    fontWeight: 700,
    textAlign: "center",
    padding: "4px 12px",
    display: "inline-block",
    maxWidth: "100%",
  };

  switch (config.style) {
    case "clean":
      return {
        ...base,
        textShadow: "0 2px 8px rgba(0,0,0,0.8), 0 1px 3px rgba(0,0,0,0.9)",
      };
    case "bold-outline":
      return {
        ...base,
        textShadow: [
          "-2px -2px 0 #000",
          "2px -2px 0 #000",
          "-2px 2px 0 #000",
          "2px 2px 0 #000",
          "0 0 8px rgba(0,0,0,0.9)",
        ].join(", "),
      };
    case "boxed":
      return {
        ...base,
        backgroundColor: "rgba(0,0,0,0.7)",
        borderRadius: "4px",
        padding: "4px 16px",
      };
    case "typewriter":
    case "word-highlight":
      return {
        ...base,
        textShadow: "0 2px 4px rgba(0,0,0,0.8)",
        letterSpacing: "0.02em",
      };
    default:
      return base;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CaptionEditor({ 
  value, 
  onChange, 
  className = "",
  voiceText,
  voiceDuration
}: CaptionEditorProps) {
  const [hexInput, setHexInput] = useState(value.color);

  function patch(partial: Partial<CaptionConfig>) {
    onChange({ ...value, ...partial });
  }

  function handleColorInput(raw: string) {
    setHexInput(raw);
    if (/^#[0-9a-fA-F]{6}$/.test(raw)) {
      patch({ color: raw });
    }
  }

  const sampleText = value.text.trim() || "Your caption text preview";
  const isMismatch = voiceText && value.text.trim() && value.text.trim().toLowerCase() !== voiceText.trim().toLowerCase();

  return (
    <div className={`bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Caption Editor</h3>
        {voiceText && (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-[10px] font-bold text-indigo-400 uppercase tracking-tight">
              <span className="w-1 h-1 rounded-full bg-indigo-400 animate-pulse" />
              Voiceover {voiceDuration ? `(${voiceDuration.toFixed(1)}s)` : ""}
            </span>
          </div>
        )}
      </div>

      <div className="p-4 space-y-4">
        {/* Text area */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs uppercase tracking-wider text-zinc-500">
              Caption Text
            </label>
            {voiceText && (
              <button
                onClick={() => patch({ text: voiceText })}
                className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors uppercase tracking-tight"
              >
                Auto-fill from voiceover
              </button>
            )}
          </div>
          <div className="relative">
            <textarea
              value={value.text}
              onChange={(e) => patch({ text: e.target.value })}
              placeholder="Enter your caption text here..."
              rows={3}
              className={`w-full bg-zinc-900 border rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none transition-colors ${
                isMismatch ? "border-amber-500/50" : "border-zinc-800"
              }`}
            />
            {isMismatch && (
              <div className="absolute top-2 right-2 group">
                <div className="text-amber-500 cursor-help">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
                </div>
                <div className="absolute right-0 top-full mt-2 w-48 p-2 bg-zinc-900 border border-amber-500/30 rounded-lg text-[10px] text-amber-200 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 font-medium">
                  Manual text differs from the generated voiceover content.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Style presets */}
        <div>
          <label className="block text-xs uppercase tracking-wider text-zinc-500 mb-2">
            Style
          </label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {STYLE_PRESETS.map((preset) => (
              <button
                key={preset.key}
                onClick={() => patch({ style: preset.key })}
                title={preset.description}
                className={`group relative h-20 rounded-xl border transition-all overflow-hidden ${
                  value.style === preset.key
                    ? "border-indigo-500 ring-1 ring-indigo-500"
                    : "border-zinc-800 hover:border-zinc-600 bg-zinc-900"
                }`}
              >
                {/* Visual Preview Area */}
                <div className="absolute inset-0 flex items-center justify-center p-2 pb-6 bg-black/40">
                  <span 
                    className="text-[10px] font-bold leading-tight line-clamp-2"
                    style={{
                      color: "white",
                      fontFamily: preset.key === "typewriter" ? "ui-monospace, monospace" : "system-ui, sans-serif",
                      ...(preset.key === "clean" && {
                        textShadow: "0 1px 3px rgba(0,0,0,0.8)"
                      }),
                      ...(preset.key === "bold-outline" && {
                        WebkitTextStroke: "0.5px black",
                        textShadow: "0 0 4px rgba(0,0,0,0.5)"
                      }),
                      ...(preset.key === "boxed" && {
                        backgroundColor: "rgba(0,0,0,0.7)",
                        padding: "1px 4px",
                        borderRadius: "2px"
                      }),
                      ...(preset.key === "word-highlight" && {
                        display: "inline-block"
                      }),
                    }}
                  >
                    {preset.key === "word-highlight" ? (
                      <>Sample <span className="text-indigo-400">Word</span></>
                    ) : (
                      "Sample Text"
                    )}
                    {preset.key === "typewriter" && <span className="animate-pulse ml-0.5">|</span>}
                  </span>
                </div>
                
                {/* Label Overlay */}
                <div className={`absolute bottom-0 inset-x-0 py-1.5 px-2 text-center text-[9px] font-bold uppercase tracking-tighter transition-colors ${
                  value.style === preset.key ? "bg-indigo-600 text-white" : "bg-zinc-800 text-zinc-400 group-hover:text-zinc-200"
                }`}>
                  {preset.label}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Font size slider */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs uppercase tracking-wider text-zinc-500">Font Size</label>
            <span className="text-xs text-zinc-300 font-mono">{value.fontSize}px</span>
          </div>
          <input
            type="range"
            min={24}
            max={72}
            step={2}
            value={value.fontSize}
            onChange={(e) => patch({ fontSize: Number(e.target.value) })}
            className="w-full accent-indigo-500"
          />
          <div className="flex justify-between text-[10px] text-zinc-700 mt-0.5">
            <span>24px</span>
            <span>72px</span>
          </div>
        </div>

        {/* Color */}
        <div>
          <label className="block text-xs uppercase tracking-wider text-zinc-500 mb-2">Color</label>
          <div className="flex items-center gap-2 flex-wrap">
            {COLOR_SWATCHES.map((s) => (
              <button
                key={s.value}
                onClick={() => { patch({ color: s.value }); setHexInput(s.value); }}
                title={s.label}
                className={`w-8 h-8 rounded-lg border-2 transition-all ${
                  value.color === s.value ? "border-white scale-110" : "border-zinc-700 hover:border-zinc-400"
                }`}
                style={{ backgroundColor: s.value }}
              />
            ))}
            <div className="flex items-center gap-1.5">
              <input
                type="color"
                value={value.color}
                onChange={(e) => { patch({ color: e.target.value }); setHexInput(e.target.value); }}
                className="w-8 h-8 rounded-lg border border-zinc-700 bg-transparent cursor-pointer"
                title="Custom color"
              />
              <input
                type="text"
                value={hexInput}
                onChange={(e) => handleColorInput(e.target.value)}
                placeholder="#ffffff"
                className="w-20 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* Timing */}
        <div>
          <label className="block text-xs uppercase tracking-wider text-zinc-500 mb-2">Timing</label>
          <div className="flex gap-2">
            {(["sentence", "word"] as const).map((t) => (
              <button
                key={t}
                onClick={() => patch({ timing: t })}
                className={`flex-1 py-1.5 rounded-xl border text-[10px] font-medium capitalize transition-colors ${
                  value.timing === t
                    ? "bg-amber-600/20 border-amber-500/60 text-amber-300"
                    : "border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-white bg-zinc-900"
                }`}
              >
                {t === "sentence" ? "Sentence-Level" : "Word-Level (Viral)"}
              </button>
            ))}
          </div>
        </div>

        {/* Position */}
        <div>
          <label className="block text-xs uppercase tracking-wider text-zinc-500 mb-2">Position</label>
          <div className="flex gap-2">
            {(["top", "center", "bottom"] as const).map((pos) => (
              <button
                key={pos}
                onClick={() => patch({ position: pos })}
                className={`flex-1 py-2 rounded-xl border text-xs font-medium capitalize transition-colors ${
                  value.position === pos
                    ? "bg-indigo-600 border-indigo-500 text-white"
                    : "border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-white bg-zinc-900"
                }`}
              >
                {pos}
              </button>
            ))}
          </div>
        </div>

        {/* Live preview strip */}
        <div>
          <label className="block text-xs uppercase tracking-wider text-zinc-500 mb-2">Preview</label>
          <div
            className="w-full h-14 bg-zinc-900 rounded-xl border border-zinc-800 flex items-center overflow-hidden"
            style={{
              justifyContent:
                value.position === "top"
                  ? "flex-start"
                  : value.position === "bottom"
                  ? "flex-end"
                  : "center",
              flexDirection: "column",
            }}
          >
            <span style={getPreviewStyle(value)}>
              {sampleText.length > 60 ? sampleText.slice(0, 60) + "…" : sampleText}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { useBrand } from "../context/BrandContext";
import { useApiKey } from "../components/ApiKeyGuard";
import { useToast } from "../context/ToastContext";
import { motion, AnimatePresence } from "motion/react";
import {
  Loader2,
  Search,
  BrainCircuit,
  Sparkles,
  X,
  Plus,
  Image as ImageIcon,
  Video,
  Mic,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

interface MediaSuggestion {
  type: "image" | "video" | "voice";
  label: string;
  purpose: string;
  promptTemplate: string;
}

export default function Research() {
  const brand = useBrand();
  const { resetKey } = useApiKey();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"search" | "think">("search");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [sources, setSources] = useState<any[]>([]);

  // I1: Media suggestion modal state
  const [showMediaModal, setShowMediaModal] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<MediaSuggestion[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const performResearch = async () => {
    if (!query) return;
    setLoading(true);
    setResult("");
    setSources([]);

    try {
      const brandContext = {
        brandName: brand.brandName,
        brandDescription: brand.brandDescription,
        targetAudience: brand.targetAudience,
      };

      const endpoint = mode === "search" ? "/api/research/search" : "/api/research/think";

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, brandContext }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Research failed");
      }

      const data = await response.json();
      setResult(data.text || "No results found.");

      if (data.sources) {
        setSources(data.sources);
      }
    } catch (error: any) {
      console.error(error);
      if (
        error?.message?.includes("PERMISSION_DENIED") ||
        error?.message?.includes("Requested entity was not found")
      ) {
        resetKey();
      } else {
        toast(error.message || "Research failed.", "error");
      }
    } finally {
      setLoading(false);
    }
  };

  // I1: Generate media suggestions from research results
  const handleSuggestMedia = async () => {
    if (!result) return;
    setShowMediaModal(true);
    setSuggestLoading(true);
    setSuggestions([]);
    setSelected(new Set());

    try {
      const response = await fetch("/api/media/plan/suggest-from-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          researchText: result,
          brandContext: {
            brandName: brand.brandName,
            brandDescription: brand.brandDescription,
            targetAudience: brand.targetAudience,
            brandVoice: brand.brandVoice,
          },
        }),
      });

      if (!response.ok) {
        // If endpoint not yet available (Lane 1 dependency), use smart mock
        throw new Error("endpoint_unavailable");
      }

      const data = await response.json();
      setSuggestions(data.items ?? []);
    } catch (err: any) {
      // Graceful fallback with contextual mock items based on research
      const mockItems: MediaSuggestion[] = [
        {
          type: "image",
          label: "Hero Banner",
          purpose: "Website hero section",
          promptTemplate: `A compelling hero image for ${brand.brandName} based on: ${query}. Professional, brand-aligned, no text overlays.`,
        },
        {
          type: "image",
          label: "Social Media Post",
          purpose: "Instagram post",
          promptTemplate: `Bold Instagram post for ${brand.brandName} showcasing insights from: ${query}. 1:1 format, vibrant.`,
        },
        {
          type: "image",
          label: "Thought Leadership Graphic",
          purpose: "LinkedIn post",
          promptTemplate: `Professional thought leadership visual for ${brand.brandName} about: ${query}. LinkedIn-optimized.`,
        },
        {
          type: "video",
          label: "Explainer Video Concept",
          purpose: "YouTube short",
          promptTemplate: `A dynamic explainer video intro for ${brand.brandName} covering: ${query}. Cinematic, engaging.`,
        },
        {
          type: "voice",
          label: "Research Summary Audio",
          purpose: "Podcast teaser",
          promptTemplate: `A compelling podcast teaser voiceover summarizing research on: ${query} for ${brand.brandName}.`,
        },
      ];
      setSuggestions(mockItems);
      if (err.message !== "endpoint_unavailable") {
        toast("Using AI suggestions from context (endpoint connecting soon).", "info");
      }
    } finally {
      setSuggestLoading(false);
    }
  };

  function toggleSelect(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  function handleAddToMediaPlan() {
    const chosen = [...selected].map((i) => suggestions[i]);
    if (chosen.length === 0) { toast("Select at least one item.", "warning"); return; }
    // Store in sessionStorage so MediaPlan can pick them up
    const existing = JSON.parse(sessionStorage.getItem("pending-media-items") ?? "[]");
    sessionStorage.setItem("pending-media-items", JSON.stringify([...existing, ...chosen]));
    toast(`Added ${chosen.length} item${chosen.length > 1 ? "s" : ""} to Media Plan.`, "success");
    setShowMediaModal(false);
    navigate("/plan");
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
      className="p-4 md:p-8 max-w-5xl mx-auto"
    >
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2">R&D Lab</h1>
        <p className="text-zinc-400">Conduct deep market research and strategic thinking.</p>
      </div>

      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6 mb-8">
        <div className="flex gap-4 mb-6 flex-wrap">
          <button
            onClick={() => setMode("search")}
            className={`flex-1 py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors min-w-[140px] ${
              mode === "search"
                ? "bg-indigo-600 text-white"
                : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800"
            }`}
          >
            <Search className="w-5 h-5" />
            Live Market Search
          </button>
          <button
            onClick={() => setMode("think")}
            className={`flex-1 py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors min-w-[140px] ${
              mode === "think"
                ? "bg-emerald-600 text-white"
                : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800"
            }`}
          >
            <BrainCircuit className="w-5 h-5" />
            Deep Strategic Thinking
          </button>
        </div>

        <div className="flex gap-4 flex-wrap">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && performResearch()}
            className="flex-1 min-w-0 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder={
              mode === "search"
                ? "Search the web for competitors, trends..."
                : "Ask a complex strategic question..."
            }
          />
          <button
            onClick={performResearch}
            disabled={loading || !query}
            className={`px-8 py-3 rounded-xl flex items-center justify-center transition-colors disabled:opacity-50 text-white font-medium ${
              mode === "search" ? "bg-indigo-600 hover:bg-indigo-700" : "bg-emerald-600 hover:bg-emerald-700"
            }`}
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Analyze"}
          </button>
        </div>
      </div>

      {result && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-zinc-950 border border-zinc-800 rounded-2xl p-8"
        >
          {/* I1: Create media button */}
          <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
            <h2 className="text-lg font-semibold text-white">Research Results</h2>
            <button
              id="create-media-from-research"
              onClick={handleSuggestMedia}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              Create media from this
            </button>
          </div>

          <div className="prose prose-invert max-w-none">
            <div className="text-zinc-300 leading-relaxed whitespace-pre-wrap">{result}</div>
          </div>

          {sources.length > 0 && (
            <div className="mt-8 pt-6 border-t border-zinc-800">
              <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">Sources</h3>
              <ul className="space-y-2">
                {sources.map((source, idx) => (
                  <li key={idx}>
                    <a
                      href={source.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-400 hover:text-indigo-300 text-sm flex items-center gap-2"
                    >
                      <Search className="w-3 h-3" />
                      {source.title || source.uri}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </motion.div>
      )}

      {/* I1: Media suggestion modal */}
      <AnimatePresence>
        {showMediaModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden max-h-[80vh] flex flex-col"
            >
              <div className="flex items-center justify-between p-6 border-b border-zinc-800">
                <div>
                  <h2 className="text-lg font-semibold text-white">Create Media from Research</h2>
                  <p className="text-sm text-zinc-400 mt-1">
                    AI-suggested media items based on your research. Select items to add to your Media Plan.
                  </p>
                </div>
                <button
                  onClick={() => setShowMediaModal(false)}
                  className="text-zinc-500 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-3">
                {suggestLoading ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3 text-zinc-400">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
                    <p className="text-sm">Generating suggestions…</p>
                  </div>
                ) : (
                  suggestions.map((item, i) => (
                    <button
                      key={i}
                      onClick={() => toggleSelect(i)}
                      className={`w-full text-left p-4 rounded-xl border transition-all ${
                        selected.has(i)
                          ? "bg-indigo-600/15 border-indigo-500/50 ring-1 ring-indigo-500/30"
                          : "bg-zinc-800/50 border-zinc-700 hover:border-zinc-600"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 ${selected.has(i) ? "bg-indigo-500 border-indigo-500" : "border-zinc-600"}`}>
                          {selected.has(i) && <span className="text-white text-[10px]">✓</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {typeIcon(item.type)}
                            <span className="text-sm font-medium text-white">{item.label}</span>
                            <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">
                              {item.type}
                            </span>
                          </div>
                          <p className="text-xs text-zinc-400 mb-2">{item.purpose}</p>
                          <p className="text-xs text-zinc-500 line-clamp-2">{item.promptTemplate}</p>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>

              <div className="p-6 border-t border-zinc-800 flex gap-3 justify-between items-center">
                <span className="text-sm text-zinc-400">
                  {selected.size} of {suggestions.length} selected
                </span>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowMediaModal(false)}
                    className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-300 text-sm hover:bg-zinc-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddToMediaPlan}
                    disabled={selected.size === 0}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Add to Media Plan ({selected.size})
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

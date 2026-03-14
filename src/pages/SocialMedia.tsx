import { useState } from "react";
import { useBrand } from "../context/BrandContext";
import { useApiKey } from "../components/ApiKeyGuard";
import { useToast } from "../context/ToastContext";
import { motion } from "motion/react";
import { Loader2, Image as ImageIcon, Sparkles } from "lucide-react";

const PLATFORM_PRESETS = [
  { label: "Custom", value: "custom", size: "1K", aspectRatio: "" },
  { label: "Instagram Post (1:1)", value: "ig-post", size: "1K", aspectRatio: "1:1" },
  { label: "Instagram Story (9:16)", value: "ig-story", size: "1K", aspectRatio: "9:16" },
  { label: "Twitter Banner (16:9)", value: "twitter", size: "1K", aspectRatio: "16:9" },
  { label: "LinkedIn (1.91:1)", value: "linkedin", size: "1K", aspectRatio: "1.91:1" },
  { label: "YouTube Thumbnail (16:9)", value: "yt-thumb", size: "1K", aspectRatio: "16:9" },
];

export default function SocialMedia() {
  const brand = useBrand();
  const { resetKey } = useApiKey();
  const { toast } = useToast();
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [model, setModel] = useState("gemini-3.1-flash-image-preview");
  const [size, setSize] = useState("1K");
  const [count, setCount] = useState(1);
  const [preset, setPreset] = useState("custom");

  function applyPreset(value: string) {
    const p = PLATFORM_PRESETS.find((x) => x.value === value);
    if (!p) return;
    setPreset(value);
    setSize(p.size);
  }

  const generateImages = async () => {
    if (!prompt) return;
    setLoading(true);
    let anySuccess = false;
    try {
      const fullPrompt = `Brand: ${brand.brandName}. Description: ${brand.brandDescription}. Audience: ${brand.targetAudience}. Style: ${brand.brandVoice}. Generate an image for social media: ${prompt}`;

      // Fire `count` sequential requests (API may not support batch natively)
      const results: string[] = [];
      for (let i = 0; i < count; i++) {
        const response = await fetch("/api/media/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: fullPrompt,
            model,
            size,
            brandContext: brand,
            apiKey: import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to generate image");
        }

        const data = await response.json();
        if (data.outputs && data.outputs.length > 0) {
          results.push(...data.outputs);
          anySuccess = true;
        }
      }

      if (results.length > 0) {
        setImages((prev) => [...results, ...prev]);
        toast(`Generated ${results.length} image${results.length > 1 ? "s" : ""}.`, "success");
      }
    } catch (error: any) {
      console.error(error);
      if (
        error?.message?.includes("PERMISSION_DENIED") ||
        error?.message?.includes("Requested entity was not found")
      ) {
        resetKey();
      } else {
        toast(error.message || "Failed to generate image.", "error");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 md:p-8 max-w-6xl mx-auto"
    >
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Social Media Generation</h1>
        <p className="text-zinc-400">Generate high-quality images for your brand's social media channels.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Controls */}
        <div className="lg:col-span-1 space-y-5 bg-zinc-950 p-6 rounded-2xl border border-zinc-800">
          {/* Platform preset */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Platform Preset</label>
            <select
              value={preset}
              onChange={(e) => applyPreset(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {PLATFORM_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>

          {/* Prompt */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Image Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="A futuristic workspace with neon lights..."
            />
          </div>

          {/* Count */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Number of Images{" "}
              <span className="text-zinc-500 font-normal">(1–4)</span>
            </label>
            <div className="flex gap-2">
              {[1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  onClick={() => setCount(n)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    count === n
                      ? "bg-indigo-600 border-indigo-500 text-white"
                      : "bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-600"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Model */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Model</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="gemini-3.1-flash-image-preview">Nano Banana 2 (Fast)</option>
              <option value="gemini-3-pro-image-preview">Nano Banana Pro (High Quality)</option>
            </select>
          </div>

          {/* Size */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Image Size</label>
            <select
              value={size}
              onChange={(e) => setSize(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="512px">512px</option>
              <option value="1K">1K</option>
              <option value="2K">2K</option>
              <option value="4K">4K</option>
            </select>
          </div>

          <button
            id="social-generate-btn"
            onClick={generateImages}
            disabled={loading || !prompt}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Sparkles className="w-5 h-5" />
            )}
            {loading
              ? "Generating…"
              : count === 1
              ? "Generate Image"
              : `Generate ${count} Images`}
          </button>
        </div>

        {/* Results */}
        <div className="lg:col-span-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {images.map((img, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden aspect-square"
              >
                <img
                  src={img}
                  alt={`Generated ${idx + 1}`}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </motion.div>
            ))}
            {images.length === 0 && !loading && (
              <div className="col-span-full h-64 border-2 border-dashed border-zinc-800 rounded-2xl flex flex-col items-center justify-center text-zinc-500 gap-3">
                <ImageIcon className="w-10 h-10 opacity-40" />
                <p>No images generated yet.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

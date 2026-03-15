import { useState } from "react";
import { useBrand } from "../context/BrandContext";
import { useApiKey } from "../components/ApiKeyGuard";
import { motion } from "motion/react";
import { Loader2, Music, Play, CheckCircle2, Clock, AlertCircle } from "lucide-react";

interface MusicJob {
  id: string;
  status: "pending" | "completed" | "failed";
  outputs: string[];
  logs?: string[];
  error?: string;
}

export default function MusicLab() {
  const brand = useBrand();
  const { resetKey } = useApiKey();
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [musicUrl, setMusicUrl] = useState<string | null>(null);
  const [job, setJob] = useState<MusicJob | null>(null);
  const [duration, setDuration] = useState(30);

  const generateMusic = async () => {
    if (!prompt) return;
    setLoading(true);
    setMusicUrl(null);
    setJob(null);
    try {
      const response = await fetch("/api/media/music", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: `${prompt}. Style: ${brand.styleKeywords.join(", ")}. Brand: ${brand.brandName}.`,
          duration,
          brandContext: brand,
          apiKey: import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate music");
      }

      const data = await response.json();
      setJob(data);

      // Simple polling for result
      const poll = setInterval(async () => {
         const statusRes = await fetch(`/api/media/job/music/${data.id}`);
         if (statusRes.ok) {
           const statusData = await statusRes.json();
           setJob(statusData);
           if (statusData.status === "completed") {
             setMusicUrl(statusData.outputs?.[0] || null);
             clearInterval(poll);
             setLoading(false);
           } else if (statusData.status === "failed") {
             clearInterval(poll);
             setLoading(false);
           }
         }
      }, 5000);

    } catch (error: any) {
      console.error(error);
      if (error?.message?.includes("PERMISSION_DENIED")) {
        resetKey();
      } else {
        alert(error.message || "Failed to generate music.");
      }
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 md:p-8 max-w-4xl mx-auto"
    >
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Music Lab</h1>
        <p className="text-zinc-400">Generate custom background music and soundtracks for your brand.</p>
      </div>

      <div className="bg-zinc-950 p-6 rounded-2xl border border-zinc-800 space-y-6">
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-2">Music Prompt</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
            placeholder="A cinematic orchestral track with a sense of wonder and uplifting energy..."
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Duration (seconds)</label>
            <input
              type="number"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              min={10}
              max={120}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Style</label>
            <div className="text-sm text-zinc-500 py-3">
              Inherited from brand: {brand.styleKeywords.join(", ") || "Default"}
            </div>
          </div>
        </div>

        <button
          onClick={generateMusic}
          disabled={loading || !prompt}
          className="w-full bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-medium py-3 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-lg shadow-rose-900/20"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Music className="w-5 h-5" />}
          {loading ? "Generating Track..." : "Generate Music"}
        </button>

        {job && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-zinc-300 font-medium">Job {job.id}</span>
              {job.status === "pending" ? (
                <span className="inline-flex items-center gap-1 text-amber-300"><Clock className="w-4 h-4" />Pending</span>
              ) : job.status === "completed" ? (
                <span className="inline-flex items-center gap-1 text-emerald-300"><CheckCircle2 className="w-4 h-4" />Completed</span>
              ) : (
                <span className="inline-flex items-center gap-1 text-red-300"><AlertCircle className="w-4 h-4" />Failed</span>
              )}
            </div>
            {job.logs?.length ? <p className="text-xs text-zinc-500">{job.logs[job.logs.length - 1]}</p> : null}
            {job.error ? <p className="text-xs text-red-300">{job.error}</p> : null}
          </div>
        )}

        {musicUrl && (
          <div className="mt-4 p-6 bg-zinc-900 rounded-xl border border-zinc-800 flex flex-col items-center gap-4">
            <div className="w-16 h-16 bg-rose-500/10 rounded-full flex items-center justify-center">
              <Play className="w-8 h-8 text-rose-500" />
            </div>
            <p className="text-sm font-medium text-white">Your track is ready!</p>
            <audio src={musicUrl} controls className="w-full" />
            <a 
              href={musicUrl} 
              download 
              className="text-xs text-rose-400 hover:text-rose-300 transition-colors"
            >
              Download Asset
            </a>
          </div>
        )}
      </div>
    </motion.div>
  );
}

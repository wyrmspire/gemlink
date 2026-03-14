import { useState, useRef, useEffect, ChangeEvent } from "react";
import { useBrand } from "../context/BrandContext";
import { useApiKey } from "../components/ApiKeyGuard";
import { useToast } from "../context/ToastContext";
import { motion } from "motion/react";
import { Loader2, Video, Upload, CheckCircle2, AlertCircle } from "lucide-react";

interface VideoJob {
  id: string;
  status: "pending" | "completed" | "failed";
  outputs: string[];
  logs?: string[];
  error?: string;
}

const VIDEO_PRESETS = [
  { label: "Custom", value: "custom", aspectRatio: "16:9", resolution: "1080p" },
  { label: "YouTube Intro (16:9 1080p)", value: "yt-intro", aspectRatio: "16:9", resolution: "1080p" },
  { label: "Instagram Reel (9:16 1080p)", value: "ig-reel", aspectRatio: "9:16", resolution: "1080p" },
  { label: "TikTok (9:16 720p)", value: "tiktok", aspectRatio: "9:16", resolution: "720p" },
  { label: "Twitter/X Landscape (16:9 720p)", value: "twitter", aspectRatio: "16:9", resolution: "720p" },
];

export default function VideoLab() {
  const brand = useBrand();
  const { resetKey } = useApiKey();
  const { toast } = useToast();
  const [prompt, setPrompt] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [job, setJob] = useState<VideoJob | null>(null);
  const [analysisResult, setAnalysisResult] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [resolution, setResolution] = useState("1080p");
  const [preset, setPreset] = useState("custom");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  function applyPreset(value: string) {
    const p = VIDEO_PRESETS.find((x) => x.value === value);
    if (!p) return;
    setPreset(value);
    setAspectRatio(p.aspectRatio);
    setResolution(p.resolution);
  }

  const generateVideo = async () => {
    if (!prompt && !imageFile) return;
    setLoading(true);
    setJob(null);
    try {
      const fullPrompt = `Brand: ${brand.brandName}. Style: ${brand.brandVoice}. ${prompt}`;

      let base64Data = null;
      let mimeType = null;

      if (imageFile) {
        const reader = new FileReader();
        reader.readAsDataURL(imageFile);
        await new Promise<void>((resolve) => {
          reader.onload = () => {
            base64Data = (reader.result as string).split(",")[1];
            mimeType = imageFile.type;
            resolve();
          };
        });
      }

      const response = await fetch("/api/media/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: fullPrompt,
          model: "veo-3.1-fast-generate-preview",
          resolution,
          aspectRatio,
          brandContext: brand,
          imageBytes: base64Data,
          mimeType,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate video");
      }

      const data = await response.json();
      setJob(data);
      toast("Video job started. It will process in the background.", "info");
    } catch (error: any) {
      console.error(error);
      if (
        error?.message?.includes("PERMISSION_DENIED") ||
        error?.message?.includes("Requested entity was not found")
      ) {
        resetKey();
      } else {
        toast(error.message || "Failed to generate video.", "error");
      }
    } finally {
      setLoading(false);
    }
  };

  const analyzeVideo = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAnalyzing(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        try {
          const base64Data = (reader.result as string).split(",")[1];

          const response = await fetch("/api/media/video/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              videoData: base64Data,
              mimeType: file.type,
            }),
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || "Failed to analyze video");
          }

          const data = await response.json();
          setAnalysisResult(data.text || "No analysis generated.");
          toast("Video analysis complete.", "success");
        } catch (error: any) {
          console.error(error);
          if (
            error?.message?.includes("PERMISSION_DENIED") ||
            error?.message?.includes("Requested entity was not found")
          ) {
            resetKey();
          } else {
            toast(error.message || "Failed to analyze video.", "error");
          }
        } finally {
          setAnalyzing(false);
        }
      };
    } catch (error: any) {
      toast(error.message || "Failed to analyze video.", "error");
      setAnalyzing(false);
    }
  };

  // B3: Poll pending video jobs for live status updates
  useEffect(() => {
    if (!job || job.status !== "pending") return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/media/job/video/${job.id}`);
        if (!res.ok) return;
        const updated = await res.json();
        setJob(updated);
        if (updated.status !== "pending") {
          clearInterval(interval);
          if (updated.status === "completed") toast("Video generation complete!", "success");
          else toast("Video generation failed.", "error");
        }
      } catch {
        // Silently retry on next interval
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [job?.id, job?.status]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 md:p-8 max-w-6xl mx-auto"
    >
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Video Lab</h1>
        <p className="text-zinc-400">Generate promotional videos and analyze existing content.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Generate */}
        <div className="space-y-5 bg-zinc-950 p-6 rounded-2xl border border-zinc-800">
          <h2 className="text-xl font-semibold text-white">Generate Video</h2>

          {/* Platform preset */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Platform Preset</label>
            <select
              value={preset}
              onChange={(e) => applyPreset(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {VIDEO_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Starting Image (Optional)</label>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              ref={imageInputRef}
              onChange={(e) => setImageFile(e.target.files?.[0] || null)}
            />
            <div className="flex gap-4 items-center">
              <button
                onClick={() => imageInputRef.current?.click()}
                className="bg-zinc-800 hover:bg-zinc-700 text-white font-medium py-2 px-4 rounded-lg flex items-center gap-2 transition-colors border border-zinc-700"
              >
                <Upload className="w-4 h-4" />
                {imageFile ? "Change Image" : "Upload Image"}
              </button>
              {imageFile && <span className="text-sm text-zinc-400">{imageFile.name}</span>}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Video Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="A cinematic drone shot of a futuristic city..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">Aspect Ratio</label>
              <select
                value={aspectRatio}
                onChange={(e) => { setAspectRatio(e.target.value); setPreset("custom"); }}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="16:9">16:9 (Landscape)</option>
                <option value="9:16">9:16 (Portrait)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">Resolution</label>
              <select
                value={resolution}
                onChange={(e) => { setResolution(e.target.value); setPreset("custom"); }}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="1080p">1080p</option>
                <option value="720p">720p</option>
              </select>
            </div>
          </div>

          <button
            onClick={generateVideo}
            disabled={loading || (!prompt && !imageFile)}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Video className="w-5 h-5" />}
            {loading ? "Starting job…" : "Generate Video"}
          </button>

          {job && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-zinc-300 font-medium">Job {job.id}</span>
                {job.status === "pending" ? (
                  <span className="inline-flex items-center gap-1.5 text-amber-300">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processing…
                  </span>
                ) : job.status === "completed" ? (
                  <span className="inline-flex items-center gap-1 text-emerald-300">
                    <CheckCircle2 className="w-4 h-4" />Completed
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-red-300">
                    <AlertCircle className="w-4 h-4" />Failed
                  </span>
                )}
              </div>

              {job.status === "pending" && (
                <div className="space-y-2">
                  <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                    <div className="h-full bg-amber-400/70 rounded-full animate-pulse" style={{ width: "60%" }} />
                  </div>
                  <p className="text-zinc-400">
                    Your video is being generated. This page auto-refreshes every 5 seconds.
                  </p>
                </div>
              )}

              {job.status === "completed" && job.outputs?.length > 0 && (
                <div className="space-y-2">
                  <video
                    src={job.outputs[0]}
                    controls
                    className="w-full rounded-lg border border-zinc-700"
                  />
                  <p className="text-xs text-zinc-500">Video ready — also available in the Media Library.</p>
                </div>
              )}

              {job.logs?.length ? (
                <p className="text-xs text-zinc-500">{job.logs[job.logs.length - 1]}</p>
              ) : null}
              {job.error ? <p className="text-xs text-red-300">{job.error}</p> : null}
            </div>
          )}
        </div>

        {/* Analyze */}
        <div className="space-y-6 bg-zinc-950 p-6 rounded-2xl border border-zinc-800">
          <h2 className="text-xl font-semibold text-white">Video Understanding</h2>
          <p className="text-sm text-zinc-400">Upload a video to analyze its content using Gemini Pro.</p>

          <input
            type="file"
            accept="video/*"
            className="hidden"
            ref={fileInputRef}
            onChange={analyzeVideo}
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={analyzing}
            className="w-full bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white font-medium py-3 rounded-xl flex items-center justify-center gap-2 transition-colors border border-zinc-700"
          >
            {analyzing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
            {analyzing ? "Analyzing Video…" : "Upload Video to Analyze"}
          </button>

          {analysisResult && (
            <div className="mt-4 p-4 bg-zinc-900 rounded-xl border border-zinc-800 text-zinc-300 text-sm whitespace-pre-wrap h-64 overflow-y-auto">
              {analysisResult}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

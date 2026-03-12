import { useState, useRef, ChangeEvent } from "react";
import { useBrand } from "../context/BrandContext";
import { useApiKey } from "../components/ApiKeyGuard";
import { motion } from "motion/react";
import { GoogleGenAI } from "@google/genai";
import { Loader2, Video, Upload, Clock, CheckCircle2, AlertCircle } from "lucide-react";

interface VideoJob {
  id: string;
  status: "pending" | "completed" | "failed";
  outputs: string[];
  logs?: string[];
  error?: string;
}

export default function VideoLab() {
  const brand = useBrand();
  const { resetKey } = useApiKey();
  const [prompt, setPrompt] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [job, setJob] = useState<VideoJob | null>(null);
  const [analysisResult, setAnalysisResult] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [resolution, setResolution] = useState("1080p");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

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
          apiKey: import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY,
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
    } catch (error: any) {
      console.error(error);
      if (error?.message?.includes("PERMISSION_DENIED") || error?.message?.includes("Requested entity was not found")) {
        resetKey();
      } else {
        alert(error.message || "Failed to generate video.");
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
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY });

      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        try {
          const base64Data = (reader.result as string).split(",")[1];

          const response = await ai.models.generateContent({
            model: "gemini-3.1-pro-preview",
            contents: {
              parts: [
                {
                  inlineData: {
                    data: base64Data,
                    mimeType: file.type,
                  },
                },
                { text: "Analyze this video for key information, brand alignment, and potential improvements." },
              ],
            },
          });

          setAnalysisResult(response.text || "No analysis generated.");
        } catch (error: any) {
          console.error(error);
          if (error?.message?.includes("PERMISSION_DENIED") || error?.message?.includes("Requested entity was not found")) {
            resetKey();
          } else {
            alert("Failed to analyze video.");
          }
        } finally {
          setAnalyzing(false);
        }
      };
    } catch (error: any) {
      console.error(error);
      if (error?.message?.includes("PERMISSION_DENIED") || error?.message?.includes("Requested entity was not found")) {
        resetKey();
      } else {
        alert("Failed to analyze video.");
      }
      setAnalyzing(false);
    }
  };

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
        <div className="space-y-6 bg-zinc-950 p-6 rounded-2xl border border-zinc-800">
          <h2 className="text-xl font-semibold text-white">Generate Video</h2>

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
                onChange={(e) => setAspectRatio(e.target.value)}
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
                onChange={(e) => setResolution(e.target.value)}
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
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Video className="w-5 h-5" />}
            {loading ? "Starting job..." : "Generate Video"}
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
              <p className="text-zinc-400">The backend is polling this job in the background. Open the Media Library to watch it update.</p>
              {job.logs?.length ? <p className="text-xs text-zinc-500">{job.logs[job.logs.length - 1]}</p> : null}
              {job.error ? <p className="text-xs text-red-300">{job.error}</p> : null}
            </div>
          )}
        </div>

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
            className="w-full bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white font-medium py-3 rounded-lg flex items-center justify-center gap-2 transition-colors border border-zinc-700"
          >
            {analyzing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
            {analyzing ? "Analyzing Video..." : "Upload Video to Analyze"}
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

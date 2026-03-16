import { useState, useRef, useEffect } from "react";
import { useBrand } from "../context/BrandContext";
import { useApiKey } from "../components/ApiKeyGuard";
import { useToast } from "../context/ToastContext";
import { motion, AnimatePresence } from "motion/react";
import { useNavigate } from "react-router-dom";
import { GoogleGenAI, Modality, LiveServerMessage } from "@google/genai";
import { Loader2, Mic, Play, Square, CheckCircle2, Clock, AlertCircle, History, Download, Send, Sparkles } from "lucide-react";

interface VoiceJob {
  id: string;
  status: "pending" | "completed" | "failed";
  outputs: string[];
  logs?: string[];
  error?: string;
}

interface HistoryItem {
  id: string;
  type: string;
  prompt: string;
  text?: string;
  outputs: string[];
  createdAt: string;
}

const VOICE_PRESETS = [
  { label: "Professional", prefix: "Professional and clear corporate tone" },
  { label: "Casual", prefix: "Casual, friendly, everyday conversational tone" },
  { label: "Excited", prefix: "Excited, high-energy, and enthusiastic tone" },
  { label: "Soft", prefix: "Soft, calm, and soothing whisper-like tone" },
  { label: "Narration", prefix: "Steady, rhythmical storytelling narration tone" },
];

export default function VoiceLab() {
  const brand = useBrand();
  const { resetKey } = useApiKey();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingExpand, setLoadingExpand] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [voice, setVoice] = useState("Kore");
  const [job, setJob] = useState<VoiceJob | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [recentPrompts, setRecentPrompts] = useState<string[]>([]);
  const [showPrompts, setShowPrompts] = useState(false);
  const [styles, setStyles] = useState<any[]>([]);
  const [selectedStyle, setSelectedStyle] = useState("");

  const [isLive, setIsLive] = useState(false);
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    fetch("/api/media/history?type=voice")
      .then(res => res.json())
      .then(data => setHistory(data.slice(0, 5)))
      .catch(console.error);
    
    fetch("/api/agent/style-presets")
      .then(res => res.json())
      .then(data => setStyles(data))
      .catch(console.error);

    try {
      const saved = localStorage.getItem("gemlink-prompts-voice");
      if (saved) setRecentPrompts(JSON.parse(saved));
    } catch {}
  }, []);

  const savePrompt = (p: string) => {
    const updated = [p, ...recentPrompts.filter(x => x !== p)].slice(0, 10);
    setRecentPrompts(updated);
    try {
      localStorage.setItem("gemlink-prompts-voice", JSON.stringify(updated));
    } catch {}
  };
  const audioContextRef = useRef<AudioContext | null>(null);

  function applyStyle(styleId: string) {
    const s = styles.find(x => x.id === styleId);
    if (!s) {
      setSelectedStyle("");
      return;
    }
    setSelectedStyle(styleId);
    
    if (s.positiveAppend && !text.includes(s.positiveAppend)) {
      setText(prev => {
        const cleaned = prev.trim();
        return cleaned ? `${cleaned}, ${s.positiveAppend}` : s.positiveAppend;
      });
    }
  }

  const generateSpeech = async () => {
    if (!text) return;
    savePrompt(text);
    setLoading(true);
    setAudioUrl(null);
    setJob(null);
    try {
      const response = await fetch("/api/media/voice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: `Say in a ${brand.brandVoice} tone: ${text}`,
          voice,
          brandContext: brand,
          apiKey: import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate speech");
      }

      const data = await response.json();
      setJob(data);
      setAudioUrl(data.outputs?.[0] || null);
      toast("Voice generation complete.", "success");
      fetch("/api/media/history?type=voice")
        .then(res => res.json())
        .then(data => setHistory(data.slice(0, 5)))
        .catch(console.error);
    } catch (error: any) {
      console.error(error);
      if (error?.message?.includes("PERMISSION_DENIED") || error?.message?.includes("Requested entity was not found")) {
        resetKey();
      } else {
        alert(error.message || "Failed to generate speech.");
      }
    } finally {
      setLoading(false);
    }
  };

  const toggleLiveSession = async () => {
    if (isLive) {
      const liveSession = await session;
      liveSession?.close();
      setIsLive(false);
      return;
    }

    try {
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY });

      const sessionPromise = ai.live.connect({
        model: import.meta.env.VITE_MODEL_TTS || "gemini-2.5-flash-preview-tts", // ── L3-S4.5: use env var
        callbacks: {
          onopen: () => {
            setIsLive(true);
            navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
              const audioContext = new AudioContext({ sampleRate: 16000 });
              const source = audioContext.createMediaStreamSource(stream);
              const processor = audioContext.createScriptProcessor(4096, 1, 1);

              source.connect(processor);
              processor.connect(audioContext.destination);

              processor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                const pcm16 = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                  pcm16[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
                }

                const uint8Array = new Uint8Array(pcm16.buffer);
                let binary = "";
                for (let i = 0; i < uint8Array.byteLength; i++) {
                  binary += String.fromCharCode(uint8Array[i]);
                }
                const base64Data = btoa(binary);

                sessionPromise.then((s) =>
                  s.sendRealtimeInput({
                    media: { data: base64Data, mimeType: "audio/pcm;rate=16000" },
                  }),
                );
              };
            });
          },
          onmessage: async (message: LiveServerMessage) => {
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio) {
              if (!audioContextRef.current) {
                audioContextRef.current = new AudioContext({ sampleRate: 24000 });
              }

              const binaryString = atob(base64Audio);
              const len = binaryString.length;
              const bytes = new Uint8Array(len);
              for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }

              const pcm16 = new Int16Array(bytes.buffer);
              const float32 = new Float32Array(pcm16.length);
              for (let i = 0; i < pcm16.length; i++) {
                float32[i] = pcm16[i] / 32768.0;
              }

              const audioBuffer = audioContextRef.current.createBuffer(1, float32.length, 24000);
              audioBuffer.getChannelData(0).set(float32);

              const source = audioContextRef.current.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(audioContextRef.current.destination);
              source.start();
            }
          },
          onclose: () => setIsLive(false),
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
          },
          systemInstruction: `You are the voice agent for ${brand.brandName}. Description: ${brand.brandDescription}. Tone: ${brand.brandVoice}.`,
        },
      });

      setSession(sessionPromise);
    } catch (error: any) {
      console.error(error);
      if (error?.message?.includes("PERMISSION_DENIED") || error?.message?.includes("Requested entity was not found")) {
        resetKey();
      } else {
        alert("Failed to start live session.");
      }
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 md:p-8 max-w-6xl mx-auto"
    >
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Voice Lab</h1>
        <p className="text-zinc-400">Experiment with Text-to-Speech and Real-time Conversational Agents.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6 bg-zinc-950 p-6 rounded-2xl border border-zinc-800">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-white">Generate Speech</h2>
            <div className="flex gap-1.5">
              {VOICE_PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => setText(prev => p.prefix + ": " + (prev.includes(": ") ? prev.split(": ")[1] : prev))}
                  className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded text-[10px] text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Voice</label>
            <select
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="Puck">Puck</option>
              <option value="Charon">Charon</option>
              <option value="Kore">Kore</option>
              <option value="Fenrir">Fenrir</option>
              <option value="Zephyr">Zephyr</option>
            </select>
          </div>

          {/* Style selector */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Style Preset</label>
            <select
              value={selectedStyle}
              onChange={(e) => applyStyle(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">No Style (Default)</option>
              {styles.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {selectedStyle && (
              <p className="mt-1.5 text-[10px] text-zinc-500 italic">
                {styles.find(x => x.id === selectedStyle)?.description}
              </p>
            )}
          </div>

          <div className="relative">
            <div className="flex justify-between items-end mb-2">
              <label className="block text-sm font-medium text-zinc-300">Text to Speak</label>
              <div className="flex gap-3">
                <button
                  onClick={async () => {
                    if (!text || loadingExpand) return;
                    setLoadingExpand(true);
                    try {
                      const res = await fetch("/api/agent/expand-prompt", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          prompt: text,
                          type: "voice",
                          apiKey: import.meta.env.VITE_GEMINI_API_KEY
                        })
                      });
                      if (!res.ok) throw new Error("Failed to enhance text");
                      const data = await res.json();
                      setText(data.expanded);
                      toast("Script enhanced ✨", "success");
                    } catch (err: any) {
                      toast(err.message, "error");
                    } finally {
                      setLoadingExpand(false);
                    }
                  }}
                  disabled={!text || loadingExpand}
                  className="text-xs flex items-center gap-1 text-indigo-400 hover:text-indigo-300 transition-colors disabled:opacity-50"
                  title="Enhance with AI"
                >
                  {loadingExpand ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  Enhance
                </button>
                {recentPrompts.length > 0 && (
                  <button 
                    onClick={() => setShowPrompts(!showPrompts)} 
                    className="text-xs flex items-center gap-1 text-indigo-400 hover:text-indigo-300 transition-colors"
                  >
                    <History className="w-3.5 h-3.5" /> Recent
                  </button>
                )}
              </div>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Welcome to our new product launch..."
              onFocus={() => setShowPrompts(false)}
            />
            <AnimatePresence>
              {showPrompts && recentPrompts.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute z-10 w-full mt-1 top-full left-0 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl max-h-48 overflow-y-auto"
                >
                  {recentPrompts.map((rp, i) => (
                    <button
                      key={i}
                      onClick={() => { setText(rp); setShowPrompts(false); }}
                      className="w-full text-left px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700 truncate border-b border-zinc-700/50 last:border-0"
                    >
                      {rp}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button
            onClick={generateSpeech}
            disabled={loading || !text}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
            Generate Audio
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

          {audioUrl && (
            <div className="mt-4 p-4 bg-zinc-900 rounded-xl border border-zinc-800 space-y-4">
              <audio src={audioUrl} controls className="w-full" />
              <div className="flex gap-2">
                <a
                  href={audioUrl}
                  download={`voiceover-${job?.id || 'gen'}.wav`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5 border border-zinc-700"
                >
                  <Download className="w-4 h-4" /> Download
                </a>
                <button
                  onClick={() => {
                    sessionStorage.setItem("compose-send-item", JSON.stringify({
                      id: job?.id || `voice-${Date.now()}`,
                      type: "voice",
                      url: audioUrl,
                      prompt: text
                    }));
                    navigate("/compose");
                  }}
                  className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5 border border-indigo-500"
                >
                  <Send className="w-4 h-4" /> Send to Compose
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6 bg-zinc-950 p-6 rounded-2xl border border-zinc-800">
          <h2 className="text-xl font-semibold text-white">Conversational Voice App</h2>
          <p className="text-sm text-zinc-400">Talk directly to your brand's AI persona in real-time using the Gemini Live API.</p>

          <div className="h-48 flex items-center justify-center border-2 border-dashed border-zinc-800 rounded-xl bg-zinc-900">
            {isLive ? (
              <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center animate-pulse">
                  <Mic className="w-8 h-8 text-red-500" />
                </div>
                <span className="text-red-400 font-medium">Listening & Speaking...</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4 text-zinc-500">
                <Mic className="w-12 h-12" />
                <span>Ready to start conversation</span>
              </div>
            )}
          </div>

          <button
            onClick={toggleLiveSession}
            className={`w-full font-medium py-3 rounded-lg flex items-center justify-center gap-2 transition-colors ${
              isLive
                ? "bg-red-600 hover:bg-red-700 text-white"
                : "bg-emerald-600 hover:bg-emerald-700 text-white"
            }`}
          >
            {isLive ? <Square className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            {isLive ? "Stop Conversation" : "Start Conversation"}
          </button>
        </div>
      </div>

      {history.length > 0 && (
        <div className="mt-12 pt-8 border-t border-zinc-800/50">
          <h2 className="text-xl font-semibold text-white mb-6">Recent Voiceovers</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {history.map(item => (
              <div key={item.id} className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-3 relative group">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-indigo-500/10 rounded-lg">
                      <Mic className="w-4 h-4 text-indigo-400" />
                    </div>
                    <span className="text-xs font-medium text-white">Generation {item.id.slice(0, 8)}</span>
                  </div>
                  <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{new Date(item.createdAt).toLocaleDateString()}</span>
                </div>
                <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">{item.prompt}</p>
                {item.outputs?.[0] && (
                  <div className="space-y-2">
                    <audio src={item.outputs[0]} controls className="w-full h-8" />
                    <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <a
                        href={item.outputs[0]}
                        download={`voice-${item.id}.wav`}
                        className="flex-1 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-white rounded text-[10px] font-medium transition-colors flex items-center justify-center gap-1"
                      >
                        <Download className="w-3 h-3" /> Download
                      </a>
                      <button
                        onClick={() => {
                          sessionStorage.setItem("compose-send-item", JSON.stringify({
                            id: item.id,
                            type: "voice",
                            url: item.outputs[0],
                            prompt: item.prompt
                          }));
                          navigate("/compose");
                        }}
                        className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[10px] font-medium transition-colors flex items-center justify-center gap-1"
                      >
                        <Send className="w-3 h-3" /> Compose
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}

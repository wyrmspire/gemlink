import { useState, useRef, useEffect } from "react";
import { useBrand } from "../context/BrandContext";
import { useApiKey } from "../components/ApiKeyGuard";
import { motion } from "motion/react";
import { GoogleGenAI, Modality, LiveServerMessage } from "@google/genai";
import { Loader2, Mic, Play, Square } from "lucide-react";

export default function VoiceLab() {
  const brand = useBrand();
  const { resetKey } = useApiKey();
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [voice, setVoice] = useState("Kore");
  
  // Live API State
  const [isLive, setIsLive] = useState(false);
  const [session, setSession] = useState<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);

  const generateSpeech = async () => {
    if (!text) return;
    setLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY });
      
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `Say in a ${brand.brandVoice} tone: ${text}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voice },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        setAudioUrl(`data:audio/mp3;base64,${base64Audio}`);
      }
    } catch (error: any) {
      console.error(error);
      if (error?.message?.includes("PERMISSION_DENIED") || error?.message?.includes("Requested entity was not found")) {
        resetKey();
      } else {
        alert("Failed to generate speech.");
      }
    } finally {
      setLoading(false);
    }
  };

  const toggleLiveSession = async () => {
    if (isLive) {
      session?.close();
      setIsLive(false);
      return;
    }

    try {
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY });
      
      const sessionPromise = ai.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-09-2025",
        callbacks: {
          onopen: () => {
            setIsLive(true);
            // Setup microphone capture here
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
                
                // Convert to base64
                const uint8Array = new Uint8Array(pcm16.buffer);
                let binary = '';
                for (let i = 0; i < uint8Array.byteLength; i++) {
                  binary += String.fromCharCode(uint8Array[i]);
                }
                const base64Data = btoa(binary);
                
                sessionPromise.then((s) => 
                  s.sendRealtimeInput({
                    media: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
                  })
                );
              };
            });
          },
          onmessage: async (message: LiveServerMessage) => {
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio) {
              // Decode and play audio
              if (!audioContextRef.current) {
                audioContextRef.current = new AudioContext({ sampleRate: 24000 });
              }
              
              const binaryString = atob(base64Audio);
              const len = binaryString.length;
              const bytes = new Uint8Array(len);
              for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              
              // Convert PCM16 to Float32
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
      className="p-8 max-w-6xl mx-auto"
    >
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Voice Lab</h1>
        <p className="text-zinc-400">Experiment with Text-to-Speech and Real-time Conversational Agents.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* TTS Generation */}
        <div className="space-y-6 bg-zinc-950 p-6 rounded-2xl border border-zinc-800">
          <h2 className="text-xl font-semibold text-white">Generate Speech</h2>
          
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

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">Text to Speak</label>
            <textarea 
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Welcome to our new product launch..."
            />
          </div>

          <button
            onClick={generateSpeech}
            disabled={loading || !text}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
            Generate Audio
          </button>

          {audioUrl && (
            <div className="mt-4 p-4 bg-zinc-900 rounded-xl border border-zinc-800">
              <audio src={audioUrl} controls className="w-full" />
            </div>
          )}
        </div>

        {/* Live API */}
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
    </motion.div>
  );
}

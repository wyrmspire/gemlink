import { useState } from "react";
import { useBrand } from "../context/BrandContext";
import { useApiKey } from "../components/ApiKeyGuard";
import { motion } from "motion/react";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { Loader2, Search, BrainCircuit } from "lucide-react";

export default function Research() {
  const brand = useBrand();
  const { resetKey } = useApiKey();
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"search" | "think">("search");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [sources, setSources] = useState<any[]>([]);

  const performResearch = async () => {
    if (!query) return;
    setLoading(true);
    setResult("");
    setSources([]);
    
    try {
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY });
      
      const context = `Context: Our brand is ${brand.brandName}. ${brand.brandDescription}. Target audience: ${brand.targetAudience}. `;
      
      if (mode === "search") {
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: context + "Research query: " + query,
          config: {
            tools: [{ googleSearch: {} }],
          },
        });
        
        setResult(response.text || "No results found.");
        const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
        if (chunks) {
          setSources(chunks.map(c => c.web).filter(Boolean));
        }
      } else {
        const response = await ai.models.generateContent({
          model: "gemini-3.1-pro-preview",
          contents: context + "Deep analysis query: " + query,
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }
          }
        });
        
        setResult(response.text || "No analysis generated.");
      }
    } catch (error: any) {
      console.error(error);
      if (error?.message?.includes("PERMISSION_DENIED") || error?.message?.includes("Requested entity was not found")) {
        resetKey();
      } else {
        alert("Research failed.");
      }
    } finally {
      setLoading(false);
    }
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
        <div className="flex gap-4 mb-6">
          <button
            onClick={() => setMode("search")}
            className={`flex-1 py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors ${
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
            className={`flex-1 py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors ${
              mode === "think" 
                ? "bg-emerald-600 text-white" 
                : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800"
            }`}
          >
            <BrainCircuit className="w-5 h-5" />
            Deep Strategic Thinking
          </button>
        </div>

        <div className="flex gap-4">
          <input 
            type="text" 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && performResearch()}
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder={mode === "search" ? "Search the web for competitors, trends..." : "Ask a complex strategic question..."}
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
    </motion.div>
  );
}

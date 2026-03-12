import { useState } from "react";
import { useBrand } from "../context/BrandContext";
import { useApiKey } from "../components/ApiKeyGuard";
import { motion } from "motion/react";
import { GoogleGenAI } from "@google/genai";
import { Loader2, Send, Users } from "lucide-react";

interface Message {
  role: string;
  content: string;
  agent: string;
}

export default function Boardroom() {
  const brand = useBrand();
  const { resetKey } = useApiKey();
  const [topic, setTopic] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  const startDiscussion = async () => {
    if (!topic) return;
    setLoading(true);
    
    const initialMessage = { role: "user", content: topic, agent: "You" };
    setMessages([initialMessage]);
    
    try {
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY });
      
      const agents = [
        { name: "Marketing Director", prompt: `You are the Marketing Director for ${brand.brandName}. Focus on audience engagement, virality, and brand voice (${brand.brandVoice}). Respond to the topic.` },
        { name: "Tech Lead", prompt: `You are the Tech Lead for ${brand.brandName}. Focus on feasibility, automation, and technical innovation. Respond to the topic.` },
        { name: "Creative Director", prompt: `You are the Creative Director for ${brand.brandName}. Focus on aesthetics, storytelling, and emotional connection. Respond to the topic.` }
      ];

      for (const agent of agents) {
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: `Topic: ${topic}. ${agent.prompt}`,
        });
        
        setMessages(prev => [...prev, {
          role: "assistant",
          content: response.text || "",
          agent: agent.name
        }]);
      }
    } catch (error: any) {
      console.error(error);
      if (error?.message?.includes("PERMISSION_DENIED") || error?.message?.includes("Requested entity was not found")) {
        resetKey();
      } else {
        alert("Discussion failed.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 md:p-8 max-w-4xl mx-auto h-[calc(100vh-4rem)] md:h-screen flex flex-col"
    >
      <div className="mb-4 md:mb-8 shrink-0">
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2">The Boardroom</h1>
        <p className="text-zinc-400">Pitch an idea and let your AI executive team discuss it.</p>
      </div>

      <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded-2xl p-6 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto space-y-6 mb-6 pr-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-zinc-500">
              <Users className="w-16 h-16 mb-4 opacity-50" />
              <p>The board is waiting for your pitch.</p>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <motion.div 
                key={idx}
                initial={{ opacity: 0, x: msg.role === "user" ? 20 : -20 }}
                animate={{ opacity: 1, x: 0 }}
                className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
              >
                <span className="text-xs font-medium text-zinc-500 mb-1 ml-1">{msg.agent}</span>
                <div className={`max-w-[80%] p-4 rounded-2xl ${
                  msg.role === "user" 
                    ? "bg-indigo-600 text-white rounded-br-none" 
                    : "bg-zinc-800 text-zinc-200 rounded-bl-none"
                }`}>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
                </div>
              </motion.div>
            ))
          )}
          {loading && (
            <div className="flex items-center gap-3 text-zinc-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">The board is discussing...</span>
            </div>
          )}
        </div>

        <div className="flex gap-4">
          <input 
            type="text" 
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && startDiscussion()}
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Pitch a new campaign or product idea..."
          />
          <button
            onClick={startDiscussion}
            disabled={loading || !topic}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-6 py-3 rounded-xl flex items-center justify-center transition-colors"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

import { motion } from "motion/react";
import { Link, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import {
  MessageSquare,
  Video,
  Mic,
  Image as ImageIcon,
  Search,
  PhoneCall,
  Settings,
  Library as LibraryIcon,
  ListOrdered,
  FolderOpen,
  Presentation,
  Lightbulb,
  FileStack,
  Clock,
  ExternalLink,
  Loader2,
  Music,
  Clapperboard,
} from "lucide-react";

interface ToolCard {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  desc: string;
  accent?: boolean;
}

const createTools: ToolCard[] = [
  { name: "Brand Setup", href: "/setup", icon: Settings, desc: "Define your brand identity." },
  { name: "Media Plan", href: "/plan", icon: ListOrdered, desc: "Plan and batch-generate media assets.", accent: true },
  { name: "Social Media Gen", href: "/social", icon: ImageIcon, desc: "Generate images and posts." },
  { name: "Video Lab", href: "/video", icon: Video, desc: "Analyze and generate videos." },
  { name: "Voice Lab", href: "/voice", icon: Mic, desc: "Experiment with TTS and Live Audio." },
  { name: "Music Lab", href: "/music", icon: Music, desc: "Generate background music tracks." },
  { name: "Compose", href: "/compose", icon: Clapperboard, desc: "Build slideshows and video compositions." },
  { name: "Sales Agent", href: "/sales", icon: PhoneCall, desc: "Twilio SMS integration." },
];

const strategyTools: ToolCard[] = [
  { name: "Strategy Briefs", href: "/briefs", icon: Lightbulb, desc: "Capture and reference strategies." },
  { name: "Boardroom", href: "/boardroom", icon: MessageSquare, desc: "Multi-agent brainstorming." },
  { name: "Research", href: "/research", icon: Search, desc: "Deep thinking & search grounding." },
  { name: "Media Library", href: "/library", icon: LibraryIcon, desc: "Browse all generated assets." },
  { name: "Collections", href: "/collections", icon: FolderOpen, desc: "Curate and present media sets." },
  { name: "Present", href: "/collections", icon: Presentation, desc: "Full-screen slideshow mode." },
  { name: "Strategy Briefs", href: "/briefs", icon: FileStack, desc: "Manage pinned strategy artifacts.", accent: true },
];

function ToolGrid({ tools }: { tools: ToolCard[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
      {tools.map((tool) => (
        <Link key={tool.name + tool.href} to={tool.href}>
          <motion.div
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={`border p-6 rounded-2xl transition-colors h-full flex flex-col ${
              tool.accent
                ? "bg-indigo-600/10 border-indigo-500/30 hover:border-indigo-400/60"
                : "bg-zinc-950 border-zinc-800 hover:border-indigo-500/50"
            }`}
          >
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${
              tool.accent ? "bg-indigo-500/20 text-indigo-300" : "bg-indigo-500/10 text-indigo-400"
            }`}>
              <tool.icon className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">{tool.name}</h3>
            <p className="text-sm text-zinc-400 flex-1">{tool.desc}</p>
          </motion.div>
        </Link>
      ))}
    </div>
  );
}

// ─── Recent Activity ──────────────────────────────────────────────────────────

interface HistoryJob {
  id: string;
  type: "image" | "video" | "voice" | "music" | "composed";
  prompt?: string;
  text?: string;
  outputs: string[];
  status: string;
  createdAt?: string;
  timestamp?: number;
}

function timeAgo(dateStr?: string, ts?: number): string {
  const ms = dateStr ? Date.parse(dateStr) : (ts ? ts * 1000 : 0);
  if (!ms) return "";
  const diff = Math.floor((Date.now() - ms) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function typeColor(type: string): string {
  switch (type) {
    case "image": return "bg-indigo-500/20 text-indigo-300";
    case "video": return "bg-emerald-500/20 text-emerald-300";
    case "voice": return "bg-amber-500/20 text-amber-300";
    case "music": return "bg-purple-500/20 text-purple-300";
    default: return "bg-zinc-500/20 text-zinc-300";
  }
}

function typeIcon(type: string) {
  const cls = "w-3 h-3";
  switch (type) {
    case "video": return <Video className={cls} />;
    case "voice": return <Mic className={cls} />;
    case "music": return <Music className={cls} />;
    default: return <ImageIcon className={cls} />;
  }
}

function RecentActivity() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<HistoryJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetchHistory() {
      try {
        const res = await fetch("/api/media/history", { cache: "no-store" });
        if (!res.ok) return;
        const data: HistoryJob[] = await res.json();
        if (!cancelled) {
          // Show only completed jobs with outputs, most recent 5
          const completed = data
            .filter((j) => j.status === "completed" && j.outputs?.length > 0)
            .slice(0, 5);
          setJobs(completed);
        }
      } catch {
        // Server not available — silent fail (show no history)
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchHistory();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-zinc-500 text-sm py-6">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading recent activity…
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="text-zinc-600 text-sm text-center py-8 border border-zinc-800 rounded-2xl">
        <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-30" />
        No generated content yet. Pick a tool above to get started!
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
      {jobs.map((job, idx) => {
        const prompt = job.prompt ?? job.text ?? "No description";
        const isImage = job.type === "image" || !job.outputs[0]?.match(/\.(mp4|webm|wav|mp3|ogg)$/i);
        const thumbUrl = job.outputs[0];
        const age = timeAgo(job.createdAt, job.timestamp);

        return (
          <motion.button
            key={job.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate("/library")}
            className="group flex flex-col bg-zinc-950 border border-zinc-800 hover:border-indigo-500/40 rounded-2xl overflow-hidden text-left transition-colors"
          >
            {/* Thumbnail */}
            <div className="aspect-video bg-zinc-900 relative overflow-hidden">
              {isImage && thumbUrl ? (
                <img
                  src={thumbUrl}
                  alt={prompt}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className={`p-3 rounded-xl ${typeColor(job.type)}`}>
                    {typeIcon(job.type)}
                  </span>
                </div>
              )}
              {/* Type badge on top */}
              <div className={`absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${typeColor(job.type)}`}>
                {typeIcon(job.type)}
                {job.type}
              </div>
            </div>
            {/* Info */}
            <div className="p-2.5 flex-1">
              <p className="text-xs text-zinc-300 line-clamp-2 leading-relaxed">
                {prompt.slice(0, 80)}{prompt.length > 80 ? "…" : ""}
              </p>
              {age && (
                <div className="flex items-center gap-1 mt-1.5 text-[10px] text-zinc-600">
                  <Clock className="w-2.5 h-2.5" />
                  {age}
                </div>
              )}
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}

export default function Dashboard() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 md:p-8 max-w-6xl mx-auto"
    >
      <div className="mb-10">
        <h1 className="text-4xl font-bold tracking-tight text-white mb-4">Agentic Workspace</h1>
        <p className="text-xl text-zinc-400">Your central hub for building the future of your business with AI.</p>
      </div>

      {/* Recent Activity */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
            <Clock className="w-3.5 h-3.5" />
            Recent Activity
          </h2>
          <Link
            to="/library"
            className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            View all
            <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
        <RecentActivity />
      </div>

      {/* Create & Generate */}
      <div className="mb-10">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-500 mb-4">Create &amp; Generate</h2>
        <ToolGrid tools={createTools} />
      </div>

      {/* Strategy & Organize */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-500 mb-4">Strategy &amp; Organize</h2>
        <ToolGrid tools={strategyTools} />
      </div>
    </motion.div>
  );
}

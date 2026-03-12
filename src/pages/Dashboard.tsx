import { motion } from "motion/react";
import { Link } from "react-router-dom";
import { LayoutDashboard, MessageSquare, Video, Mic, Image as ImageIcon, Search, PhoneCall, Settings } from "lucide-react";

const tools = [
  { name: "Brand Setup", href: "/setup", icon: Settings, desc: "Define your brand identity." },
  { name: "Social Media Gen", href: "/social", icon: ImageIcon, desc: "Generate images and posts." },
  { name: "Video Lab", href: "/video", icon: Video, desc: "Analyze and generate videos." },
  { name: "Voice Lab", href: "/voice", icon: Mic, desc: "Experiment with TTS and Live Audio." },
  { name: "Boardroom", href: "/boardroom", icon: MessageSquare, desc: "Multi-agent brainstorming." },
  { name: "Research", href: "/research", icon: Search, desc: "Deep thinking & search grounding." },
  { name: "Sales Agent", href: "/sales", icon: PhoneCall, desc: "Twilio SMS integration." },
];

export default function Dashboard() {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 md:p-8 max-w-6xl mx-auto"
    >
      <div className="mb-12">
        <h1 className="text-4xl font-bold tracking-tight text-white mb-4">Agentic Workspace</h1>
        <p className="text-xl text-zinc-400">Your central hub for building the future of your business with AI.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {tools.map((tool, idx) => (
          <Link key={tool.name} to={tool.href}>
            <motion.div 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="bg-zinc-950 border border-zinc-800 p-6 rounded-2xl hover:border-indigo-500/50 transition-colors h-full flex flex-col"
            >
              <div className="w-12 h-12 bg-indigo-500/10 rounded-xl flex items-center justify-center mb-4 text-indigo-400">
                <tool.icon className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">{tool.name}</h3>
              <p className="text-sm text-zinc-400 flex-1">{tool.desc}</p>
            </motion.div>
          </Link>
        ))}
      </div>
    </motion.div>
  );
}

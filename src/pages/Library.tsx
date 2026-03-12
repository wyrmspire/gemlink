import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Loader2, Image as ImageIcon, Video, Mic, Clock } from "lucide-react";

interface Job {
  id: string;
  type: 'image' | 'video' | 'voice';
  prompt?: string;
  text?: string;
  createdAt: string;
  status?: string;
  outputs: string[];
}

export default function Library() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const response = await fetch("/api/media/history");
      if (response.ok) {
        const data = await response.json();
        setJobs(data);
      }
    } catch (error) {
      console.error("Failed to fetch history:", error);
    } finally {
      setLoading(false);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'image': return <ImageIcon className="w-5 h-5 text-indigo-400" />;
      case 'video': return <Video className="w-5 h-5 text-emerald-400" />;
      case 'voice': return <Mic className="w-5 h-5 text-amber-400" />;
      default: return <Clock className="w-5 h-5 text-zinc-400" />;
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 md:p-8 max-w-6xl mx-auto"
    >
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white mb-2">Media Library</h1>
        <p className="text-zinc-400 text-sm md:text-base">Browse your generated images, videos, and voice assets.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        </div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-16 bg-zinc-950 border border-zinc-800 rounded-2xl">
          <ImageIcon className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">No media yet</h3>
          <p className="text-zinc-400">Your generated assets will appear here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {jobs.map((job) => (
            <motion.div 
              key={job.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden flex flex-col"
            >
              <div className="aspect-square bg-zinc-900 relative flex items-center justify-center overflow-hidden">
                {job.type === 'image' && job.outputs.length > 0 ? (
                  <img src={job.outputs[0]} alt={job.prompt} className="w-full h-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center text-zinc-600">
                    {getIcon(job.type)}
                    <span className="mt-2 text-sm font-medium uppercase tracking-wider">{job.status || 'Completed'}</span>
                  </div>
                )}
              </div>
              <div className="p-4 flex-1 flex flex-col">
                <div className="flex items-center gap-2 mb-2">
                  {getIcon(job.type)}
                  <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                    {job.type}
                  </span>
                  <span className="text-xs text-zinc-500 ml-auto">
                    {new Date(job.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-sm text-zinc-300 line-clamp-3">
                  {job.prompt || job.text || "No description available"}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

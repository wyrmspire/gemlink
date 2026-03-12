import { useBrand } from "../context/BrandContext";
import { motion } from "motion/react";

export default function Setup() {
  const brand = useBrand();

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 md:p-8 max-w-3xl mx-auto"
    >
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Brand Setup</h1>
        <p className="text-zinc-400">Configure the core identity of your future business. This context will be used across all AI agents.</p>
      </div>

      <div className="space-y-6 bg-zinc-950 p-6 rounded-2xl border border-zinc-800 shadow-xl">
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-2">Brand Name</label>
          <input 
            type="text" 
            value={brand.brandName}
            onChange={(e) => brand.setBrandName(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="e.g. Acme Corp"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-2">Brand Description</label>
          <textarea 
            value={brand.brandDescription}
            onChange={(e) => brand.setBrandDescription(e.target.value)}
            rows={4}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="What does your business do?"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-2">Target Audience</label>
          <input 
            type="text" 
            value={brand.targetAudience}
            onChange={(e) => brand.setTargetAudience(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Who are you selling to?"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-2">Brand Voice & Tone</label>
          <input 
            type="text" 
            value={brand.brandVoice}
            onChange={(e) => brand.setBrandVoice(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="e.g. Professional, witty, educational"
          />
        </div>
      </div>
    </motion.div>
  );
}

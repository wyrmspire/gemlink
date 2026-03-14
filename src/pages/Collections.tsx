// Collections.tsx — stub for route /collections (Lane 3 will implement J1)
import { motion } from "motion/react";

export default function Collections() {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="p-8">
      <h1 className="text-3xl font-bold text-white mb-2">Collections</h1>
      <p className="text-zinc-400">Coming soon — curated media collections (J1).</p>
    </motion.div>
  );
}

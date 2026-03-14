// Present.tsx — stub for route /present/:collectionId (Lane 3 will implement J2)
import { motion } from "motion/react";

export default function Present() {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="p-8">
      <h1 className="text-3xl font-bold text-white mb-2">Present</h1>
      <p className="text-zinc-400">Coming soon — presentation mode (J2).</p>
    </motion.div>
  );
}

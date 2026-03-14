// MediaPlan.tsx — stub for route /plan (Lane 3 will implement H1)
import { motion } from "motion/react";

export default function MediaPlan() {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="p-8">
      <h1 className="text-3xl font-bold text-white mb-2">Media Plan</h1>
      <p className="text-zinc-400">Coming soon — bulk media planning (H1).</p>
    </motion.div>
  );
}

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from "lucide-react";
import { useToast, type Toast, type ToastVariant } from "../context/ToastContext";

const configs: Record<
  ToastVariant,
  { icon: React.ElementType; bg: string; border: string; text: string; iconColor: string }
> = {
  success: {
    icon: CheckCircle2,
    bg: "bg-zinc-900",
    border: "border-emerald-500/40",
    text: "text-emerald-300",
    iconColor: "text-emerald-400",
  },
  error: {
    icon: XCircle,
    bg: "bg-zinc-900",
    border: "border-red-500/40",
    text: "text-red-300",
    iconColor: "text-red-400",
  },
  warning: {
    icon: AlertTriangle,
    bg: "bg-zinc-900",
    border: "border-amber-500/40",
    text: "text-amber-300",
    iconColor: "text-amber-400",
  },
  info: {
    icon: Info,
    bg: "bg-zinc-900",
    border: "border-indigo-500/40",
    text: "text-indigo-300",
    iconColor: "text-indigo-400",
  },
};

function ToastItem({ toast }: { toast: Toast }) {
  const { dismiss } = useToast();
  const cfg = configs[toast.variant];
  const Icon = cfg.icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40, scale: 0.95 }}
      transition={{ type: "spring", duration: 0.35, bounce: 0.15 }}
      className={`flex items-start gap-3 px-4 py-3 rounded-xl border shadow-2xl ${cfg.bg} ${cfg.border} min-w-[280px] max-w-[360px] pointer-events-auto`}
      role="alert"
    >
      <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${cfg.iconColor}`} />
      <div className="flex-1">
        <p className={`text-sm leading-relaxed ${cfg.text}`}>{toast.message}</p>
        {toast.action && (
          <button
            onClick={() => {
              toast.action?.onClick();
              dismiss(toast.id);
            }}
            className="mt-2 text-xs font-bold uppercase tracking-wider text-white hover:underline"
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button
        onClick={() => dismiss(toast.id)}
        aria-label="Dismiss notification"
        className="text-zinc-500 hover:text-zinc-300 transition-colors shrink-0 mt-0.5"
      >
        <X className="w-4 h-4" />
      </button>
    </motion.div>
  );
}

export default function ToastContainer() {
  const { toasts } = useToast();

  return (
    <div
      aria-live="polite"
      className="fixed bottom-5 right-5 z-[200] flex flex-col gap-2.5 items-end pointer-events-none"
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} />
        ))}
      </AnimatePresence>
    </div>
  );
}

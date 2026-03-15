import { ChevronDown } from "lucide-react";

// ─── Transition definitions ───────────────────────────────────────────────────

export const TRANSITIONS: { value: string; label: string; description: string }[] = [
  { value: "fade",       label: "Fade",        description: "Smooth opacity blend" },
  { value: "fadeblack",  label: "Fade Black",  description: "Fade through black" },
  { value: "fadewhite",  label: "Fade White",  description: "Fade through white" },
  { value: "dissolve",   label: "Dissolve",    description: "Pixel-level blending" },
  { value: "slideright", label: "Slide Right", description: "Push outgoing frame right" },
  { value: "slideleft",  label: "Slide Left",  description: "Push outgoing frame left" },
  { value: "slideup",    label: "Slide Up",    description: "Push outgoing frame up" },
  { value: "slidedown",  label: "Slide Down",  description: "Push outgoing frame down" },
  { value: "circlecrop", label: "Circle Crop", description: "Iris circle wipe" },
  { value: "radial",     label: "Radial",      description: "Radial clock wipe" },
  { value: "wiperight",  label: "Wipe Right",  description: "Horizontal wipe right" },
  { value: "wipeleft",   label: "Wipe Left",   description: "Horizontal wipe left" },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface TransitionPickerProps {
  value: string;
  onChange: (transition: string) => void;
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TransitionPicker({
  value,
  onChange,
  className = "",
}: TransitionPickerProps) {
  const current = TRANSITIONS.find((t) => t.value === value) ?? TRANSITIONS[0];

  return (
    <div className={`relative ${className}`}>
      <label className="block text-xs text-zinc-500 mb-1 uppercase tracking-wider">
        Transition
      </label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 pr-8 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer hover:border-zinc-600 transition-colors"
        >
          {TRANSITIONS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label} — {t.description}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
      </div>
      <p className="text-[11px] text-zinc-600 mt-1">{current.description}</p>
    </div>
  );
}

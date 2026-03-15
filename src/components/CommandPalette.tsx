/**
 * CommandPalette.tsx — Lane 5, Sprint 9 W1
 *
 * Global Cmd+K / Ctrl+K palette. Opens on keyboard shortcut, lets users
 * quickly navigate to any page in the app. Fully keyboard-accessible.
 *
 * Usage:
 *   <CommandPalette open={open} onClose={() => setOpen(false)} />
 *
 * The keyboard shortcut listener lives in Layout.tsx.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { useFocusTrap } from "../hooks/useFocusTrap";
import {
  LayoutDashboard,
  Settings,
  Settings2,
  Image as ImageIcon,
  Video,
  Mic,
  Music,
  MessageSquare,
  Search,
  PhoneCall,
  Library as LibraryIcon,
  FolderOpen,
  ListOrdered,
  FileStack,
  Clapperboard,
  Terminal,
  X,
} from "lucide-react";

// ── All navigable pages ────────────────────────────────────────────────────────

interface PageEntry {
  label: string;
  description: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  keywords: string[];
}

const PAGES: PageEntry[] = [
  { label: "Dashboard",        description: "Home overview & recent activity",      href: "/",           icon: LayoutDashboard, keywords: ["home", "start", "overview"] },
  { label: "Brand Setup",      description: "Configure brand voice & identity",     href: "/setup",      icon: Settings,        keywords: ["brand", "setup", "profile", "identity"] },
  { label: "Media Plan",       description: "Batch-generate content packages",      href: "/plan",       icon: ListOrdered,     keywords: ["plan", "batch", "schedule", "media"] },
  { label: "Compose",          description: "Slideshow & video composer",           href: "/compose",    icon: Clapperboard,    keywords: ["compose", "video", "slideshow", "render"] },
  { label: "Social Media",     description: "Generate social posts & images",       href: "/social",     icon: ImageIcon,       keywords: ["social", "instagram", "twitter", "post"] },
  { label: "Video Lab",        description: "AI video generation studio",           href: "/video",      icon: Video,           keywords: ["video", "veo", "generate", "vlog"] },
  { label: "Voice Lab",        description: "Text-to-speech generation",            href: "/voice",      icon: Mic,             keywords: ["voice", "tts", "audio", "speech"] },
  { label: "Music Lab",        description: "AI music & jingle generation",         href: "/music",      icon: Music,           keywords: ["music", "lyria", "jingle", "audio"] },
  { label: "Boardroom",        description: "Strategic AI advisor sessions",        href: "/boardroom",  icon: MessageSquare,   keywords: ["boardroom", "advisor", "strategy", "agent"] },
  { label: "Research",         description: "AI-powered research assistant",        href: "/research",   icon: Search,          keywords: ["research", "search", "explore"] },
  { label: "Sales Agent",      description: "AI sales conversation agent",          href: "/sales",      icon: PhoneCall,       keywords: ["sales", "crm", "conversation"] },
  { label: "Media Library",    description: "Browse & manage generated media",      href: "/library",    icon: LibraryIcon,     keywords: ["library", "media", "assets", "files"] },
  { label: "Collections",      description: "Organise media into collections",      href: "/collections",icon: FolderOpen,      keywords: ["collections", "folders", "organize"] },
  { label: "Strategy Briefs",  description: "View & export strategy documents",     href: "/briefs",     icon: FileStack,       keywords: ["briefs", "strategy", "documents", "export"] },
  { label: "Settings",         description: "App & model configuration",            href: "/settings",   icon: Settings2,       keywords: ["settings", "config", "models", "api"] },
];

// ── Scoring / filtering ────────────────────────────────────────────────────────

function scoreEntry(entry: PageEntry, query: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const labelLower = entry.label.toLowerCase();
  const descLower = entry.description.toLowerCase();

  if (labelLower.startsWith(q)) return 100;
  if (labelLower.includes(q)) return 80;
  if (descLower.includes(q)) return 60;
  if (entry.keywords.some((k) => k.includes(q))) return 40;
  return 0;
}

// ── Component ──────────────────────────────────────────────────────────────────

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export default function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // ── W4: Focus trap — Tab/Shift+Tab stays within the dialog ────────────────
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const results = PAGES.filter((p) => scoreEntry(p, query) > 0).sort(
    (a, b) => scoreEntry(b, query) - scoreEntry(a, query)
  );

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      // Focus input after animation frame
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Scroll active item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const active = list.querySelector<HTMLLIElement>("[data-active='true']");
    active?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const handleSelect = useCallback(
    (entry: PageEntry) => {
      navigate(entry.href);
      onClose();
    },
    [navigate, onClose]
  );

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (results[selectedIndex]) handleSelect(results[selectedIndex]);
        break;
      case "Escape":
        e.preventDefault();
        onClose();
        break;
    }
  }

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Modal */}
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Command palette — navigate to any page"
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="fixed top-[18%] left-1/2 -translate-x-1/2 w-full max-w-xl z-[101] px-4"
          >
            <div className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl overflow-hidden">

              {/* Search header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800">
                <Search className="w-4 h-4 text-zinc-400 shrink-0" aria-hidden="true" />
                <input
                  ref={inputRef}
                  id="command-palette-input"
                  type="text"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-controls="command-palette-list"
                  aria-expanded={results.length > 0}
                  aria-activedescendant={results[selectedIndex] ? `cp-item-${selectedIndex}` : undefined}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Search pages…"
                  className="flex-1 bg-transparent text-white placeholder-zinc-500 text-sm focus:outline-none"
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  onClick={onClose}
                  aria-label="Close command palette"
                  className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Results */}
              <ul
                ref={listRef}
                id="command-palette-list"
                role="listbox"
                aria-label="Navigation results"
                className="max-h-80 overflow-y-auto py-2"
              >
                {results.length === 0 && (
                  <li className="px-5 py-8 text-center text-sm text-zinc-500" role="option" aria-selected={false}>
                    No results for "{query}"
                  </li>
                )}
                {results.map((entry, i) => {
                  const Icon = entry.icon;
                  const isActive = i === selectedIndex;
                  return (
                    <li
                      key={entry.href}
                      id={`cp-item-${i}`}
                      role="option"
                      aria-selected={isActive}
                      data-active={isActive}
                    >
                      <button
                        onClick={() => handleSelect(entry)}
                        onMouseEnter={() => setSelectedIndex(i)}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 transition-colors text-left ${
                          isActive ? "bg-indigo-600/20 text-white" : "text-zinc-300 hover:bg-zinc-800"
                        }`}
                      >
                        <span className={`p-1.5 rounded-lg shrink-0 ${isActive ? "bg-indigo-600/30 text-indigo-300" : "bg-zinc-800 text-zinc-400"}`}>
                          <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-medium truncate">{entry.label}</span>
                          <span className={`block text-xs truncate ${isActive ? "text-zinc-300" : "text-zinc-500"}`}>
                            {entry.description}
                          </span>
                        </span>
                        {isActive && (
                          <kbd className="hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono bg-zinc-700 text-zinc-300 rounded border border-zinc-600">
                            ↵
                          </kbd>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>

              {/* Footer hint */}
              <div className="px-4 py-2 border-t border-zinc-800 flex items-center gap-4 text-[11px] text-zinc-500">
                <span className="flex items-center gap-1">
                  <kbd className="px-1 py-0.5 bg-zinc-800 rounded border border-zinc-700 font-mono">↑↓</kbd> navigate
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1 py-0.5 bg-zinc-800 rounded border border-zinc-700 font-mono">↵</kbd> go
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1 py-0.5 bg-zinc-800 rounded border border-zinc-700 font-mono">Esc</kbd> close
                </span>
                <span className="ml-auto flex items-center gap-1">
                  <Terminal className="w-3 h-3" aria-hidden="true" />
                  Cmd+K
                </span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

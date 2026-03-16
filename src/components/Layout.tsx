import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useState, useRef, useEffect } from "react";
import {
  LayoutDashboard,
  MessageSquare,
  Video,
  Mic,
  Image as ImageIcon,
  Search,
  PhoneCall,
  Settings,
  Settings2,
  Library as LibraryIcon,
  Menu,
  X,
  ChevronDown,
  Plus,
  FolderOpen,
  ListOrdered,
  Presentation,
  FileStack,
  Clapperboard,
  Music,
  Activity,
  Loader2,
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { motion, AnimatePresence } from "motion/react";
import ErrorBoundary from "./ErrorBoundary";
import ToastContainer from "./Toast";
import ArtifactPanel from "./ArtifactPanel";
import JobQueueOverlay from "./JobQueueOverlay";
import { useProject } from "../context/ProjectContext";
// ── Added by Lane 5 (Sprint 9 W1, W2) ──────────────────────────────────────────
import CommandPalette from "./CommandPalette";
import Breadcrumbs from "./Breadcrumbs";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Brand Setup", href: "/setup", icon: Settings },
  { name: "Media Plan", href: "/plan", icon: ListOrdered },
  { name: "Compose", href: "/compose", icon: Clapperboard },
  { name: "Social Media Gen", href: "/social", icon: ImageIcon },
  { name: "Video Lab", href: "/video", icon: Video },
  { name: "Voice Lab", href: "/voice", icon: Mic },
  { name: "Music Lab", href: "/music", icon: Music },
  { name: "Boardroom", href: "/boardroom", icon: MessageSquare },
  { name: "Research", href: "/research", icon: Search },
  { name: "Sales Agent", href: "/sales", icon: PhoneCall },
  { name: "Media Library", href: "/library", icon: LibraryIcon },
  { name: "Collections", href: "/collections", icon: FolderOpen },
  { name: "Strategy Briefs", href: "/briefs", icon: FileStack },
  // ── Added by Lane 3 (Sprint 4.5) ──
  { name: "Settings", href: "/settings", icon: Settings2 },
  // ── Added by Lane 4 (Sprint 9) ──
  { name: "Presentation Mode", href: "/collections", icon: Presentation },
];

function ProjectSwitcher() {
  const { projects, activeProject, setActiveProject, createProject } = useProject();
  const [open, setOpen] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setShowNew(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleCreate() {
    if (!newName.trim()) return;
    createProject({
      name: newName.trim(),
      brandName: newName.trim(),
      brandDescription: "",
      targetAudience: "",
      brandVoice: "",
    });
    setNewName("");
    setShowNew(false);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative px-3 pb-3">
      <button
        id="project-switcher-btn"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2.5 bg-zinc-900 border border-zinc-700 rounded-xl text-sm font-medium text-white hover:bg-zinc-800 transition-colors"
      >
        <FolderOpen className="w-4 h-4 text-indigo-400 shrink-0" />
        <span className="truncate flex-1 text-left">
          {activeProject?.name ?? "Select Project"}
        </span>
        <ChevronDown className={cn("w-4 h-4 text-zinc-400 transition-transform shrink-0", open && "rotate-180")} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute left-3 right-3 top-full mt-1.5 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl z-50 overflow-hidden"
          >
            <div className="max-h-52 overflow-y-auto py-1">
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setActiveProject(p.id); setOpen(false); }}
                  className={cn(
                    "w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center gap-2",
                    p.id === activeProject?.id
                      ? "bg-indigo-600/20 text-indigo-300"
                      : "text-zinc-300 hover:bg-zinc-800"
                  )}
                >
                  <FolderOpen className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{p.name}</span>
                </button>
              ))}
            </div>

            <div className="border-t border-zinc-800 p-2">
              {showNew ? (
                <div className="flex gap-2">
                  <input
                    autoFocus
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setShowNew(false); }}
                    placeholder="Project name"
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    onClick={handleCreate}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg transition-colors"
                  >
                    Create
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowNew(true)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  New Project
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── W2 (Lane 5): Global Job Queue Indicator ───────────────────────────────────

interface QueueStatus {
  running: Record<string, number>;
  pending: Record<string, number>;
}

function GlobalJobIndicator({ onOpen }: { onOpen: () => void }) {
  const [activeCount, setActiveCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/queue", { cache: "no-store" });
        if (!res.ok) return;
        const data: QueueStatus = await res.json();
        if (!cancelled) {
          const total = Object.values(data.running).reduce((acc, n) => acc + n, 0);
          setActiveCount(total);
        }
      } catch {
        // Server unavailable — keep previous count
      }
    }

    poll();
    const timer = setInterval(poll, 15000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  if (activeCount === 0) return null;

  return (
    <button
      onClick={onOpen}
      title={`${activeCount} job${activeCount !== 1 ? "s" : ""} in progress — click to view queue`}
      className="flex items-center gap-2 px-3 py-2 mx-3 mb-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 hover:bg-amber-500/20 transition-colors text-xs font-medium"
    >
      <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
      <span className="flex-1 text-left">{activeCount} job{activeCount !== 1 ? "s" : ""} running</span>
      <Activity className="w-3.5 h-3.5 shrink-0 opacity-60" />
    </button>
  );
}

export default function Layout() {

  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  // ── Added by Lane 5 (Sprint 9 W1) — CommandPalette state ──────────────────
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isQueueOpen, setIsQueueOpen] = useState(false);

  // Cmd+K / Ctrl+K global shortcut
  useEffect(() => {
    function handleGlobalKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsPaletteOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleGlobalKey);
    return () => window.removeEventListener("keydown", handleGlobalKey);
  }, []);

  const closeMenu = () => setIsMobileMenuOpen(false);

  const NavLinks = ({ onClick }: { onClick?: () => void }) => (
    <>
      {navigation.map((item) => {
        const isActive = location.pathname === item.href;
        return (
          <Link
            key={item.name}
            to={item.href}
            onClick={onClick}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              isActive
                ? "bg-zinc-800 text-white"
                : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"
            )}
          >
            <item.icon className="w-5 h-5 shrink-0" />
            {item.name}
          </Link>
        );
      })}
    </>
  );

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-50 font-sans overflow-hidden">
      {/* Added by Lane 5 (W1): Global Command Palette */}
      <CommandPalette open={isPaletteOpen} onClose={() => setIsPaletteOpen(false)} />

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between px-4 z-50">
        <h1 className="text-lg font-semibold tracking-tight">Agent Workspace</h1>
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          aria-label={isMobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={isMobileMenuOpen}
          aria-controls="mobile-sidebar"
          className="p-2 text-zinc-400 hover:text-white"
        >
          {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Sidebar (Desktop) */}
      <div className="hidden md:flex w-64 border-r border-zinc-800 bg-zinc-950 flex-col h-full" role="navigation" aria-label="Main navigation">
        {/* Added by Lane 5 (W1): Cmd+K hint in header */}
        <div className="h-16 flex items-center px-6 border-b border-zinc-800 shrink-0 gap-3">
          <h1 className="text-lg font-semibold tracking-tight flex-1">Agent Workspace</h1>
          <button
            onClick={() => setIsPaletteOpen(true)}
            aria-label="Open command palette (Cmd+K)"
            title="Open command palette (Cmd+K)"
            className="flex items-center gap-1 px-2 py-1 rounded-md bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors text-[10px] font-mono shrink-0"
          >
            <span>⌘K</span>
          </button>
        </div>
        {/* Project switcher */}
        <div className="pt-3">
          <ProjectSwitcher />
        </div>
        <nav className="flex-1 overflow-y-auto py-2 px-3 space-y-1" aria-label="Page links">
          <NavLinks />
        </nav>
        {/* ── W2 (Lane 5): Global Job Indicator ── */}
        <GlobalJobIndicator onOpen={() => setIsQueueOpen(true)} />
      </div>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="md:hidden fixed inset-0 bg-black/60 z-40"
              onClick={closeMenu}
            />
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", bounce: 0, duration: 0.3 }}
              className="md:hidden fixed top-16 left-0 bottom-0 w-64 bg-zinc-950 border-r border-zinc-800 z-40 flex flex-col"
            >
              <div className="pt-3">
                <ProjectSwitcher />
              </div>
              <nav className="flex-1 overflow-y-auto py-2 px-3 space-y-1">
                <NavLinks onClick={closeMenu} />
              </nav>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-zinc-900 pt-16 md:pt-0 h-full" id="main-content" role="main">
        {/* Added by Lane 5 (W2): Breadcrumbs auto-generated from route */}
        <Breadcrumbs />
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>

      {/* Global toast container */}
      <ToastContainer />
      {/* Global artifact reference panel */}
      <ArtifactPanel />
      {/* Global job queue overlay */}
      <JobQueueOverlay open={isQueueOpen} onClose={() => setIsQueueOpen(false)} />
    </div>
  );
}

import { Link, Outlet, useLocation } from "react-router-dom";
import { useState } from "react";
import { 
  LayoutDashboard, 
  MessageSquare, 
  Video, 
  Mic, 
  Image as ImageIcon,
  Search,
  PhoneCall,
  Settings,
  Library as LibraryIcon,
  Menu,
  X
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { motion, AnimatePresence } from "motion/react";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Brand Setup", href: "/setup", icon: Settings },
  { name: "Social Media Gen", href: "/social", icon: ImageIcon },
  { name: "Video Lab", href: "/video", icon: Video },
  { name: "Voice Lab", href: "/voice", icon: Mic },
  { name: "Boardroom", href: "/boardroom", icon: MessageSquare },
  { name: "Research", href: "/research", icon: Search },
  { name: "Sales Agent", href: "/sales", icon: PhoneCall },
  { name: "Media Library", href: "/library", icon: LibraryIcon },
];

export default function Layout() {
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const closeMenu = () => setIsMobileMenuOpen(false);

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-50 font-sans overflow-hidden">
      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between px-4 z-50">
        <h1 className="text-lg font-semibold tracking-tight">Agent Workspace</h1>
        <button 
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 text-zinc-400 hover:text-white"
        >
          {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Sidebar (Desktop) */}
      <div className="hidden md:flex w-64 border-r border-zinc-800 bg-zinc-950 flex-col h-full">
        <div className="h-16 flex items-center px-6 border-b border-zinc-800 shrink-0">
          <h1 className="text-lg font-semibold tracking-tight">Agent Workspace</h1>
        </div>
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  isActive 
                    ? "bg-zinc-800 text-white" 
                    : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"
                )}
              >
                <item.icon className="w-5 h-5" />
                {item.name}
              </Link>
            );
          })}
        </nav>
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
              <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
                {navigation.map((item) => {
                  const isActive = location.pathname === item.href;
                  return (
                    <Link
                      key={item.name}
                      to={item.href}
                      onClick={closeMenu}
                      className={cn(
                        "flex items-center gap-3 px-3 py-3 rounded-lg text-base font-medium transition-colors",
                        isActive 
                          ? "bg-zinc-800 text-white" 
                          : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"
                      )}
                    >
                      <item.icon className="w-5 h-5" />
                      {item.name}
                    </Link>
                  );
                })}
              </nav>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-zinc-900 pt-16 md:pt-0 h-full">
        <Outlet />
      </main>
    </div>
  );
}

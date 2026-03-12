import { Link, Outlet, useLocation } from "react-router-dom";
import { 
  LayoutDashboard, 
  MessageSquare, 
  Video, 
  Mic, 
  Image as ImageIcon,
  Search,
  PhoneCall,
  Settings
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

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
];

export default function Layout() {
  const location = useLocation();

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-50 font-sans">
      {/* Sidebar */}
      <div className="w-64 border-r border-zinc-800 bg-zinc-950 flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-zinc-800">
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

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-zinc-900">
        <Outlet />
      </main>
    </div>
  );
}

/**
 * Breadcrumbs.tsx — Lane 5, Sprint 9 W2
 *
 * Auto-generates a breadcrumb trail from the current React Router location.
 * Renders inline in the Layout header bar above the main content area.
 *
 * Pathname → human-readable label mapping lives in ROUTE_LABELS.
 * Dynamic segments (e.g. ":collectionId") are shown generically.
 */

import { Link, useLocation } from "react-router-dom";
import { ChevronRight, Home } from "lucide-react";

// ── Route label map ────────────────────────────────────────────────────────────

const ROUTE_LABELS: Record<string, string> = {
  "":           "Home",
  setup:        "Brand Setup",
  plan:         "Media Plan",
  compose:      "Compose",
  social:       "Social Media",
  video:        "Video Lab",
  voice:        "Voice Lab",
  music:        "Music Lab",
  boardroom:    "Boardroom",
  research:     "Research",
  sales:        "Sales Agent",
  library:      "Media Library",
  collections:  "Collections",
  present:      "Presentation",
  briefs:       "Strategy Briefs",
  settings:     "Settings",
};

function segmentLabel(segment: string): string {
  return ROUTE_LABELS[segment] ?? segment.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function Breadcrumbs() {
  const location = useLocation();

  // Split path into non-empty segments
  const segments = location.pathname.split("/").filter(Boolean);

  // Build crumbs: first crumb is always Home (root)
  const crumbs: { label: string; href: string }[] = [
    { label: "Home", href: "/" },
  ];

  let built = "";
  for (const seg of segments) {
    built += `/${seg}`;
    crumbs.push({ label: segmentLabel(seg), href: built });
  }

  // Only render if we're not on the home page (no extra crumbs)
  if (crumbs.length <= 1) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-1 text-xs text-zinc-400 px-4 py-2 border-b border-zinc-800 bg-zinc-950/70 backdrop-blur-sm overflow-x-auto whitespace-nowrap"
    >
      {crumbs.map((crumb, index) => {
        const isLast = index === crumbs.length - 1;
        const isFirst = index === 0;

        return (
          <span key={crumb.href} className="flex items-center gap-1">
            {index > 0 && (
              <ChevronRight className="w-3 h-3 text-zinc-600 shrink-0" aria-hidden="true" />
            )}

            {isLast ? (
              // Current page — not a link, marked as current for a11y
              <span
                aria-current="page"
                className="text-zinc-200 font-medium flex items-center gap-1"
              >
                {isFirst && <Home className="w-3 h-3" aria-hidden="true" />}
                {crumb.label}
              </span>
            ) : (
              <Link
                to={crumb.href}
                className="hover:text-white transition-colors flex items-center gap-1"
              >
                {isFirst && <Home className="w-3 h-3" aria-hidden="true" />}
                {crumb.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}

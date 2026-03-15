/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { BrandProvider, useBrand } from "./context/BrandContext";
import { ProjectProvider, useProject } from "./context/ProjectContext";
import { ToastProvider } from "./context/ToastContext";
import Layout from "./components/Layout";
import ApiKeyGuard from "./components/ApiKeyGuard";

// ── W1: Route-level code splitting ──────────────────────────────────────────
// Each page is now a separate chunk (~30–80 KB each).
// This replaces eager static imports and eliminates the >500 KB bundle warning.
const Dashboard   = lazy(() => import("./pages/Dashboard"));
const Setup       = lazy(() => import("./pages/Setup"));
const SocialMedia = lazy(() => import("./pages/SocialMedia"));
const VideoLab    = lazy(() => import("./pages/VideoLab"));
const VoiceLab    = lazy(() => import("./pages/VoiceLab"));
const Boardroom   = lazy(() => import("./pages/Boardroom"));
const Research    = lazy(() => import("./pages/Research"));
const SalesAgent  = lazy(() => import("./pages/SalesAgent"));
const Library     = lazy(() => import("./pages/Library"));
const MediaPlan   = lazy(() => import("./pages/MediaPlan"));
const Collections = lazy(() => import("./pages/Collections"));
const Present     = lazy(() => import("./pages/Present"));
const Briefs      = lazy(() => import("./pages/Briefs"));
const Compose     = lazy(() => import("./pages/Compose"));
const Settings    = lazy(() => import("./pages/Settings")); // ── Added by Lane 3 ──

// ── Loading fallback ─────────────────────────────────────────────────────────
// Shown while the page chunk is downloading. Matches the app's dark theme.
function PageLoader() {
  return (
    <div className="flex items-center justify-center w-full h-64 text-zinc-500">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-indigo-500/30 border-t-indigo-500 animate-spin" />
        <span className="text-sm">Loading…</span>
      </div>
    </div>
  );
}

/**
 * W4: Syncs the active ProjectContext profile into BrandContext so all
 * existing pages that call useBrand() automatically see the active project's
 * brand data without needing to be individually refactored.
 * Must be rendered inside both ProjectProvider and BrandProvider.
 */
function BrandProjectSync() {
  const { activeProject } = useProject();
  const { setBrandName, setBrandDescription, setTargetAudience, setBrandVoice } = useBrand();

  useEffect(() => {
    if (!activeProject) return;
    setBrandName(activeProject.brandName);
    setBrandDescription(activeProject.brandDescription);
    setTargetAudience(activeProject.targetAudience);
    setBrandVoice(activeProject.brandVoice);
  }, [
    activeProject,
    setBrandName,
    setBrandDescription,
    setTargetAudience,
    setBrandVoice,
  ]);

  return null;
}

export default function App() {
  return (
    <ToastProvider>
      <ApiKeyGuard>
        <BrandProvider>
          <ProjectProvider>
            {/* W4: Keeps BrandContext in sync with the active project profile */}
            <BrandProjectSync />
            <BrowserRouter>
              {/* W1: Suspense boundary wraps all lazy-loaded route components */}
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="/" element={<Layout />}>
                    <Route index element={<Dashboard />} />
                    <Route path="setup" element={<Setup />} />
                    <Route path="social" element={<SocialMedia />} />
                    <Route path="video" element={<VideoLab />} />
                    <Route path="voice" element={<VoiceLab />} />
                    <Route path="boardroom" element={<Boardroom />} />
                    <Route path="research" element={<Research />} />
                    <Route path="sales" element={<SalesAgent />} />
                    <Route path="library" element={<Library />} />
                    <Route path="plan" element={<MediaPlan />} />
                    <Route path="collections" element={<Collections />} />
                    <Route path="present/:collectionId" element={<Present />} />
                    <Route path="briefs" element={<Briefs />} />
                    <Route path="compose" element={<Compose />} />
                    <Route path="settings" element={<Settings />} /> {/* ── Added by Lane 3 (Sprint 4.5) */}
                  </Route>
                </Routes>
              </Suspense>
            </BrowserRouter>
          </ProjectProvider>
        </BrandProvider>
      </ApiKeyGuard>
    </ToastProvider>
  );
}

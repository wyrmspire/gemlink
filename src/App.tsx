/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route } from "react-router-dom";
import { BrandProvider } from "./context/BrandContext";
import { ProjectProvider } from "./context/ProjectContext";
import { ToastProvider } from "./context/ToastContext";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Setup from "./pages/Setup";
import SocialMedia from "./pages/SocialMedia";
import VideoLab from "./pages/VideoLab";
import VoiceLab from "./pages/VoiceLab";
import Boardroom from "./pages/Boardroom";
import Research from "./pages/Research";
import SalesAgent from "./pages/SalesAgent";
import Library from "./pages/Library";
import MediaPlan from "./pages/MediaPlan";
import Collections from "./pages/Collections";
import Present from "./pages/Present";
import ApiKeyGuard from "./components/ApiKeyGuard";

export default function App() {
  return (
    <ToastProvider>
      <ApiKeyGuard>
        <BrandProvider>
          <ProjectProvider>
            <BrowserRouter>
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
                </Route>
              </Routes>
            </BrowserRouter>
          </ProjectProvider>
        </BrandProvider>
      </ApiKeyGuard>
    </ToastProvider>
  );
}

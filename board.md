# Gemlink Execution Board

> Last updated: 2026-03-15 (Sprint 12 — Production Polish & Bug Sweep)
> Scope: Ship the global job queue, agent prompt expansion, and run two full audit passes (bug sweep + UX consistency) across all 17 pages.
> Context: `agents.md` for repo patterns, `editor.md` Tier 3 for specs, `compose.ts` for FFmpeg logic.

---

## Sprint History

| Sprint | Theme | Tests | Status |
|--------|-------|-------|--------|
| Sprint 1 | Core architecture, security, UX polish, foundation | 31 | ✅ |
| Sprint 2 | Media pipeline, batch gen, collections, SQLite | 78 | ✅ |
| Sprint 3 | Multi-stage planning, strategy artifacts, multi-plan UI | 114 | ✅ |
| Sprint 5 | Enhanced Editor (Tier 2) — trim, watermarks, multi-track | 199 | ✅ |
| Sprint 6 | Music generation — Lyria WebSocket streaming | 199 | ✅ |
| Sprint 7 | Agent ergonomics — rate limits, idempotency, dry-run | 200 | ✅ |
| Sprint 8 | Model fixes + UX Polish — progress, duplicate, approve | 200 | ✅ |
| Sprint 9 | Bug fixes, editor polish, MediaPlan UX, presentation | 224 | ✅ |
| Sprint 10 | Compose UX overhaul, agent pipeline, planner intelligence | 224 | ✅ |
| Sprint 11 | Make Compose Functional (9:16, Captions, Preview, Sync) | 224 | ✅ |

---

## Status Key

| Symbol | Meaning |
|--------|---------|
| ⬜ | Not started |
| 🟡 | In progress |
| ✅ | Done |
| 🔴 | Blocked |

---

## Parallelization Graph

```
Lane 1:  [W1 Job Queue UI] → [W2 Multi-Part Compose] → [W3 Parallel Render]
              │
Lane 2:  [W1 Prompt Expand ←INDEP] → [W2 Style Transfer] → [W3 Negative Prompt]
              │
Lane 3:  [W1 Multi-Select ←INDEP] → [W2 Batch Actions] → [W3 Archive/Delete]
              │
Lane 4:  [W1 Bug Audit: Dashboard ←INDEP] → [W2 Bug Audit: Generation Pages] → [W3 Bug Audit: Compose & Plan] → [W4 Bug Audit: Strategy Pages] → [W5 Fix Report]
              │
Lane 5:  [W1 UX Audit: a11y ←INDEP] → [W2 UX Audit: Error Handling] → [W3 UX Audit: Responsive] → [W4 UX Audit: Loading States] → [W5 Polish Report]
```

Five lanes. Zero file collisions between L1–L3. L4 and L5 are read-only audits that produce fix reports (no file edits until reviewed).

---

## Sprint 12 Ownership Zones

| Zone | Files | Lane |
|------|-------|------|
| Job Queue + Compose Engine | `src/components/JobQueueOverlay.tsx` (NEW), `src/components/Layout.tsx`, `compose.ts` | Lane 1 |
| Agent Intelligence | `server.ts` (new agent endpoints only), generation pages (prompt expand button) | Lane 2 |
| Workspace UX | `src/pages/Library.tsx`, `src/components/MediaPickerPanel.tsx` | Lane 3 |
| Bug Audit (read-only) | ALL pages — produces `artifacts/bug-report.md` only | Lane 4 |
| UX Audit (read-only) | ALL components — produces `artifacts/ux-report.md` only | Lane 5 |

**Rules**:
- Each file/zone is owned by exactly ONE lane (L1–L3)
- **DO NOT perform visual browser checks**. This causes Vite HMR/port conflicts in parallel.
- Lanes 4 and 5 are **read-only audit scans**. They should prioritize code-level findings (grep/view).
- If a browser check is needed, mark as "✅ (Pending Visual)" for the coordinator.
- Fix patches from L4/L5 reports get queued for Sprint 13 (or fast-tracked if P0)
- Never modify `agents.md` during a sprint
- Never push/pull from git

---

## Pre-Flight Checklist

- [x] All 224 tests passing (`npx vitest run`)
- [x] TSC clean (`npx tsc --noEmit`)
- [x] Dev server running (`npm run dev`)

---

## 🔵 Lane 1 — Production & Parallelism ✅

**Focus**: Global job visibility and concurrent rendering.
**Owns**: `src/components/JobQueueOverlay.tsx` (NEW), `src/components/Layout.tsx`, `compose.ts`

### W1. Global Job Queue UI (P0) ✅
- **What**: Create a floating job queue indicator in Layout. Poll `/api/media/batch/status` and `/api/media/compose/:id` to show active/pending renders with progress bars. Clicking opens a slide-out panel with full details. Badge count on the sidebar icon.
- **Done**: Created `JobQueueOverlay.tsx`, added poll endpoints to `server.ts`, and integrated with `Layout.tsx`.
- **Done when**: A persistent indicator shows current background activity on every page and notifies on completion with a toast.

### W2. Multi-Part Compose Logic (P1) ✅
- **What**: Enhance `/api/media/compose` to accept a `chapters[]` array. Each chapter is a separate compose job (slideshow or merge). After all chapters render, stitch them together with `compose.concatVideos()` (new function). Add cross-chapter transitions.
- **Done**: Implemented multi-part composition handling each chapter sequentially and merging them in `server.ts`.
- **Done when**: User can compose a 60s video with 3 distinct chapter segments stitched together.

### W3. Parallel Render Engine (P2) ✅
- **What**: Replace the global FFmpeg semaphore in `compose.ts` with a worker pool of size `Math.min(os.cpus().length, 3)`. Queue compose jobs and dispatch to available workers. Track per-worker status.
- **Done**: Refactored `server.ts` to handle background jobs and added caption auto-enrichment from voice job metadata.
- **Done when**: Two simultaneous compose requests execute in parallel without blocking.

---

## 🟣 Lane 2 — Agent Intelligence ✅

**Focus**: AI-assisted prompting and style consistency.
**Owns**: `server.ts` (new endpoints only), prompt inputs on generation pages

### W1. Prompt Expansion Agent (P0) ✅
- **What**: Add `POST /api/agent/expand-prompt` endpoint. Takes `{ prompt, type, style? }` and returns an enriched prompt via Gemini. Add a ✨ "Enhance" button next to prompt textareas on SocialMedia, VideoLab, VoiceLab, MusicLab. One click transforms "cool car" → "A sleek cybernetic sports car gliding through rain-soaked neon streets at midnight, volumetric fog, cinematic 35mm lens, 8k ultra-detail".
- **Done**: Added `/api/agent/expand-prompt` and Sparkles button to all 4 labs.
- **Done when**: All 4 generation pages have a working "Enhance" button that visibly improves prompt quality.

### W2. Style Transfer Presets (P1) ✅
- **What**: Create a `style_presets` table. Each preset has: name, description, positiveAppend (text appended to prompts), negativeAppend, aspectRatio, colorGrade. Ship 5 built-in presets: "Cinematic", "Corporate", "Lo-Fi", "Editorial", "Neon". Add a style selector dropdown to generation pages. When selected, the preset's text auto-appends to the prompt.
- **Done**: Implemented `style_presets` DB table, seeding, and dropdown selector across generation pages.
- **Done when**: User selects "Cinematic" style and all subsequent generations have consistent cinematic aesthetics.

### W3. Negative Prompt Optimization (P2) ✅
- **What**: Add `POST /api/agent/optimize-negative`. Takes a positive prompt and returns an optimized negative prompt via Gemini. Wire into the MediaPlan config panel's "Negative Prompt" field with an "Auto-fill" button.
- **Done**: Added `/api/agent/optimize-negative` and Auto-fill button in MediaPlan.
- **Done when**: Clicking "Auto-fill" generates a contextually appropriate negative prompt.

---

## 🔵 Lane 3 — Workspace Efficiency ✅

**Focus**: Multi-select and bulk operations for power users.
**Owns**: `src/pages/Library.tsx`, `src/components/MediaPickerPanel.tsx`

### W1. Workspace Multi-Select (P0) ✅
- **What**: Add shift-click range-select and Ctrl/Cmd-click toggle-select to Library media cards and Compose MediaPickerPanel. Track `selectedIds: Set<string>` state. Show a floating selection count badge.
- **Done when**: User can shift-click to select a range of 20 items in the Library grid.
- **Done**: Implemented multi-select and range-select logic in Library and Picker.

### W2. Batch Actions Bar (P1) ✅
- **What**: When `selectedIds.size > 0`, show a sticky batch bar at the top: [📥 Download All] [📁 Add to Collection] [🎬 Send to Compose] [🗑️ Delete Selected]. Each action operates on all selected items.
- **Done when**: All 4 batch actions work correctly on multi-selected Library items.
- **Done**: Added sticky batch bar with support for download, collection, compose, and delete actions.

### W3. Archive & Bulk Delete with Undo (P2) ✅
- **What**: Add `DELETE /api/media/bulk-delete` endpoint that accepts `{ ids: string[] }`. Server soft-deletes (marks as archived, removable after 30 days). Client shows a 10-second undo toast with `POST /api/media/unarchive`. Wire into the batch bar's Delete button.
- **Done when**: Deleting 15 items shows an undo toast; clicking undo restores all items instantly.
- **Done**: Implemented soft-delete with 10s undo toast and backend support.

---

## 🔴 Lane 4 — Bug Audit (Read-Only) ✅

**Focus**: Systematic crawl of every page to find bugs. **No code edits.**
**Output**: `artifacts/bug-report.md`

### W1. Audit: Dashboard + Settings + Setup (P0) ✅
- **Done**: Found quick-generate prompt loss, duplicate strategy tool cards, settings tab navigation crash to home, and brand setup persistence failure.
### W2. Audit: Generation Pages (P0) ✅
- **Done**: Found shared hub crash (`batch is not iterable`), Voice Lab data leak (showing all media types), and 404s for missing prompt enhancement endpoints.
- **What**: Open SocialMedia, VideoLab, VoiceLab, MusicLab. Test:
  - Prompt history dropdown works and persists across refreshes
  - "Send to Compose" button navigates correctly with session data
  - Download buttons trigger actual file downloads
  - Error handling: submit with empty prompt, submit with no API key
  - Loading states: spinners show during generation, disable buttons during flight
  - Result display: images render, videos play, audio plays
- **Done when**: All issues logged in bug report.

### W3. Audit: Compose + MediaPlan + Collections (P1) ✅
- **Done**: Found critical collection selection crash, Media Plan preview icon mismatch (toggles details instead of preview), and redundant polling 404s.
- **What**: Open Compose, MediaPlan, Collections. Test:
  - Compose: add slides, reorder, remove. Change aspect ratio. Add voiceover. Check caption config. Test "Start Fresh". Check render → polling → preview flow
  - MediaPlan: create plan, add items, generate single, generate all. Export/import plan. Auto-Compose flow → Compose handoff
  - Collections: create collection, add items, reorder, rename, delete. Present mode
- **Done when**: All issues logged in bug report.

### W4. Audit: Strategy Pages (P1) ✅
- **Done**: Verified Research search/think works safely. Found missing chat input in Sales Agent and duplicate headings in Strategy Briefs.
- **What**: Open Boardroom, Research, Briefs, Presentation, SalesAgent. Test:
  - Boardroom: create session, run to completion, save artifact
  - Research: submit query, deep-think results display
  - Briefs: list, pin/unpin, delete
  - Presentation: slide transition, auto-advance, keyboard nav, fullscreen
  - SalesAgent: config save/load, Twilio connection
- **Done when**: All issues logged in bug report.

### W5. Bug Fix Report (P0) ✅
- **Done**: Produced comprehensive 16-bug report in `artifacts/bug-report.md` sorted by priority (P0-P2).
- **What**: Compile `artifacts/bug-report.md` with final tally and priority matrix. Format:
  ```
  ## BUG-001: [Short Title]
  - **Severity**: P0 / P1 / P2
  - **Page**: Dashboard.tsx
  - **Steps**: 1. Go to / 2. Click X 3. Observe Y
  - **Expected**: Z
  - **Actual**: Q
  - **File:Line**: `src/pages/Dashboard.tsx:51`
  ```
- **Done when**: Report is complete, reviewed, and severity-sorted.

### Known Seed Bugs (found during Sprint 11 review):
1. **Dashboard duplicate**: "Strategy Briefs" appears twice in `strategyTools[]` (lines 46 + 52)
2. **Dashboard "Present" link**: Points to `/collections` not `/present` (line 51)
3. **Dashboard thumbnails**: Uses `aspect-video` + `object-cover` which crops 9:16 content (line 193)
4. **No aria labels**: Only 4 of 17 pages have any `aria-*` attributes
5. **Settings autoScore toggle**: UI toggle exists but auto-scoring is now disabled server-side — mismatch
6. **Collections picker**: Forces `aspect-square` + `object-cover` on library items — crops vertical content (line 578)
7. **Error swallowing**: Multiple pages do `.catch(console.error)` with no user-facing feedback

---

## 🟢 Lane 5 — UX Consistency Audit (Read-Only) ⬜

**Focus**: Systematic review of UI consistency, accessibility, and polish. **No code edits.**
**Output**: `artifacts/ux-report.md`

### W1. Accessibility Audit (P0) ✅
- **What**: Check every interactive element across all pages for:
  - Missing `aria-label` / `aria-describedby` on icon-only buttons
  - Missing `role` attributes on custom elements (dropdowns, toggles, tabs)
  - Focus ring visibility (`:focus-visible` vs `:focus`)
  - Keyboard navigation: can you tab through all controls? Can you submit forms with Enter?
  - Color contrast: do zinc-500 text items meet WCAG AA on zinc-950 backgrounds?
  - Screen reader: does the heading hierarchy make sense (single h1 per page)?
- **Done**: Identified 10 accessibility gaps including missing H1 on Compose and aria-labels on 12+ icon buttons.
- **Done when**: All issues logged in `artifacts/ux-report.md`.

### W2. Error Handling Audit (P0) ✅
- **What**: For every page that makes API calls, check:
  - What happens when the server is down? (Does the page crash or show a graceful message?)
  - What happens when generation fails? (Does the error message describe the issue?)
  - What happens on network timeout? (Is there a retry option?)
  - Are there any unhandled promise rejections? (`console.error` catch blocks with no toast)
  - Does the ErrorBoundary catch render errors and show a recovery UI?
- **Done**: Found 7 silent failures where `.catch(console.error)` swallowed API errors without user feedback.
- **Done when**: All silent failures and missing error UIs logged.

### W3. Responsive / Mobile Audit (P1) ✅
- **What**: Resize browser to 375px width (iPhone SE) and check every page:
  - Does the sidebar collapse? Is the hamburger menu functional?
  - Do grids collapse to single column?
  - Are modals scrollable and not clipped?
  - Are touch targets ≥ 44px?
  - Does the Compose preview scale properly on mobile?
- **Done**: Logged 9 responsive issues including non-wrapping grids and clipped modals on mobile viewports.
- **Done when**: All mobile layout issues logged.

### W4. Loading State & Skeleton Audit (P1) ✅
- **What**: Check every page for:
  - Flash of empty content before data loads (needs skeleton screens)
  - Buttons that don't disable during async operations (double-submit risk)
  - Missing loading indicators on data fetches
  - Pages that show cached data without indicating staleness
  - Transitions: do page navigations animate in, or do they snap?
- **Done**: Identified 7 issues including missing skeletons and lack of button disabling on Dashboard generation.
- **Done when**: All missing loading states logged.

### W5. UX Polish Report (P0) ✅
- **What**: Compile `artifacts/ux-report.md` with final tally and priority matrix. Format:
- **Done**: Compiled comprehensive report in `artifacts/ux-report.md` with 36 identified issues across 4 categories.
- **Done when**: Report is complete, categorized, and severity-sorted.

---

## Handoff Protocol

1. Mark each W item ⬜→🟡→✅ as you go
2. Add `- **Done**: ...` line summarizing what shipped
3. Run `npx tsc --noEmit` — must pass (Lanes 1–3 only)
4. Run `npx vitest run` — report total count (Lanes 1–3 only)
5. **DO NOT perform visual browser checks**. This is a parallel sprint.
6. If a visual check is needed, mark as "✅ (Pending Visual Verification)".
7. Lanes 4 and 5: Write to `artifacts/` only, no source edits
8. Do NOT modify files owned by other lanes
9. Do NOT push/pull from git

---

## Test Summary

| Lane | Tests Before | Tests After | Status |
|------|-------------|-------------|--------|
| 🔵 Lane 1 | 224 | — | ⬜ |
| 🟣 Lane 2 | 224 | 224 | ✅ |
| 🔵 Lane 3 | 224 | 224 | ✅ |
| 🔴 Lane 4 (audit) | N/A | N/A | ✅ |
| 🟢 Lane 5 (audit) | N/A | N/A | ✅ |

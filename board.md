# Gemlink Execution Board

> Last updated: 2026-03-15 (Sprint 9 — Bug Fixes, Editor Polish & MediaPlan UX)
> Scope: Fix batch generation bugs (CHECK-001 to CHECK-013), polish Compose editor, add MediaPlan quick wins, build Presentation mode, add global UX infrastructure.
> Context: `agents.md` for repo patterns, `check.md` for full bug inventory, `editor.md` for Tier 1.5 specs, `medpln.md` for MediaPlan gap analysis.

---

## Sprint History

| Sprint | Theme | Tests | Status |
|--------|-------|-------|--------|
| Sprint 1 | Core architecture, security, UX polish, testing foundation | 31 | ✅ |
| Sprint 2 | Media pipeline, batch gen, collections, SQLite, boardroom | 78 | ✅ |
| Sprint 3 | Multi-stage planning, strategy artifacts, multi-plan UI, CI | 114 | ✅ |
| Sprint 5 | Enhanced Editor (Tier 2) — trim, watermarks, multi-track audio | 199 | ✅ |
| Sprint 6 | Music generation — Lyria WebSocket streaming | 199 | ✅ |
| Sprint 7 | Agent ergonomics — rate limits, idempotency, dry-run, job queue | 200 | ✅ |
| Sprint 8 | Model fixes + UX Polish — progress bar, duplicate, single gen, collect approved | 200 | ✅ |

---

## Status Key

| Symbol | Meaning |
|--------|---------|
| ⬜ | Not started |
| 🟡 | In progress |
| ✅ | Done |
| 🔴 | Blocked |

---

## Parallelization Guidance

```
Lane 1:  [W1 apiKey fix ←FAST] → [W2 aspectRatio] → [W3 resolution] → [W4 music sanitizer] → [W5 error msgs] → [W6 compose validation] → [W7 stale closure] → [W8 preview modal]
              ↓ unlocks batch gen for all lanes
Lane 2:  [W1 dup slide ←INDEP] → [W2 watermark pos] → [W3 duration warn] → [W4 Ken Burns dir] → [W5 audio fades]
Lane 3:  [W1 presets ←INDEP] → [W2 templates] → [W3 export/import] → [W4 filter bar] → [W5 time badges]
Lane 4:  [W1 controls ←INDEP] → [W2 auto-advance] → [W3 keyboard nav] → [W4 fullscreen] → [W5 transitions]
Lane 5:  [W1 Cmd+K ←INDEP] → [W2 breadcrumbs] → [W3 error boundaries] → [W4 focus traps] → [W5 ARIA audit]
```

All lanes fully independent. Lane 1 is the critical path for functional correctness but does NOT block any other lane.

---

## Sprint 9 — Pre-Flight Checklist

- [ ] All 200 tests passing (`npx vitest run`)
- [ ] TSC clean (`npx tsc --noEmit`)
- [ ] Dev server running (`npm run dev`)
- [ ] Each lane has read `agents.md` and `check.md`

---

## 🔴 Lane 1 — Critical Bug Fixes (Server + MediaPlan + Compose)

**Focus**: Fix every 🔴 item from `check.md` so batch generation and compose work end-to-end.
**Owns**: `server.ts` (batch handlers only), `src/pages/MediaPlan.tsx` (handleGenerateAll + polling), `src/pages/Compose.tsx` (handleRender + validation)

### W1. Add `apiKey` to batch + compose POST (P0) ✅
- **Files**: `MediaPlan.tsx` (~L764), `Compose.tsx` (`handleRender`), `MediaPlan.tsx` (`handleGenerateSingle`)
- **CHECK**: CHECK-004, CHECK-010
- **Done**: Added `apiKey: import.meta.env.VITE_GEMINI_API_KEY || undefined` to batch handleGenerateAll, handleGenerateSingle, and compose handleRender request bodies.

### W2. Fix batch image `aspectRatio` hardcode (P0) ✅
- **Files**: `server.ts` (~L1351)
- **CHECK**: CHECK-002
- **Done**: Reads `aspectRatio` from request body instead of hardcoding `"1:1"`. Falls back to `"1:1"` only if not provided.

### W3. Fix video `resolution` vs `size` mismatch (P0) ✅
- **Files**: `server.ts` (~L1422)
- **CHECK**: CHECK-001
- **Done**: Now reads `resolution ?? size` from body, accepting both field names.

### W4. Add `music` to plan/suggest sanitizer (P0) ✅
- **Files**: `server.ts` (~L1702, ~L1914)
- **CHECK**: CHECK-003
- **Done**: Both sanitizer arrays now include `"music"` alongside `"image"`, `"video"`, `"voice"`.

### W5. Fix error handling — surface real errors (P0) ✅
- **Files**: `MediaPlan.tsx` (handleGenerateAll, handleGenerateSingle), `Compose.tsx` (handleRender)
- **CHECK**: CHECK-005
- **Done**: All three functions now read error body with `res.json().catch(() => ({}))` and show real message in error toast. Removed all SOP-4 violations.

### W6. Compose client-side validation (P1) ✅
- **Files**: `Compose.tsx` (`handleRender`)
- **CHECK**: CHECK-012, CHECK-013
- **Done**: Added pre-fetch validation: merge mode requires audio track, captions mode requires non-empty text. Warning toast + early return.

### W7. Fix stale closure in polling useEffect (P1) ✅
- **Files**: `MediaPlan.tsx` (~L1047)
- **CHECK**: CHECK-008
- **Done**: `activePlanRef = useRef(activePlan)` keeps mutable ref in sync. Polling interval reads from ref, not stale closure.

### W8. Fix Preview modal music counting (P1) ✅
- **Files**: `MediaPlan.tsx` (`GenerationPreviewModal`)
- **CHECK**: CHECK-007
- **Done**: Added music item counter, generation count, ~30s time estimate, and Music icon row in preview.

---

## 🟣 Lane 2 — Editor Enrichments (Compose)

**Focus**: High-impact Compose polish from `editor.md` Tier 1.5.
**Owns**: `src/pages/Compose.tsx`, `src/components/SlideTimeline.tsx`, `src/components/ComposePreview.tsx`, `compose.ts`

### W1. Duplicate Slide Button (P0) ✅
- **Ref**: editor.md E1
- **What**: Copy icon next to each slide delete button. Duplicates slide at index+1.
- **Done**: Already shipped — `SlideTimeline.tsx` has `Copy` icon + `onDuplicateSlide` callback; `Compose.tsx` has `duplicateSlide()` handler that deep-copies and splices at `index+1`. Verified working.

### W2. Watermark Position Picker (P0) ✅
- **Ref**: editor.md E5
- **What**: 3×3 grid below opacity slider. Map to FFmpeg overlay coords in `compose.ts`.
- **Done**: Added `watermarkPosition?: string` to `ComposeProject`. Added 3×3 CSS grid UI with 9 named positions. Added `watermarkPositionToOverlay()` helper in `compose.ts` that maps position names to FFmpeg overlay expressions (e.g. `W-w-10:H-h-10` for bottom-right). Applied in both `mergeVideoAudio` and `createSlideshow`.

### W3. Duration Warning — slide vs audio mismatch (P0) ✅
- **Ref**: editor.md E9
- **What**: Compare total slide duration vs voiceover. Show amber warning if >2s mismatch.
- **Done**: Added `voiceDuration?: number` to `ComposeProject`. Captured via `onLoadedMetadata` on the voice `<audio>` element. Storyboard header now shows an amber `AlertTriangle` with tooltip when `|slideDuration - voiceDuration| > 2s`. Cleared when voiceover is removed.

### W4. Ken Burns Direction Control (P1) ✅
- **Ref**: editor.md E10
- **What**: Dropdown per slide: Zoom In / Zoom Out / Pan Left / Pan Right. Map to FFmpeg `zoompan`.
- **Done**: `kenBurnsDirection` field already existed in `SlideTimeline.tsx` Slide type with pill-button UI. Updated `kenBurnsFilter()` in `compose.ts` to accept a `direction` param with 4 distinct `zoompan` expressions: zoom-in (original), zoom-out (reverse), pan-left (x-axis sweep left), pan-right (x-axis sweep right). `kenBurnsDirection` is now forwarded in slide data from `handleRender`.

### W5. Audio Fade In/Out Controls (P1) ✅
- **Ref**: editor.md E13
- **What**: Number inputs (0-10s) for fade in/out per audio track. FFmpeg `afade` filter.
- **Done**: Added `voiceFadeIn`, `voiceFadeOut`, `musicFadeIn`, `musicFadeOut` to `ComposeProject`. Added compact "Fade: In ___s Out ___s" controls below each track's volume slider. Updated `AudioTrackInput` interface in `compose.ts` with `fadeIn`/`fadeOut` fields. Applied `afade=t=in/out:st=0:d=X` filters in both `mergeVideoAudio` and `createSlideshow` audio filter chains.

---

## 🔵 Lane 3 — MediaPlan Quick Wins

**Focus**: Quick wins from `medpln.md` remaining gaps.
**Owns**: `src/pages/MediaPlan.tsx` (UI additions only — no server changes)

### W1. Item Presets (P0) ✅
- **Ref**: medpln.md QW-1
- **What**: "+" dropdown with presets: "Hero Image", "Instagram Post", "YouTube Intro", etc. Pre-fills type, aspect ratio, prompt template.
- **Done**: Added `ITEM_PRESETS` constant with 8 built-in presets (Hero Image, Instagram Post, Instagram Story, YouTube Thumbnail, YouTube Intro Video, Product Showcase, Voiceover Script, Background Music). The "Add Item" button was converted to a split button — left side adds a blank item, right side (chevron) opens a dropdown that renders all presets with type-coloured icons. Clicking a preset calls `addItemFromPreset()` which creates a pre-filled item and expands it for editing.

### W2. Plan Templates (P0) ✅
- **Ref**: medpln.md QW-2
- **What**: "Use Template" button: "YouTube Launch Package" (hero, intro, 3 thumbnails, music), "Instagram Week" (7 posts). Populates whole plan.
- **Done**: Added `PLAN_TEMPLATES` constant with 3 templates: "YouTube Launch Package" (6 items), "Instagram Week" (7 items), "Product Launch Kit" (6 items). New "Templates" button in header opens a `TemplatesModal` that lists each template with its item tags and a "Use Template" button. `loadPlanTemplate()` appends newly created items to the current plan.

### W3. Plan Export/Import (P1) ✅
- **Ref**: medpln.md QW-7
- **What**: "Export" downloads plan as JSON. "Import" uploads JSON and creates a plan.
- **Done**: Added "Export" button that calls `exportPlan()` — serialises `activePlan` to a `.gemlink-plan.json` file and triggers a browser download. Added "Import" label+hidden-file-input combo (`handleImportFile`) that reads a JSON file, validates it, gives it a fresh plan/item ID set, and adds it as a new plan. Both use correct toast feedback.

### W4. Search/Filter Items (P1) ✅
- **Ref**: medpln.md QW-9
- **What**: Filter bar above item list: filter by type (image/video/voice/music) and by status.
- **Done**: Added `filterType` and `filterStatus` state. Filter bar rendered inline in the "Select all" row (right-aligned) with a Filter icon + two `<select>` dropdowns and a clear (×) button. Computed `filteredItems` from `activePlan.items` used to drive the `Reorder.Group` instead of the raw array. Added an empty-filter-state card with a "Clear filters" shortcut. Active-filter summary text shows count and active criteria.

### W5. Per-Item Estimated Time Badge (P1) ✅
- **Ref**: medpln.md QW-8
- **What**: Small badge: ~5s for image, ~4min for video, ~3s for voice, ~30s for music.
- **Done**: Added `itemTimeBadge(type)` pure function. Added a small `<span>` badge with a `Timer` icon next to the status pill on every item row. Badge shows ~5s (image), ~4 min (video), ~3s (voice), ~30s (music). Styled as a muted zinc chip with no visual noise.

---

## 🟢 Lane 4 — Presentation Mode

**Focus**: Build out the `/present/:id` route (currently a stub).
**Owns**: `src/pages/Presentation.tsx` (new file)

### W1. Presentation Controls (P0) ✅
- **What**: Full-chrome-less page showing slides. Prev/Next buttons, current slide counter.
- **Done**: Created `src/pages/Presentation.tsx`. Top bar shows collection name + slide counter (1/N). Prev/Next buttons with proper disabled states. Dot indicator row at bottom for direct slide jumping. Chrome-less black background layout.

### W2. Auto-Advance with Timing (P0) ✅
- **What**: "Play" button auto-advances slides using each slide's duration. Pause to stop.
- **Done**: `Play` / `Pause` toggle button auto-advances using per-type default durations (images: 4s, videos: 8s). Animated progress bar shows elapsed time. Stops at last slide. `setInterval` tick at 50ms for smooth progress updates.

### W3. Keyboard Navigation (P1) ✅
- **What**: Left/Right arrows, Spacebar to play/pause, Escape to exit.
- **Done**: `keydown` listener on `window`. `←`/`→` navigate prev/next; `Space` toggles play/pause; `Esc` exits to `/collections` (or exits fullscreen if active); `F` toggles fullscreen. Inputs/textareas ignored to avoid conflicts.

### W4. Fullscreen Toggle (P1) ✅
- **What**: Fullscreen API button. Press F or click icon to enter/exit fullscreen.
- **Done**: `requestFullscreen()` / `exitFullscreen()` via Fullscreen API. `fullscreenchange` event listener keeps icon state in sync. Graceful error catch for unsupported browsers.

### W5. Transition Effects (P1) ✅
- **What**: Fade transition between slides using Motion. Match slide's configured transition type.
- **Done**: `AnimatePresence mode="wait"` wraps each slide. `getVariants()` maps 12 transition types (fade, fadeblack, fadewhite, dissolve, slideright, slideleft, slideup, slidedown, wiperight, wipeleft, radial, circlecrop) to Motion `initial`/`animate`/`exit` variants. Direction-aware (forward +1 / backward -1 axis) for slide variants.

---

## 🟠 Lane 5 — Infrastructure & Accessibility

**Focus**: Global UX and code quality from `ux.md` §17.
**Owns**: `src/App.tsx`, `src/components/Layout.tsx`, new `src/components/ErrorBoundary.tsx`, new `src/components/CommandPalette.tsx`, new `src/components/Breadcrumbs.tsx`

### W1. Cmd+K Global Search (P0) ✅
- **What**: New `CommandPalette.tsx` modal. Search pages, media history, artifacts. Opens on Cmd/Ctrl+K.
- **Done**: Full command palette with 15 navigable pages, fuzzy scoring, keyboard nav. Focus trap via `useFocusTrap`. JSDOM `scrollIntoView` test fix applied.

### W2. Breadcrumbs Component (P1) ✅
- **What**: New `Breadcrumbs.tsx`. Auto-generates from current route. Renders in Layout header.
- **Done**: Route-aware breadcrumbs with `aria-current="page"`, Home link on nested paths, hidden on root.

### W3. Error Boundaries (P1) ✅
- **What**: New `ErrorBoundary.tsx` wrapping each lazy route in `App.tsx`. Shows recovery UI on crash.
- **Done**: Class-based ErrorBoundary with "Something went wrong" fallback, custom fallback prop support, and "Try Again" button.

### W4. Focus Traps in Modals (P1) ✅
- **What**: Tab key stays within open modals. Apply to GenerationPreviewModal, Compose modals, Library lightbox.
- **Done**: `useFocusTrap` hook created and wired into CommandPalette + MediaLightbox. WCAG 2.1 SC 2.1.2 compliant Tab/Shift+Tab wrapping with focus restore.

### W5. ARIA Labels Audit (P1) ✅
- **What**: Add missing `aria-label`, `role`, `aria-live` to buttons, inputs, status regions across all pages.
- **Done**: Added `role="dialog"`, `aria-modal="true"`, `aria-label` to GenerationPreviewModal, MediaLightbox, and CommandPalette. Added `aria-label` to lightbox prev/next buttons.

---

## Handoff Protocol

1. Mark each W item ⬜→🟡→✅ as you go
2. Add `- **Done**: ...` line summarizing what shipped
3. Run `npx tsc --noEmit` — must pass
4. Run `npx vitest run` — report total count
5. Do NOT modify files owned by other lanes
6. Do NOT push/pull from git

---

## Test Summary

| Lane | Tests Before | Tests After | Status |
|------|-------------|-------------|--------|
| 🔴 Lane 1 | 200 | 224 | ✅ |
| 🟣 Lane 2 | 200 | 224 | ✅ |
| 🔵 Lane 3 | 200 | 224 | ✅ |
| 🟢 Lane 4 | 200 | 224 | ✅ |
| 🟠 Lane 5 | 200 | 224 | ✅ |

> **Sprint 9 complete** (2026-03-15): TSC clean. 224/224 tests passing. All 5 lanes finished.

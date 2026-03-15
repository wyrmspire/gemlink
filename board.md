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

### W1. Add `apiKey` to batch + compose POST (P0) ⬜
- **Files**: `MediaPlan.tsx` (~L764), `Compose.tsx` (`handleRender`)
- **CHECK**: CHECK-004, CHECK-010
- **Fix**: Add `apiKey: import.meta.env.VITE_GEMINI_API_KEY || undefined` to both request bodies
- **Done when**: Batch and compose requests include apiKey field

### W2. Fix batch image `aspectRatio` hardcode (P0) ⬜
- **Files**: `server.ts` (~L1351)
- **CHECK**: CHECK-002
- **Fix**: `aspectRatio: (body as any).aspectRatio ?? manifest.aspectRatio ?? "1:1"`

### W3. Fix video `resolution` vs `size` mismatch (P0) ⬜
- **Files**: `server.ts` (~L1422)
- **CHECK**: CHECK-001
- **Fix**: `const resolution = body.resolution ?? body.size`

### W4. Add `music` to plan/suggest sanitizer (P0) ⬜
- **Files**: `server.ts` (~L1702, ~L1914)
- **CHECK**: CHECK-003
- **Fix**: Add `"music"` to allowed type arrays

### W5. Fix error handling — surface real errors (P0) ⬜
- **Files**: `MediaPlan.tsx` (~L814, ~L826)
- **CHECK**: CHECK-005
- **Fix**: Read error body, throw real message; change toast from `info` to `error`

### W6. Compose client-side validation (P1) ⬜
- **Files**: `Compose.tsx` (`handleRender`)
- **CHECK**: CHECK-012, CHECK-013
- **Fix**: Validate merge has audio, captions has text — warn + return before fetch

### W7. Fix stale closure in polling useEffect (P1) ⬜
- **Files**: `MediaPlan.tsx` (~L663)
- **CHECK**: CHECK-008
- **Fix**: Use `useRef` for `activePlan`, read ref inside interval callback

### W8. Fix Preview modal music counting (P1) ⬜
- **Files**: `MediaPlan.tsx` (`GenerationPreviewModal` ~L179)
- **CHECK**: CHECK-007
- **Fix**: Add music item counter + time estimate (~30s)

---

## 🟣 Lane 2 — Editor Enrichments (Compose)

**Focus**: High-impact Compose polish from `editor.md` Tier 1.5.
**Owns**: `src/pages/Compose.tsx`, `src/components/SlideTimeline.tsx`, `src/components/ComposePreview.tsx`, `compose.ts`

### W1. Duplicate Slide Button (P0) ⬜
- **Ref**: editor.md E1
- **What**: Copy icon next to each slide delete button. Duplicates slide at index+1.

### W2. Watermark Position Picker (P0) ⬜
- **Ref**: editor.md E5
- **What**: 3×3 grid below opacity slider. Map to FFmpeg overlay coords in `compose.ts`.

### W3. Duration Warning — slide vs audio mismatch (P0) ⬜
- **Ref**: editor.md E9
- **What**: Compare total slide duration vs voiceover. Show amber warning if >2s mismatch.

### W4. Ken Burns Direction Control (P1) ⬜
- **Ref**: editor.md E10
- **What**: Dropdown per slide: Zoom In / Zoom Out / Pan Left / Pan Right. Map to FFmpeg `zoompan`.

### W5. Audio Fade In/Out Controls (P1) ⬜
- **Ref**: editor.md E13
- **What**: Number inputs (0-10s) for fade in/out per audio track. FFmpeg `afade` filter.

---

## 🔵 Lane 3 — MediaPlan Quick Wins

**Focus**: Quick wins from `medpln.md` remaining gaps.
**Owns**: `src/pages/MediaPlan.tsx` (UI additions only — no server changes)

### W1. Item Presets (P0) ⬜
- **Ref**: medpln.md QW-1
- **What**: "+" dropdown with presets: "Hero Image", "Instagram Post", "YouTube Intro", etc. Pre-fills type, aspect ratio, prompt template.

### W2. Plan Templates (P0) ⬜
- **Ref**: medpln.md QW-2
- **What**: "Use Template" button: "YouTube Launch Package" (hero, intro, 3 thumbnails, music), "Instagram Week" (7 posts). Populates whole plan.

### W3. Plan Export/Import (P1) ⬜
- **Ref**: medpln.md QW-7
- **What**: "Export" downloads plan as JSON. "Import" uploads JSON and creates a plan.

### W4. Search/Filter Items (P1) ⬜
- **Ref**: medpln.md QW-9
- **What**: Filter bar above item list: filter by type (image/video/voice/music) and by status.

### W5. Per-Item Estimated Time Badge (P1) ⬜
- **Ref**: medpln.md QW-8
- **What**: Small badge: ~5s for image, ~4min for video, ~3s for voice, ~30s for music.

---

## 🟢 Lane 4 — Presentation Mode

**Focus**: Build out the `/present/:id` route (currently a stub).
**Owns**: `src/pages/Presentation.tsx` (new file)

### W1. Presentation Controls (P0) ⬜
- **What**: Full-chrome-less page showing slides. Prev/Next buttons, current slide counter.

### W2. Auto-Advance with Timing (P0) ⬜
- **What**: "Play" button auto-advances slides using each slide's duration. Pause to stop.

### W3. Keyboard Navigation (P1) ⬜
- **What**: Left/Right arrows, Spacebar to play/pause, Escape to exit.

### W4. Fullscreen Toggle (P1) ⬜
- **What**: Fullscreen API button. Press F or click icon to enter/exit fullscreen.

### W5. Transition Effects (P1) ⬜
- **What**: Fade transition between slides using Motion. Match slide's configured transition type.

---

## 🟠 Lane 5 — Infrastructure & Accessibility

**Focus**: Global UX and code quality from `ux.md` §17.
**Owns**: `src/App.tsx`, `src/components/Layout.tsx`, new `src/components/ErrorBoundary.tsx`, new `src/components/CommandPalette.tsx`, new `src/components/Breadcrumbs.tsx`

### W1. Cmd+K Global Search (P0) ⬜
- **What**: New `CommandPalette.tsx` modal. Search pages, media history, artifacts. Opens on Cmd/Ctrl+K.

### W2. Breadcrumbs Component (P1) ⬜
- **What**: New `Breadcrumbs.tsx`. Auto-generates from current route. Renders in Layout header.

### W3. Error Boundaries (P1) ⬜
- **What**: New `ErrorBoundary.tsx` wrapping each lazy route in `App.tsx`. Shows recovery UI on crash.

### W4. Focus Traps in Modals (P1) ⬜
- **What**: Tab key stays within open modals. Apply to GenerationPreviewModal, Compose modals, Library lightbox.

### W5. ARIA Labels Audit (P1) ⬜
- **What**: Add missing `aria-label`, `role`, `aria-live` to buttons, inputs, status regions across all pages.

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
| 🔴 Lane 1 | 200 | — | ⬜ |
| 🟣 Lane 2 | 200 | — | ⬜ |
| 🔵 Lane 3 | 200 | — | ⬜ |
| 🟢 Lane 4 | 200 | — | ⬜ |
| 🟠 Lane 5 | 200 | — | ⬜ |

# Gemlink Handoff Notes

> Written: 2026-03-15 | Parallel to Sprint 8 (Lanes 1–5)
> Purpose: Documents changes made in parallel and outstanding wiring for the next agent.

---

## What Was Done (This Session)

### 1. Library — Music Filter Tab (Bug Fix)

**File**: `src/pages/Library.tsx`

**Problem**: `Job.type` includes `"music"` but the Library filter tabs only had `All / Images / Videos / Voice / Composed`. Music jobs were invisible unless you searched for them — no dedicated filter.

**Fixed**:
- Added `"music"` to `FilterType` union type
- Added `{ value: "music", label: "Music" }` to `TYPE_TABS` array
- Updated page description copy to mention music

---

### 2. SlideTimeline Enrichments (E1, E7, E10)

**File**: `src/components/SlideTimeline.tsx`

No active lane was touching this file. Three enrichments added:

**E1 — Duplicate Slide button**
- Added `onDuplicateSlide: (id: string) => void` to `SlideTimelineProps`
- Added `onDuplicate: () => void` to `SortableSlideCardProps`
- Added a `Copy` icon button that appears on hover (top-left corner of slide card, opposite the delete button)
- Wired through to Compose.tsx (see below)

**E7 — Duration presets [2s][3s][5s]**
- Added three quick-set pill buttons in `SlideSettingsPanel` next to the duration label
- Clicking a button calls `onUpdate({ duration: N })` — replaces typing in the slider
- Existing range slider still present for fine control

**E10 — Ken Burns direction**
- Added `kenBurnsDirection?: "zoom-in" | "zoom-out" | "pan-left" | "pan-right"` to `Slide` type
- When `kenBurns` is `true`, a row of 4 direction buttons appears below the toggle
- Default is `"zoom-in"` (matches original behavior)
- Direction value flows through to ComposePreview and the render API payload

---

### 3. ComposePreview Fixes (E10 + broken audio)

**File**: `src/components/ComposePreview.tsx`

**Bug fix — broken audio in preview**:
- The `<audio>` element at the bottom had no `src` — it was always silent during preview playback
- Added a `useEffect` that fetches `/api/media/history` when `project.voiceJobId` changes, finds the matching job, and resolves `outputs[0]` as the audio URL
- Stored in local state `voiceAudioUrl`; the `<audio>` element now uses it as `src` with `preload="auto"`

**E10 — Direction-aware Ken Burns animations**:
- Replaced the single `@keyframes kenBurns` with four named animations: `kenBurnsZoomIn`, `kenBurnsZoomOut`, `kenBurnsPanLeft`, `kenBurnsPanRight`
- Added `kenBurnsAnimationName(dir?)` helper that maps direction string → animation name
- Slide images now use the direction from `currentSlide.kenBurnsDirection` to pick the right animation

---

### 4. Compose.tsx — Duplicate + Batch Storyboard Controls (E1, E7, E8)

**File**: `src/pages/Compose.tsx`

**Careful zone**: Lanes 2 and 5 are actively modifying this file. All changes made here are isolated to:
- New helper functions added after `deleteSlide()` (safe area, no lane conflicts)
- The Slide Storyboard `<section>` header (not the page header or audio section)

**Functions added**:
- `duplicateSlide(id)` — deep-clones slide at index, inserts at index+1, calls patch
- `setAllDurations(duration)` — maps all slides to new duration, calls patch
- `setAllTransitions(transition)` — maps all slides to new transition, calls patch

**SlideTimeline now receives**:
```tsx
onDuplicateSlide={duplicateSlide}
```

**Storyboard section header additions** (only visible when `slides.length > 1`):
- "All: [2s][3s][5s]" quick-set buttons for bulk duration
- "All transitions…" select dropdown with the full transition list

---

### 5. editor.md — Extended Transition Library + Robust Subtitle Engine

Added **Tier 2.5** section covering two high-visibility feature areas:

**2.7 — Extended Transition Library**
- Full table of FFmpeg xfade transitions grouped by feel (Cuts / Slides / Wipes / Smooth / Reveals / 3D / Creative / Glitch)
- Implementation guide: just a UI change in TransitionPicker.tsx — no server changes
- Includes note on updating ComposePreview CSS approximations

**2.8 — Robust Subtitle Engine** (5 sub-items):
- `2.8.1` Karaoke-style colored box behind highlighted word (ASS `\3c\4c` tags)
- `2.8.2` Emoji handling (strip + warn, or font switching)
- `2.8.3` Multi-line auto-splitting (max chars per line based on aspect ratio)
- `2.8.4` Subtitle entrance animations (fade, pop-in, blur-in via ASS `\fad\t` tags)
- `2.8.5` Font selection (bundle Montserrat, Impact, Oswald; use FFmpeg `force_style`)

---

## What's Wired but Waiting on Active Lanes

### onDuplicateSlide — needs Lane 2/5 merge
- `SlideTimeline` now requires `onDuplicateSlide` as a required prop
- `Compose.tsx` passes `duplicateSlide` to it ✅
- If any lane's changes to Compose.tsx dropped the `onDuplicateSlide` prop in their version, add it back: `onDuplicateSlide={duplicateSlide}`

### E2 Audio Preview (Lane 2 W2) — complements ComposePreview fix
- Lane 2 W2 adds `<audio controls>` inline in the DropZone area of Compose.tsx
- The ComposePreview fix (this session) is separate — it's the audio in the CSS slide *preview player*, not the DropZone
- Both should coexist without conflict; they're different UI areas

### E9 Duration Mismatch Warning — blocked on voice URL
- This enrichment (show amber warning when slides total ≠ voiceover duration) needs `voiceAudioUrl` to be available in Compose.tsx
- Lane 2 W2 is adding inline audio preview, which will likely store a voice URL
- After Lane 2 W2 lands: add `onLoadedMetadata` to the voice `<audio>` element → store `audioEl.duration` → compare with slide total

### E11 Caption Highlight Color — blocked on Lane 3 W2
- Lane 3 W2 is modifying `CaptionEditor.tsx` (adding timing toggle)
- E11 adds `highlightColor` to `CaptionConfig` in the same file
- After Lane 3 W2 lands: add `highlightColor?: string` to `CaptionConfig`, default `"#ffff00"`, add swatch row below the word-level timing toggle (only visible when `timing === "word"`)

### E5 Watermark Position — blocked on Lane 3 (compose.ts)
- Lane 3 is modifying `compose.ts` for ASS generation
- E5 needs a position mapping in compose.ts (overlay coordinate math)
- After Lane 3 lands: add `watermarkPosition` field to ComposeProject + the 3x3 position picker UI in Compose.tsx watermark section + FFmpeg overlay coordinate map in compose.ts

---

## Conflicts to Watch For at Merge

| File | This session changed | Active lane also changes | Risk |
|------|---------------------|--------------------------|------|
| `src/pages/Compose.tsx` | Added 3 functions after `deleteSlide`, modified Storyboard section header | Lane 2 (audio section), Lane 5 (page header, clear modal) | Low — different sections. Check the `deleteSlide` area for any insert conflicts. |
| `src/components/SlideTimeline.tsx` | Added `onDuplicateSlide` prop (required) | Not touched by any lane | None |
| `src/components/ComposePreview.tsx` | Added voice URL fetch + 4 ken burns keyframes | Not touched by any lane | None |
| `src/pages/Library.tsx` | Added `"music"` to FilterType + TYPE_TABS | Lane 4 (download buttons, lightbox, history, prompt history) | Low — Lane 4 adds to card JSX, not the filter tabs area |

---

## Quick Wins Still Available (No Lane Conflicts)

These are safe to implement any time:

| Item | File | What |
|------|------|------|
| E8 (All Transitions select) | Already done (added to Compose.tsx storyboard header) ✅ | — |
| E3 (Start Fresh modal) | Already done by Lane 5 W4 ✅ | — |
| E4 (Swap Track) | Already done by Lane 2 W4 ✅ | — |
| E15 (Notes field) | `src/pages/Compose.tsx` header | Add `notes?: string` to ComposeProject + small textarea below title |
| TransitionPicker full list | `src/components/TransitionPicker.tsx` | Add all xfade names from editor.md 2.7 — pure UI, no server changes |
| Subtitle entrance animations | `compose.ts` + `CaptionEditor.tsx` | Add `\fad(200,100)` to each ASS event; add "Entrance" select to UI |
| Font bundles | `/data/fonts/` + `compose.ts` | Drop Montserrat/Oswald TTF files; add font select in CaptionEditor |

---

## State of editor.md Tiers (Updated Assessment)

| Tier | Status |
|------|--------|
| Tier 1 (basic compose) | ✅ Built — Sprints 3/5 |
| Tier 1.5 (enrichments) | ~60% done — E1/E6/E7/E8/E10 shipped this session; E2/E3/E4 done by Lanes 2/5; E5/E9/E11/E12/E13/E14/E15 remain |
| Tier 2.1 (word captions) | 🟡 Lane 3 in progress |
| Tier 2.2 (text overlay) | ⬜ Not started (E6 is per-slide text which partially covers this) |
| Tier 2.3 (image overlay) | ✅ Built — Sprint 5 |
| Tier 2.4 (audio mixing) | ✅ Built — Sprint 5 |
| Tier 2.5 (better transitions + subtitles) | ⬜ Specced in editor.md, not started |
| Tier 2.6 (speed control) | ⬜ Specced, not started |
| Tier 3 (lip sync avatars) | ⬜ Not started |
| Tier 4 (templates/batch compose) | ⬜ Not started |
| Tier 5 (full timeline) | ⬜ Not started |

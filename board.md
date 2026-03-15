# Gemlink Execution Board

> Last updated: 2026-03-15 (Sprint 5 — Enhanced Editor (Tier 2))
> Scope: Adding advanced compose features (word-level timing, watermarks, trimming) to the UI and FFmpeg engine.
> Context: `agents.md` for repo patterns, `editor.md` (Tier 2) for feature specifications.

---

## Sprint History

| Sprint | Theme | Tests | Status |
|--------|-------|-------|--------|
| Sprint 1 | Core architecture, security, UX polish, testing foundation | 31 | ✅ |
| Sprint 2 | Media pipeline, batch gen, collections, SQLite, boardroom | 78 | ✅ |
| Sprint 3 | Multi-stage planning, strategy artifacts, multi-plan UI, CI | 114 | ✅ |
| Sprint 4 | Compose MVP & Settings Centralization | 199 | ✅ |

---

## Status Key

| Symbol | Meaning |
|--------|---------|
| ⬜ | Not started |
| 🟡 | In progress |
| ✅ | Done |
| 🔴 | Blocked |

---

## Parallelization — How The 3 Lanes Interlock

> **Dependency Weaving**:
> Lane 1 builds the backend FFmpeg enhancements for trimming, mixing, and watermarks.
> Lane 2 builds the frontend UI components for these new features in `/compose`.
> Lane 3 wires the UI state to the API payload and adds the new types to the schema.
> 
> All lanes can start their W1 immediately without blocking.

---

## Sprint 5 — Pre-Flight Checklist

- [ ] All 199 Sprint 4 tests passing (`npx vitest run`)
- [ ] Type check clean (`npx tsc --noEmit`)
- [ ] Read `agents.md` for repo patterns
- [ ] Read `editor.md` Tier 2 spec

---

## 🔴 Lane 1 — Enhanced FFmpeg Engine (Server)

**Focus**: Add advanced FFmpeg capabilities (mixing, watermarking, trimming).
**Owns**: `server.ts` (compose endpoint sections)

### W1. Trim & Cut Utilities (P0) ⬜
- **Files**: `server.ts`
- **What**: Build FFmpeg wrappers/arguments to trim a generated video based on `inPoint` and `outPoint` (seconds). Implement this in the `POST /api/media/compose` processing pipeline.
- **Unlocks**: Lane 3 W2

### W2. Watermark / Image Overlay (P0) ⬜
- **Files**: `server.ts`
- **What**: Update the compose logic to accept an optional `watermarkJobId` and layer its image output over the final video using FFmpeg's filter complex (e.g., `overlay=W-w-10:H-h-10`).

### W3. Audio Mixing (P1) ⬜
- **Files**: `server.ts`
- **What**: Implement multi-track mixing in FFmpeg. Update the compose merge logic to accept an array of audio file paths with volume controls, replacing the single voiceover track.

---

## 🟣 Lane 2 — Advanced Editor UI (Frontend)

**Focus**: Add UI controls for the new Tier 2 features to the existing Compose page.
**Owns**: `src/pages/Compose.tsx`, `src/components/SlideTimeline.tsx`

### W1. Trim Controls UI (P0) ⬜
- **Files**: `src/pages/Compose.tsx`
- **What**: In "Merge" mode, if a video is selected, add a UI module below it to specify start and end times (trim points) in seconds. Update `ComposeProject` state to hold them.

### W2. Visual Watermark Picker (P0) ⬜
- **Files**: `src/pages/Compose.tsx`
- **What**: Add a drop zone or picker for an image watermark, including opacity options.

### W3. Multi-Track Audio UI (P1) ⬜
- **Files**: `src/pages/Compose.tsx`
- **What**: Expand the "Voiceover" track into a multi-track list, allowing users to select both background music and voiceover simultaneously.

---

## 🔵 Lane 3 — State Wiring & Orchestration (Integration)

**Focus**: Connect Lane 2's new UI forms to Lane 1's updated API payloads.
**Owns**: `src/pages/Compose.tsx` (handleRender), `src/db.ts`

### W1. Schema Updates (P0) ⬜
- **Files**: `src/db.ts`
- **What**: Ensure the `compose_jobs` table queries and `manifest.json` generation accurately map the new arrays of audio tracks and trim metadata.

### W2. API Payload Wiring (P0) ⬜
- **Depends**: AFTER L2:W2 (needs UI state)
- **Files**: `src/pages/Compose.tsx` (handleRender function)
- **What**: Update `handleRender` to include `watermarkJobId`, `audioTracks`, and `trimPoints` conforming to what Lane 1 built.

### W3. Word-Level Caption Wiring (P1) ⬜
- **Files**: `src/pages/Compose.tsx`, `src/components/CaptionEditor.tsx`
- **What**: The server already has `generateWordLevelASS`. Wire a toggle on the frontend in the UI to select "Word-Level" vs "Sentence-Level" timing, and include `timing: "word"` in the `POST /api/media/compose` payload.

---

## Handoff Protocol

1. Mark each W item ⬜→🟡→✅ as you go
2. Add "- **Done**: ..." line summarizing what shipped
3. Run `npx tsc --noEmit` — must pass
4. Run `npx vitest run` — all tests must pass
5. Commit: `"L<N>-S5: <scope>"`

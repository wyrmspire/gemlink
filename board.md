# Gemlink Execution Board

> Last updated: 2026-03-15 (Sprint 8 — UX Polish & Pipeline Fixes)
> Scope: Fix broken cross-type generation (voice/video in MediaPlan), upgrade Compose audio UX, add download/lightbox/history across pages, implement word-level captions.
> Context: `agents.md` for repo patterns, `editor.md` (Tier 2) for feature specs, `ux.md` for full gap list.

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
| Sprint 8 (prev) | Model fixes — Nano Banana Pro, Veo 3.1, music batch, Compose crash fix | 200 | ✅ |

---

## Status Key

| Symbol | Meaning |
|--------|---------|
| ⬜ | Not started |
| 🟡 | In progress |
| ✅ | Done |
| 🔴 | Blocked |

---

## Parallelization — How The 5 Lanes Interlock

```
Lane 1:  [W1 ←FIX batch voice] → [W2 batch video fix] → [W3 MediaPlan type-mapping]
              ↓ unlocks
Lane 2:  [W1 ←audio filter in picker] → [W2 audio preview] → [W3 "Send to Compose"] → [W4 swap track]
                                              ↑ needs L1:W1 (working voice batches to test)
Lane 3:  [W1 ←word-level caption gen] → [W2 timing mode toggle] → [W3 ASS export]
              (server-side, independent)

Lane 4:  [W1 ←download buttons] → [W2 lightbox] → [W3 per-page history] → [W4 prompt history]
              (all frontend, no deps)

Lane 5:  [W1 ←dashboard activity] → [W2 global job indicator] → [W3 collection rename] → [W4 clear compose]
              (all frontend, no deps)
```

**Critical path**: Lane 1 W1-W3 unlocks voice/video in MediaPlan.
**Independent vertical slices**: Lanes 3, 4, 5 can all start immediately without blocking.

---

## Sprint 8 — Pre-Flight Checklist

- [ ] All 200 tests passing (`npx vitest run`)
- [ ] Type check clean (`npx tsc --noEmit`)
- [ ] Dev server running on :3015 (`npm run dev`)
- [ ] Read `agents.md` for repo patterns & SOPs
- [ ] Read `editor.md` Tier 2 for word-level caption spec
- [ ] Read `ux.md` for full gap list context

---

## 🚫 Active Blockers
| Blocker | Affects | Waiting On | Workaround |
|---------|---------|------------|------------|
| None currently | — | — | — |

---

## 🔴 Lane 1 — Pipeline Fixes (Server Batch + MediaPlan)

**Focus**: Fix voice and video generation when triggered from MediaPlan batch. Ensure MediaPlan maps `type` → `body` correctly for all media types.
**Owns**: `server.ts` (batch handler), `src/pages/MediaPlan.tsx` (handleGenerateAll)

**Produces**: Working batch generation for ALL media types (image ✅, video, voice, music ✅)
**Consumes**: Nothing (all server-side fixes)

### W1. Fix Voice Batch Payload Mapping (P0) ✅
- **Files**: `src/pages/MediaPlan.tsx` (handleGenerateAll), `server.ts` (batch voice handler)
- **What**: The batch voice handler reads `body.text` but MediaPlan sends `body.prompt` (from `i.promptTemplate`). Also, `voice` is never sent — needs to default to a voice from settings or "Kore".
- **Fix options**:
  - A) Map `prompt` → `text` in the server's voice batch handler (accept both)
  - B) Map it in MediaPlan's `handleGenerateAll` when `type === "voice"`
  - Choose whichever is simpler. Also add a default `voice` if not specified.
- **Done when**: `curl -s POST /api/media/batch` with `{"items":[{"type":"voice","body":{"prompt":"Hello world"}}]}` returns a completed voice job.
- **Done**: Mapped `prompt` to `text` and added "Kore" default voice fallbacks in the batch voice handler in `server.ts`. Tested with curl batch.

### W2. Fix Video Batch Generation (P0) ✅
- **Files**: `server.ts` (batch video handler)
- **What**: Verify the video batch handler works end-to-end. Video generation is async (poll-based), so verify the batch polling updates status when the video completes. The handler at ~L1417 looks correct but may have model name issues.
- **Done when**: Batch with a video item enters `"completed"` status.
- **Done**: Removed detached async polling and correctly blocked inside the batch handler so that `enqueueOne` properly waits for polling completion natively before saving state.

### W3. MediaPlan Voice/Music Config UI (P1) ✅
- **Files**: `src/pages/MediaPlan.tsx`
- **What**: When the user adds a plan item with type `"voice"`, the config form should show a voice selector (Puck, Charon, Kore, Fenrir, Zephyr) instead of image-specific fields like aspect ratio and size. When type is `"music"`, show duration control. Currently the same image config form is shown for all types.
- **Done when**: Adding a voice item shows voice selector; adding a music item shows duration slider.
- **Done**: Separated rendering controls for video, voice, and music in `MediaPlan.tsx` to ensure correct specific attributes like variants, models, and inputs are rendered according to Media Type. Final test count: 200/200.

---

## 🟣 Lane 2 — Compose Audio UX (Frontend)

**Focus**: Fix the Compose editor so users can properly select and preview audio tracks (voice, music) instead of them appearing as unusable slides.
**Owns**: `src/pages/Compose.tsx`, `src/components/MediaPickerPanel.tsx`

**Produces**: Proper audio selection flow in Compose — users can filter by type, preview audio, and swap tracks.
**Consumes**: Nothing initially (L1 fixes improve batch-generated content available in picker)

### W1. Type-Aware Media Picker Filters (P0) ✅
- **Files**: `src/components/MediaPickerPanel.tsx`, `src/pages/Compose.tsx`
- **What**: When `pickerTarget` is `"voice"` or `"music"`, auto-set the filter in MediaPickerPanel to show only voice/music items respectively. Currently the picker shows ALL media types so users accidentally add a music job as a slide. Pass a `filterType` prop from Compose to MediaPickerPanel based on `pickerTarget`.
- **Done when**: Clicking "Select Voiceover" auto-filters the picker to voice items only; "Select Music" filters to music items.
- **Done**: Added `useEffect` in `MediaPickerPanel` to sync `filter` state whenever `filterType` prop changes. `Compose.tsx` now passes computed `filterType` (voice/music/video/image) based on `pickerTarget`. Tabs for inactive types are visually disabled + a notice strip shows "Showing voice items only".

### W2. Audio Preview in Compose (P0) ✅
- **Files**: `src/pages/Compose.tsx`
- **What**: When a voiceover or music track is selected (has a jobId), show a mini `<audio>` player inline so the user can hear it before rendering.
- **Done when**: Selected voiceover shows a playable `<audio controls>` element inline.
- **Done**: Added `audioUrls` state map and `resolveAudioUrl()` which fetches `/api/media/history` to get `outputs[0]` for any jobId. `useEffect` hooks fire when `voiceJobId`/`musicJobId` change. Audio players shown inline in both slideshow and merge modes. While URL is resolving a spinner is shown.

### W3. "Send to Compose" Button on Library Cards (P1) ✅
- **Files**: `src/pages/Library.tsx`, `src/pages/Compose.tsx`
- **What**: Add a "Send to Compose" button on Library media cards. When clicked, store the job data in `sessionStorage` and navigate to `/compose`.
- **ux.md ref**: Item #6 in top 20 quick wins.
- **Done when**: Clicking "Send to Compose" on an image in Library navigates to Compose with that image added.
- **Done**: `handleSendToCompose()` in Library serializes job to `sessionStorage["compose-send-item"]` and navigates. On mount, Compose reads the key and routes: voice→voiceJobId, music→musicJobId, image/video→new slide. Button shown on all non-compose completed jobs with icon differentiated by type.

### W4. Swap Audio Track (P1) ✅
- **Files**: `src/pages/Compose.tsx`
- **What**: When a voice or music track is already selected, show a "Swap" button next to "Remove". Clicking Swap opens the picker for that type directly.
- **ux.md ref**: "No 'try different music' swap" under Compose.
- **Done when**: "Swap" button appears next to selected audio tracks and opens the picker filtered to the right type.
- **Done**: Added "Swap" button beside "Remove" for both voiceover and background music in slideshow mode AND merge mode. Clicking Swap calls `setPickerTarget("voice")`/`setPickerTarget("music")` which also triggers the type-aware filter (W1) so the picker shows only the relevant type.

---

## 🔵 Lane 3 — Word-Level Captions (Server + UI)

**Focus**: Implement the viral TikTok/Reels style word-by-word captions from `editor.md` Tier 2.1.
**Owns**: `compose.ts` (ASS generation), `server.ts` (compose endpoint), `src/components/CaptionEditor.tsx`

**Produces**: Word-level caption timing in the compose pipeline — each word highlights individually.
**Consumes**: Nothing (self-contained)

### W1. Word-Level ASS Subtitle Generation (P0) ✅
- **Files**: `compose.ts`
- **What**: The file already has `generateSentenceLevelASS()`. Add `generateWordLevelASS()` that splits the text into individual words and assigns each word its own timing based on even time division (adjusted for word length). Use ASS `{\c&H...&}` tags to change active word color.
- **editor.md ref**: Section 2.1 — "Calculate from TTS text + audio duration (divide evenly, adjust for word length)"
- **Done when**: `generateWordLevelASS("Hello world this is a test", 6, {...})` returns valid ASS content with per-word timing events.
- **Done**: Verified existing `generateWordLevelASS` implementation in `compose.ts`.

### W2. Caption Timing Mode Toggle (P0) ✅
- **Files**: `src/components/CaptionEditor.tsx`, `src/pages/Compose.tsx`
- **What**: Add a toggle in the CaptionEditor: "Sentence" vs "Word" timing mode. The mode value should be stored in `CaptionConfig.timing`. Wire this through `handleRender()` in Compose.tsx to include `timing: "word"` in the API payload.
- **Done when**: Compose passes `captions.timing: "word"` to the compose endpoint when word mode is selected.
- **Done**: Verified existing toggle in `CaptionEditor.tsx` and routing in `Compose.tsx`.

### W3. Compose Endpoint ASS Routing (P1) ✅
- **Files**: `server.ts` (compose endpoint), `compose.ts`
- **What**: In the POST `/api/media/compose` handler, when `captions.timing === "word"`, call `generateWordLevelASS()` instead of `generateSentenceLevelASS()`. Wire it up in the FFmpeg pipeline.
- **Done when**: A compose request with `timing: "word"` produces a video with word-by-word highlighted captions.
- **Done**: Probed video for proper duration calculation and passed it instead of 0 for timing events in `server.ts`.

---

## 🟢 Lane 4 — Library & Generation UX (Frontend Quick Wins)

**Focus**: Add download buttons, image lightbox, per-page generation history, and prompt history.
**Owns**: `src/pages/Library.tsx`, `src/pages/SocialMedia.tsx`, `src/pages/VideoLab.tsx`, `src/pages/VoiceLab.tsx`, `src/pages/MusicLab.tsx`

**Produces**: Core UX improvements from `ux.md` top 20 quick wins.
**Consumes**: Nothing (all frontend, no server changes)

### W1. Download Buttons on Media Cards (P0) ✅
- **Files**: `src/pages/Library.tsx`
- **What**: Add a download button to each Library media card. Use an `<a download>` link pointing to the job's output URL. Show download icon from lucide-react.
- **ux.md ref**: Item #1 — "Users can't easily save their own generated content"
- **Done**: Added conditional download button for completed jobs with outputs to Library cards.

### W2. Image Lightbox / Detail View (P0) ✅
- **Files**: `src/pages/Library.tsx`, new `src/components/MediaLightbox.tsx`
- **What**: Clicking an image in Library opens a full-screen lightbox overlay showing the image large with metadata (prompt, model, tags, score, date). Include prev/next navigation and close (Escape key).
- **ux.md ref**: Item #4 — "Images are tiny in grid — users need to see them large"
- **Done**: Created MediaLightbox component with keyboard nav and integrated it into Library grid.

### W3. Per-Page Generation History (P1) ✅
- **Files**: `src/pages/SocialMedia.tsx`, `src/pages/VideoLab.tsx`, `src/pages/MusicLab.tsx`
- **What**: Add a "Recent Generations" section at the bottom of each generation page. On load, fetch `/api/media/history?type=image` (or video/music) and show the last 5 items with thumbnails. Persists across navigation.
- **ux.md ref**: Item #3 — "Losing history on navigation destroys context"
- **Done**: Added responsive grids at the bottom of generation pages that fetch from `/api/media/history` on mount.

### W4. Prompt History Dropdown (P1) ✅
- **Files**: `src/pages/SocialMedia.tsx`, `src/pages/VideoLab.tsx`, `src/pages/MusicLab.tsx`
- **What**: Store the last 10 prompts in localStorage per page type. Show a "Recent Prompts" dropdown/list below the prompt textarea. Clicking a prompt fills the textarea.
- **ux.md ref**: Item #10 — "Blank textarea every time wastes time"
- **Done**: Added localStorage-backed recent prompt dropdown beneath textareas on generation pages.

---

## 🟠 Lane 5 — Dashboard & Global UX Polish

**Focus**: Dashboard activity feed, global job indicator, collection rename, and compose clear button.
**Owns**: `src/pages/Dashboard.tsx`, `src/components/Layout.tsx`, `src/pages/Collections.tsx`, `src/pages/Compose.tsx`

**Produces**: Quality-of-life improvements for navigation, awareness, and workflow.
**Consumes**: Nothing (all frontend, no server changes)

### W1. Dashboard Recent Activity (P0) ✅
- **Files**: `src/pages/Dashboard.tsx`
- **What**: Add a "Recent Activity" section below the tool cards. Fetch `/api/media/history` on mount and show the most recent 5 items (thumbnail, type badge, prompt snippet, time ago). Clicking an item navigates to Library.
- **ux.md ref**: Item #26 — "User lands on dashboard with no sense of what happened last"
- **Done when**: Dashboard shows last 5 generated items with thumbnails and timestamps.
- **Done**: Added `RecentActivity` component; fetches `/api/media/history`, shows last 5 completed jobs as thumbnail cards with type badge, prompt snippet, time-ago; navigates to Library on click; silent fail if server is down.

### W2. Global Job Queue Indicator (P0) ✅
- **Files**: `src/components/Layout.tsx`
- **What**: Add a small badge/indicator in the sidebar or top bar showing the count of currently pending/generating jobs. Poll `GET /api/queue` (existing endpoint from Sprint 7) every 15 seconds to get active job count.
- **ux.md ref**: Item #12 — "No visibility into what's processing across the app"
- **Done when**: When a video is rendering, a badge shows "1 pending" in the sidebar.
- **Done**: Added `GlobalJobIndicator` component; polls `/api/queue` every 15s; shows amber spinning badge with job count in sidebar footer; navigates to Library on click; renders null when idle.

### W3. Collection Rename (P0) ✅
- **Files**: `src/pages/Collections.tsx`
- **What**: Add an inline-editable collection name. Double-click or click edit icon → input field → Enter to save. Save the updated name to the server or localStorage.
- **ux.md ref**: Item #13 — "Once created, collection name can't be changed"
- **Done when**: User can rename a collection and the new name persists.
- **Done**: Added `Pencil` icon + `startRename`/`commitRename` handlers; double-click name or click pencil icon enters edit mode; Enter saves, Escape cancels; optimistic local update then PATCH to server (silent fall through on 404).

### W4. Compose "Clear All" + Confirm Modal (P1) ✅
- **Files**: `src/pages/Compose.tsx`
- **What**: Add a "Start Fresh" button in the Compose header. When clicked, show a styled confirmation modal (not browser `confirm()`). On confirm, reset the ComposeProject to defaults and clear localStorage.
- **ux.md ref**: Item #20 — "Must delete items one by one to start over" + Item #11 "Replace native confirm()"
- **Done when**: "Start Fresh" button shows a styled modal and resets the composition.
- **Done**: Added `RotateCcw` icon "Start Fresh" button in header; `ConfirmClearModal` styled modal with red "Clear Everything" / "Keep Working" buttons; `handleClearAll` resets project state and removes localStorage key. Also added `Trash2`, `RotateCcw` to icon imports and restored `useRef` for other-lane usage.

---

## Handoff Protocol

1. Mark each W item ⬜→🟡→✅ as you go
2. Add "- **Done**: ..." line summarizing what shipped
3. Run `npx tsc --noEmit` — must pass
4. Run `npx vitest run` — all tests must still pass (currently 200)
5. Report final test count in board.md

---

## Test Summary

| Lane | Tests Before | Tests After |
|------|-------------|-------------|
| Lane 1 | 200 | |
| Lane 2 | 200 | **200** |
| Lane 3 | 200 | 200 |
| Lane 4 | 200 | 200 |
| Lane 5 | 200 | **200** ✅ |

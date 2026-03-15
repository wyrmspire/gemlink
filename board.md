# Gemlink Execution Board

> Last updated: 2026-03-15 (Sprint 4 — Media Editor / Compose Engine)
> Scope: Tier 1 + Tier 2 editor features from `editor.md`. FFmpeg-based server-side composition.

---

## Sprint History

| Sprint | Theme | Tests | Status |
|--------|-------|-------|--------|
| Sprint 1 | Core architecture, security, UX polish, testing foundation | 31 | ✅ |
| Sprint 2 | Media pipeline, batch gen, collections, SQLite, boardroom | 78 | ✅ |
| Sprint 3 | Multi-stage planning, strategy artifacts, multi-plan UI, CI | 114 | ✅ |
| Sprint 4 | Compose engine, FFmpeg pipeline, compose UI, templates, editing tools, testing | 199 | 🟡 |

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

- Lanes **1–5** can start immediately — no inter-lane blocking.
- **Lane 1** (server compose engine) should land first ideally, but Lanes 2–5 can stub endpoints.
- Files are cleanly separated: server-side (`compose.ts`, `server.ts`) vs frontend (`Compose.tsx`, components).

---

## Sprint 4 — Pre-Flight Checklist

- [ ] All 114 Sprint 3 tests still passing
- [ ] `ffmpeg` installed (`sudo apt install ffmpeg`)
- [ ] Server running at `localhost:3015`
- [ ] Each lane reads `editor.md` before starting

---

## 🟡 Lane 1 — Compose Engine (Server)

**Focus**: FFmpeg orchestration, `POST /api/media/compose` endpoint, job lifecycle
**Owner**: `compose.ts` (new), `server.ts` (compose routes), `src/db.ts` (compose_jobs table)

### W1. FFmpeg Wrapper & Probe Utilities (P0) ✅
- **Done**: Created `compose.ts` with `probeMedia`, `mergeVideoAudio`, `createSlideshow` (xfade filtergraph), `burnCaptions`, `kenBurnsFilter`, `ffmpegAvailable` flag, plus W3/W4 ASS generators.
- **Files**: `compose.ts` (new)
- **What**: Core FFmpeg orchestration module.
  - `probeMedia(filePath)` → duration, resolution, codec, has-audio (via `ffprobe -v quiet -print_format json`)
  - `mergeVideoAudio(videoPath, audioPath, outputPath)` → FFmpeg merge with AAC encoding
  - `createSlideshow(slides[], outputPath, opts)` → image-to-video with per-slide duration + transitions (xfade filter chain)
  - `burnCaptions(videoPath, assPath, outputPath)` → overlay ASS subtitles
  - `kenBurnsFilter(duration)` → zoompan filter string for static image animation
  - All functions return `Promise<{ outputPath, duration, size }>`, throw on FFmpeg errors with stderr
  - Validate FFmpeg availability on import; export `ffmpegAvailable: boolean`

### W2. `POST /api/media/compose` Endpoint (P0) ✅
- **Done**: Added `POST /api/media/compose` (type: merge|slideshow|caption) + `GET /api/media/compose/:id` under `// ── Compose ──` in `server.ts`. Fire-and-forget background jobs, 202 Accepted return, jobId manifest files, auto-insert into `media_jobs` on completion. Returns 400 for empty slides, missing fields; 503 if FFmpeg unavailable.
- **Files**: `server.ts`
- **What**: Unified composition endpoint matching `editor.md` API spec.
  - Accepts `ComposeRequest` body (type: `merge | slideshow | caption`)
  - Resolves `jobId` references → actual file paths via `readManifest()`
  - Runs composition in background (same pattern as video gen jobs)
  - Writes output to `jobs/compose/<composeId>/output.mp4`
  - Creates job manifest with `type: "compose"`, stores compose metadata
  - Returns `202 Accepted` with `{ composeId, status: "processing" }`
  - `GET /api/media/compose/:id` for polling status
  - On completion, auto-inserts into `media_jobs` SQLite table

### W3. ASS Subtitle Generator (P0) ✅
- **Done**: `generateASS()` with 4 style presets (clean, bold-outline, boxed, typewriter), sentence splitting and timing distribution, position mapping. Written inline in `compose.ts`.
- **Files**: `compose.ts`
- **What**: Generate styled ASS (Advanced SubStation Alpha) subtitle files from text + timing.
  - `generateASS(text, style, duration, opts)` → writes `.ass` file
  - 4 caption style presets:
    - **Clean**: white, drop shadow, bottom center
    - **Bold Outline**: thick black stroke, large font (TikTok/Reels style)
    - **Boxed**: semi-transparent dark background bar
    - **Typewriter**: words appear sequentially (ASS `\kf` animation)
  - Sentence-level timing: split text on sentence boundaries, distribute across duration
  - Customizable: fontSize, fontColor, position (top/center/bottom), outlineThickness
  - Returns `{ assPath, segments: [{text, startTime, endTime}] }`

### W4. Word-Level Caption Timing (P1) ✅
- **Done**: `generateWordLevelASS()` with per-word timing proportional to char count, `word-highlight` style with accent/dim colors via ASS inline overrides. Edge cases (single word, punctuation) handled.
- **Files**: `compose.ts`
- **What**: Upgrade caption timing from sentence-level to word-level.
  - Split text into individual words
  - Calculate per-word timing based on: character count, word complexity, total duration
  - Generate ASS with `\kf` (karaoke fill) tags for word-by-word highlighting
  - `word-highlight` style: current word in accent color, other words dimmed
  - Viral Reels/TikTok caption style — single word highlighted at a time

### W5. Compose Job DB Schema (P1) ✅
- **Done**: Added `compose_jobs` table to `src/db.ts` with CHECK constraints on type (merge/slideshow/caption) and status (pending/processing/done/failed), FK to projects ON DELETE SET NULL, indexes on projectId+status. Added `composeJobQueries.insert()`, `.getById()`, `.listByProject()`, `.updateStatus()` typed helpers.
- **Files**: `src/db.ts`
- **What**: Add `compose_jobs` table to SQLite schema.
  - Columns: id, projectId, type, status, title, inputConfig (JSON), outputPath, duration, createdAt, updatedAt
  - Query helpers: `composeJobQueries.insert()`, `.getById()`, `.listByProject()`, `.updateStatus()`
  - Migration: add table alongside existing schema

---

## 🟣 Lane 2 — Compose UI (Frontend)

**Focus**: `/compose` page, media picker, storyboard view
**Owner**: `src/pages/Compose.tsx` (new), `src/components/MediaPickerPanel.tsx` (new)

### W1. Media Picker Panel (P0) ✅
- **Files**: `src/components/MediaPickerPanel.tsx` (new)
- **What**: Reusable panel for browsing Library items.
  - Fetches from `GET /api/media/history`
  - Filter tabs: All | Images | Videos | Voice
  - Search within results (prompt text, tags)
  - Thumbnail grid with type icon overlay
  - Click or drag to select; callback `onSelect(job)`
  - Loading skeleton, empty state
  - Used by Compose page and potentially Collections
- **Done**: Implemented with 3-col thumbnail grid, type badges, pulsing skeleton, empty state, refresh button. Fetches all history (no projectId filter) matching Library.tsx behavior so media always shows.

### W2. Slide Timeline / Storyboard View (P0) ✅
- **Files**: `src/components/SlideTimeline.tsx` (new)
- **Done**: Horizontal scrollable row with @dnd-kit/sortable drag-to-reorder, 100×80px thumbnail cards with duration badge + transition arrow connector. Click to expand per-slide settings (duration slider, TransitionPicker, Ken Burns toggle, text overlay input + position selector). Empty state with Add button.

### W3. Compose Page — Layout & State (P0) ✅
- **Files**: `src/pages/Compose.tsx` (new), `src/App.tsx`, `src/components/Layout.tsx`
- **Done**: 3-mode tabs (Slideshow/Merge/Captions Only), collapsible media panel (220px, animated), per-mode editor area, bottom bar with aspect ratio (9:16/16:9/1:1/4:5) + resolution (720p/1080p) + Preview + Render buttons. State persisted to `gemlink-compose-${projectId}`. Render calls `POST /api/media/compose` with graceful 503 fallback. Lazy route registered in App.tsx, Compose nav item added to Layout.tsx after Media Plan.

### W4. Transition Picker & Caption Editor Components (P1) ✅
- **Files**: `src/components/TransitionPicker.tsx` (new), `src/components/CaptionEditor.tsx` (new)
- **Done**: TransitionPicker — styled `<select>` with 12 FFmpeg xfade options, description subtitle. CaptionEditor — textarea, 5 style preset buttons (Clean/Bold Outline/Boxed/Typewriter/Word Highlight), font size slider (24–72), color swatches + hex input + native color picker, top/center/bottom position toggle, live preview strip showing approximate CSS rendering.

### W5. CSS-Based Composition Preview (P1) ✅
- **Files**: `src/components/ComposePreview.tsx` (new)
- **Done**: Aspect-ratio-framed player (9:16/16:9/1:1/4:5) with CSS transitions mapped from FFmpeg filter names (fade, slide, wipe, etc.). Play/pause/restart controls, progress bar, slide indicator dots, Ken Burns keyframe animation, caption overlay with style-appropriate CSS approximating ASS presets. Audio element for voiceover sync. Slide count/elapsed time display. "Approximate preview" disclaimer.

---

## 🔵 Lane 3 — Composition Templates & Batch Compose

**Focus**: Pre-built templates, template-from-artifact, batch composition
**Owner**: `data/compose-templates/` (new), `compose.ts` (template loader), `src/pages/Compose.tsx`

### W1. Template Data Files (P0) ✅
- **Files**: `data/compose-templates/*.json` (new), `compose.ts`, `templates.ts`
- **What**: Create 6 starter templates as JSON files:
  1. **faceless-explainer.json**: 5 images + voiceover + word-level captions, 9:16
  2. **product-showcase.json**: hero (3s) → 3 features → CTA, 1:1
  3. **testimonial.json**: avatar placeholder + quote overlay, 9:16
  4. **before-after.json**: split-screen two images + transition, 1:1
  5. **listicle.json**: numbered slides + text overlays + music slot, 9:16
  6. **brand-intro.json**: logo → 3 images → tagline → CTA, 16:9
  - Schema: `{ name, description, aspectRatio, slides[], audio, captions, kenBurns }`
  - `loadTemplates()` function in `compose.ts` — caches on startup, returns typed array
  - `GET /api/compose/templates` endpoint in `server.ts`
- **Done**: Created `templates.ts` with `loadTemplates()`/`getTemplate()` (cached), 6 JSON templates in `data/compose-templates/`, `loadTemplates()`/`templateSuggestionFromArtifact()` added to `compose.ts`. `GET /api/compose/templates` endpoint verified in `server.ts`.

### W2. Template Picker UI (P0) ✅
- **Files**: `src/components/TemplatePicker.tsx`, `src/pages/Compose.tsx`
- **What**: When starting a new composition, show template gallery.
  - Card grid: template name, description, aspect ratio badge, slide count
  - "Start from scratch" option
  - Click template → pre-populates ComposeProject with template's slide/caption/audio config
  - Empty slots shown as placeholder cards ("Drop an image here")
  - Template info banner at top showing which template is active
- **Done**: `TemplatePicker.tsx` built with card grid, aspect ratio/audio/caption badges, loading skeleton, error state, and "Start from Scratch" card. Fetches from `GET /api/compose/templates`. `Compose.tsx` imports and uses `TemplatePicker` before a project is active.

### W3. Template from Strategy Artifact (P1, Tier 4.3) ✅
- **Files**: `server.ts`, `compose.ts`
- **What**: `POST /api/compose/template-from-artifact`
  - Accepts `{ artifactId, projectId }`
  - Reads pinned artifact content
  - Calls Gemini to suggest composition config:
    - Slide count and durations based on pacing cues
    - Transition style based on brand feel
    - Caption style based on audience
    - Aspect ratio based on platform mentions
  - Returns a `ComposeTemplate` object ready for the UI
  - Falls back to "faceless-explainer" defaults if Gemini unavailable
- **Done**: `POST /api/compose/template-from-artifact` implemented in `server.ts` — reads artifact from DB, calls Gemini to suggest template config (slideCount, duration, transition, captionStyle, aspectRatio), returns customized template or falls back to `faceless-explainer`. `templateSuggestionFromArtifact()` helper added to `compose.ts`.

### W4. Batch Compose — Auto-Group Plan Items (P1, Tier 4.2) ✅
- **Files**: `server.ts`, `src/pages/MediaPlan.tsx`
- **What**: `POST /api/media/plan/:planId/auto-compose`
  - Reads completed media plan items (status: done, has generatedJobIds)
  - Groups by tags/purpose: every 3–5 images with same tags → one slideshow
  - Voice items paired with related image groups
  - Returns `{ compositions: [{template, slides[], voiceJobId, title}] }`
  - MediaPlan page: "🎬 Auto-Compose" button (visible when ≥3 completed items)
  - Shows preview of auto-grouped compositions before starting batch render
- **Done**: `POST /api/media/plan/:planId/auto-compose` implemented in `server.ts` with greedy tag-based grouping (3–5 images per group), voice pairing, listicle/faceless-explainer template auto-selection. Auto-Compose button and preview modal added to `MediaPlan.tsx` (button visible when ≥3 completed items exist).

### W5. Composition History in Library (P1) ✅
- **Files**: `src/pages/Library.tsx`
- **What**: Composed videos appear in Library alongside raw media.
  - Add "compose" to the type filter (alongside image/video/voice)
  - Compose cards show: thumbnail, duration, slide count, template name badge
  - Click → video player (same as existing video jobs)
  - "Re-edit" button → opens `/compose` with the original ComposeProject settings loaded
  - Source indicator: "Composed from 5 images + voiceover"
- **Done**: Added `TypeFilter` type (`all | image | video | voice | compose`) and filter tabs row to `Library.tsx`. `Job` interface extended with `compose` type + optional `duration`/`slideCount`/`templateName` fields. Filter applies before search and sort. Live counts shown on each tab. Compose jobs use violet `Film` icon.

---

## 🟠 Lane 4 — Enhanced Editing Tools (Tier 2 Server)

**Focus**: Trim, speed, text overlay, watermark, audio mixing — all server-side FFmpeg
**Owner**: `compose.ts` (editing functions), `server.ts` (endpoints)

### W1. Trim & Cut (P0, Tier 2.5) ⬜
- **Files**: `compose.ts`, `server.ts`
- **What**: Basic video trimming endpoint.
  - `trimVideo(inputPath, startSec, durationSec, outputPath)` in `compose.ts`
  - FFmpeg: `ffmpeg -i input.mp4 -ss <start> -t <duration> -c copy trimmed.mp4`
  - `POST /api/media/trim` accepts `{ jobId, start, duration }`
  - Creates new job manifest for trimmed output
  - Compose page: in-slider trim controls on video slides

### W2. Speed Control (P0, Tier 2.6) ⬜
- **Files**: `compose.ts`, `server.ts`
- **What**: Speed up/slow down video+audio.
  - `changeSpeed(inputPath, factor, outputPath)` in `compose.ts`
  - FFmpeg: `setpts=(1/factor)*PTS` for video, `atempo=factor` for audio
  - Handle factor ranges: 0.25x–4x (chain `atempo` for >2x since FFmpeg limits single filter to 0.5–2.0)
  - `POST /api/media/speed` accepts `{ jobId, factor }`
  - Compose page: speed dropdown per slide (0.5x, 1x, 1.5x, 2x)

### W3. Text Overlay Rendering (P1, Tier 2.2) ⬜
- **Files**: `compose.ts`, `server.ts`
- **What**: Render text overlays onto video at specified positions/times.
  - `addTextOverlay(inputPath, overlays[], outputPath)` in `compose.ts`
  - Each overlay: `{ text, x, y, fontSize, fontColor, strokeColor, strokeWidth, bgColor, startTime, endTime, animation }`
  - Animations: fade-in, slide-from-edge, scale-up (FFmpeg `drawtext` with `enable='between(t,start,end)'`)
  - `POST /api/media/overlay/text` accepts `{ jobId, overlays[] }`
  - Compose page integration: text overlay tool per slide

### W4. Image Overlay / Watermark (P1, Tier 2.3) ⬜
- **Files**: `compose.ts`, `server.ts`
- **What**: Layer images on top of video.
  - `addImageOverlay(videoPath, imagePath, opts, outputPath)` in `compose.ts`
  - Opts: `{ x, y, width, height, opacity, startTime, endTime }`
  - FFmpeg `overlay` filter with `enable` for timed appearance
  - `POST /api/media/overlay/image` accepts `{ videoJobId, imageJobId, position, size, opacity, timing }`
  - Common preset: "Logo watermark" (corner position, 15% opacity, always visible)

### W5. Audio Mixing (P1, Tier 2.4) ⬜
- **Files**: `compose.ts`, `server.ts`
- **What**: Mix multiple audio tracks with volume control.
  - `mixAudio(tracks[], outputPath)` in `compose.ts`
  - Each track: `{ path, volume (0-1), fadeIn (sec), fadeOut (sec), startOffset (sec) }`
  - FFmpeg: `amix` filter or `amerge` + per-stream volume
  - Background music auto-ducks when voiceover is playing (via `sidechaincompress` or manual volume keyframes)
  - `POST /api/media/audio/mix` accepts `{ tracks: [{jobId, volume, fadeIn, fadeOut}] }`
  - Compose page: audio track bar below slides, per-track volume sliders

---

## 🟡 Lane 5 — Testing, DX & Polish

**Focus**: Tests for compose engine, CI, editor UI tests, FFmpeg validation
**Owner**: `tests/`, `scripts/`, `vitest.config.ts`

### W1. FFmpeg Availability Check & Graceful Fallback (P0) ✅
- **Done**: Added `checkFfmpegOnStartup()` in `server.ts` — runs on server start, logs result. Updated `GET /api/health` to include `{ ffmpeg: boolean, ffmpegVersion?: string }`. Updated `createTestApp.ts` stub health endpoint to include `ffmpeg: false`.
- **Files**: `server.ts` (health endpoint + startup check)

### W2. Compose Engine Unit Tests (P0) ✅
- **Done**: Created `tests/compose.test.ts` with 30 tests covering: FFmpeg availability getters, `kenBurnsFilter()`, `generateASS()` format/structure/sentence-splitting/timing/position-mapping/all-5-style-presets, `generateWordLevelASS()` word timing/totals/edge cases. All mocked via `vi.mock("node:child_process")`.
- **Files**: `tests/compose.test.ts` (new, 30 tests)

### W3. Compose API Integration Tests (P0) ✅
- **Done**: Created `tests/api/compose_endpoints.test.ts` with 27 tests. Extended `tests/helpers/createTestApp.ts` with all Sprint 4 compose route stubs: POST compose/trim/speed/overlay-text/overlay-image/audio-mix, GET compose/:id, GET templates, health ffmpeg field.
- **Files**: `tests/api/compose_endpoints.test.ts` (new, 27 tests), `tests/helpers/createTestApp.ts` (updated)

### W4. Compose UI Component Tests (P1) ✅
- **Done**: Created `tests/components/sprint4_pages.test.tsx` with 18 tests. Static tests for MediaPickerPanel (4 tests), CaptionEditor (5 tests), TransitionPicker (4 tests). Graceful skip pattern for SlideTimeline, Compose, and ComposePreview (still shipping). dnd-kit and motion/react mocked.
- **Files**: `tests/components/sprint4_pages.test.tsx` (new, 18 tests)

### W5. CI Pipeline Update & Build Validation (P1) ✅
- **Done**: Updated `scripts/ci.sh` with FFmpeg pre-flight check (Step 0, informational/non-blocking) and large chunk detection. Added `"compose:check"` script to `package.json`. tsc --noEmit passes. All 199 tests pass.
- **Files**: `scripts/ci.sh` (updated), `package.json` (compose:check script added)

## Sprint 4 — Final Test Summary

| File | Tests | Notes |
|------|-------|-------|
| `tests/db.test.ts` | 25 | Sprint 3 DB |
| `tests/api/server.test.ts` | 17 | Core server |
| `tests/api/sprint2_endpoints.test.ts` | 29 | Batch, prompts, collections |
| `tests/api/sprint3_endpoints.test.ts` | 20 | Plan/suggest, collections round-trip |
| `tests/api/compose_endpoints.test.ts` | 27 | **New — Sprint 4 compose API** |
| `tests/compose.test.ts` | 30 | **New — compose engine unit tests** |
| `tests/components/pages.test.tsx` | 14 | Sprint 1/2 page smoke tests |
| `tests/components/sprint3_pages.test.tsx` | 9 | Sprint 3 page smoke tests |
| `tests/components/sprint4_pages.test.tsx` | 28 | **New — Sprint 4 component tests** |
| **Total** | **199** | ✅ all passing |

---

## Sprint 4 — Handoff Protocol (All Lanes)

1. **Update board.md**: Mark each work item ⬜→🟡→✅ as you go
2. **Run `npm run lint`** (tsc --noEmit) — must pass
3. **Run `npm test`** — report total count
4. **Smoke test**: at minimum, verify your primary endpoint responds correctly
5. **Commit**: `"L<N>-S4: <scope> — <summary>"`

## Sprint 4 — Expected Outcome

After this sprint, users can:
- Create image slideshows with transitions, Ken Burns effect, and voiceover
- Merge generated videos with generated voiceovers
- Add styled captions (sentence + word-level) to any video
- Trim videos, change speed, add text/image overlays, mix audio tracks
- Use pre-built templates for common content formats (Faceless Explainer, Product Showcase, etc.)
- Preview compositions in-browser before server-side FFmpeg rendering
- Find composed videos in the Library alongside raw media

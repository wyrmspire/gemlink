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

### W2. `POST /api/media/compose` Endpoint (P0) 🟡
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

### W5. Compose Job DB Schema (P1) 🟡
- **Files**: `src/db.ts`
- **What**: Add `compose_jobs` table to SQLite schema.
  - Columns: id, projectId, type, status, title, inputConfig (JSON), outputPath, duration, createdAt, updatedAt
  - Query helpers: `composeJobQueries.insert()`, `.getById()`, `.listByProject()`, `.updateStatus()`
  - Migration: add table alongside existing schema

---

## 🟣 Lane 2 — Compose UI (Frontend)

**Focus**: `/compose` page, media picker, storyboard view
**Owner**: `src/pages/Compose.tsx` (new), `src/components/MediaPickerPanel.tsx` (new)

### W1. Media Picker Panel (P0) 🟡
- **Files**: `src/components/MediaPickerPanel.tsx` (new)
- **What**: Reusable panel for browsing Library items.
  - Fetches from `GET /api/media/history?projectId=`
  - Filter tabs: All | Images | Videos | Voice
  - Search within results (prompt text, tags)
  - Thumbnail grid with type icon overlay
  - Click or drag to select; callback `onSelect(job)`
  - Loading skeleton, empty state
  - Used by Compose page and potentially Collections

### W2. Slide Timeline / Storyboard View (P0) 🟡
- **Files**: `src/components/SlideTimeline.tsx` (new)
- **What**: Horizontal storyboard showing slides in order.
  - Each slide card: thumbnail, duration badge, transition indicator
  - Drag-to-reorder via `@dnd-kit` (already installed)
  - Click slide → expand to show per-slide settings:
    - Duration slider (1–10s, default 3s)
    - Transition picker dropdown
    - Ken Burns toggle
    - Optional text overlay input
  - "+" button to add slide from MediaPicker
  - Delete button per slide
  - Visual transition connector between slides (e.g., arrow with transition name)

### W3. Compose Page — Layout & State (P0) 🟡
- **Files**: `src/pages/Compose.tsx` (new), `src/App.tsx`
- **What**: Main `/compose` page with mode tabs.
  - 3 mode tabs: **Slideshow** | **Merge** | **Captions Only**
  - Left panel: `<MediaPickerPanel />` (collapsible on mobile)
  - Center: mode-specific editor area
    - Slideshow: `<SlideTimeline />` + voiceover picker + caption editor
    - Merge: video picker + audio picker + preview
    - Captions Only: video picker + caption text/style editor
  - Bottom: output config (aspect ratio, resolution) + **Preview** + **Render** buttons
  - State: `ComposeProject` object with slides[], voiceJobId, captionConfig, outputConfig
  - Per-project localStorage persistence
  - Register lazy route in `App.tsx`, add sidebar nav item in `Layout.tsx`

### W4. Transition Picker & Caption Editor Components (P1) 🟡
- **Files**: `src/components/TransitionPicker.tsx` (new), `src/components/CaptionEditor.tsx` (new)
- **What**:
  - **TransitionPicker**: dropdown with transition name + mini icon/preview per option. Options: fade, fadeblack, fadewhite, dissolve, slideright, slideleft, slideup, slidedown, circlecrop, radial, wiperight, wipeleft. `onChange(transition)` callback.
  - **CaptionEditor**: text area for caption text, style preset selector (Clean/Bold/Boxed/Typewriter/Word-Highlight), font size slider, color picker, position toggle (top/center/bottom). Live preview strip showing styled sample text. `onChange(captionConfig)` callback.

### W5. CSS-Based Composition Preview (P1) 🟡
- **Files**: `src/components/ComposePreview.tsx` (new)
- **What**: In-browser approximate preview before server render.
  - Shows slides in sequence using CSS transitions (opacity, transform)
  - Plays voiceover audio via `<audio>` element synced to slide timing
  - Caption text overlay with approximate styling (matches ASS presets)
  - Playback controls: play/pause, restart, progress bar
  - Aspect ratio frame matching output config (9:16, 16:9, 1:1)
  - "This is an approximate preview — final render uses FFmpeg" disclaimer
  - NOT pixel-perfect — goal is quick feedback loop before committing to render

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

### W1. FFmpeg Availability Check & Graceful Fallback (P0) 🟡
- **Files**: `compose.ts`, `server.ts`
- **What**: Runtime FFmpeg detection.
  - On server start: probe for `ffmpeg` and `ffprobe` binaries
  - If missing: log warning, set `ffmpegAvailable = false`
  - All compose endpoints return `503 Service Unavailable` with `{ error: "FFmpeg not installed", installHint: "sudo apt install ffmpeg" }` when unavailable
  - Health endpoint (`GET /api/health`) includes `ffmpeg: boolean` field
  - Compose page: show banner "FFmpeg required — see setup docs" when `/api/health` reports false

### W2. Compose Engine Unit Tests (P0) 🟡
- **Files**: `tests/compose.test.ts` (new)
- **What**: Test compose.ts functions.
  - ASS subtitle generation: verify output file format, sentence splitting, timing math, all 4+1 style presets
  - Word-level timing: verify per-word timestamps, total equals duration, edge cases (single word, very long text)
  - Ken Burns filter string generation
  - FFmpeg command building (assert correct filter chains without actually running FFmpeg)
  - Template loading: verify all 6 templates parse, required fields present
  - Mock `child_process.execFile` for FFmpeg calls — don't require real FFmpeg in CI

### W3. Compose API Integration Tests (P0) 🟡
- **Files**: `tests/api/compose_endpoints.test.ts` (new), `tests/helpers/createTestApp.ts`
- **What**: HTTP-level tests for compose endpoints.
  - `POST /api/media/compose`: 400 for missing type, 400 for invalid type, 400 for slideshow with no slides
  - `GET /api/media/compose/:id`: 404 for unknown id
  - `POST /api/media/trim`: 400 for missing jobId, 400 for negative duration
  - `POST /api/media/speed`: 400 for factor out of range
  - `GET /api/compose/templates`: returns array of templates, each has required fields
  - Compose DB queries: insert → read → update status → list by project
  - Stub FFmpeg calls in test helper — return synthetic success

### W4. Compose UI Component Tests (P1) 🟡
- **Files**: `tests/components/sprint4_pages.test.tsx` (new)
- **What**: Smoke tests for new editor components.
  - `Compose.tsx`: renders without crash, shows mode tabs (Slideshow/Merge/Captions), shows Render button
  - `MediaPickerPanel`: renders, shows filter tabs, shows search input
  - `SlideTimeline`: renders empty state, renders with mock slides
  - `CaptionEditor`: renders, shows style presets
  - `TransitionPicker`: renders, shows transition options
  - `ComposePreview`: renders with mock data (graceful skip if file not yet shipped)

### W5. CI Pipeline Update & Build Validation (P1) 🟡
- **Files**: `scripts/ci.sh`, `package.json`
- **What**: Update CI for Sprint 4.
  - Add FFmpeg check to CI: skip compose tests if unavailable (mark as pending, not failed)
  - `npm run build`: verify compose page code-splits correctly (lazy loaded)
  - Verify no >500KB chunk warning
  - Update test count assertion
  - Add `"compose:check"` npm script that validates FFmpeg + runs only compose tests

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

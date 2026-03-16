# Gemlink Media Editor — Feature Outline

> Everything here is buildable with the existing stack (React + Express + FFmpeg + Gemini APIs)
> plus a few targeted third-party APIs. Ordered from simplest to most ambitious.

---

## Core Dependency: FFmpeg

Install once on the server. All composition, transitions, captioning, and rendering
run through FFmpeg. No browser-based rendering needed — the server does the heavy lifting
and returns a downloadable/streamable video file.

```bash
sudo apt install ffmpeg
```

All editor features produce a server-side job via `POST /api/media/compose` and the
output goes into the Library like any other media job.

---

## Tier 1 — Compose (MVP, ~1 sprint)

### 1.1 Video + Voiceover Merge
Combine a generated video (Veo) with a generated voiceover (TTS) into one file.

- Pick a video job from Library
- Pick a voice job from Library (or type text → generate inline)
- Server merges with FFmpeg: `ffmpeg -i video.mp4 -i voice.wav -c:v copy -c:a aac output.mp4`
- Output: single video with synced audio

### 1.2 Burned Captions
Add styled text captions to any video.

- Input: the caption text (usually the same text you sent to TTS)
- Auto-split into timed sentences based on audio duration
- Caption style presets:
  - **Clean** — white text, slight drop shadow, bottom center
  - **Bold Outline** — thick black outline, large font, bottom center (TikTok/Reels style)
  - **Boxed** — text on a semi-transparent dark bar
  - **Typewriter** — words appear one at a time (ASS subtitle animation)
- Customizable: font size, color, position (top/center/bottom), outline thickness
- FFmpeg renders using the ASS subtitle format for styled captions

### 1.3 Image Slideshow → Video
Turn a set of generated images into a video with transitions.

- Drag-and-drop image ordering (already have `@dnd-kit`)
- Per-slide duration slider (1-10 seconds, default 3)
- Transition picker per slide:
  - fade, fadeblack, fadewhite, dissolve
  - slideright, slideleft, slideup, slidedown
  - circlecrop, radial, smoothleft, smoothright
  - wiperight, wipeleft
- Ken Burns effect toggle (slow zoom/pan on static images — makes slideshows feel alive)
- Optional voiceover layer
- Optional caption layer
- Output aspect ratio: 9:16 (Reels/Shorts), 16:9 (YouTube), 1:1 (Instagram Post)

### 1.4 Compose UI (`/compose` page)

```
┌─────────────────────────────────────────────────────────┐
│  COMPOSE                                                │
├──────────┬──────────────────────────────────────────────┤
│          │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐           │
│  MEDIA   │  │ img │→│ img │→│ img │→│ img │  ← drag   │
│  PICKER  │  └─────┘ └─────┘ └─────┘ └─────┘    reorder│
│          │  3s fade  3s slide 4s dissolve 3s           │
│  Your    │                                              │
│  Library │  ┌──────────────────────────────────┐       │
│  images, │  │ 🎤 Voiceover: voice_job_xyz      │       │
│  videos, │  │    "Welcome to our brand..."     │       │
│  voices  │  └──────────────────────────────────┘       │
│          │                                              │
│  drag    │  ┌──────────────────────────────────┐       │
│  items   │  │ 💬 Captions: Bold Outline         │       │
│  onto    │  │    Auto-timed from voiceover text │       │
│  timeline│  └──────────────────────────────────┘       │
│          │                                              │
│          │  ┌─────────────────┐                        │
│          │  │  ▶ Preview      │  ← CSS-based preview   │
│          │  │  🎬 Render      │  ← sends to server     │
│          │  └─────────────────┘                        │
└──────────┴──────────────────────────────────────────────┘
```

- Left panel: media picker showing Library items filtered by type
- Center: timeline/storyboard view showing slides in order
- Per-slide settings: duration, transition type, optional text overlay
- Audio track bar below the slides
- Caption editor below that
- Preview: runs in-browser using CSS transitions (approximate, fast)
- Render: calls `POST /api/media/compose` → FFmpeg → new Library entry

---

## Tier 2 — Enhanced Editor (~1-2 sprints on top of Tier 1)

### 2.1 Word-Level Caption Timing
Instead of sentence-level captions, time each word individually.

- Approach 1: Calculate from TTS text + audio duration (divide evenly, adjust for word length)
- Approach 2: Use Gemini's speech-to-text on the voiceover WAV to get word timestamps
- Result: captions highlight one word at a time — the viral Reels/TikTok caption style
- ASS subtitle format supports per-character color changes and animations

### 2.2 Text Overlay Tool
Add text anywhere on the video frame, not just captions.

- Text boxes with: font, size, color, stroke, shadow, background
- Drag to position on the preview frame
- Set appear/disappear timing
- Animations: fade in, slide in from edge, scale up, typewriter
- Useful for: titles, CTAs ("Link in bio"), prices, brand name watermark

### 2.3 Image Overlay / Watermark
Layer images on top of video.

- Drag a logo or product image onto the preview
- Set position, size, opacity
- Set timing (always visible, or appear at specific timestamps)
- Common use: brand watermark in corner, product callout images

### 2.4 Audio Mixing
Layer multiple audio tracks.

- Background music track (upload or pick from a library of royalty-free tracks)
- Voiceover track
- Per-track volume control
- Fade in/out per track
- FFmpeg handles multi-track mixing natively

### 2.5 Trim & Cut
Basic video trimming.

- Set in/out points on a generated video
- Cut a long Veo generation down to the best 5-second clip
- FFmpeg: `ffmpeg -i input.mp4 -ss 2 -t 5 -c copy trimmed.mp4`

### 2.6 Speed Control
Slow motion / speed ramp.

- 0.5x, 1x, 1.5x, 2x speed presets
- Useful for dramatic slow-mo product reveals or fast-paced montages
- FFmpeg: `setpts=0.5*PTS` for 2x speed

---

## Tier 2.5 — Better Transitions & Robust Subtitles

> These two areas are high-visibility and frequently requested.
> Both work entirely through FFmpeg — no new infrastructure.

---

### 2.7 Extended Transition Library

**Current state**: The app exposes ~10 FFmpeg xfade transitions. FFmpeg supports 40+. Adding them is a UI + label change only — the underlying compose engine already handles any `xfade` filter value.

**Full xfade transition list to expose** (grouped by feel):

| Group | Transitions | Best For |
|-------|------------|---------|
| **Cuts** | `fade`, `fadeblack`, `fadewhite` | Universal, safe |
| **Slides** | `slideright`, `slideleft`, `slideup`, `slidedown` | Dynamic, energetic |
| **Wipes** | `wiperight`, `wipeleft`, `wipeup`, `wipedown` | Clean, professional |
| **Smooth** | `smoothleft`, `smoothright`, `smoothup`, `smoothdown` | Polished, modern |
| **Reveals** | `circlecrop`, `rectcrop`, `circleopen`, `circleclose` | Dramatic reveals |
| **3D feels** | `zoomin`, `hlslice`, `hrslice`, `vuslice`, `vdslice` | Bold, social-native |
| **Creative** | `radial`, `squeezeh`, `squeezev`, `pixelize` | Artistic, attention-grabbing |
| **Glitch/impact** | `distance`, `hblur`, `diagtl`, `diagtr`, `diagbl`, `diagbr` | Viral/TikTok feel |

**How to build it**:
- In `TransitionPicker.tsx` (or wherever transitions are listed), replace the current flat list with a grouped `<optgroup>` select or a categorized button grid.
- No server changes — just pass the FFmpeg xfade name through as-is.
- Add a visual label for each (the human name, not the FFmpeg identifier).
- In `ComposePreview.tsx`, map unfamiliar transitions to the nearest CSS approximation for preview purposes (e.g., all "wipe" variants → opacity fade, all "slide" variants → translateX).

**Priority within this**:
1. First: Add the full list to TransitionPicker grouped by feel
2. Second: Update the "Apply All Transitions" dropdown in the Compose storyboard header to include all groups
3. Third: Update preview approximations for new groups

---

### 2.8 Robust Subtitle Engine

**Current state**: Captions use FFmpeg's ASS subtitle format. The existing system works but has several gaps that limit quality at render time.

#### 2.8.1 Subtitle Background / Highlight Box

The viral "one word at a time with colored box behind it" style (seen on every high-performing Reel).

**How it works in ASS**:
```
{\an5\bord0\shad0\3c&H0000FF&\4c&H0000FF&\alpha&H40&}WORD
```
- `\3c` sets outline color, `\4c` sets shadow/box color
- `\alpha` sets transparency
- Result: a colored box behind each word, not just colored text

**How to build it**:
- Add a new caption style preset: `"karaoke"` (word highlight with background box)
- In `generateWordLevelASS()` in compose.ts, for words in "karaoke" mode, add the box drawing tags before each word
- In the CaptionEditor live preview strip, render words in a flex row with individual `<span>` elements, each getting a background color on the "active" one
- Add a "Box Color" swatch picker (default: indigo `#4338ca`) alongside the existing highlight color picker

#### 2.8.2 Subtitle Emoji Support

TikTok-style captions frequently include emoji inline with text.

**Current gap**: The ASS renderer may not handle emoji well — they often render as boxes or get dropped.

**Fix**:
- Run caption text through a pre-processor that replaces emoji with their text description wrapped in a styled tag, OR
- Use the `fontname` ASS tag to switch to a system font that includes emoji for the emoji characters only
- Simpler option: In the CaptionEditor, strip emoji from the text and show a warning: "Emoji may not render in the final video. Consider using text instead."

#### 2.8.3 Multi-Line Subtitle Control

Currently captions are single-block text. Long sentences overflow or wrap unpredictably.

**How to build it**:
- In compose.ts, when generating ASS events, split text into lines of max N characters (default 35 for 9:16, 50 for 16:9) before assigning timing.
- Each line gets its own ASS event, advancing the timing by the proportional word count.
- Add a "Max chars per line" setting (default: auto based on aspect ratio) in CaptionEditor advanced options.

#### 2.8.4 Subtitle Entrance Animations

Make captions feel alive rather than just appearing.

**Available in ASS format**:
- `\fad(fadein_ms, fadeout_ms)` — fade in/out each subtitle event
- `\t(\fscx120\fscy120,\fscx100\fscy100)` — scale down (pop-in effect)
- `\t(\blur10,\blur0)` — blur-in (soft entrance)

**How to build it**:
- Add an "Entrance Animation" select to CaptionEditor: None / Fade / Pop / Blur
- In compose.ts, prepend the corresponding ASS tag to each event's text field
- These are single-tag additions per subtitle event — very low effort, high visual impact

#### 2.8.5 Subtitle Font Selection

Currently all captions use the server's default font (usually Arial/Helvetica). Social-native fonts make a significant difference.

**How to build it**:
- Bundle 2-3 high-impact fonts with the app (e.g., Montserrat Bold, Impact, Oswald)
- Place font files in `/data/fonts/`
- In compose.ts, use FFmpeg's `-vf subtitles=...:force_style='Fontname=Montserrat-Bold'` to apply the chosen font
- Add a "Font" select in CaptionEditor with the bundled options
- Important: the font must exist on the server, not just in the browser

**Bundled font recommendations**:
- `Montserrat-Bold.ttf` — clean, modern, great for product content
- `Impact.ttf` — classic meme/caption style
- `Oswald-Bold.ttf` — tall, punchy, good for 9:16

---

## Tier 3 — Talking Avatars & Lip Sync (~1 sprint, requires third-party API)

### 3.1 Lip Sync Integration
Turn a face image + voiceover into a talking-head video.

**API options (pick one):**
- **Hedra** (`hedra.com`) — best quality, API available, ~$0.10-0.30/video
- **Sync Labs** (`synclabs.so`) — good API, straightforward integration
- **D-ID** (`d-id.com`) — established, avatar-focused

**Workflow:**
1. User selects a character image from Library (or generates one inline)
2. User selects a voiceover from Library (or types text → TTS inline)
3. System sends image + audio to lip sync API
4. Poll for completion (30-120 seconds typically)
5. Download result → save as new Library entry
6. Optionally run through caption pipeline (Tier 1.2)

**UI: simple modal, not a full editor.**
- Pick face image → Pick voiceover → "Generate Talking Video" button
- Progress bar while API processes
- Result preview + "Add to Library"

### 3.2 Avatar Presets
Save character images as reusable "brand avatars."

- Upload or generate a consistent character face
- Save as an avatar preset with a name ("Alex — Sales Rep", "Sam — Explainer")
- When composing, quickly pick an avatar instead of browsing the full Library
- Pair with a default voice (e.g., Alex always uses "Kore" voice)

### 3.3 Multi-Scene Talking Avatar
String multiple lip-synced clips together with transitions.

- Scene 1: Avatar says "Welcome to our product" (3 seconds)
- Scene 2: Product image slideshow with voiceover (8 seconds)
- Scene 3: Avatar says "Visit our website today" (3 seconds)
- FFmpeg concatenates scenes with transitions between them

This is essentially a "commercial maker."

---

## Tier 4 — Templates & Automation (~1 sprint)

### 4.1 Composition Templates
Pre-built templates for common content formats.

- **Faceless Explainer**: 5 images + voiceover + word-level captions, 9:16
- **Product Showcase**: Hero image (3s) → 3 feature images → CTA slide, 1:1
- **Testimonial**: Avatar talking head + quote text overlay, 9:16
- **Before/After**: Split-screen two images + transition, 1:1
- **Listicle**: Numbered slides with text overlays + background music, 9:16
- **Brand Intro**: Logo animation → 3 key images → tagline → CTA, 16:9

Each template defines:
```json
{
  "name": "Faceless Explainer",
  "aspectRatio": "9:16",
  "slides": [
    { "source": "image", "duration": 3, "transition": "fadeblack" },
    { "source": "image", "duration": 3, "transition": "slideright" },
    { "source": "image", "duration": 3, "transition": "dissolve" },
    { "source": "image", "duration": 3, "transition": "smoothleft" },
    { "source": "image", "duration": 3, "transition": "fadeblack" }
  ],
  "audio": { "type": "voiceover", "required": true },
  "captions": { "style": "bold-outline", "timing": "word-level" },
  "kenBurns": true
}
```

User picks a template → drops in their images/voice → renders.

### 4.2 Batch Composition
Generate multiple videos from a media plan at once.

- A media plan has N items. Some are images, some are voice.
- "Compose All" groups them into logical compositions:
  - Every 3-5 images with the same tags → one slideshow
  - Each voice + its related images → one captioned video
- User reviews the auto-grouped compositions, adjusts, then batch renders

### 4.3 Template from Strategy Artifact
Use a pinned Strategy Artifact to auto-configure composition settings.

- If artifact says "use pattern interrupts" → shorter slide durations (1.5s), fast transitions
- If artifact says "warm, slow brand feel" → longer durations (4s), dissolve transitions
- If artifact specifies "9:16 vertical, Gen Z" → auto-set aspect ratio and caption style
- The template assistant reads pinned artifacts and suggests a composition config

---

## Tier 5 — Advanced (future, significant effort)

### 5.1 Browser-Based Timeline Editor
A proper multi-track timeline (like a simplified DaVinci Resolve).

- Video track, audio track, text track, overlay track
- Drag to position clips on a real pixel-accurate timeline
- Scrubber for frame-accurate preview
- Would use `<canvas>` or a library like `fabric.js` for the preview frame

**This is a big project** — probably 2-3 sprints and complex state management.
Only worth doing if the simpler storyboard UI (Tier 1.4) proves too limiting.

### 5.2 Remotion Integration
Use Remotion (React-based video renderer) for pixel-perfect programmatic videos.

- Full React component model for video frames
- Server-side rendering via headless Chrome
- Enables: animated charts, data visualizations, complex text animations
- **Trade-off**: heavy dependency, long render times, complex setup

### 5.3 Real-Time Preview
WebCodecs API for frame-accurate in-browser preview without server rendering.

- Decode video frames in the browser
- Composite overlays in real-time using canvas
- Only for preview — final render still uses FFmpeg server-side

### 5.4 Music Generation
Use Gemini or a music API to generate background music that fits the content.

- Input: mood (upbeat, dramatic, calm), tempo, duration
- Output: royalty-free background audio track
- Auto-mixed with voiceover at appropriate volume levels

---

## Tier 1.5 — Editor Enrichments (Simple UX Wins, No New Infrastructure)

> These are small, self-contained improvements to the existing Compose page.
> They use what's already built — no new APIs, no new dependencies, no new pages.
> Each one makes the editor feel more capable without adding complexity.

---

### E1. Duplicate Slide Button

**What it does**: Adds a "copy" icon button next to each slide's delete button in the timeline. Clicking it inserts a clone of that slide immediately after the original — same image, duration, transition, and Ken Burns setting. Only the `id` is new.

**Why it matters**: Users frequently want the same image to appear twice (hold on a hero image, bookend with brand image). Currently they must re-open the picker, scroll, find, and re-add. One click is better.

**How to build it**:
- In `SlideTimeline.tsx`, add a `Copy` icon button next to the existing `Trash2` button on each slide row.
- The `onDuplicateSlide` callback receives the slide's index.
- In `Compose.tsx`, the handler deep-copies the slide at that index, gives it a new `genId()`, and inserts it at `index + 1` in the `slides` array.
- Call `patch({ slides: newSlides })` to persist.

**Scope**: ~15 lines in SlideTimeline, ~8 lines in Compose. No server changes. No new components.

---

### E2. Inline Audio Preview on Selected Tracks

**What it does**: When a voiceover or music track is selected (shows "Selected" checkmark), render an `<audio controls>` element inline so the user can hear it before rendering. Currently the DropZone only shows a checkmark — no way to listen.

**Why it matters**: The user is composing blind on audio. They pick a voiceover, can't hear it, render the full video, realize it's wrong, go back, swap, re-render. Hearing the audio before committing saves significant time and API cost.

**How to build it**:
- The `handleMediaSelect` function in Compose.tsx already receives the full `MediaJob` object, which has `outputs[0]` (the audio URL).
- Store the audio URL alongside the jobId: add `voiceUrl?: string` and `musicUrl?: string` to `ComposeProject`.
- When `pickerTarget === "voice"` and a job is selected, do `patch({ voiceJobId: job.id, voiceUrl: job.outputs?.[0] })`.
- Below the volume slider, conditionally render: `{project.voiceUrl && <audio src={project.voiceUrl} controls className="w-full mt-2" />}`.
- Same pattern for `musicUrl`.
- The `<audio>` element gives native play/pause/seek — no custom player needed.

**Scope**: Add 2 optional fields to `ComposeProject` interface. ~4 lines to store URLs on select. ~6 lines of JSX per track (voice + music). No server changes.

---

### E3. "Start Fresh" Button with Styled Confirmation

**What it does**: Adds a "Start Fresh" button in the Compose header bar (next to the mode tabs). Clicking it shows a styled in-app confirmation modal: "Clear everything and start over?" with Cancel/Confirm buttons. On confirm, resets the `ComposeProject` to `defaultProject()` and clears localStorage.

**Why it matters**: Currently, to start over, users must individually delete every slide, remove every audio track, clear captions, clear trim points, and remove the watermark. There's no reset button. Users working iteratively — trying one composition, then wanting a completely different one — are stuck doing manual cleanup.

**How to build it**:
- Add a `showClearModal` boolean state to Compose.
- Add a small icon button (e.g., `RotateCcw` from lucide) in the header bar, right side.
- On click, `setShowClearModal(true)`.
- Render a simple modal overlay (same pattern as the picker instruction banner — `AnimatePresence` + `motion.div`):
  - Semi-transparent black overlay (`bg-black/60 fixed inset-0 z-50`)
  - Centered card (`bg-zinc-900 border border-zinc-700 rounded-2xl p-6`)
  - Title: "Start Fresh?"
  - Body: "This will clear all slides, audio tracks, captions, and watermarks."
  - Two buttons: "Cancel" (zinc) and "Clear Everything" (red)
- On confirm: `setProject(defaultProject()); localStorage.removeItem(storageKey); setShowClearModal(false); toast("Composition cleared.", "info");`

**Scope**: ~40 lines of modal JSX (inline in Compose.tsx, no new component needed). One state variable. No server changes.

---

### E4. Audio Track Swap Button

**What it does**: When a voiceover or music track is already selected, shows a "Swap" button alongside the existing "Remove" link. Clicking Swap opens the media picker pre-filtered to the correct type, replacing the current selection.

**Why it matters**: "Try different music" is the most common iteration in slideshow creation. Currently the user must click Remove, then click the DropZone again, then find and select a new track. Swap combines this into one action.

**How to build it**:
- Next to the existing "Remove" button on each audio track section, add a "Swap" button (e.g., `RefreshCw` icon + "Swap" label).
- On click: `setPickerTarget("voice")` or `setPickerTarget("music")` — this is exactly what the DropZone's `onSelect` already does.
- The existing `handleMediaSelect` already overwrites the jobId, so selecting a new item replaces the old one automatically.
- The real improvement: combine this with E2 (audio preview) so the user can hear the new track immediately after swapping.

**Scope**: ~6 lines of JSX per track (a button next to Remove). No new logic — uses existing picker target system. No server changes.

---

### E5. Watermark Position Picker

**What it does**: Adds a position selector for the watermark overlay — a 3x3 grid of clickable cells representing the 9 standard positions (top-left, top-center, top-right, middle-left, center, middle-right, bottom-left, bottom-center, bottom-right). Currently the watermark has opacity control but no position control.

**Why it matters**: A brand watermark in bottom-right is standard practice. Currently the position is undefined and defaults to wherever FFmpeg places it. Giving users control is essential for brand consistency.

**How to build it**:
- Add `watermarkPosition?: string` to `ComposeProject` (e.g., "top-left", "bottom-right", "center").
- In the watermark section of Compose.tsx, below the opacity slider, render a 3x3 CSS grid (9 small squares, ~24px each).
- Each cell is a `<button>` that sets `watermarkPosition`. The active cell gets an indigo highlight.
- Pass `watermarkPosition` in the render API body (already supports arbitrary fields; server-side FFmpeg overlay filter uses position coordinates).
- Map the 9 position names to FFmpeg overlay coordinates in `compose.ts`:
  ```
  top-left:     overlay=10:10
  top-center:   overlay=(W-w)/2:10
  top-right:    overlay=W-w-10:10
  center:       overlay=(W-w)/2:(H-h)/2
  bottom-right: overlay=W-w-10:H-h-10
  ```
  (This is the only server-side change, and it's just a position mapping in the existing FFmpeg overlay filter.)

**Scope**: ~20 lines of 3x3 grid JSX. One new field on ComposeProject. ~10 lines of position mapping in compose.ts.

---

### E6. Per-Slide Text Overlay (Title Cards)

**What it does**: Each slide in the timeline already has a `textOverlay` field in the data model (`SlideTimeline.tsx` Slide type includes `textOverlay?: { text, position, style }`), and `ComposePreview.tsx` already renders it. But the UI has no way to set it. This adds a small text input per slide in the timeline.

**Why it matters**: Users want title cards ("Chapter 1: Origins"), call-to-action text ("Link in bio"), or product names on specific slides. The global caption system applies the same text to the entire video. Per-slide text is different — it's slide-specific, like PowerPoint.

**How to build it**:
- In `SlideTimeline.tsx`, add a small text input below each slide's duration/transition controls.
- Label it "Text Overlay" with a tiny input: `<input placeholder="Optional text..." />`.
- On change, call `onUpdateSlide(slide.id, { textOverlay: { text: value, position: "bottom", style: "clean" } })`.
- Optionally add a position dropdown (top/center/bottom) — but even just a text input with a default position is valuable.
- `ComposePreview.tsx` already handles rendering `textOverlay` on slides (lines 269-290), so preview works automatically.
- The render API body already includes `textOverlay` per slide (editor.md ComposeRequest spec line 319-323), so server-side rendering should work without changes.

**Scope**: ~12 lines of JSX in SlideTimeline per slide. No server changes. Preview already works.

---

### E7. Slide Duration Presets

**What it does**: Next to the per-slide duration number input, adds 3 quick-set buttons: "2s", "3s", "5s". Also adds a "Set All" dropdown in the Storyboard section header that applies a uniform duration to all slides at once.

**Why it matters**: Manually typing "3" into 10 separate number inputs is tedious. Most users want either uniform timing or just 2-3 common durations. Quick presets make this instant.

**How to build it**:
- In `SlideTimeline.tsx`, next to the duration `<input type="number">`, render 3 small pill buttons (`text-[10px]`). Clicking one calls `onUpdateSlide(slide.id, { duration: 2 })` (or 3, or 5).
- In the Storyboard section header (Compose.tsx, line 414-421), add a "Set All" button. On click, show a small popover or inline select with the same preset values. Choosing one calls `patch({ slides: project.slides.map(s => ({ ...s, duration: chosen })) })`.

**Scope**: ~10 lines per-slide preset buttons. ~15 lines for "Set All" in header. No server changes.

---

### E8. Transition Presets ("Apply All")

**What it does**: Adds a "Transition for All" dropdown in the Storyboard section header. Choosing a transition (fade, dissolve, slideright, etc.) applies it to every slide at once.

**Why it matters**: Same problem as duration — setting the same transition on 10 slides one by one is slow. Most slideshows use a single consistent transition style. One click should handle this.

**How to build it**:
- In the Storyboard section header (next to the slide count), add a select dropdown with all transition options.
- On change, map over all slides and set the chosen transition: `patch({ slides: project.slides.map(s => ({ ...s, transition: chosen })) })`.
- Consider grouping with E7 into a single "Batch Settings" popover in the header to keep the UI clean.

**Scope**: ~10 lines of JSX. One `<select>` and one handler. No server changes.

---

### E9. Total Duration Display with Audio Alignment Warning

**What it does**: The Storyboard header already shows total duration (e.g., "5 slides · 15.0s"). Enhance it:
1. If voiceover is selected and its duration is known, show both durations side by side: "Slides: 15.0s | Voice: 22.3s"
2. If there's a mismatch (slides shorter than voice, or vice versa), show an amber warning icon with tooltip: "Your voiceover is 7.3s longer than your slides. Consider adding slides or adjusting durations."

**Why it matters**: The #1 source of bad renders is audio/visual length mismatch. A voiceover that runs 10 seconds past the last slide, or slides that end in silence. This warning catches the problem before render instead of after.

**How to build it**:
- When a voice job is selected, its `MediaJob` object should include duration data. If not available from the job metadata, the `<audio>` element from E2 fires `onLoadedMetadata` which provides `audioRef.duration`. Store this as `voiceDuration?: number` on `ComposeProject`.
- In the Storyboard header, compute `slideDuration` (already done: `project.slides.reduce(...)`). Compare with `voiceDuration`.
- If `|slideDuration - voiceDuration| > 2` (more than 2 seconds off), render an `AlertTriangle` icon with a tooltip explaining the mismatch and suggesting fixes.
- The tooltip can be a simple `title` attribute — no tooltip library needed.

**Scope**: ~1 new field on ComposeProject. ~15 lines of comparison logic and warning JSX. No server changes.

---

### E10. Ken Burns Direction Control

**What it does**: Currently Ken Burns is a boolean toggle — on or off. When on, it always zooms in and drifts slightly right (`scale(1) → scale(1.12) translate(2%, -2%)`). Add a small dropdown to choose the direction: "Zoom In" (default), "Zoom Out", "Pan Left", "Pan Right".

**Why it matters**: Repeating the same zoom-in on every slide feels monotonous. Alternating directions (zoom in, pan right, zoom out, pan left) creates visual variety and makes slideshows feel professionally edited.

**How to build it**:
- Add `kenBurnsDirection?: "zoom-in" | "zoom-out" | "pan-left" | "pan-right"` to the `Slide` type in SlideTimeline.tsx.
- In SlideTimeline, when `kenBurns` is checked, show a small select dropdown for direction.
- In `ComposePreview.tsx`, update the `@keyframes kenBurns` to use different transforms based on direction:
  - `zoom-in`: `scale(1) → scale(1.12) translate(2%, -2%)` (current)
  - `zoom-out`: `scale(1.12) → scale(1)`
  - `pan-left`: `translateX(0) → translateX(-5%)`
  - `pan-right`: `translateX(0) → translateX(5%)`
- Pass `kenBurnsDirection` in the slide data to the render API. Server-side, map each direction to FFmpeg `zoompan` filter parameters.
- In compose.ts, the zoompan filter already exists for Ken Burns — just vary the `x`, `y`, `z` expressions.

**Scope**: ~1 new field on Slide type. ~5 lines of select JSX in SlideTimeline. ~15 lines of direction-to-keyframe mapping in ComposePreview. ~10 lines of filter param mapping in compose.ts.

---

### E11. Caption Highlight Color (Word-Level)

**What it does**: When using "Word-Level (Viral)" timing mode, adds a "Highlight Color" picker below the main text color picker. This sets the color of the currently-active word, while all other words use the base color.

**Why it matters**: The viral TikTok/Reels caption style works because one word pops in a different color (usually yellow or cyan) against the rest (usually white). Without a separate highlight color, all words are the same color and the word-level timing has no visual punch.

**How to build it**:
- Add `highlightColor?: string` to `CaptionConfig` (default: `"#ffff00"` yellow).
- In `CaptionEditor.tsx`, when `timing === "word"`, show a second row of color swatches labeled "Highlight Color" (same COLOR_SWATCHES array, same UI pattern — reuse the existing swatch buttons and hex input).
- Pass `highlightColor` through the render API to compose.ts.
- In `generateWordLevelASS()` (Lane 3, W1 in board.md), use `highlightColor` for the `{\c&H...&}` ASS tag on the active word.
- In the CaptionEditor live preview, show the first word in `highlightColor` and the rest in the base `color` to give a visual hint.

**Scope**: ~1 new field on CaptionConfig. ~15 lines of conditional swatch UI in CaptionEditor (copy-paste existing color section). ~2 lines to pass through API. ~3 lines to use in ASS generation.

---

### E12. Composition History (Recent Renders)

**What it does**: Adds a "Recent Renders" collapsible section at the bottom of the Compose page. On mount, fetches `/api/media/history` filtered to `type === "compose"` and shows the last 5 composed videos with thumbnail, title, timestamp, and a "Load Config" button.

**Why it matters**: Users iterate — render, watch, adjust, re-render. Currently each render disappears into the Library with no trace in the Compose page. Seeing recent renders in context helps users track what they've tried, compare results, and reload a previous config.

**How to build it**:
- On Compose mount, fetch `/api/media/history` and filter client-side for `type === "compose"`. Show last 5.
- Each item renders as a small horizontal card: thumbnail (or film icon), title, timestamp, status pill.
- "Load Config" button reads `job.composeConfig` (already stored on compose jobs) and calls `setProject(job.composeConfig)` to restore it into the editor.
- This is the same pattern Library uses for "Re-edit" — just surface it directly in Compose.
- Wrap in a collapsible `<details>` or toggle section so it doesn't clutter the main editor.

**Scope**: ~30 lines of fetch + render JSX. No new component needed — inline at bottom of Compose. No server changes (uses existing history endpoint).

---

### E13. Audio Fade In/Out Controls

**What it does**: For each audio track (voiceover and background music), adds two small number inputs: "Fade In" and "Fade Out" (in seconds, default 0). These tell FFmpeg to apply volume ramps at the start and end of each track.

**Why it matters**: Background music that starts abruptly at full volume and cuts off hard sounds jarring. A 1-2 second fade-in and fade-out is standard practice in any video with background music. Voiceovers sometimes benefit from a short fade-out too.

**How to build it**:
- Add `voiceFadeIn?: number`, `voiceFadeOut?: number`, `musicFadeIn?: number`, `musicFadeOut?: number` to `ComposeProject`.
- Below each volume slider in the audio section, add a small row: "Fade: [in ___s] [out ___s]" using compact number inputs (type="number", min=0, max=10, step=0.5).
- Default display: collapsed or "0s / 0s". Only show when a track is selected.
- Pass these values in the render API body as part of `audioTracks`:
  ```
  audioTracks: [{ jobId, volume, fadeIn: 0, fadeOut: 0 }]
  ```
- In compose.ts, apply FFmpeg `afade` filter: `afade=t=in:st=0:d=2,afade=t=out:st=28:d=2`.

**Scope**: ~4 new fields on ComposeProject. ~12 lines of compact inputs per track. ~5 lines of FFmpeg filter construction in compose.ts.

---

### E14. Speed Control for Merge Mode

**What it does**: In Merge mode, when a video is selected, adds a "Playback Speed" segmented control: 0.5x, 0.75x, 1x (default), 1.5x, 2x. This applies to the video track only (audio is separate).

**Why it matters**: Slow motion product reveals and sped-up timelapses are extremely common in social media content. The source video from Veo is always 1x speed. Letting users adjust speed without re-generating the video is a simple, powerful control. Already specced in editor.md Tier 2.6.

**How to build it**:
- Add `videoSpeed?: number` to `ComposeProject` (default 1).
- In Merge mode, below the Trim Controls section, add a "Speed" section with 5 pill buttons (same pattern as aspect ratio selector in the bottom bar).
- Pass `videoSpeed` in the render API body.
- In compose.ts, apply FFmpeg `setpts` filter: `setpts=${1/speed}*PTS`. For 2x speed: `setpts=0.5*PTS`. For 0.5x (slow-mo): `setpts=2*PTS`.
- Note: this changes video duration, which affects audio sync. Show a small note: "Audio tracks are not time-stretched — adjust accordingly."

**Scope**: ~1 new field. ~10 lines of segmented control JSX (copy aspect ratio pattern). ~3 lines of FFmpeg filter in compose.ts.

---

### E15. Composition Notes / Description Field

**What it does**: Adds a small collapsible "Notes" textarea below the title input in the Compose header. Users can jot down intent, instructions, or reminders about the composition (e.g., "This is the v2 with upbeat music for the Instagram campaign").

**Why it matters**: When users render multiple versions of a composition, they lose track of what each one was for. The title alone isn't enough context. Notes travel with the composition config into `composeConfig` on the job, so they appear in Library and can be read when using "Re-edit" or "Load Config".

**How to build it**:
- Add `notes?: string` to `ComposeProject`.
- Below the title input in the header, add a toggle icon (e.g., `FileText` from lucide). Clicking it expands a small textarea (2 rows, same styling as caption text input).
- Save notes via `patch({ notes: value })`.
- Include `notes` in the render API body. Store in the compose job manifest so it appears in Library and is restored on re-edit.

**Scope**: ~1 new field. ~10 lines of toggle + textarea JSX. ~1 line to include in API body.

---

## Implementation Priority

| Tier | What you get | Effort | Dependency |
|------|-------------|--------|------------|
| **1** | Slideshows + voiceover + captions. Covers 80% of faceless content. | ~1 sprint | FFmpeg only |
| **1.5** | 15 editor enrichments. Makes the existing editor feel polished and complete. | ~1 sprint | Tier 1 done |
| **2** | Word-level captions, text overlays, watermarks, trim, speed. Pro editing feel. | ~1-2 sprints | FFmpeg only |
| **3** | Talking avatars. "AI spokesperson" format. | ~1 sprint | Hedra/SyncLabs API |
| **4** | Templates + batch compose. Scale content production. | ~1 sprint | Tiers 1-2 done |
| **5** | Full timeline editor, Remotion, real-time preview. | ~3+ sprints | Big commitment |

**Recommended path**: Tier 1 → Tier 1.5 → Tier 4 → Tier 2 → Tier 3 → Tier 5 (if ever needed).

Tier 1.5 is pure UX polish on the existing editor — no new infrastructure, no new APIs.
It makes the editor feel like a real tool rather than a prototype. Each enrichment is
independent and can be cherry-picked in any order. Top priorities within 1.5:

| Priority | Items | Why |
|----------|-------|-----|
| Do first | E2 (audio preview), E3 (start fresh), E1 (duplicate slide) | Fixes the biggest daily friction points |
| Do second | E4 (swap track), E9 (duration warning), E7 (duration presets) | Iteration speed improvements |
| Do third | E5 (watermark position), E6 (per-slide text), E11 (highlight color) | Creative control users will ask for |
| Do whenever | E8, E10, E12, E13, E14, E15 | Nice-to-haves that round out the experience |

Templates + the basic compose engine will produce the most content with the least friction.
The word-level captions (2.1) could also be pulled into Tier 1 if you want maximum
viral potential from day one.

---

## API Structure

All composition goes through one flexible endpoint:

```
POST /api/media/compose
```

```typescript
interface ComposeRequest {
  // What to build
  type: "merge" | "slideshow" | "lipsync";

  // For slideshow
  slides?: {
    jobId: string;         // Library image job
    duration: number;      // seconds
    transition?: string;   // "fade", "slideright", "dissolve", etc.
    kenBurns?: boolean;    // slow zoom/pan
    textOverlay?: {
      text: string;
      position: "top" | "center" | "bottom";
      style: string;       // preset name
    };
  }[];

  // For merge (video + audio)
  videoJobId?: string;
  audioJobId?: string;

  // For lipsync
  faceImageJobId?: string;
  lipSyncProvider?: "hedra" | "synclabs";

  // Audio
  voiceJobId?: string;
  backgroundMusicUrl?: string;
  voiceVolume?: number;    // 0-1, default 1
  musicVolume?: number;    // 0-1, default 0.15

  // Captions
  captions?: {
    text: string;
    style: "clean" | "bold-outline" | "boxed" | "typewriter" | "word-highlight";
    fontSize?: number;
    color?: string;
    position?: "top" | "center" | "bottom";
    timing?: "sentence" | "word";  // word = viral TikTok style
  };

  // Output
  output: {
    aspectRatio: "9:16" | "16:9" | "1:1" | "4:5";
    resolution?: "720p" | "1080p";
    fps?: number;          // default 30
  };

  // Template (optional — overrides individual settings)
  templateId?: string;

  // Metadata
  projectId?: string;
  title?: string;
}
```

Response: `202 Accepted` with a job manifest. Poll for completion like video jobs.

---

## File Structure

```
src/pages/Compose.tsx          — the editor UI
src/components/
  SlideTimeline.tsx            — storyboard/timeline view
  TransitionPicker.tsx         — transition selector dropdown
  CaptionEditor.tsx            — caption text + style config
  MediaPickerPanel.tsx         — browse Library items to add
  ComposePreview.tsx           — CSS-based approximate preview
  AvatarPicker.tsx             — (Tier 3) select saved avatars
server/
  compose.ts                   — FFmpeg orchestration logic
  templates.ts                 — composition template definitions
data/
  compose-templates/           — JSON template files
```

---

## Tier 6 — Compose Next: Honest Audit & Roadmap (March 2025)

> This section is the result of a full audit of the shipped compose system as of Sprint 9.
> It asks: what can we realistically build that adds real value, and what should we
> just use CapCut (or DaVinci / Premiere) for?

---

### 6.0 What's Actually Shipped (Engine Capabilities)

Before planning, here's the truthful **"what works today"** inventory:

| Feature | Status | Engine | Notes |
|---------|--------|--------|-------|
| **Video+Voiceover Merge** | ✅ Shipped | FFmpeg `mergeVideoAudio()` | Multi-track audio, volume, fade in/out |
| **Image Slideshow** | ✅ Shipped | FFmpeg `createSlideshow()` | Video slides now supported too |
| **Video Slides in Slideshow** | ✅ Shipped | `-stream_loop -1` | Fixed this sprint — mp4 inputs work |
| **xfade Transitions** | ✅ Shipped | 12 transitions exposed | FFmpeg supports 40+, we show 12 |
| **Ken Burns (4 directions)** | ✅ Shipped | `zoompan` filter | zoom-in, zoom-out, pan-left, pan-right |
| **Sentence-Level Captions** | ✅ Shipped | ASS subtitles | 5 style presets, position control, color |
| **Word-Level Captions** | ✅ Shipped | `generateWordLevelASS()` | Proportional timing by character count |
| **Watermark Overlay** | ✅ Shipped | 9-position grid | Opacity + position picker works |
| **Per-Slide Text Overlay** | ✅ Shipped | SlideTimeline UI | Text + position (top/center/bottom) |
| **Audio Fade In/Out** | ✅ Shipped | `afade` filter | Per-track fade controls |
| **Trim Points (Merge)** | ✅ Shipped | `-ss`/`-to` | In/out point controls |
| **Templates** | ✅ Shipped | 6 JSON templates + AI suggestion | Template selection + artifact-tuned |
| **Speed Control** | ⬜ Specced only | `setpts` filter | E14 — not wired to UI |
| **Highlight Color (word caps)** | ⬜ Specced only | ASS `\c&H...&` | E11 — not wired to UI |
| **Subtitle Entrance Animations** | ⬜ Specced only | ASS `\fad`, `\t` | 2.8.4 — not built |
| **Subtitle Background Box** | ⬜ Specced only | ASS `\3c`, `\4c` | 2.8.1 — not built |
| **Font Selection** | ⬜ Specced only | `Fontname=X` in ASS | 2.8.5 — needs bundled fonts |
| **Multi-Line Caption Control** | ⬜ Specced only | Line-split logic | 2.8.3 — not built |

So roughly: **Tier 1 is done. Half of Tier 1.5 is done. Tier 2 is partially done (captions, watermarks, trim). Tiers 2.5-5 are essentially untouched.**

---

### 6.1 The Big Question: Build vs. CapCut

Here's the honest breakdown of what Gemlink can realistically own versus what's better left to dedicated NLEs:

#### ✅ BUILD — These add unique value that CapCut can't replicate

| Feature | Why build it | Effort |
|---------|-------------|--------|
| **Agent-Assisted Compose** | CapCut can't read your brand strategy, look at your media plan, and auto-build a composition. This is our unique moat. | Medium |
| **Streaming Word Subtitles** | We already have the engine (`generateWordLevelASS`). Just needs highlight color, entrance animation, and karaoke background box. These are ASS tag additions — no new infra. | Small |
| **Media Plan → Auto-Compose** | A second AI reasoning pass over the plan that groups images+voice into compositions, assigns transitions based on brand feel, and queues renders. Nobody else does this. | Medium |
| **Post-Render Add Slide** | Let the user add/insert an image to an existing slideshow after initial assembly, without starting over. Already possible — just wire the "insert at index" logic. | Small |
| **Full Transition Library** | We have 12 of 40+ FFmpeg transitions. Expanding is pure UI — no engine changes. | Tiny |

#### ⚠️ BUILD CAREFULLY — Diminishing returns, keep it minimal

| Feature | Risk | Recommendation |
|---------|------|----------------|
| **Text Positioning (drag-to-place)** | We'd need a canvas-based overlay editor. Worth doing only as a simple 9-position grid (like watermark), NOT a freeform drag. | Build the 9-grid version. Skip freeform. |
| **Text Effects (typewriter, bounce, glow)** | ASS supports `\fad`, `\t\fscx`, `\t\blur` for basic animation. But truly premium text animation (bounce, glitch, shake) requires Remotion or canvas rendering. | Build the 4 ASS-native effects. Skip fancy ones. |
| **Timing Row for Text** | A visual timeline showing when each word/sentence appears. This is the gateway to a full NLE timeline, which is Tier 5 territory. | Build a simple read-only "caption timeline bar" that shows word blocks, NOT a full draggable editor. |
| **Speed Ramp** | Variable speed within a single clip (slow-mo then fast) is very complex in FFmpeg's filtergraph. Constant speed is trivial. | Build constant speed only (0.5x–2x segmented control). Skip variable ramp. |

#### ❌ DON'T BUILD — Use CapCut/Premiere for these

| Feature | Why not | Alternative |
|---------|---------|-------------|
| **Freeform text drag positioning** | Requires a canvas compositing engine. Months of work for something CapCut does perfectly. | Export to CapCut for fine positioning. |
| **Multi-track visual timeline** | This is DaVinci Resolve. We'd be building an NLE inside a marketing tool. | Use the storyboard (cards) for ordering, export for precise editing. |
| **Motion graphics / animated overlays** | Requires Remotion or After Effects. Way outside our stack. | Use CapCut templates or Canva. |
| **Keyframe animation editor** | The core of any NLE. Completely impractical to build well. | CapCut or Premiere. |
| **Audio waveform scrubbing** | Needs WebAudio API + canvas rendering. Big project for small payoff. | Match durations using the E9 warning system. |
| **Split-screen / picture-in-picture** | Complex FFmpeg overlay math with positioning. Fragile. | CapCut has one-click PiP. |

---

### 6.2 Agent-Assisted Compose ("Compose with Agent")

This is the **killer feature** that no standalone editor has. Here's how it works:

#### The Flow

```
Media Plan (approved items) → Agent Reasoning Pass → Proposed Composition → User Review → Render
```

#### What the Agent Does (Second Reasoning Session)

The Media Plan already has a "Quick Plan" AI that generates items. The **second reasoning pass** would:

1. **Group approved media** — cluster images/videos by purpose, topic, or tags
2. **Assign slide order** — put "hook" imagery first, "CTA" last, "features" in middle
3. **Choose transitions** — match brand feel (fast cuts for Gen Z, dissolves for luxury)
4. **Set timing** — shorter slides for high-energy brands, longer for "premium" feel
5. **Write caption text** — generate voiceover script from the slide sequence
6. **Pick caption style** — bold-outline for TikTok, clean for LinkedIn, word-highlight for Reels
7. **Suggest music mood** — "upbeat", "cinematic", "chill" (for future Lyria integration)

#### How to Build It

This is essentially `templateSuggestionFromArtifact()` (already in compose.ts!) but operating on the **actual media plan items** instead of an artifact:

```typescript
// New endpoint: POST /api/media/plan/:planId/auto-compose
// Input: { items: MediaPlanItem[] }
// Output: ComposeProject (ready to load into Compose page)
```

The server would:
1. Read the approved items from the plan
2. Read any pinned strategy artifacts for brand context
3. Call Gemini with both + ask for a composition config
4. Return a `ComposeProject` JSON that the frontend loads directly into `setProject()`
5. User sees the pre-built composition, tweaks anything, hits Render

**Effort**: ~1 day. The hardest part is prompt engineering the Gemini call. The plumbing already exists.

---

### 6.3 Streaming Word Subtitles (The Viral Caption Stack)

What makes TikTok/Reels captions feel premium:

1. ✅ **Word-by-word timing** — we have this (`generateWordLevelASS`)
2. ⬜ **Active word highlight color** — specced as E11, needs wiring
3. ⬜ **Background box on active word** — specced as 2.8.1, ASS tags only
4. ⬜ **Entrance animation** — specced as 2.8.4, ASS `\fad` + `\t` tags
5. ⬜ **Multi-line auto-wrap** — specced as 2.8.3, line-split logic
6. ⬜ **Font selection** — specced as 2.8.5, need to bundle 2-3 TTF files

All six of these are **ASS subtitle tag modifications** in `compose.ts`. No new FFmpeg filters. No new infrastructure. The total change to `generateWordLevelASS()` is probably ~80 lines.

#### Priority order for subtitle work:

| Step | What | Impact | Effort |
|------|------|--------|--------|
| 1 | **Highlight color** (E11) | Makes word-level mode visually obvious | ~20 lines |
| 2 | **Background box** (2.8.1) | The "karaoke" look everyone wants | ~30 lines |
| 3 | **Entrance animation** (2.8.4) | Words feel alive instead of static | ~15 lines |
| 4 | **Multi-line wrap** (2.8.3) | Prevents text overflow on 9:16 | ~25 lines |
| 5 | **Font selection** (2.8.5) | Premium feel — needs font files | ~20 lines + font download |

Total for all 5: **~110 lines of ASS generation logic + 6 lines of CaptionEditor UI per feature**.

---

### 6.4 Text Positioning & Effects (Realistic Scope)

#### What we CAN build with ASS subtitles:

The ASS format supports positional override tags that let us place text anywhere on screen:

```
{\an7}     top-left        {\an8}     top-center        {\an9}     top-right
{\an4}     middle-left     {\an5}     center            {\an6}     middle-right
{\an1}     bottom-left     {\an2}     bottom-center     {\an3}     bottom-right
```

We can also do these ASS-native text effects:
- `\fad(500,300)` — Fade in 500ms, fade out 300ms
- `\t(\fscx120\fscy120,\fscx100\fscy100)` — Pop-in (scale up then settle)
- `\t(\blur10,\blur0)` — Blur-in (soft entrance)
- `\move(x1,y1,x2,y2)` — Slide text from one position to another
- `\kf` — Karaoke fill (already using this for typewriter)

**Action**: Build a 9-position grid (reuse watermark picker component) for caption placement. Add 4 entrance animation options. ~40 lines of UI + ~20 lines of ASS tag logic.

#### What we CANNOT build without a canvas editor:

- Freeform pixel-position text dragging
- Text along a curved path
- Per-character animation (bounce, wave, shake)
- Animated emoji
- Text masked by video content

**Verdict**: Don't build these. CapCut's text editor is world-class for this.

---

### 6.5 Post-Assembly Image Insertion

> "Can we add an image to the slideshow afterwards?"

**Yes, and this is already mostly wired.** The slide timeline has:
- Drag-to-reorder (via `@dnd-kit`)
- Duplicate slide button
- Delete slide button
- Media picker opens on "slide" target

What's missing is an **"Insert After" action** that opens the picker and inserts at a specific index rather than appending to the end. This is ~10 lines:

```typescript
function insertSlideAfter(index: number, job: MediaJob) {
  const slide = jobToSlide(job);
  const next = [...project.slides];
  next.splice(index + 1, 0, slide);
  patch({ slides: next });
}
```

Add an "+" button between each slide card in the timeline. On click, open picker with `pickerTarget = "slide-insert"` and save the target index. When media is selected, insert at that index instead of appending.

---

### 6.6 Caption Timing Bar (Read-Only Timeline)

A visual bar showing when each word or sentence appears, without being a full timeline editor.

```
┌─────────────────────────────────────────────────────┐
│ ██ Welcome ██ to ██ our ██ brand ██████ new ██ prod │
│ 0s          2s        4s        6s        8s    10s │
└─────────────────────────────────────────────────────┘
```

- Each word gets a colored block proportional to its duration
- Active word (during preview playback) highlights
- NOT draggable (that's a full NLE feature)
- Purely informational: helps the user see if timing feels right before rendering

**How to build**: In `CaptionEditor.tsx`, when `timing === "word"`, compute the word durations using the same proportional-character-count algorithm from `generateWordLevelASS()`. Render as a flex row of `<div>` blocks with widths proportional to duration. ~40 lines of UI.

---

### 6.7 Media Plan Agent: Second Reasoning Session

The existing "Quick Plan" generates items from a text description. A **second reasoning pass** would:

1. Look at the completed/approved items in the plan
2. Read pinned strategy artifacts for brand context
3. Propose a complete `ComposeProject`:
   - Which items become slides, in what order
   - Which voice job is the voiceover
   - Which music job is the background track
   - Slide durations, transitions, caption style
   - Output aspect ratio based on target platform
4. Load the proposed config into Compose for user review

This is the glue between Media Plan and Compose. It turns "I generated 8 images and a voiceover" into "here's a ready-to-render video" with one click.

**Endpoint**: `POST /api/media/plan/:planId/auto-compose` (already stubbed in MediaPlan.tsx as `handleAutoCompose`)

**Effort**: ~1 day for the endpoint + prompt engineering. Frontend wiring already exists.

---

### 6.8 Updated Roadmap: What to Build Next

Given everything above, here's the recommended sequence — optimized for **maximum impact with minimum effort**, keeping us out of "building an NLE" territory:

| Phase | What | Effort | Why |
|-------|------|--------|-----|
| **Next (1 day)** | Full transition library (expose all 40+ FFmpeg xfade transitions) | Tiny | Pure UI change, huge perceived improvement |
| **Next (1 day)** | Highlight color for word-level captions (E11) | Small | Makes viral captions actually look viral |
| **Next (1 day)** | Caption entrance animations (fade/pop/blur) | Small | Captions feel alive |
| **Next (1 day)** | Karaoke background box on active word | Small | The look everyone wants |
| **Sprint** | Agent-Assisted Compose (plan → auto-compose → render) | Medium | Our unique moat. Nobody else has this. |
| **Sprint** | Speed control for merge mode (E14) | Small | 5 pill buttons + 1 FFmpeg filter |
| **Sprint** | Insert slide at index (post-assembly) | Small | "+" button between slide cards |
| **Sprint** | Caption timing bar (read-only) | Small | Informational, prevents bad renders |
| **Sprint** | Multi-line caption auto-wrap | Small | Fixes text overflow on 9:16 |
| **Sprint** | Font selection (bundle 3 fonts) | Small | Premium feel for captions |
| **Later** | 9-position caption placement (reuse watermark grid) | Small | More text control without freeform drag |
| **Later** | Composition notes field (E15) | Tiny | Helps track iterations |
| **Never** | Freeform text drag, multi-track timeline, keyframes | Huge | Use CapCut. We are not an NLE. |

---

### 6.9 The CapCut Line

This is the rule for deciding what to build:

> **If it can be done with an FFmpeg filter or ASS subtitle tag, build it.**
> **If it requires a canvas-based visual editor, use CapCut.**

Everything above the line runs server-side, renders deterministically, and can be automated by the AI agent. Everything below the line requires a visual compositing engine that would take months to build and years to polish.

Our competitive advantage is **AI-driven composition from brand context** — not pixel-level video editing. The agent reads your strategy, understands your brand, groups your media intelligently, and produces a render-ready composition. CapCut can't do that. We focus there.

The export story is: Gemlink produces the 80% version. If you need the last 20% (text animations, split screen, motion graphics), download the video from Library and open it in CapCut for final polish.

---

## Tier 7 — Critical UX Gaps (Identified March 2025)

> These are real, testable bugs and missing connections found during hands-on usage.
> Each item describes what currently happens, what should happen, and how to fix it.
> **These should be prioritized before any new feature work** — they break the core flow.

---

### 7.1 Auto-Compose Does NOT Actually Pre-Fill Compose

**What happens now**: MediaPlan's `handleAutoCompose` calls the server → gets composition groups → shows modal → stores to `sessionStorage("auto-compose-groups")` → navigates to `/compose`. **But Compose.tsx never reads `auto-compose-groups` from sessionStorage.** It only reads `compose-send-item`. So the user lands on a blank Compose page.

**What should happen**: When the user clicks "Compose All", Compose should load up with the first composition group's slides pre-filled, voiceover matched, captions auto-populated from the voice text, and the template's transitions/durations applied. The user should see a fully assembled storyboard ready to tweak and render.

**How to fix**:

In `Compose.tsx`, add a second `useEffect` on mount that reads `auto-compose-groups`:

```typescript
useEffect(() => {
  const raw = sessionStorage.getItem("auto-compose-groups");
  if (!raw) return;
  sessionStorage.removeItem("auto-compose-groups");
  try {
    const groups = JSON.parse(raw);
    if (!groups.length) return;
    const first = groups[0]; // load first group for now
    
    // Build slides from slideJobIds
    const slides = first.slideJobIds.map((jobId, i) => ({
      id: genId(),
      jobId,
      thumbnail: null, // will be resolved when picker loads
      duration: first.template?.slides?.[i]?.duration ?? 3,
      transition: first.template?.slides?.[i]?.transition ?? "fade",
      kenBurns: first.template?.slides?.[i]?.kenBurns ?? false,
    }));
    
    const newProject: ComposeProject = {
      ...defaultProject(),
      mode: "slideshow",
      title: first.title || "Auto-Composed",
      slides,
      voiceJobId: first.voiceJobId || undefined,
      captionConfig: first.captionText ? {
        ...DEFAULT_CAPTION_CONFIG,
        text: first.captionText,
        style: first.template?.captions?.style ?? "bold-outline",
        timing: first.template?.captions?.timing ?? "word",
        position: first.template?.captions?.position ?? "bottom",
      } : undefined,
      outputConfig: {
        aspectRatio: first.template?.aspectRatio ?? "9:16",
        resolution: "1080p",
        fps: 30,
      },
    };
    
    setProject(newProject);
    saveProject(newProject);
    toast(`Loaded "${first.title}" — ${slides.length} slides ready.`, "success");
  } catch { /* ignore */ }
}, []);
```

Additionally, the auto-compose endpoint should resolve slide thumbnails (the actual output URLs) so the Compose page shows the images immediately, not blank cards.

**Effort**: ~40 lines in Compose.tsx + ~10 lines in auto-compose endpoint to include output URLs.

---

### 7.2 Videos Don't Work as Slideshow Slides

**What happens now**: When you add a video to the slideshow timeline, two problems:

1. `jobToSlide()` hardcodes `duration: 3` regardless of the actual video length.
2. The slide thumbnail doesn't show (video cards may show blank if `.mp4` URL isn't handled).
3. In `createSlideshow()` (compose.ts), video slides use `-stream_loop -1` which loops them, but the `tpad=stop_mode=clone:stop_duration=` filter still applies — which was designed for still images, not videos.

**What should happen**: When a video is added as a slide, the system should:
- Probe the video's actual duration (using `probeMedia()` or reading it from the manifest/DB)
- Default the slide duration to the video's actual length
- Show a video thumbnail (first frame or the video element itself)
- In FFmpeg, handle video slides differently from image slides (trim to duration instead of tpad)

**How to fix**:

1. **Add `duration` to `MediaJob` interface** in MediaPickerPanel.tsx:
```typescript
export interface MediaJob {
  // ...existing fields...
  duration?: number;  // in seconds — available for video/voice/music
}
```

2. **Return `duration` from the history API**: The DB schema already has `duration` on `MediaJobRow` and compose jobs. The `collectHistory()` function just doesn't map it. Add `duration: row.duration ?? undefined` to the flat-file scan result too (read from manifest).

3. **Update `jobToSlide()`** in Compose.tsx:
```typescript
function jobToSlide(job: MediaJob): Slide {
  const thumb = job.outputs?.[0] ?? job.outputPath ?? null;
  return {
    id: genId(),
    jobId: job.id,
    thumbnail: thumb,
    jobType: job.type,
    duration: job.type === "video" ? (job.duration ?? 8) : 3,
    transition: "fade",
    kenBurns: job.type !== "video", // Ken Burns on images only
  };
}
```

4. **Fix compose.ts `createSlideshow()`** — video slides should NOT get `tpad`/`zoompan`, they should get `trim=duration=X`:
```typescript
if (isImageFile(slide.imagePath)) {
  // existing tpad logic for images
} else {
  // Video slide: trim to requested duration, no tpad
  filterParts.push(
    `[${i}:v]${scaleFilter},trim=duration=${dur},setpts=PTS-STARTPTS,fps=${fps}[v${i}]`
  );
}
```

**Effort**: ~30 lines across Compose.tsx, server.ts, and compose.ts.

---

### 7.3 Planner Agent Doesn't Know Video Duration Limits

**What happens now**: The plan/suggest AI prompt says nothing about how long generated videos actually are. It doesn't know Veo produces ~8 second clips. So it might plan a "30-second product demo" as a single video item, which will fail or produce an 8s clip.

**What should happen**: The system prompt should tell the AI:
- Veo generates clips of **up to 8 seconds**
- If you need a longer video, plan it as **multiple video clips** or a **slideshow of images with voiceover**
- Music generation is **up to 30 seconds**
- Voice generation depends on text length

**How to fix** — in `server.ts` line ~1672, add to the system prompt:

```typescript
"- VIDEO DURATION: Video generation (Veo) produces clips of up to 8 seconds each. For longer content, plan multiple video clips or use an image slideshow with voiceover.",
"- AUDIO DURATION: Music generation produces tracks up to 30 seconds. Voice generation length depends on text.",
"- ASPECT RATIOS: Videos only support 16:9 (widescreen) and 9:16 (vertical). Images support any ratio.",
"- For promptTemplate on video items: keep the action describable in 8 seconds or less.",
```

**Effort**: 4 lines added to the system prompt string array.

---

### 7.4 Thinking Depth Control for the Planner

**What the user wants**: A way to control how deeply the AI reasons about the media plan — a "think more" vs "quick" toggle.

**How to implement**:

1. **UI**: Add a small segmented control or dropdown next to the "Quick Plan" button in MediaPlan.tsx:
   - **Quick** — current behavior (single Gemini call, `gemini-2.5-flash`)
   - **Deep** — uses `gemini-2.5-pro` with a much richer system prompt that asks for strategic reasoning before generating items
   - **Think Again** — re-runs the AI on the *existing* plan items asking it to critique and improve them

2. **"Deep" mode** — uses a two-pass approach:
   - Pass 1: "Analyze this brand and project. What types of content will perform best? What's the optimal mix of formats?"
   - Pass 2: "Based on your analysis, generate a specific media plan."
   - Uses the thinking/extended model for more nuanced plans

3. **"Think Again" mode** — takes the current items and sends them to the AI:
   - "Here is the current media plan. Critique it. What's missing? What should be reworded? What order should they be generated in? Suggest improvements."
   - Returns revised items or additional items

4. **Add state**:
```typescript
const [thinkingDepth, setThinkingDepth] = useState<"quick" | "deep">("quick");
```

5. **Pass to server**:
```typescript
body: JSON.stringify({
  description: naturalInput,
  depth: thinkingDepth,
  // ...
})
```

6. **Server-side**: When `depth === "deep"`, use the multi-stage pipeline endpoint (which already exists at line ~1726 in server.ts), OR switch to a thinking model.

**Effort**: ~15 lines UI + ~20 lines server prompt logic.

---

### 7.5 Planner Should Think About Formatting & Composition

**What happens now**: The plan/suggest prompt only thinks about what assets to generate (images, videos, voice). It doesn't think about:
- What subtitle/caption style would work best
- What transitions suit the brand
- What aspect ratio each platform needs
- How the assets should be sequenced
- What animation style the captions should use

**What should happen**: The planner should output **composition metadata** alongside the asset list:

```json
{
  "items": [ ... ],
  "compositionSuggestion": {
    "captionStyle": "word-highlight",
    "captionAnimation": "pop",
    "transitionStyle": "smoothleft",
    "aspectRatio": "9:16",
    "slideDuration": 3,
    "kenBurns": true,
    "mood": "upbeat, energetic",
    "reasoning": "Gen Z audience → fast cuts, bold captions, vertical format"
  }
}
```

This composition suggestion would be stored on the plan and automatically loaded when you hit Auto-Compose.

**How to fix**: Add `compositionSuggestion` to the plan/suggest server prompt output schema, and store it alongside the plan items in the frontend.

**Effort**: ~10 lines in server prompt + ~5 lines to store/pass the suggestion.

---

### 7.6 Captions vs. Subtitles vs. Narration — Three Different Things

**The user's insight is critical.** These are three different features that currently get conflated:

| Concept | What it is | Source | Current state |
|---------|-----------|--------|---------------|
| **Narration / Voiceover** | TTS audio track layered on the video | User types text → TTS generates audio | ✅ Works — voice generation + merge |
| **Captions** | Burned text that matches the spoken narration | Should auto-populate from voiceover text | ❌ User has to manually type the same text into CaptionEditor |
| **Subtitles** | Separate timed text (translations, descriptions) | Different from narration | ❌ No distinction — CaptionEditor handles both |

**What should happen**:

1. **When a voiceover is selected**, the caption text should **auto-fill from the voiceover's source text** — the user should NOT have to retype it. The voice job's `text` or `prompt` field contains the narration script. When the user selects a voice track, the CaptionEditor should immediately populate with that text.

2. **Caption style should be choosable** — show the style grid (clean, bold-outline, word-highlight, etc.) prominently when a voiceover is detected.

3. **The flow should be**:
   - User picks voiceover → captions auto-fill with voiceover text
   - User sees style presets → picks one
   - Caption timing auto-matches the voiceover duration
   - User can edit the text if they want different wording

**How to fix** — in Compose.tsx `handleMediaSelect()`:

```typescript
if (pickerTarget === "voice") {
  patch({ 
    voiceJobId: job.id,
    captionConfig: {
      ...DEFAULT_CAPTION_CONFIG,
      text: job.text || job.prompt || "",   // auto-fill from voice
      style: "bold-outline",
      timing: "word",
    }
  });
  toast("Voiceover added. Captions auto-filled from narration text.", "success");
}
```

**Also**: Add a visible "Auto-fill from voiceover" button in the CaptionEditor that pulls text from the currently selected voice job (for cases where the user changes the text and wants to reset).

**Effort**: ~15 lines in Compose.tsx + ~10 lines of UI in CaptionEditor.

---

### 7.7 Animated Subtitles as Media Plan Items

**What the user wants**: The Media Plan should include subtitle/caption configuration as first-class plan items, not just images and voice. The planner should be able to say "this video needs word-level bold-outline captions in 9:16".

**How to implement**:

1. **Add `captionConfig` as an optional field on `MediaPlanItem`**:
```typescript
interface MediaPlanItem {
  // ...existing...
  captionConfig?: {
    style: "clean" | "bold-outline" | "boxed" | "word-highlight";
    timing: "sentence" | "word";
    animation?: "none" | "fade" | "pop" | "blur";
    position?: "top" | "center" | "bottom";
  };
}
```

2. **The planner AI should output this** for voice items — when it plans a voiceover, it should also specify what caption style goes with it.

3. **Auto-Compose should read these** and apply them to the composition.

**Effort**: ~5 lines to add the field + ~10 lines in the planner prompt to include it.

---

### 7.8 "Think Again" Button — Re-Analyze an Existing Plan

**What it does**: A button that takes the current plan items and sends them back to the AI for critique and improvement. Different from "Quick Plan" which starts fresh.

**UI**: Add a "🔄 Think Again" button next to "Quick Plan" that appears when there are existing items.

**Server**: New endpoint or parameter on existing `/api/media/plan/suggest`:

```typescript
body: {
  mode: "refine",  // vs "generate"
  existingItems: activePlan.items,
  description: "Review and improve this plan", 
}
```

The AI would:
- Review the existing items
- Suggest reworded prompts for better generation results
- Flag missing items (e.g., "you have images but no voiceover")
- Suggest ordering for composition
- Recommend caption/transition styles

**Effort**: ~20 lines endpoint + ~10 lines UI button/handler.

---

### 7.9 Video Duration Defaults to 3s in Slideshow

**This is a concrete bug.** The `jobToSlide()` function in Compose.tsx hardcodes `duration: 3` for ALL slides regardless of type.

```typescript
function jobToSlide(job: MediaJob): Slide {
  return {
    duration: 3,  // ← this is wrong for video slides!
    // ...
  };
}
```

A 10-second Veo video becomes a 3-second slide. This is because:
1. `MediaJob` interface doesn't have `duration`
2. The history API doesn't return `duration` (even though the DB stores it)
3. `jobToSlide()` can't read what it doesn't have

See **7.2** for the full fix.

---

### 7.10 Summary: Priority Order for Tier 7

These break the core Media Plan → Compose flow and should be fixed before adding new features:

| # | Issue | Severity | Fix Size |
|---|-------|----------|----------|
| **7.1** | Auto-Compose doesn't pre-fill Compose | 🔴 Critical | ~40 lines |
| **7.2** | Videos don't work as slideshow slides | 🔴 Critical | ~30 lines |
| **7.6** | Voiceover doesn't auto-fill captions | 🔴 Critical | ~15 lines |
| **7.9** | Video duration hardcoded to 3s | 🔴 Critical | ~10 lines (part of 7.2) |
| **7.3** | Planner doesn't know video duration limits | 🟡 Medium | ~4 lines |
| **7.4** | No thinking depth control | 🟡 Medium | ~35 lines |
| **7.5** | Planner doesn't think about formatting | 🟡 Medium | ~15 lines |
| **7.7** | Animated subtitles in media plan | 🟢 Enhancement | ~15 lines |
| **7.8** | "Think Again" button | 🟢 Enhancement | ~30 lines |

The 🔴 items are **bugs** — things that are technically wired but don't actually work end-to-end. Fix these first. The 🟡 items make the planner smarter. The 🟢 items are genuine new features.

Total to fix all 🔴 bugs: **~95 lines of code** spread across 3 files. These should be a single sprint's worth of focused work.

---

## Tier 8 — Compose UX Overhaul: From Tool to Flow (March 2025)

> This tier addresses the **structural UX problems** in the Compose page — not missing features,
> but wrong architecture. The current 3-mode tab system forces users to think like an engineer
> ("Is this a merge or a slideshow?") instead of thinking like a creator ("I want a video with
> a voiceover and animated captions"). Every fix here also makes the compose API more natural
> for agent-driven workflows.

---

### 8.0 The Three Structural Problems

Before any feature work, these are the root causes of friction:

| Problem | What happens | Why it's wrong |
|---------|-------------|----------------|
| **Rigid 3-mode system** | User must pick Slideshow/Merge/Captions before adding any media | The right mode depends on WHAT you add. Single video + voiceover = merge. 5 images = slideshow. The system should infer this. |
| **Captions missing from Merge mode** | The CaptionEditor component only renders in Slideshow and Captions modes. Merge mode has no caption UI. | The #1 use case is video + voiceover + animated captions. Currently requires two separate renders across two modes. |
| **Voiceover and captions are disconnected** | User adds a voiceover, then has to manually retype the same text into the CaptionEditor | The voice job already has the source text. Captions should auto-fill instantly. |

These three problems cascade: because captions aren't in merge mode, users who want
video + voice + captions don't know what mode to pick. They try merge (no captions), try
captions (no audio mixing), and end up doing two passes. The "easy" path doesn't exist.

---

### 8.1 Kill the Mode Tabs — Adaptive Compose

**Current**: Three rigid tabs (Slideshow | Merge | Captions Only) that determine which UI
panels are visible. User picks a mode first, then adds media.

**Proposed**: One unified canvas that adapts based on what media is present. No tabs. The UI
shows exactly the controls that are relevant to the current state.

#### The Adaptive Logic

```
IF slides.length > 0 AND no video clip selected:
  → Show SlideTimeline + slide controls (this is a slideshow)
ELSE IF video clip selected AND slides.length === 0:
  → Show video preview + trim controls (this is a merge/enhance)
ELSE IF slides.length > 0 AND video clip selected:
  → Show both — video becomes a slide in the timeline
END

ALWAYS show (when relevant):
  → Voiceover track (if voice job selected OR user clicks "Add Voiceover")
  → Music track (if music job selected OR user clicks "Add Music")
  → CaptionEditor (if voiceover is present OR user clicks "Add Captions")
  → Watermark section (if watermark selected)
  → Output settings (aspect ratio, resolution)
```

#### How This Changes Compose.tsx

Replace the `ComposeMode` type and `MODE_TABS` with derived state:

```typescript
// Remove: export type ComposeMode = "slideshow" | "merge" | "captions";
// Remove: MODE_TABS array
// Remove: mode tabs UI in header

// Add: derived display mode (for the render API, not UI)
function deriveMode(project: ComposeProject): "slideshow" | "merge" | "caption" {
  if (project.slides.length > 0) return "slideshow";
  if (project.videoJobId) {
    if (project.captionConfig?.text && !project.voiceJobId && !project.musicJobId) {
      return "caption";  // video + captions only, no audio mixing
    }
    return "merge";
  }
  return "slideshow"; // default empty state
}
```

The UI becomes a single scrollable editor where sections appear/disappear based on state:

```
┌──────────────────────────────────────────────────────────┐
│  COMPOSE  "My Brand Video"                  [Start Fresh]│
├──────────┬───────────────────────────────────────────────┤
│          │                                               │
│  MEDIA   │  ┌─ VISUAL TRACK ──────────────────────────┐ │
│  PICKER  │  │ [slide] [slide] [slide] [+ Add]         │ │  ← shows if slides exist
│          │  │  OR                                      │ │
│          │  │ [Video Clip: selected ✓] [Trim: 0-8s]   │ │  ← shows if video selected
│          │  └─────────────────────────────────────────┘ │
│  (always │                                               │
│   open)  │  ┌─ VOICEOVER TRACK ───────────────────────┐ │  ← shows when voice selected
│          │  │ 🎤 [audio player] Vol: [===] Fade: in/out│ │
│          │  └─────────────────────────────────────────┘ │
│          │                                               │
│          │  ┌─ MUSIC TRACK ───────────────────────────┐ │  ← shows when music selected
│          │  │ 🎵 [audio player] Vol: [===] Fade: in/out│ │
│          │  └─────────────────────────────────────────┘ │
│          │                                               │
│          │  ┌─ ANIMATED CAPTIONS ─────────────────────┐ │  ← shows when voice OR manual
│          │  │ "Welcome to our brand..."  [from voice ↻]│ │
│          │  │ Style: [Clean] [Bold] [Boxed] [Type] [HL]│ │
│          │  │ Timing: [Sentence] [Word-Level]          │ │
│          │  │ Animation: [None] [Fade] [Pop] [Blur]    │ │
│          │  │ Position: [Top] [Center] [Bottom]        │ │
│          │  └─────────────────────────────────────────┘ │
│          │                                               │
│          │  ┌─ WATERMARK (optional) ──────────────────┐ │
│          │  │ [image] Position: [grid] Opacity: [===]  │ │
│          │  └─────────────────────────────────────────┘ │
│          │                                               │
├──────────┴───────────────────────────────────────────────┤
│ [9:16 Reels] [16:9 Wide] [1:1] [4:5]  [720p] [1080p]   │
│                                    [Preview]  [🎬 Render]│
└──────────────────────────────────────────────────────────┘
```

#### What the Agent Sees

No change to the compose API — it still takes `type: "merge" | "slideshow" | "caption"`.
The `deriveMode()` function maps the UI state to the API type automatically. An agent
calling `POST /api/media/compose` directly already bypasses the mode tabs entirely — this
change just makes the human UI match the API's flexibility.

**Effort**: Medium (~100 lines of refactoring). The render logic doesn't change. Only the
conditional rendering in the JSX changes — replacing `{project.mode === "slideshow" && ...}`
with `{project.slides.length > 0 && ...}`.

---

### 8.2 Voiceover → Animated Captions: The One-Click Pipeline

This is the highest-impact UX fix. The current flow for "video with voiceover and animated
captions" is 10+ actions. It should be 4.

#### Current Flow (painful)

1. Pick mode (merge? captions? which one?)
2. Select video
3. Open picker for voiceover
4. Select voiceover
5. Adjust volume
6. Realize captions aren't available in merge mode
7. Switch to captions mode (lose audio settings)
8. Re-select video
9. Manually type the voiceover text into CaptionEditor
10. Pick caption style
11. Pick timing mode
12. Render — but now there's no voiceover audio because captions mode doesn't merge audio

#### Proposed Flow (delightful)

1. Drop a video from the Library
2. Drop a voiceover → **captions auto-fill, style picker appears, timing defaults to word-level**
3. Pick a caption style (one click on a visual preset card)
4. Hit Render

#### Implementation: Auto-Caption on Voiceover Selection

When a voiceover job is selected, the system should:

1. **Read the voice job's source text** from its metadata (the `prompt` or `text` field
   stored in the job manifest/DB)
2. **Auto-fill the CaptionEditor** with that text
3. **Default to word-level timing** (the viral TikTok style — this is what people want)
4. **Default to bold-outline style** (the most popular style for short-form)
5. **Show the CaptionEditor section** immediately (don't require a mode switch)
6. **Show a toast**: "Captions auto-filled from voiceover. Pick a style below."

```typescript
// In handleMediaSelect(), when selecting a voiceover:
if (pickerTarget === "voice" || job.type === "voice") {
  const voiceText = job.text || job.prompt || job.transcription || "";

  const updates: Partial<ComposeProject> = {
    voiceJobId: job.id,
  };

  // Auto-fill captions if we have voice text and captions are currently empty
  if (voiceText && (!project.captionConfig?.text || !project.captionConfig.text.trim())) {
    updates.captionConfig = {
      ...DEFAULT_CAPTION_CONFIG,
      text: voiceText,
      style: "bold-outline",
      timing: "word",
      position: "bottom",
    };
    toast("Voiceover added — captions auto-filled. Pick a style below.", "success");
  } else {
    toast("Voiceover selected.", "success");
  }

  patch(updates);
  setPickerTarget(null);
  return;
}
```

#### The "From Voiceover" Button

In the CaptionEditor, add a small button next to the text area that pulls text from the
current voiceover job. This handles the case where the user edits the text and wants to
reset, or where they selected the voiceover before this feature existed:

```
┌─ Caption Text ────────────────────────────────┐
│ Welcome to our brand new product launch...    │
│                                               │
│                            [↻ From Voiceover] │
└───────────────────────────────────────────────┘
```

The button is only visible when `project.voiceJobId` is set. On click, it fetches the
voice job's text and replaces the caption text.

**Requires**: The voice job's source text must be accessible. Two options:
1. **Best**: Store `text` on the MediaJob when it's created (the TTS endpoint already has it)
2. **Fallback**: Fetch the job manifest from `/api/media/history` and read the `prompt` field

**Effort**: ~25 lines in Compose.tsx + ~10 lines of "From Voiceover" button in CaptionEditor.

---

### 8.3 Smart Aspect Ratio Detection

**Current**: Aspect ratio defaults to 16:9 and sits in the bottom bar. Users forget to change it.
A 9:16 Veo video gets rendered into a 16:9 frame with huge black bars.

**Proposed**: Aspect ratio auto-detects from the first media item added, with a visible
suggestion the user can accept or override.

#### Detection Logic

```typescript
function suggestAspectRatio(job: MediaJob): OutputConfig["aspectRatio"] | null {
  // If the job has dimensions (from ffprobe/manifest), use them
  if (job.width && job.height) {
    const ratio = job.width / job.height;
    if (ratio < 0.7) return "9:16";      // vertical video (0.5625)
    if (ratio > 1.5) return "16:9";      // widescreen (1.778)
    if (ratio > 0.9 && ratio < 1.1) return "1:1";  // square
    if (ratio >= 0.7 && ratio <= 0.9) return "4:5"; // portrait
  }

  // If it's a video job, check the generation params
  if (job.type === "video" && job.aspectRatio) {
    return job.aspectRatio as OutputConfig["aspectRatio"];
  }

  return null; // can't determine — keep current setting
}
```

#### When to Trigger

1. **On first media added** (slide or video clip): auto-set the aspect ratio and show a
   brief toast: "Aspect ratio set to 9:16 to match your video."
2. **On subsequent media**: if the new media's aspect ratio differs from the current
   setting, show a warning: "This image is 16:9 but your composition is set to 9:16.
   It will be cropped/letterboxed."
3. **Never force it**: the user can always override. The auto-detection is a suggestion,
   not a lock.

#### What the Agent Needs

The compose API already accepts `output.aspectRatio`. For agent workflows, the smart
default should live in the **auto-compose endpoint** (`POST /api/media/plan/:planId/auto-compose`):

```typescript
// In the auto-compose response, include aspect ratio reasoning:
{
  "outputConfig": {
    "aspectRatio": "9:16",
    "resolution": "1080p",
    "fps": 30
  },
  "aspectRatioReason": "Target platform is TikTok/Reels. Source video is 9:16."
}
```

**Requires**: `MediaJob` needs `width`, `height`, and optionally `aspectRatio` fields.
These are already available from ffprobe (run on video jobs at creation) and from Veo's
generation params. They just need to be surfaced in the history API response.

**Effort**: ~20 lines detection logic + ~15 lines UI toast/warning + ~5 lines history API.

---

### 8.4 CaptionEditor Everywhere (Fix the Merge Mode Gap)

**The bug**: CaptionEditor only renders in slideshow and captions modes. Merge mode shows
video + audio controls but NO caption UI. The render API body *does* send `captionConfig`
from merge mode (it's in the shared section of `handleRender()`), but users can't set it
because the UI isn't shown.

**The fix**: Show CaptionEditor in ALL modes when it's relevant. In the unified flow (8.1),
this happens automatically. But even without the full 8.1 refactor, the immediate fix is:

```tsx
// In the merge mode section, after the trim controls, add:
{project.mode === "merge" && (
  <CaptionEditor
    value={project.captionConfig ?? DEFAULT_CAPTION_CONFIG}
    onChange={(cfg) => patch({ captionConfig: cfg })}
  />
)}
```

That's literally 5 lines of JSX. This single change unlocks the most requested workflow:
video + voiceover + animated captions in one render.

**For the agent**: No API changes needed. The compose endpoint already accepts `captions`
alongside `videoJobId` and `audioTracks` for merge type. The agent can already do this —
only the human UI is broken.

**Effort**: 5 lines. This should be done immediately, before any other Tier 8 work.

---

### 8.5 Visual Caption Style Picker (Replace the Text Labels)

**Current**: Caption styles are small text buttons: `[Clean] [Bold Outline] [Boxed] [Typewriter] [Word Highlight]`. Users don't know what these look like until they render.

**Proposed**: Replace with visual preview cards showing what each style actually looks like.
Each card is a small dark rectangle with sample text rendered in that style:

```
┌──────────────────────────────────────────────────────────────────┐
│ Caption Style                                                     │
│                                                                   │
│ ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐│
│ │         │  │         │  │         │  │         │  │         ││
│ │  Hello  │  │ HELLO   │  │ █Hello█ │  │  H|ello │  │  HELLO  ││
│ │  World  │  │ WORLD   │  │ █World█ │  │  W|orld │  │  *WORLD*││
│ │         │  │         │  │         │  │         │  │         ││
│ │  Clean  │  │Bold Out.│  │  Boxed  │  │Typewrite│  │Word High││
│ └─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────────┘│
│    ↑ selected (indigo border)                                     │
└──────────────────────────────────────────────────────────────────┘
```

Each card uses CSS to approximate the ASS style:
- **Clean**: white text, subtle drop shadow
- **Bold Outline**: Impact-style font, thick black stroke (`-webkit-text-stroke`)
- **Boxed**: text on a semi-transparent dark background
- **Typewriter**: monospace font, cursor-blink animation
- **Word Highlight**: one word in accent color, rest dimmed

This is purely CSS — no canvas, no ASS rendering in the browser. The preview doesn't have
to be pixel-perfect; it just has to communicate the *feel* of each style.

**Effort**: ~40 lines of styled card components in CaptionEditor.tsx. No logic changes.

---

### 8.6 Caption Entrance Animations (The Missing Polish)

Captions that just *appear* feel cheap. Captions that fade or pop in feel professional.
This is already specced in 2.8.4 but not built. Adding it here because it's part of the
caption UX overhaul.

**UI**: A segmented control below the style picker:

```
Animation: [None] [Fade] [Pop] [Blur]
```

**Implementation in CaptionConfig**:

```typescript
interface CaptionConfig {
  // ...existing fields...
  animation?: "none" | "fade" | "pop" | "blur";
}
```

**ASS tags per animation** (prepended to each subtitle event's text):

| Animation | ASS tag | Visual effect |
|-----------|---------|---------------|
| None | (no tag) | Instant appear/disappear |
| Fade | `\fad(300,200)` | Fade in 300ms, fade out 200ms |
| Pop | `\t(0,150,\fscx110\fscy110)\t(150,300,\fscx100\fscy100)` | Scale up then settle |
| Blur | `\t(0,300,\blur0)` with initial `\blur6` | Blur-in (soft entrance) |

In `generateASS()` and `generateWordLevelASS()` in compose.ts, prepend the animation tag
before the subtitle text in each dialogue line. ~15 lines of logic.

**For the agent**: Add `animation` to the compose API's `captions` object. The agent can
specify `"captions": { "text": "...", "style": "bold-outline", "animation": "pop" }`.

**Effort**: ~10 lines UI + ~15 lines ASS generation + ~2 lines API passthrough.

---

### 8.7 Smart Defaults: The "What Do You Want to Make?" Empty State

**Current**: Empty Compose page shows mode tabs and blank panels. New users don't know
where to start.

**Proposed**: When the composition is empty (no slides, no video, no audio), show a
friendly empty state with quick-start options:

```
┌──────────────────────────────────────────────────────────────┐
│                                                               │
│                   What do you want to make?                   │
│                                                               │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────┐ │
│  │  📱               │  │  🎬               │  │  💬         │ │
│  │  Short-Form Video │  │  Video + Voice    │  │  Add       │ │
│  │                   │  │                   │  │  Captions  │ │
│  │  Images → video   │  │  Merge a clip     │  │            │ │
│  │  with voiceover   │  │  with narration   │  │  Burn text │ │
│  │  + animated subs  │  │  + background     │  │  onto any  │ │
│  │                   │  │  music             │  │  video     │ │
│  │  Best for: Reels, │  │  Best for: demos, │  │            │ │
│  │  TikTok, Shorts   │  │  explainers       │  │            │ │
│  └──────────────────┘  └──────────────────┘  └────────────┘ │
│                                                               │
│  ─── or just start adding media from the panel on the left ──│
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

Clicking a card sets intelligent defaults:

| Card | Defaults set |
|------|-------------|
| **Short-Form Video** | aspectRatio: 9:16, caption timing: word, caption style: bold-outline, opens picker filtered to images |
| **Video + Voice** | aspectRatio: auto (from video), opens picker filtered to video |
| **Add Captions** | opens picker filtered to video, expands CaptionEditor |

These are not "modes" — they're starting points. After clicking, the user is in the same
unified editor and can change anything. The card just saves 3-4 manual setting choices.

**For the agent**: The agent doesn't need this — it sets all params explicitly. But the
auto-compose endpoint could include a `quickStart` hint in its response that tells the
frontend which defaults to apply.

**Effort**: ~50 lines of empty-state JSX + ~15 lines of defaults-setting handlers.

---

### 8.8 "Auto-Fill from Voiceover" in CaptionEditor

Expanding on 8.2, the CaptionEditor itself needs a visible connection to the voiceover
track. When a voiceover is present, the CaptionEditor should:

1. **Show "Voiceover detected" badge** at the top of the caption section
2. **Show "Auto-fill from voiceover" button** next to the textarea
3. **Show duration match indicator**: "Caption timing will match voiceover: 22.3s"
4. **Warn on manual text edits**: "Caption text differs from voiceover. Timing may not
   match spoken words." (informational, not blocking)

The CaptionEditor component needs a new optional prop:

```typescript
interface CaptionEditorProps {
  value: CaptionConfig;
  onChange: (config: CaptionConfig) => void;
  voiceText?: string;       // NEW: text from selected voiceover job
  voiceDuration?: number;   // NEW: duration of voiceover in seconds
}
```

Compose.tsx passes these when a voiceover is selected. The CaptionEditor uses them to
show the badge, the auto-fill button, and the duration indicator.

**Effort**: ~20 lines in CaptionEditor + ~5 lines in Compose.tsx to pass props.

---

### 8.9 Aspect Ratio Intelligence for the Agent

When an agent calls the compose API, it currently has to specify `output.aspectRatio`
explicitly. But the agent often doesn't know the right ratio — it depends on the source
media and the target platform.

**Proposal**: Accept `output.aspectRatio: "auto"` in the compose API.

When `"auto"` is specified, the server:

1. Probes the first video/image input for dimensions
2. Picks the closest standard ratio
3. Returns the chosen ratio in the response so the agent knows what was used

```typescript
// In POST /api/media/compose handler:
if (body.output.aspectRatio === "auto") {
  const firstAsset = body.slides?.[0]?.jobId || body.videoJobId;
  if (firstAsset) {
    const probe = await probeMedia(resolvedPath);
    body.output.aspectRatio = inferAspectRatio(probe.width, probe.height);
  } else {
    body.output.aspectRatio = "9:16"; // default for auto when no media to probe
  }
}
```

The response includes: `"resolvedAspectRatio": "9:16"` so the agent can log/use it.

**Effort**: ~20 lines in the compose endpoint.

---

### 8.10 The Compose Request: Agent-Friendly Shorthand

Currently the agent has to build a verbose JSON body with separate fields for voiceover,
music, captions, slides, etc. For the most common workflows, offer shorthand:

```json
// Shorthand: "make a video with voiceover and captions"
{
  "type": "quick",
  "videoJobId": "job_abc",
  "voiceJobId": "job_def",
  "captions": "auto",
  "output": { "aspectRatio": "auto" }
}
```

When `captions: "auto"`:
- Server reads the voice job's source text
- Defaults to word-level timing, bold-outline style
- Auto-detects aspect ratio from video

When `captions` is a string (not "auto"):
- Uses that string as the caption text
- Defaults to word-level timing, bold-outline style

This means an agent can compose a full short-form video in one line:

```json
{ "type": "quick", "videoJobId": "X", "voiceJobId": "Y", "captions": "auto", "output": { "aspectRatio": "auto" } }
```

The server expands the shorthand to the full config internally.

**Effort**: ~30 lines of shorthand expansion in the compose endpoint.

---

### 8.11 Implementation Priority

These are ordered by **impact on the most common workflow** (video + voiceover + captions):

| Phase | Item | What changes | Effort | Unlocks |
|-------|------|-------------|--------|---------|
| **Now (5 lines)** | 8.4 CaptionEditor in merge mode | Add `<CaptionEditor>` to merge mode JSX | Tiny | Video+voice+captions in one render |
| **Now (~25 lines)** | 8.2 Auto-fill captions from voiceover | `handleMediaSelect` reads voice text | Small | No more retyping text |
| **Now (~20 lines)** | 8.3 Smart aspect ratio detection | Auto-set ratio from first media | Small | No more wrong-ratio renders |
| **Next sprint** | 8.1 Kill mode tabs (adaptive flow) | Refactor conditional rendering | Medium | Unified editor, no confusion |
| **Next sprint** | 8.6 Caption entrance animations | ASS tags + UI control | Small | Captions feel professional |
| **Next sprint** | 8.5 Visual caption style cards | CSS preview cards | Small | Users know what they're picking |
| **Next sprint** | 8.7 Smart empty state | Quick-start cards | Small | New users aren't lost |
| **Next sprint** | 8.8 Voiceover ↔ CaptionEditor link | Props + badge + auto-fill button | Small | Clear connection between voice and text |
| **Agent sprint** | 8.9 Aspect ratio "auto" | Server-side probe + infer | Small | Agent doesn't guess ratios |
| **Agent sprint** | 8.10 Quick compose shorthand | Shorthand expansion in endpoint | Small | Agent composes in one call |

**The first three items (8.4, 8.2, 8.3) are ~50 lines total and fix the core workflow.**
They should be done before any other compose work.

---

### 8.12 The Ideal End State

After Tier 8, the compose experience for a human looks like this:

```
1. Open Compose → see "What do you want to make?" (or resume previous)
2. Click "Short-Form Video" → aspect ratio locks to 9:16, picker opens
3. Add 5 images from Library → they appear as slides with smart defaults
4. Click a voiceover from Library → captions auto-fill, style cards appear
5. Tap "Bold Outline" style card → see visual preview
6. Hit Render → done
```

For an agent, the same thing is:

```json
POST /api/media/compose
{
  "type": "slideshow",
  "slides": [
    { "jobId": "img1", "duration": 3, "transition": "fade", "kenBurns": true },
    { "jobId": "img2", "duration": 3, "transition": "slideright", "kenBurns": true },
    { "jobId": "img3", "duration": 3, "transition": "dissolve", "kenBurns": true }
  ],
  "voiceJobId": "voice1",
  "captions": "auto",
  "output": { "aspectRatio": "9:16", "resolution": "1080p" }
}
```

Or with maximum shorthand:

```json
POST /api/media/compose
{
  "type": "quick",
  "slideJobIds": ["img1", "img2", "img3"],
  "voiceJobId": "voice1",
  "captions": "auto",
  "output": { "aspectRatio": "auto" }
}
```

Both paths produce the same output. The human never has to think about modes. The agent
never has to guess about aspect ratios or caption text. The system meets them where they are.

---

### 8.13 What This Does NOT Include

Staying on the right side of the CapCut Line (Tier 6.9):

- **No freeform text dragging** — use the position grid (top/center/bottom)
- **No multi-track timeline** — the storyboard card view is enough
- **No canvas-based preview** — CSS approximation + server render is fine
- **No keyframe animation** — ASS entrance animations cover 90% of needs
- **No waveform scrubbing** — duration mismatch warnings catch the problem

The goal is to make the **common case effortless**, not to build an NLE. CapCut exists
for the last 20%. We own the first 80% — and especially the "AI reads your brand and
assembles a composition" part that CapCut will never have.

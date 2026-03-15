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

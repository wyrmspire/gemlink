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

## Implementation Priority

| Tier | What you get | Effort | Dependency |
|------|-------------|--------|------------|
| **1** | Slideshows + voiceover + captions. Covers 80% of faceless content. | ~1 sprint | FFmpeg only |
| **2** | Word-level captions, text overlays, watermarks, trim, speed. Pro editing feel. | ~1-2 sprints | FFmpeg only |
| **3** | Talking avatars. "AI spokesperson" format. | ~1 sprint | Hedra/SyncLabs API |
| **4** | Templates + batch compose. Scale content production. | ~1 sprint | Tiers 1-2 done |
| **5** | Full timeline editor, Remotion, real-time preview. | ~3+ sprints | Big commitment |

**Recommended path**: Tier 1 → Tier 4 → Tier 2 → Tier 3 → Tier 5 (if ever needed).

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

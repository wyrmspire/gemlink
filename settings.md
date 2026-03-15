# Gemlink Settings System — Design Document

> Status: Draft — Sprint 4.5 or independent pre-sprint task
> Covers: model centralization, `.env.local` overhaul, Settings page UI, user preferences

---

## Problem

Models are hardcoded as strings across **30+ locations** in `server.ts`, `boardroom.ts`, and frontend pages. Several are dated preview models (`gemini-2.5-flash-preview-04-17`) that rotate out and cause 403/404 errors. Each agent that touches the codebase picks whatever model string they remember, leading to inconsistency.

### Current Model Chaos

| Hardcoded String | Used Where | Role | Count |
|---|---|---|---|
| `gemini-2.5-flash-preview-04-17` | server.ts (plan suggest, scoring, grading, plan pipeline) | Text/JSON reasoning | 10 |
| `gemini-3-flash-preview` | server.ts (prompt expand, variants, research, captions) | Text generation | 6 |
| `gemini-3.1-pro-preview` | server.ts (video analysis, image labeling) | Multimodal analysis | 2 |
| `gemini-3.1-flash-image-preview` | server.ts, SocialMedia.tsx (image gen) | Image generation | 3 |
| `gemini-2.5-flash-preview-tts` | server.ts (voice gen) | TTS | 2 |
| `veo-3.1-fast-generate-preview` | server.ts, VideoLab.tsx (video gen) | Video generation | 3 |
| `gemini-2.5-flash` | server.ts, boardroom.ts (boardroom sessions) | Boardroom chat | 3 |
| `gemini-flash-image` | MediaPlan.tsx (default config) | ❌ Not a real model | 1 |
| `gemini-2.5-flash-native-audio-preview-09-2025` | VoiceLab.tsx | Voice preview | 1 |

**Total: 31 hardcoded model strings across 12+ files**

---

## Solution: Centralized Model Config

### 1. `.env.local` Model Variables

```env
# ─── API ───────────────────────────────────────────────────
GEMINI_API_KEY=AIza...

# ─── Models ────────────────────────────────────────────────
# Text/JSON reasoning (plan suggest, scoring, grading, strategy analysis)
MODEL_TEXT=gemini-2.5-flash

# Multimodal analysis (video analysis, image labeling, scoring with images)
MODEL_MULTIMODAL=gemini-2.5-flash

# Image generation
MODEL_IMAGE=gemini-2.5-flash-preview-image

# Video generation
MODEL_VIDEO=veo-2.0-generate-001

# TTS / Voice generation
MODEL_TTS=gemini-2.5-flash-preview-tts

# Prompt expansion (creative writing - can be a different model for variety)
MODEL_CREATIVE=gemini-2.5-flash

# Boardroom sessions (multi-turn chat)
MODEL_BOARDROOM=gemini-2.5-flash

# ─── Defaults ──────────────────────────────────────────────
# Default image count per generation
DEFAULT_IMAGE_COUNT=1

# Default aspect ratio
DEFAULT_ASPECT_RATIO=1:1

# Default image size
DEFAULT_IMAGE_SIZE=1K

# Default video resolution
DEFAULT_VIDEO_RESOLUTION=720p

# Default video aspect ratio
DEFAULT_VIDEO_ASPECT_RATIO=16:9

# Default TTS voice
DEFAULT_VOICE=Kore

# ─── Server ────────────────────────────────────────────────
PORT=3015

# ─── Feature Flags ─────────────────────────────────────────
# Enable auto-scoring after batch completion
ENABLE_AUTO_SCORE=true

# Enable auto-tagging after image generation
ENABLE_AUTO_TAG=true

# Max video poll attempts (each ~10s)
MAX_VIDEO_POLL_ATTEMPTS=60
```

### 2. Server-Side Config Module (`config.ts`)

```typescript
// config.ts — single source of truth for all configurable values

export const models = {
  text:        process.env.MODEL_TEXT        || "gemini-2.5-flash",
  multimodal:  process.env.MODEL_MULTIMODAL  || "gemini-2.5-flash",
  image:       process.env.MODEL_IMAGE       || "gemini-2.5-flash-preview-image",
  video:       process.env.MODEL_VIDEO       || "veo-2.0-generate-001",
  tts:         process.env.MODEL_TTS         || "gemini-2.5-flash-preview-tts",
  creative:    process.env.MODEL_CREATIVE    || "gemini-2.5-flash",
  boardroom:   process.env.MODEL_BOARDROOM   || "gemini-2.5-flash",
} as const;

export const defaults = {
  imageCount:       parseInt(process.env.DEFAULT_IMAGE_COUNT || "1"),
  aspectRatio:      process.env.DEFAULT_ASPECT_RATIO || "1:1",
  imageSize:        process.env.DEFAULT_IMAGE_SIZE || "1K",
  videoResolution:  process.env.DEFAULT_VIDEO_RESOLUTION || "720p",
  videoAspectRatio: process.env.DEFAULT_VIDEO_ASPECT_RATIO || "16:9",
  voice:            process.env.DEFAULT_VOICE || "Kore",
} as const;

export const features = {
  autoScore:  process.env.ENABLE_AUTO_SCORE !== "false",
  autoTag:    process.env.ENABLE_AUTO_TAG !== "false",
} as const;

export const server = {
  port: parseInt(process.env.PORT || "3015"),
  maxVideoPollAttempts: parseInt(process.env.MAX_VIDEO_POLL_ATTEMPTS || "60"),
} as const;
```

Then replace every hardcoded model in `server.ts`:
```diff
- model: "gemini-2.5-flash-preview-04-17",
+ model: models.text,

- model: "gemini-3.1-flash-image-preview",
+ model: models.image,

- model: "veo-3.1-fast-generate-preview",
+ model: models.video,
```

### 3. `GET /api/settings` Endpoint

Expose current config to the frontend (no API key leak):

```typescript
api.get("/settings", (req, res) => {
  res.json({
    models,
    defaults,
    features,
    ffmpeg: ffmpegAvailable,
    version: "0.4.0",
  });
});

api.put("/settings", (req, res) => {
  // Runtime override — saves to a settings.json file
  // Does NOT modify .env.local
  // Falls back to .env.local values on restart
  const { models: m, defaults: d, features: f } = req.body;
  // merge and persist...
});
```

---

## Settings Page UI

### Route: `/settings`

### Sections

#### 1. 🧠 AI Models
The most important section — this is what broke.

| Setting | Description | Control |
|---------|-------------|---------|
| Text Model | Used for planning, scoring, grading, analysis | Dropdown + custom input |
| Multimodal Model | Image/video analysis with visual input | Dropdown + custom input |
| Image Model | Generates images | Dropdown + custom input |
| Video Model | Generates video | Dropdown + custom input |
| TTS Model | Text-to-speech | Dropdown + custom input |
| Creative Model | Prompt expansion, variants | Dropdown + custom input |
| Boardroom Model | Multi-turn discussion sessions | Dropdown + custom input |

Each dropdown pre-populated with known working models. Custom input for preview/experimental models.

**"Test Model" button** per row: fires a quick `generateContent` call (e.g., "say hello") to verify the model works before saving.

#### 2. 🎨 Generation Defaults
Defaults applied when creating new plan items or generating media.

| Setting | Description | Control |
|---------|-------------|---------|
| Default Aspect Ratio | Applied to new image items | Segmented: 1:1, 16:9, 9:16, 4:5 |
| Default Image Size | Resolution preset | Dropdown: 512, 1K, 2K |
| Default Image Count | Variants per generation | Stepper: 1-4 |
| Default Video Resolution | Video gen resolution | Toggle: 720p / 1080p |
| Default Video Aspect Ratio | Video gen aspect ratio | Segmented: 16:9, 9:16, 1:1 |
| Default TTS Voice | Voice preset | Dropdown of available voices |
| Default Caption Style | For compose captions | Dropdown: Clean, Bold Outline, Boxed, Typewriter, Word Highlight |

#### 3. ⚡ Features & Behavior

| Setting | Description | Control |
|---------|-------------|---------|
| Auto-Score | Score media after batch generation | Toggle |
| Auto-Tag | Tag images with AI after generation | Toggle |
| Auto-Save Plans | Persist plans to localStorage | Toggle (default: on) |
| Confirm Before Generate | Show preview modal before batch gen | Toggle (default: on) |
| Ken Burns Default | Default Ken Burns on slideshows | Toggle (default: on) |

#### 4. 🔑 API & Connection

| Setting | Description | Control |
|---------|-------------|---------|
| API Key | Gemini API key (masked) | Password input + "Change" button |
| Server Port | Local server port | Read-only display |
| FFmpeg Status | Installed / version | Read-only indicator (green/red) |
| Health Check | Ping server | Button → shows response time + status |

#### 5. 📊 Usage & Info

| Setting | Description | Control |
|---------|-------------|---------|
| Total Jobs | Count of all media jobs | Read-only |
| Storage Used | Disk space for jobs/ | Read-only |
| Database Size | SQLite file size | Read-only |
| App Version | Current version | Read-only |
| Export Settings | Download settings as JSON | Button |
| Import Settings | Upload settings JSON | Button |

#### 6. 🎭 Theme & Display (future)

| Setting | Description | Control |
|---------|-------------|---------|
| Theme | Dark only for now | Segmented: Dark / Light / System |
| Sidebar Position | Left / Right | Toggle |
| Compact Mode | Reduce spacing/card sizes | Toggle |
| Animation | Enable/disable motion | Toggle |

---

## Implementation Plan

### Phase 1: Config Module + Fix Models (can do now, pre-sprint)
1. Create `config.ts` with model/defaults/features objects
2. Update `.env.local` with all model variables
3. Find-and-replace all 31 hardcoded model strings in `server.ts` and `boardroom.ts`
4. Fix frontend model strings in `SocialMedia.tsx`, `VoiceLab.tsx`, `VideoLab.tsx`, `MediaPlan.tsx`
5. Add `GET /api/settings` endpoint
6. Verify all endpoints work with new model names

### Phase 2: Settings Page UI (Sprint 4 or 4.5)
1. Create `src/pages/Settings.tsx`
2. Add route + nav item
3. Fetch from `GET /api/settings`
4. Save via `PUT /api/settings`
5. "Test Model" buttons
6. Export/Import settings

### Phase 3: Runtime Persistence (Sprint 5+)
1. `settings.json` file for runtime overrides
2. Merge priority: runtime > .env.local > hardcoded defaults
3. Settings change broadcast to frontend via SSE or polling

---

## File Ownership

| File | Owner |
|------|-------|
| `config.ts` (NEW) | Shared — all server code imports from here |
| `.env.local` | User-managed, git-ignored |
| `.env.example` | Template with all variables documented |
| `src/pages/Settings.tsx` (NEW) | Frontend |
| `server.ts` | All model refs replaced with `config.models.*` |
| `boardroom.ts` | `DEFAULT_MODEL` replaced with `config.models.boardroom` |

---

## Known Model Aliases (as of March 2026)

For reference when populating the Settings dropdowns:

### Text / Reasoning
- `gemini-2.5-flash` — best balance of speed + quality
- `gemini-2.5-pro` — highest quality, slower
- `gemini-3-flash-preview` — newer preview, good for creative tasks
- `gemini-3-pro-preview` — newer preview, highest quality

### Image Generation
- `gemini-2.5-flash-image` — stable image gen
- `gemini-3.1-flash-image-preview` — newer, may rotate
- `gemini-3-pro-image-preview` — higher quality images

### Video Generation
- `veo-2.0-generate-001` — stable
- `veo-3.1-fast-generate-preview` — faster but preview

### TTS
- `gemini-2.5-flash-preview-tts` — standard TTS
- `gemini-2.5-pro-preview-tts` — higher quality TTS

### Multimodal
- `gemini-2.5-flash` — good multimodal understanding
- `gemini-2.5-pro` — best multimodal

> ⚠️ Preview models (containing `-preview`) may be rotated or retired without notice.
> Always prefer stable model names (without date suffixes like `-04-17`).

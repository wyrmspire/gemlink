// config.ts — Gemlink centralized configuration
// Single source of truth for all configurable values.
// Priority: runtime data/settings.json > .env.local > hardcoded defaults below
// NEVER import from server.ts — this file must stay import-free to avoid cycles.

// ─── AI Models ────────────────────────────────────────────────────────────────
// Each key maps to a specific role. Swap values in .env.local to change models
// without touching code.

export const models = {
  /** Text/JSON reasoning — plan suggest, scoring, grading, strategy analysis */
  text:        process.env.MODEL_TEXT        || "gemini-2.5-flash",
  /** Multimodal analysis — video analysis, image labeling, scoring with images */
  multimodal:  process.env.MODEL_MULTIMODAL  || "gemini-2.5-flash",
  /** Image generation — Nano Banana Pro (studio quality, 4K, reasoning) */
  image:       process.env.MODEL_IMAGE       || "gemini-3-pro-image-preview",
  /** Video generation (Veo 3.1 — latest cinematic quality) */
  video:       process.env.MODEL_VIDEO       || "veo-3.1-generate-preview",
  /** Text-to-speech / voice generation */
  tts:         process.env.MODEL_TTS         || "gemini-2.5-flash-preview-tts",
  /** Prompt expansion and creative text generation */
  creative:    process.env.MODEL_CREATIVE    || "gemini-2.5-flash",
  /** Boardroom multi-turn chat sessions (Pro for best reasoning) */
  boardroom:   process.env.MODEL_BOARDROOM   || "gemini-2.5-pro",
  /** Music generation — Lyria uses WebSocket streaming via ai.live.music.connect() */
  music:       process.env.MODEL_MUSIC       || "lyria-realtime-exp",
} as const;

// ─── Rate Limits (RPM: Requests Per Minute, IPM: Images Per Minute) ───────────
export const rateLimits = {
  text:  parseInt(process.env.LIMIT_RPM_TEXT  || "15"),
  image: parseInt(process.env.LIMIT_IPM_IMAGE || "2"),   // Free tier default
  video: parseInt(process.env.LIMIT_RPM_VIDEO || "1"),   // Veo is slow
  voice: parseInt(process.env.LIMIT_RPM_VOICE || "5"),
  music: parseInt(process.env.LIMIT_RPM_MUSIC || "1"),   // Music generation is slow
} as const;

// ─── Generation Defaults ──────────────────────────────────────────────────────
// Applied when creating new plan items or when the user hasn't set a preference.

export const defaults = {
  imageCount:        parseInt(process.env.DEFAULT_IMAGE_COUNT       || "1"),
  aspectRatio:       process.env.DEFAULT_ASPECT_RATIO               || "1:1",
  imageSize:         process.env.DEFAULT_IMAGE_SIZE                 || "1K",
  videoResolution:   process.env.DEFAULT_VIDEO_RESOLUTION           || "720p",
  videoAspectRatio:  process.env.DEFAULT_VIDEO_ASPECT_RATIO         || "16:9",
  voice:             process.env.DEFAULT_VOICE                      || "Kore",
  captionStyle:      process.env.DEFAULT_CAPTION_STYLE              || "clean",
} as const;

// ─── Feature Flags ────────────────────────────────────────────────────────────

export const features = {
  /** Automatically score media after batch generation completes */
  autoScore:             process.env.ENABLE_AUTO_SCORE              !== "false",
  /** Automatically tag images with AI labels after generation */
  autoTag:               process.env.ENABLE_AUTO_TAG                !== "false",
  /** Show confirmation modal before starting a batch generation */
  confirmBeforeGenerate: process.env.ENABLE_CONFIRM_BEFORE_GENERATE !== "false",
  /** Apply Ken Burns effect to slideshow images by default */
  kenBurnsDefault:       process.env.ENABLE_KEN_BURNS_DEFAULT       !== "false",
} as const;

// ─── Server ───────────────────────────────────────────────────────────────────

export const server = {
  port:                 parseInt(process.env.PORT                      || "3015"),
  maxVideoPollAttempts: parseInt(process.env.MAX_VIDEO_POLL_ATTEMPTS   || "60"),
} as const;

// ─── App Metadata ─────────────────────────────────────────────────────────────

export const app = {
  version: "0.4.5",
  name: "Gemlink",
} as const;

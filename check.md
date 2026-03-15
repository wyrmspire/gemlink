# Gemlink — Known Issues & Confusion Inventory

> Last updated: 2026-03-15
> Purpose: Document concrete bugs, field mismatches, dead code, and confusing patterns that cause agent hallucinations or silent failures.
> When you fix an item, mark it ✅ and add the fix location. Do NOT delete entries — they are historical context.

---

## How to Use This File

1. Before starting any work on Compose or MediaPlan, read every ⬜ item below.
2. If your task touches a file listed here, assume the issue is still present unless marked ✅.
3. When you discover a new bug or confusion, add it immediately — do not wait for a sprint.
4. Cross-reference `board.md` for sprint-level status and `agents.md` for SOPs.

---

## Status Key

| Symbol | Meaning |
|--------|---------|
| ⬜ | Known issue — not yet fixed |
| ✅ | Fixed — commit or sprint noted |
| ⚠️ | Partially mitigated — see notes |
| 🔵 | By design — not a bug, but confusing |

---

## Section 1 — MediaPlan Batch Generation (`src/pages/MediaPlan.tsx` + `server.ts`)

These are the issues that cause things to work in individual labs (SocialMedia, VideoLab, VoiceLab, MusicLab) but silently fail or produce wrong results when triggered from the Media Planner.

---

### CHECK-001 — Video batch ignores `resolution` (sends `size` instead)

**Status**: ⬜

**Files**: `src/pages/MediaPlan.tsx` `handleGenerateAll` (~line 757), `server.ts` batch video handler (~line 1422)

**What happens**: `GenerationConfig` in `MediaPlan.tsx` has a field called `size` (e.g. `"1K"`, `"720p"`, `"1080p"`). When `handleGenerateAll` builds the batch request body, it spreads `...i.generationConfig`. The batch video handler in `server.ts` destructures `resolution` from the body — NOT `size`. So `resolution` is always `undefined` for MediaPlan-originated video jobs.

**Individual lab behaviour**: `VideoLab.tsx` sends `resolution` explicitly from its own state variable, so it works fine.

**Fix required**:
- Option A: Add `resolution` to `GenerationConfig` (rename `size` for video items, or add a separate field).
- Option B: In the batch video handler, accept both `resolution` and `size`: `const resolution = body.resolution ?? body.size`.
- Option B is simpler and less risky. Add a note to check.md if Option B is chosen so `GenerationConfig` inconsistency is tracked.

---

### CHECK-002 — Batch image handler hardcodes `aspectRatio: "1:1"`

**Status**: ⬜

**Files**: `server.ts` batch image handler (~line 1351)

**What happens**: The batch image `runJob` calls:
```typescript
config: { imageConfig: { aspectRatio: "1:1", imageSize: manifest.size } }
```
The `"1:1"` is hardcoded. The `manifest.aspectRatio` field is never read. Any image item configured with `"9:16"` or `"16:9"` in the MediaPlan will always generate square images.

**Individual lab behaviour**: `SocialMedia.tsx` sends `aspectRatio` explicitly and the individual `/api/media/image` endpoint reads it from `req.body`.

**Fix required**: Change line ~1351 to:
```typescript
config: { imageConfig: { aspectRatio: manifest.aspectRatio ?? "1:1", imageSize: manifest.size } }
```
The `manifest` already has `aspectRatio` from the `handleGenerateAll` body spread.

---

### CHECK-003 — `plan/suggest` sanitizer drops `music` type to `image`

**Status**: ⬜

**Files**: `server.ts` plan/suggest handler (~line 1702), also line 1914 (plan/generate)

**What happens**: When the AI suggests a `music` type item, the sanitizer:
```typescript
type: ["image", "video", "voice"].includes(x.type) ? x.type : "image"
```
silently converts it to `"image"` since `"music"` is not in the allowed list.

**Impact**: Users asking for background music in their media plan get image items instead, with no error.

**Fix required**: Add `"music"` to the allowed list in both locations:
```typescript
type: ["image", "video", "voice", "music"].includes(x.type) ? x.type : "image"
```

---

### CHECK-004 — `handleGenerateAll` does not send `apiKey`

**Status**: ⬜

**Files**: `src/pages/MediaPlan.tsx` `handleGenerateAll` (~line 757)

**What happens**: Unlike `handleSuggest` (which sends `apiKey: import.meta.env.VITE_GEMINI_API_KEY`), `handleGenerateAll` does not include `apiKey` in the fetch body. The batch endpoint calls `requireApiKey(apiKey)` which falls back to `process.env.GEMINI_API_KEY`. If the server env var is NOT set, all batch jobs will fail with an API key error — but the client catches it and shows `"Batch endpoint not yet live"` instead of the real error.

**Fix required**: Add to the batch fetch body:
```typescript
apiKey: import.meta.env.VITE_GEMINI_API_KEY || undefined,
```

---

### CHECK-005 — Error handler hides real errors with misleading messages (violates SOP-4)

**Status**: ⬜

**Files**: `src/pages/MediaPlan.tsx` `handleGenerateAll` catch (~line 793), `src/pages/Compose.tsx` `handleRender` catch (~line 460)

**What happens**:
- `handleGenerateAll` catch: `toast("Batch endpoint not yet live. Items left in draft.", "info")` — shown even when the endpoint is live but returns a real error like 401 (missing API key) or 500.
- `handleRender` catch: `toast("Render endpoint not yet live. Build the compose engine in Lane 1.", "info")` — shown even when FFmpeg is installed and the endpoint is running but returns 400/401/500.

**Fix required** (SOP-4 compliance):
```typescript
// In handleGenerateAll:
catch {
  const errBody = await res.json().catch(() => ({}));
  toast(errBody.error || `Batch failed (HTTP ${res.status}).`, "error");
}

// In handleRender (the non-503 case):
catch (err: any) {
  toast(err.message || "Render failed — check server logs.", "error");
}
```

---

### CHECK-006 — `plan/suggest` returns items without type-appropriate `generationConfig` defaults

**Status**: ⬜

**Files**: `server.ts` plan/suggest handler (~line 1700-1720), `src/pages/MediaPlan.tsx` `handleSuggest` (~line 660)

**What happens**: The suggest endpoint returns items with `model: null, size: null, aspectRatio: null`. The client's `handleSuggest` calls `newItem(x)` which creates a `generationConfig` using `defaultConfig()` — which always produces IMAGE defaults (`model: VITE_MODEL_IMAGE`, `size: "1K"`, `aspectRatio: "1:1"`). A suggested `video` item ends up with the image model and image size defaults.

**Impact**: Generating a suggested video item submits the image model to the batch video handler. The server reads its model from `body.model`, and passes the image model string to `generateVideos()`, which will return a 400 or 404.

**Fix required**:
- In `newItem`, check `overrides.type` and apply type-specific defaults. Or:
- In `handleSuggest`, after creating items, patch `generationConfig` based on type (e.g., for `video` items, set `model` to `import.meta.env.VITE_MODEL_VIDEO`).

---

### CHECK-007 — `GenerationPreviewModal` doesn't count music items

**Status**: ⬜

**Files**: `src/pages/MediaPlan.tsx` `GenerationPreviewModal` (~line 179)

**What happens**: The preview modal counts images, videos, and voices but has no count or time estimate for music items. Music items are silently excluded from the estimated time and total calls display.

**Fix required**: Add music item counting alongside the existing counters.

---

### CHECK-008 — Stale closure in batch polling `useEffect`

**Status**: ⬜

**Files**: `src/pages/MediaPlan.tsx` polling effect (~line 663)

**What happens**: The polling effect sets up an `interval` and closes over `activePlan`. But `activePlan` is derived from `plans.find(...)` — when `saveItems` is called inside the interval callback (updating localStorage and `plans` state), the re-render produces a new `activePlan`. However, the interval callback still holds the OLD reference to the old `activePlan`. This means:
1. Status updates from one poll tick may be overwritten by the next tick's stale data.
2. After an item transitions to `"review"`, the next interval tick might not see the new `activePlan.items` correctly.

The effect has `[activePlan, saveItems, toast]` in its dep array, which should re-create the interval on each plan update — but this causes excessive interval recreation.

**Fix required**: Use a `useRef` to hold a mutable reference to the latest `activePlan` and read it inside the interval callback:
```typescript
const activePlanRef = useRef(activePlan);
useEffect(() => { activePlanRef.current = activePlan; });
```

---

### CHECK-009 — `plan/suggest` does not include brand context in generated prompts when no `projectContext` is sent

**Status**: ⬜

**Files**: `src/pages/MediaPlan.tsx` `handleSuggest` (~line 625)

**What happens**: `handleSuggest` sends `projectContext` with brand fields. Good. But if `activeProject` has no brand fields set (e.g., fresh project), the server builds an empty `brandCtx` string. The AI prompt doesn't include brand context, so suggested prompts are generic.

**Behaviour note**: This is not a crash, but it causes confusing output. Agents should not mistake generic AI suggestions for "brand-aware" suggestions when brand fields are empty.

---

## Section 2 — Composer (`src/pages/Compose.tsx` + `server.ts` compose endpoint)

---

### CHECK-010 — `handleRender` never sends `apiKey`

**Status**: ⬜

**Files**: `src/pages/Compose.tsx` `handleRender` (~line 390)

**What happens**: The `/api/media/compose` endpoint calls `requireApiKey(req.body.apiKey)` internally. `handleRender` never includes `apiKey` in the fetch body. If `GEMINI_API_KEY` is not set server-side as an env var, the compose job will fail with "API key required" — but the client catches all errors and shows "Render endpoint not yet live."

**Fix required**: Add `apiKey` to the compose request body (same pattern as other endpoints).

---

### CHECK-011 — `audioJobId` in `ComposeProject` is dead code

**Status**: ⬜

**Files**: `src/pages/Compose.tsx` type definition (~line 53), `handleMediaSelect` (~line 327)

**What happens**: `ComposeProject` defines `audioJobId?: string`. The `handleMediaSelect` function has a branch:
```typescript
} else if (pickerTarget === "audio") {
  patch({ audioJobId: job.id });
```
But no UI code ever calls `setPickerTarget("audio")`. There is no button that opens the picker for `"audio"` type. So `audioJobId` is set but never read. It is never included in the `audioTracks` array for the render request. The `trimPoints` for merge mode uses `voiceJobId`/`musicJobId` — `audioJobId` is completely unused.

**Impact**: If someone adds a UI button calling `setPickerTarget("audio")`, the selected job will be silently ignored in the render because `handleRender` only reads `voiceJobId` and `musicJobId`.

**Fix required**: Either remove `audioJobId` from the type and the `handleMediaSelect` branch, OR wire it into `audioTracks` in `handleRender`.

---

### CHECK-012 — Merge mode allows render with no audio (server returns 400)

**Status**: ⬜

**Files**: `src/pages/Compose.tsx` merge mode UI, `server.ts` compose endpoint validation (~line 2828)

**What happens**: In merge mode, the server requires at least one of `audioJobId`, `audioPath`, or a non-empty `audioTracks` array. But `handleRender` builds `audioTracks` only if `project.voiceJobId` or `project.musicJobId` is set. If neither is set (user picks a video but no audio), `audioTracks` will be `[]` and `body.audioTracks` won't be sent. The server returns `400 { error: "merge requires audioJobId, audioPath, or audioTracks" }`. The client then shows "Render endpoint not yet live" (see CHECK-005).

**Fix required**: Add client-side validation in `handleRender` before the fetch:
```typescript
if (project.mode === "merge" && !project.voiceJobId && !project.musicJobId) {
  toast("Merge mode requires at least one audio track (voice or music).", "warning");
  setRendering(false);
  return;
}
```

---

### CHECK-013 — Captions-only mode sends request without checking caption text

**Status**: ⬜

**Files**: `src/pages/Compose.tsx` `handleRender` (~line 440), `server.ts` compose caption validation (~line 2837)

**What happens**: `handleRender` includes `body.captions` only if `project.captionConfig?.text` is truthy. But in captions mode, `body.type` is `"caption"`. The server validates that `captions.text` must be a non-empty string for caption type. If the user starts a caption render without entering caption text, the server returns `400 { error: "caption requires captions.text" }`.

**Fix required**: Add client-side validation:
```typescript
if (project.mode === "captions" && !project.captionConfig?.text?.trim()) {
  toast("Please enter caption text before rendering.", "warning");
  setRendering(false);
  return;
}
```

---

### CHECK-014 — `resolveAudioUrl` fetches all history to find one job

**Status**: ⬜

**Files**: `src/pages/Compose.tsx` `resolveAudioUrl` (~line 225)

**What happens**: To get the output URL for a selected audio job, `resolveAudioUrl` fetches the full `/api/media/history` endpoint (all jobs) and then finds the matching job by ID. If the library has hundreds of items, this is a large unnecessary payload.

**Impact**: Not a crash, but unnecessarily slow. Agents should not use this as a pattern for other features.

**Better approach**: Use `GET /api/media/history?type=voice` or a future `GET /api/media/job/:id` endpoint, or have the picker pass the full job object to `handleMediaSelect` instead of just re-fetching.

---

### CHECK-015 — Slideshow mode adds any job type as a slide (no type check)

**Status**: ✅ Fixed in Sprint 10

**Files**: `src/pages/Compose.tsx` `addSlideFromJob` (~line 315)

**What happens**: When `pickerTarget === "slide"`, any selected job was added as a slide — including `voice` and `music` job types. The `jobToSlide` function sets `thumbnail: null` for non-image types and `jobType: job.type`. When a voice or music job becomes a slide, the compose engine may fail to process it because it expects an image file path for slideshow slides.

**Fix**: `addSlideFromJob()` now checks the job type first. If `job.type === "voice" || job.type === "music"`, it shows a warning toast and returns early. Additionally, the media picker panel now defaults to the "image" filter tab when `pickerTarget === "slide"`, reducing the chance of the user accidentally seeing voice/music items.

---

## Section 3 — Shared Architecture Issues

---

### CHECK-016 — Two separate agent context files exist

**Status**: 🔵 By design but confusing

**Files**: `AGENTS.md` (uppercase, Lane model), `agents.md` (lowercase, SOPs + commands)

**What happens**: `AGENTS.md` contains lane ownership, file ownership table, handoff protocol, and collision avoidance rules. `agents.md` contains 16 SOPs, repo map, commands, common pitfalls, and sprint history. An agent reading only one file misses critical context from the other.

**Note**: Both files should be read before any work. `AGENTS.md` is the authoritative lane/ownership document. `agents.md` is the authoritative SOP/pattern document. They are intentionally separate but must be treated as one combined reference.

---

### CHECK-017 — BrandContext is not passed to batch items in `handleGenerateAll`

**Status**: ⬜

**Files**: `src/pages/MediaPlan.tsx` `handleGenerateAll` (~line 762)

**What happens**: The individual lab endpoints (`/api/media/image`, etc.) send `brandContext` from `activeProject`. `handleGenerateAll` builds the batch body but does NOT include `brandContext` in each item's body. This means all batch-generated assets are brand-context-free, even if the user has configured a brand.

**Individual lab behaviour**: SocialMedia, VideoLab etc. build a `brandContext` object from `useProject()` and include it in every request.

**Fix required**: In `handleGenerateAll`, build a `brandContext` from `activeProject` and include it in each item's body:
```typescript
body: {
  prompt: i.promptTemplate,
  ...i.generationConfig,
  brandContext: activeProject ? {
    brandName: activeProject.brandName,
    brandDescription: activeProject.brandDescription,
    targetAudience: activeProject.targetAudience,
    brandVoice: activeProject.brandVoice,
  } : undefined,
}
```

---

### CHECK-018 — BrandContext is lost on page refresh

**Status**: ⬜ (known, documented in AGENTS.md)

**Files**: `src/context/BrandContext.tsx`, `src/context/ProjectContext.tsx`

**What happens**: Brand/project settings are stored in React state only, not in localStorage or a server-side store. Refreshing the page resets all brand fields to defaults.

**Impact**: After a refresh, all API calls will have empty `brandContext`. Generation quality drops silently.

**Fix required**: Persist `BrandContext` and `ProjectContext` to `localStorage` using the same pattern as MediaPlan plans (`gemlink-<feature>-<projectId>` key format per SOP-14).

---

### CHECK-019 — `Research.tsx` and `VideoLab.tsx` analysis call Gemini directly from the browser

**Status**: ⬜ (known violation, documented in AGENTS.md)

**Files**: `src/pages/Research.tsx`, `src/pages/VideoLab.tsx`

**What happens**: These pages instantiate `GoogleGenAI` directly using `import.meta.env.VITE_GEMINI_API_KEY`. This exposes the API key to anyone who views source or browser network tab.

**Impact**: Security risk in production. Not a bug for local dev, but agents should not replicate this pattern.

---

### CHECK-020 — `plan/generate` multi-stage endpoint (5-stage) is rarely tested

**Status**: ⬜

**Files**: `server.ts` `POST /api/media/plan/generate` (around line 1730+), `src/pages/MediaPlan.tsx` plan generation buttons

**What happens**: The plan/generate endpoint runs 5 stages (context → outline → grade → prompts → grade). It is separate from `plan/suggest`. The frontend has a button that triggers it, but the error surface is large (5 AI calls in sequence). Any model timeout or grading failure in stage 2-4 produces a generic 500 with no stage-level info shown in the UI.

---

## Section 4 — Configuration & Model Issues

---

### CHECK-021 — Frontend `MODELS` array in `MediaPlan.tsx` includes video models mixed with image models

**Status**: ⬜

**Files**: `src/pages/MediaPlan.tsx` MODELS constant (~line 77)

**What happens**: A single `MODELS` array mixes image models (`gemini-3-pro-image-preview`, `imagen-4.0-generate-001`) with video models (`veo-3.1-generate-preview`) and TTS models (`gemini-2.5-flash-preview-tts`). When a user selects a model in the MediaPlan item config, there is no type-gating: a video item could have `model: "imagen-4.0-generate-001"` set. The batch handler would then try to call `generateVideos` with an image model, which will fail with a 400/404.

**Fix required**: Show a type-filtered model selector:
- Image items → show only image models
- Video items → show only video models
- Voice items → show only TTS models
- Music items → show only music models

---

### CHECK-022 — `defaultConfig()` always uses image model for all types

**Status**: ✅ Fixed in Sprint 9

**Files**: `src/pages/MediaPlan.tsx` `defaultConfig()` (~line 115)

**What happens**: `defaultConfig()` returns `{ model: import.meta.env.VITE_MODEL_IMAGE || "gemini-3-pro-image-preview", ... }`. When a new item is created with `type: "video"` or `type: "voice"`, its `generationConfig.model` still defaults to the image model. This gets sent to the batch endpoint, which then uses the wrong model.

**Fix**: `defaultConfig()` is now type-aware (returns correct model per type). The type-change handler in the item config panel now resets `generationConfig` to `defaultConfig(newType)`, so changing an item's type always updates the model. `defaultConfig()` also now defaults `aspectRatio` to `"16:9"` for video items instead of `"1:1"`.

---

## Section 5 — Compose UX Confusion

---

### CHECK-023 — `trimPoints` maps `start`/`end` to `inPoint`/`outPoint` in the render body

**Status**: 🔵 By design — but confusing

**Files**: `src/pages/Compose.tsx` `handleRender` (~line 423)

**What happens**: The `ComposeProject.trimPoints` uses `{ start?: number; end?: number }`. When building the render body, it maps these to `{ inPoint, outPoint }`:
```typescript
body.trimPoints = {
  inPoint: project.trimPoints.start ?? 0,
  outPoint: project.trimPoints.end ?? 0,
};
```
The server reads `body.trimPoints.inPoint`/`outPoint`. This mapping is consistent but the frontend type uses `start`/`end` while the API uses `inPoint`/`outPoint`. Agents adding trim UI must use `start`/`end` in `ComposeProject` state but `inPoint`/`outPoint` in the body.

---

### CHECK-024 — Compose `mode === "slideshow"` auto-adds all jobs as slides (ignores `pickerTarget`)

**Status**: ✅ Fixed in Sprint 9

**Files**: `src/pages/Compose.tsx` `handleMediaSelect` (~line 316)

**What happens**: The picker handler originally had `if (pickerTarget === "slide" || project.mode === "slideshow")` which would add any job as a slide when in slideshow mode, overriding the pickerTarget. The `|| project.mode === "slideshow"` condition was removed. The handler now checks `pickerTarget` first in all cases. Additionally, `addSlideFromJob()` now rejects voice/music types with a warning toast (CHECK-015 fix), and the picker panel shows the "image" filter tab by default when targeting slides.

---

## Section 6 — Tests Lagging Behind Code

---

### CHECK-025 — Tests reference old component text/labels that may have changed

**Status**: ⬜

**Files**: `tests/components/`, `tests/api/`

**What happens**: Per SOP-7, when UI text changes, tests must be updated. There have been multiple sprint renaming events (e.g., "Suggest Plan" → "Quick Plan"). Check before running tests that the expected text strings in component tests match current button/heading labels.

**Action for each sprint**: Run `grep -r "Quick Plan\|Suggest Plan\|Generate All\|Batch\|Compose" tests/` and verify all strings match current UI.

---

## Appendix: Quick Bug Map by File

| File | Issues |
|------|--------|
| `src/pages/MediaPlan.tsx` | CHECK-017 (brandContext batch), CHECK-021 (models mixed) |
| `server.ts` (batch handler) | *(all fixed)* |
| `server.ts` (plan/suggest) | CHECK-006 (no generationConfig returned) |
| `src/pages/Compose.tsx` | CHECK-011 (dead audioJobId), CHECK-014 (history fetch), CHECK-023 (trimPoints naming) |
| `src/context/*` | CHECK-018 (BrandContext not persisted) |
| `src/pages/Research.tsx`, `VideoLab.tsx` | CHECK-019 (client-side Gemini) |
| `AGENTS.md` + `agents.md` | CHECK-016 (two files) |

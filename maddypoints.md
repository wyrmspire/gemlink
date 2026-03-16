# maddypoints.md — Agent Endpoint Improvement Suggestions

Observations and concrete suggestions for making Gemlink's endpoints work better
for agent-driven workflows. Written after reviewing `server.ts`, `boardroom.ts`,
`config.ts`, `agents.md`, and the lane system.

---

## 1. The Big One: Split server.ts Into Route Modules

**Current state:** `server.ts` is 136KB — media, boardroom, compose, research, twilio, collections, artifacts, settings all in one file. Every agent writing to the same file causes merge conflicts.

**Suggestion:** Move each lane's endpoints into its own Express router file:

```
routes/
  media.ts        ← Lane 1
  boardroom.ts    ← Lane 2
  research.ts     ← Lane 3
  compose.ts      ← Lane 4
  twilio.ts       ← Lane 5
  collections.ts  ← shared
  artifacts.ts    ← shared
  settings.ts     ← shared
```

```typescript
// server.ts becomes minimal:
app.use('/api/media',      mediaRouter);
app.use('/api/boardroom',  boardroomRouter);
app.use('/api/research',   researchRouter);
app.use('/api/compose',    composeRouter);
app.use('/api/twilio',     twilioRouter);
```

**Why it matters for agents:** Each agent touches exactly one file. No lane collisions on `server.ts`. New agents can add a new router without reading 136KB of other lanes' code.

---

## 2. Add a Capabilities Endpoint

**Current state:** Agents have to read `config.ts` and infer what's available. There's no runtime query.

**Suggestion:** `GET /api/capabilities`

```json
{
  "models": {
    "text": "gemini-2.0-flash",
    "image": "imagen-3",
    "video": "veo-2.0-generate-001",
    "boardroom": "gemini-2.5-pro",
    "music": "music-1.0-generate-preview"
  },
  "rateLimits": {
    "text": { "rpm": 15 },
    "image": { "ipm": 2 },
    "video": { "rpm": 1 }
  },
  "features": {
    "autoScore": true,
    "autoTag": true,
    "ffmpeg": true
  },
  "lanes": ["media", "boardroom", "research", "compose", "twilio"],
  "version": "0.4.5"
}
```

**Why it matters for agents:** An agent can call this once at startup, decide what tools to use, and adapt if a feature is disabled. No hardcoded assumptions about what's available.

---

## 3. Add Rate Limit Headers to Every Response

**Current state:** Rate limit config lives in `config.ts` but nothing tells callers how close they are to limits. Agents retry blindly.

**Suggestion:** Add standard headers to every API response:

```
X-RateLimit-Limit: 15
X-RateLimit-Remaining: 12
X-RateLimit-Reset: 1741987200
X-Request-Id: req_abc123
```

For 429 responses, add `Retry-After: 4` (seconds).

**Why it matters for agents:** Agents can back off intelligently instead of hammering and getting 429s. Especially important for video (1 RPM) and music (1 RPM) — the hardest limits in the system.

---

## 4. Add SSE Streaming for Long-Running Jobs

**Current state:** Boardroom, video, music, and compose all use polling (`GET /media/job/:type/:id`). Agents poll on a fixed interval, wasting requests and adding latency.

**Suggestion:** Add Server-Sent Events endpoints alongside the existing poll endpoints:

```
GET /api/boardroom/sessions/:id/stream   ← streams turns as they happen
GET /api/media/job/:type/:id/stream      ← streams status updates
GET /api/media/compose/:id/stream        ← streams compose progress %
```

```typescript
// Example boardroom stream
res.setHeader('Content-Type', 'text/event-stream');
res.setHeader('Cache-Control', 'no-cache');

boardroomEngine.on('turn', (turn) => {
  res.write(`data: ${JSON.stringify(turn)}\n\n`);
});
boardroomEngine.on('done', (result) => {
  res.write(`data: ${JSON.stringify({ type: 'done', result })}\n\n`);
  res.end();
});
```

**Why it matters for agents:** Agents get real-time feedback without polling loops. Boardroom sessions in particular are ~32 API calls — streaming means the agent sees each turn as it completes rather than waiting for the full session.

---

## 5. Add Idempotency Keys to Generation Endpoints

**Current state:** If an agent retries a failed `POST /api/media/image` request, it might generate a duplicate. No way to tell if the first one succeeded.

**Suggestion:** Accept an optional `Idempotency-Key` header on all generation endpoints. If the server has already processed a request with that key, return the cached response.

```
POST /api/media/image
Idempotency-Key: agent-session-xyz-image-1

→ Returns same job result if already processed
→ Returns fresh job if new key
```

Store keys in SQLite with a 24h TTL.

**Why it matters for agents:** Safe retries. An agent that got a network error on a slow Veo request doesn't have to guess whether to retry or not.

---

## 6. Fix the URL Prefix Inconsistency

**Current state:** Some endpoints have `/api/` prefix, some don't:
- `GET /health` — no prefix
- `GET /style-db` — no prefix
- `GET /settings` — no prefix
- `GET /api/media/...` — has prefix
- `GET /compose/templates` — no prefix despite being under compose

**Suggestion:** All endpoints under `/api/`. Move `/health` to `/api/health`, `/style-db` to `/api/style-db`, etc. Add a redirect for backwards compatibility.

**Why it matters for agents:** Agents generating fetch calls use a consistent base URL. Right now an agent writing a client has to remember which endpoints have the prefix and which don't.

---

## 7. Boardroom: Add a Mid-Session Inject Endpoint

**Current state:** Boardroom sessions run to completion autonomously. There's no way to guide a session once it's started, even if early phases reveal the objective was underspecified.

**Suggestion:** `POST /api/boardroom/sessions/:id/inject`

```json
{
  "phase": "challenge",
  "message": "Consider that the target market is B2B, not B2C",
  "fromSeat": "moderator"
}
```

This inserts a moderator message into the room context before the next phase begins. The session only accepts this if it's between phases (not mid-turn).

**Why it matters for agents:** An orchestrating agent watching a boardroom session can steer it without having to abort and restart. Saves ~20 API calls when an early phase goes off-track.

---

## 8. Add a Job Cancellation Endpoint

**Current state:** Once a video or music job is started, there's no way to cancel it. The polling loop runs until it times out or completes. If an agent decides the output isn't needed, it still burns quota.

**Suggestion:**

```
POST /api/media/job/:type/:id/cancel
DELETE /api/boardroom/sessions/:id
```

For Gemini async operations that support cancellation (Veo), call the cancel API. For others, mark the job as `cancelled` in the DB and stop polling.

**Why it matters for agents:** Agents make decisions in loops. If a downstream agent decides it doesn't need the video, the upstream generation should stop. Without cancel, you burn quota even after the agent moves on.

---

## 9. Add Agent Identity Headers

**Current state:** All requests look the same in logs. You can't tell which agent lane made a request, which session it belongs to, or trace a request through the system.

**Suggestion:** Accept and propagate agent identity headers:

```
X-Agent-Id: lane-1-media-agent
X-Agent-Session: session-abc123
X-Agent-Lane: 1
```

Log these alongside every request in the `[section]` console prefix format already used:

```
[media/image] [lane:1] [session:abc123] Generating image: "sunset over mountains"
```

The `/api/capabilities` endpoint (suggestion #2) can also return the accepted header names.

**Why it matters for agents:** Multi-agent traceability. When something goes wrong, you know exactly which agent, in which lane, in which session made the call.

---

## 10. Expose a Dry-Run Mode for Expensive Endpoints

**Current state:** There's no way to validate a request payload without actually spending quota. An agent that builds a compose job config has to submit it and hope the parameters are valid.

**Suggestion:** Accept a `dry-run: true` body field (or `X-Dry-Run: true` header) on endpoints that call external APIs:

```
POST /api/media/image
{ "prompt": "sunset", "dry-run": true }
→ 200 { "valid": true, "estimatedCredits": 1, "model": "imagen-3" }

POST /api/boardroom/sessions
{ ..., "dry-run": true }
→ 200 { "valid": true, "estimatedCalls": 32, "seats": [...] }
```

**Why it matters for agents:** An agent can validate its full plan before committing quota. The boardroom in particular — 32 API calls — benefits hugely from pre-validation.

---

## 11. Boardroom Seat Provider Should Be Configurable

**Current state:** Each boardroom seat has a `provider` field but it's hardcoded to `"gemini"`. The code doesn't use it.

**Suggestion:** Actually honor `provider` and allow seats to use different models:

```json
{
  "seats": [
    {
      "id": "s1",
      "name": "Devil's Advocate",
      "provider": "gemini",
      "model": "gemini-2.5-pro"
    },
    {
      "id": "s2",
      "name": "Optimist",
      "provider": "gemini",
      "model": "gemini-2.0-flash"
    }
  ]
}
```

Even with a single provider, allowing per-seat model selection lets you run a "fast/cheap" seat and a "slow/smart" seat in the same session. Use Flash for the first-pass seat and Pro for the convergence seat.

**Why it matters for agents:** Better cost control. An agent orchestrating a boardroom session could pick models based on budget constraints rather than always running everything on Pro.

---

## 12. Add a Queue Status Endpoint

**Current state:** There's no way to know how many jobs are currently running or pending. An agent that wants to batch-submit 10 images can't tell whether the system is already saturated.

**Suggestion:** `GET /api/queue`

```json
{
  "running": {
    "image": 1,
    "video": 2,
    "music": 0,
    "boardroom": 1,
    "compose": 0
  },
  "pending": {
    "image": 3,
    "video": 0
  },
  "rateLimitStatus": {
    "text": { "callsThisMinute": 8, "limit": 15 },
    "image": { "callsThisMinute": 1, "limit": 2 }
  }
}
```

**Why it matters for agents:** An orchestrating agent can make smart throttling decisions. If video slots are full, queue the next request locally rather than submitting and getting a 429.

---

## 13. Research Endpoint: Expose Thinking Budget

**Current state:** `POST /api/research/think` uses Gemini thinking mode but the thinking budget isn't exposed as a parameter. It's whatever the server defaults to.

**Suggestion:** Accept `thinkingBudget` as an optional parameter:

```json
{
  "query": "competitive analysis for...",
  "thinkingBudget": 8192,
  "streamThinking": true
}
```

`streamThinking: true` would stream the thinking tokens via SSE (separate from the final answer) so agents can monitor reasoning quality in real-time.

**Why it matters for agents:** An agent doing quick triage can request a low budget. An agent doing deep strategy research can request a high budget. Right now it's one-size-fits-all.

---

## 14. Collections: Add Bulk Operations

**Current state:** Collection items are added one at a time (`POST /collections/:id/items`). Adding 20 media items from a batch generation requires 20 separate requests.

**Suggestion:**

```
POST /api/collections/:id/items/bulk
{ "jobIds": ["job1", "job2", "job3", ...] }

DELETE /api/collections/:id/items/bulk
{ "jobIds": ["job1", "job2"] }
```

**Why it matters for agents:** After a batch generation run, an agent assembling a collection currently has to loop. Bulk operations mean one call.

---

## 15. Media Scoring: Expose the Rubric

**Current state:** `POST /api/media/score` scores a single item, and `POST /api/media/scoring-insights` gives a breakdown. But the rubric (what criteria are being scored) isn't documented in the API.

**Suggestion:** `GET /api/media/scoring-rubric`

```json
{
  "dimensions": [
    { "id": "relevance", "weight": 0.3, "description": "How well the media matches the brief" },
    { "id": "quality", "weight": 0.4, "description": "Technical and aesthetic quality" },
    { "id": "brand_fit", "weight": 0.3, "description": "Alignment with brand voice and palette" }
  ],
  "scale": { "min": 1, "max": 10 }
}
```

**Why it matters for agents:** An agent that auto-selects the "best" media from a batch needs to know what the scores mean. Right now scores come back as numbers without a public rubric definition — agents can't reason about thresholds.

---

## Priority Order

| # | Change | Effort | Impact |
|---|--------|--------|--------|
| 1 | Split server.ts into route modules | Medium | Very high — solves agent collision |
| 3 | Rate limit headers | Low | High — prevents blind retries |
| 2 | Capabilities endpoint | Low | High — self-describing API |
| 6 | Fix URL prefix inconsistency | Low | Medium — reduces agent config errors |
| 9 | Agent identity headers | Low | Medium — traceability |
| 8 | Job cancellation | Medium | Medium — quota safety |
| 4 | SSE streaming | Medium | High — eliminates polling loops |
| 5 | Idempotency keys | Medium | Medium — safe retries |
| 14 | Bulk collection ops | Low | Medium — fewer round trips |
| 7 | Boardroom inject | High | Medium — mid-session steering |
| 11 | Per-seat model config | Low | Medium — cost control |
| 12 | Queue status | Medium | Medium — smart throttling |
| 10 | Dry-run mode | Medium | Medium — pre-validation |
| 13 | Research thinking budget | Low | Low-Medium — fine-grained control |
| 15 | Scoring rubric endpoint | Low | Low — transparency |

---

*Suggestions focus on agent ergonomics: self-describing APIs, safe retries, real-time feedback, and collision avoidance. None of these require changes to the Gemini integration — they're all Express/architecture-level improvements.*

---

## 16. Auto-Compose Handoff is Broken — Compose Never Reads the Data

**Current state:** `POST /api/media/plan/:planId/auto-compose` returns composition groups. MediaPlan stores them in `sessionStorage("auto-compose-groups")` and navigates to `/compose`. **But Compose.tsx never reads that key.** It only reads `compose-send-item`. The user (or agent) lands on a blank Compose page. For agents, the situation is even worse — there's no API that takes an auto-compose result and returns a fully assembled `ComposeProject` JSON.

**Suggestion:** Two fixes:

1. **Frontend:** Add a `useEffect` in Compose.tsx to read `auto-compose-groups` and pre-fill the project.

2. **Agent endpoint:** `POST /api/compose/from-plan`

```json
{
  "compositions": [{ "slideJobIds": [...], "voiceJobId": "...", "template": {...} }]
}
→ 200 {
  "projects": [{
    "mode": "slideshow",
    "title": "Product Showcase (Group 1)",
    "slides": [{ "jobId": "...", "thumbnail": "/jobs/images/.../output.png", "duration": 3, "transition": "fade" }],
    "voiceJobId": "...",
    "captionConfig": { "text": "...", "style": "bold-outline", "timing": "word" },
    "outputConfig": { "aspectRatio": "9:16", "resolution": "1080p", "fps": 30 }
  }]
}
```

An agent calling auto-compose → from-plan → `/api/compose/render` can orchestrate the entire pipeline without the UI.

**Why it matters for agents:** Right now the pipeline is: plan → auto-compose → (broken handoff) → empty compose page → manual setup → render. An agent literally cannot complete this flow via API.

---

## 17. History API Missing `duration` — Video Slides Default to 3s

**Current state:** `GET /api/media/history` returns job manifests but does NOT include `duration` for video/voice/music jobs, even though the DB schema has a `duration` column and `probeMedia()` can provide it. Without duration data, `jobToSlide()` hardcodes `duration: 3` for all slides — a 10-second Veo clip becomes a 3-second slide.

**Suggestion:** Add `duration` to the history API response:

```typescript
// In collectHistory() — flat-file path:
{
  ...manifest,
  duration: manifest.duration ?? undefined,
}

// In collectHistory() — DB path:
{
  ...row,
  duration: row.duration ?? undefined,
}
```

Also probe for duration at generation time. When a video job completes, call `probeMedia()` and store the result in the manifest/DB.

**Why it matters for agents:** An agent building a composition needs to know how long each video clip is to set slide durations, calculate total composition time, match voiceover duration, and warn about mismatches. Without this, every agent-built slideshow has wrong timing.

---

## 18. Plan Suggest Endpoint Has No Duration/Format Awareness

**Current state:** `POST /api/media/plan/suggest` prompt tells the AI to generate items but says nothing about:
- Veo clips are max ~8 seconds
- Music tracks are max ~30 seconds
- Video only supports 16:9 and 9:16
- Voice duration depends on text length

So the AI might plan a "30-second product demo" as one video item, which silently fails.

**Suggestion:** Add duration and format constraints to the system prompt:

```typescript
"- VIDEO: max 8 seconds per clip. For longer content, use multiple video items or an image slideshow with voiceover.",
"- MUSIC: max 30 seconds per track.",
"- VOICE: duration scales with text length (~150 words/minute).",
"- VIDEO ASPECT RATIOS: only 16:9 or 9:16. Images support any ratio.",
```

Also accept and pass back `estimatedDuration` per item so agents can compute total duration before generation.

**Why it matters for agents:** An agent trusts the planner's output. If the planner says "1 video, 30 seconds" and Veo produces 8 seconds, the agent has no way to recover. Duration awareness prevents impossible plans.

---

## 19. Plan Suggest Should Return Composition Metadata

**Current state:** `POST /api/media/plan/suggest` returns `{ items: [...] }` — just a list of assets. It doesn't suggest anything about how to assemble them: no caption style, no transition preference, no aspect ratio, no slide duration, no composition order.

**Suggestion:** Extend the return schema:

```json
{
  "items": [ ... ],
  "compositionSuggestion": {
    "captionStyle": "word-highlight",
    "captionAnimation": "pop",
    "transitionStyle": "dissolve",
    "aspectRatio": "9:16",
    "slideDuration": 3,
    "kenBurns": true,
    "targetPlatform": "instagram-reels",
    "reasoning": "Gen Z audience → vertical, fast cuts, bold captions"
  }
}
```

The planner prompt already knows the brand context — it should think about formatting too.

**Why it matters for agents:** An agent going from plan → compose needs these parameters. Without them, every composition uses generic defaults. With them, the agent can programmatically build a brand-appropriate composition without guessing.

---

## 20. Add Thinking Depth Parameter to Plan Suggest

**Current state:** Plan suggest uses a single Gemini call with `gemini-2.5-flash`. No way to request deeper analysis. The multi-stage pipeline endpoint exists at `/api/media/plan/pipeline` but it's a separate path with different semantics.

**Suggestion:** Add `depth` parameter to suggest:

```json
POST /api/media/plan/suggest
{
  "description": "...",
  "depth": "quick" | "deep" | "refine",
  "existingItems": []   // optional, for "refine" mode
}
```

- **quick** — current behavior, single Flash call
- **deep** — two-pass: analysis → plan generation, uses Pro or thinking model
- **refine** — takes existing items, critiques them, suggests improvements

```json
// "refine" mode response
{
  "items": [ ... ],        // revised items
  "removedItems": ["item_abc"],
  "addedItems": ["item_xyz"],
  "reasoning": "Added a voiceover to tie the 5 images into a cohesive narrative. Removed duplicate product shot."
}
```

**Why it matters for agents:** An orchestrating agent can decide how much thinking to invest based on the importance of the plan. Quick for iteration, deep for final plans, refine for revision loops.

---

## 21. Add Plan Refinement Endpoint ("Think Again")

**Current state:** No endpoint to critique an existing plan. The only option is to generate a fresh plan from scratch with `/api/media/plan/suggest`.

**Suggestion:** `POST /api/media/plan/:planId/refine`

```json
{
  "items": [ <current plan items> ],
  "focus": "improve prompts" | "add missing items" | "optimize for platform" | "all",
  "platform": "tiktok" | "instagram" | "youtube-shorts" | "linkedin"
}
→ 200 {
  "refinedItems": [ ... ],
  "changes": [
    { "itemId": "item_abc", "field": "promptTemplate", "before": "...", "after": "...", "reason": "More specific lighting description" },
    { "action": "added", "item": { ... }, "reason": "Missing voiceover for cohesive narrative" }
  ],
  "compositionSuggestion": { ... }
}
```

**Why it matters for agents:** An agent reviewing a batch of generated media can send the underperforming items back for prompt refinement before re-generating. This creates a self-improving loop: generate → score → refine → re-generate.

---

## 22. Voice→Caption Auto-Fill is Missing

**Current state:** When a voice job is selected as the voiceover track, the caption text field stays empty. The user (or agent) has to manually type the same narration text into the caption config. The voice job's `text` field contains the script, but no endpoint or logic copies it to caption config.

**Suggestion:** Two changes:

1. **Auto-compose endpoint** should include `captionText` derived from the voice job's source text (it partially does this, but the wiring to Compose is broken — see #16).

2. **New endpoint:** `GET /api/media/job/:type/:id/text`

```json
→ 200 { "text": "Welcome to our brand new product...", "wordCount": 45, "estimatedDuration": 18 }
```

This returns the source text of any voice job, so an agent (or the frontend) can fetch it and populate captions without needing the full manifest.

3. **Compose render endpoint** should accept `captionSource: "voice"` and auto-pull text from the voice job:

```json
POST /api/compose/render
{
  "mode": "slideshow",
  "slides": [...],
  "voiceJobId": "job_abc",
  "captionSource": "voice",  // ← auto-populate from voice job text
  "captionStyle": "word-highlight",
  "captionTiming": "word"
}
```

**Why it matters for agents:** This is the biggest UX gap. Agents generating videos with voiceovers currently produce silent videos (no burned captions) because there's no automated path from voice text → caption text. Every TikTok/Reels video needs captions.

---

## 23. Video Slides Need Separate FFmpeg Handling

**Current state:** `createSlideshow()` in compose.ts processes all slides the same way. Image slides get `tpad=stop_mode=clone:stop_duration=X` (which extends a still image to fill the duration). Video slides also get this filter, which is wrong — it pads a video with frozen frames instead of playing the actual video content. Separately, video slides use `-stream_loop -1` on input, which loops them indefinitely, then the `tpad` filter clips them wrong.

**Suggestion:** In `createSlideshow()`, branch the filter logic:

```typescript
if (isImageFile(slide.imagePath)) {
  // Current logic: scale + tpad + optional kenBurns
  filterParts.push(`[${i}:v]${scaleFilter},tpad=...[v${i}]`);
} else {
  // Video slide: scale + trim (no tpad, no kenBurns)
  filterParts.push(`[${i}:v]${scaleFilter},trim=duration=${dur},setpts=PTS-STARTPTS,fps=${fps}[v${i}]`);
}
```

Also expose this as a parameter in the compose API so agents can set `slideType: "video" | "image"` per slide, avoiding auto-detection failures.

**Why it matters for agents:** An agent building a slideshow with video clips produces broken output. The videos freeze/loop/pad incorrectly. This makes mixed-media compositions (images + video clips) — the most common use case — unreliable.

---

## 24. Per-Slide Duration Should Use Probe Data

**Current state:** `POST /api/compose/render` accepts slide durations in the request, but there's no way for an agent to ask "how long is this video?" without calling a separate probe endpoint. And the slide duration defaults to 3 seconds regardless of actual content length.

**Suggestion:** Add a probe parameter to the compose endpoint:

```json
POST /api/compose/render
{
  "slides": [
    { "jobId": "job_abc", "duration": "auto" },  // ← server probes the file
    { "jobId": "job_def", "duration": 3 }
  ]
}
```

When `duration: "auto"`, the server calls `probeMedia()` on the slide's media file and uses its actual duration. For images, default to 3s. For videos, use the probe result.

Also expose `GET /api/media/job/:type/:id/probe`:

```json
→ 200 { "duration": 8.4, "width": 1920, "height": 1080, "codec": "h264", "hasAudio": true }
```

**Why it matters for agents:** An agent can request correct durations without guessing. `"duration": "auto"` is the safe default that prevents 3-second truncation of long videos.

---

## 25. Full Compose-From-Plan Orchestration Endpoint

**Current state:** Going from a media plan to a rendered video requires 4 separate API calls with manual data wiring between them:

1. `POST /api/media/plan/:id/auto-compose` → groups
2. (broken) Navigate to Compose and hope it loads → it doesn't
3. Manually configure the composition
4. `POST /api/compose/render` → rendered video

No single endpoint ties this together.

**Suggestion:** `POST /api/compose/from-plan`

```json
{
  "planId": "plan_abc",
  "items": [ <approved plan items> ],
  "templateId": "faceless-explainer",          // optional
  "captionSource": "voice",                    // auto-pull from voice item
  "captionStyle": "word-highlight",
  "captionTiming": "word",
  "aspectRatio": "9:16",
  "render": false                              // true = immediately render, false = return ComposeProject JSON for review
}
→ 200 {
  "project": {
    "mode": "slideshow",
    "title": "Auto-Composed: Product Launch",
    "slides": [...],
    "voiceJobId": "...",
    "captionConfig": { ... },
    "outputConfig": { ... }
  },
  "reasoning": "Grouped 6 images into 2 compositions. Matched voice_abc to group 1 based on shared 'product-launch' tag."
}
```

With `render: true`, it also kicks off the render and returns the compose job ID for polling.

**Why it matters for agents:** This is the holy grail for agent-driven workflows. One call: plan → composition → render. An orchestrating agent can go from "here's my media plan" to "here's a rendered TikTok video" in a single request. This makes the full AI-to-video pipeline automatable.

---

## Updated Priority Order

| # | Change | Effort | Impact |
|---|--------|--------|--------|
| 1 | Split server.ts into route modules | Medium | Very high — solves agent collision |
| **16** | **Fix auto-compose handoff + from-plan endpoint** | **Medium** | **Very high — totally broken pipeline** |
| **17** | **Add duration to history API** | **Low** | **High — wrong video timing everywhere** |
| **22** | **Voice→caption auto-fill** | **Low** | **High — every video needs captions** |
| **23** | **Video slide FFmpeg handling** | **Low** | **High — broken mixed-media output** |
| 3 | Rate limit headers | Low | High — prevents blind retries |
| 2 | Capabilities endpoint | Low | High — self-describing API |
| **25** | **Full compose-from-plan orchestration** | **Medium** | **High — single-call plan→video** |
| **18** | **Duration/format awareness in suggest** | **Low** | **Medium — prevents impossible plans** |
| **19** | **Composition metadata in suggest** | **Low** | **Medium — brand-appropriate defaults** |
| **20** | **Thinking depth parameter** | **Low** | **Medium — agent can control reasoning** |
| **24** | **Per-slide auto-probe duration** | **Low** | **Medium — correct durations** |
| **21** | **Plan refinement endpoint** | **Medium** | **Medium — self-improving loop** |
| 6 | Fix URL prefix inconsistency | Low | Medium — reduces agent config errors |
| 9 | Agent identity headers | Low | Medium — traceability |
| 8 | Job cancellation | Medium | Medium — quota safety |
| 4 | SSE streaming | Medium | High — eliminates polling loops |
| 5 | Idempotency keys | Medium | Medium — safe retries |
| 14 | Bulk collection ops | Low | Medium — fewer round trips |
| 7 | Boardroom inject | High | Medium — mid-session steering |
| 11 | Per-seat model config | Low | Medium — cost control |
| 12 | Queue status | Medium | Medium — smart throttling |
| 10 | Dry-run mode | Medium | Medium — pre-validation |
| 13 | Research thinking budget | Low | Low-Medium — fine-grained control |
| 15 | Scoring rubric endpoint | Low | Low — transparency |

---

*Items 16–25 focus on the Media Plan → Compose → Render pipeline — the most critical agent workflow. Without these, an external agent literally cannot produce a video from a media plan via API. Items 16, 17, 22, 23 are bugs (broken or missing wiring); items 18–21 make the planner smarter; items 24–25 build the orchestration layer.*

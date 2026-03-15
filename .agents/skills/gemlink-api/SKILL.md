---
name: gemlink-api
description: How to start the Gemlink server and use all its API endpoints to generate images, videos, voice, run research, boardroom sessions, manage plans, collections, and score media.
---

# Gemlink API — Agent Skill

Gemlink is a media generation workspace at `/home/devpc/.openclaw/workspace/gemlink`. It wraps Google Gemini APIs behind an Express server so you can generate images, videos, voice audio, run AI research, hold boardroom sessions, manage media plans, and score outputs — all via HTTP.

## Starting the Server

**Check if it's running first:**
```bash
curl -s http://localhost:3015/api/health
# Expected: {"status":"ok"}
```

**If not running, start it:**
```bash
cd /home/devpc/.openclaw/workspace/gemlink
PORT=3015 npm run dev
```
Wait ~5 seconds for Vite to initialize.

**Prerequisites:**
- Node 18+
- `.env.local` must contain `GEMINI_API_KEY=<your key>`
- The server reads the API key from this file automatically — you do NOT need to pass it in most requests

---

## API Reference

**Base URL**: `http://localhost:3015/api`  
**Content-Type**: `application/json` for all POST requests  
**API Key**: The server uses `process.env.GEMINI_API_KEY` from `.env.local`. You can optionally pass `"apiKey"` in the request body to override, but usually you don't need to.

---

### 1. Generate Image

```
POST /api/media/image
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `prompt` | string | ✅ | — | The generation prompt. Include brand context inline for best results. |
| `model` | string | — | `"gemini-3.1-flash-image-preview"` | Model to use. |
| `size` | string | — | `"1K"` | Image size: `"1K"`, `"2K"`, or `"4K"`. |
| `aspectRatio` | string | — | `"1:1"` | Aspect ratio: `"1:1"`, `"2:3"`, `"3:2"`, `"3:4"`, `"4:3"`, `"9:16"`, `"16:9"`, `"21:9"`. |
| `brandContext` | object | — | — | `{ brandName, brandDescription, targetAudience, brandVoice }` — stored in the job manifest. |
| `projectId` | string | — | — | Links the job to a project for filtering. |

**Example:**
```bash
curl -s -X POST http://localhost:3015/api/media/image \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A futuristic holographic AI assistant floating above a desk, warm lighting, cinematic style",
    "size": "1K",
    "aspectRatio": "16:9",
    "projectId": "proj_abc123"
  }'
```

**Response:** `JobManifest` with `status: "completed"` and `outputs: ["/jobs/images/<jobId>/output_0.png"]`.

**To generate multiple images**, send N sequential requests (the API generates 1 per call).

---

### 2. Generate Video

```
POST /api/media/video
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `prompt` | string | ✅ | — | Video generation prompt. |
| `model` | string | — | `"veo-3.1-fast-generate-preview"` | Video model. |
| `resolution` | string | — | — | Resolution hint (e.g., `"720p"`, `"1080p"`). |
| `aspectRatio` | string | — | — | `"16:9"`, `"9:16"`, `"1:1"`. |
| `imageBytes` | string | — | — | Base64-encoded image for image-to-video. |
| `mimeType` | string | — | — | MIME type of the image (required if `imageBytes` is sent). |
| `brandContext` | object | — | — | Brand context object. |
| `projectId` | string | — | — | Project ID. |

**Response:** `202 Accepted` with a pending `JobManifest`. Video generation is **asynchronous** — the server polls Gemini in the background.

**Poll status:**
```bash
curl -s http://localhost:3015/api/media/job/video/<jobId>
# Wait until status is "completed", then the output URL will be in .outputs[0]
```

**Example:**
```bash
curl -s -X POST http://localhost:3015/api/media/video \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A drone shot of a futuristic city at sunset, smooth camera movement",
    "aspectRatio": "16:9"
  }'
```

---

### 3. Generate Voice (TTS)

```
POST /api/media/voice
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `text` | string | ✅ | — | Text to speak. |
| `voice` | string | — | — | Voice name. Options: `"Puck"`, `"Charon"`, `"Kore"`, `"Fenrir"`, `"Zephyr"`. |
| `brandContext` | object | — | — | Brand context. |
| `projectId` | string | — | — | Project ID. |

**Example:**
```bash
curl -s -X POST http://localhost:3015/api/media/voice \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Welcome to our product launch. We are excited to share our latest innovation with you.",
    "voice": "Kore"
  }'
```

**Response:** `JobManifest` with `outputs: ["/jobs/voices/<jobId>/output.wav"]`.

---

### 4. Batch Generate (Multiple Items)

```
POST /api/media/batch
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `items` | array | ✅ | Array of `{ type, prompt, text?, voice?, model?, size?, aspectRatio?, resolution?, brandContext?, projectId? }` |

Each item's `type` must be `"image"`, `"video"`, or `"voice"`.

**Example:**
```bash
curl -s -X POST http://localhost:3015/api/media/batch \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      { "type": "image", "prompt": "Product hero shot, minimalist background", "size": "1K", "aspectRatio": "1:1" },
      { "type": "image", "prompt": "Behind the scenes team photo, warm colors", "size": "1K", "aspectRatio": "16:9" },
      { "type": "voice", "text": "Check out our latest product!", "voice": "Zephyr" }
    ]
  }'
```

**Response:** `202 Accepted` with `{ batchId, total, jobIds, statuses }`.

**Poll batch status:**
```bash
curl -s http://localhost:3015/api/media/batch/<batchId>
# Returns: { ...state, summary: { total, done, generating, queued, failed }, complete: boolean }
```

---

### 5. Research (Search Grounding)

```
POST /api/research/search
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | string | ✅ | Research question |
| `brandContext` | object | — | `{ brandName, brandDescription, targetAudience }` for context |

**Example:**
```bash
curl -s -X POST http://localhost:3015/api/research/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Best practices for Instagram Reels for B2B companies in 2026"
  }'
```

**Response:** `{ text: "...", sources: [{ uri, title }] }`

---

### 6. Research (Deep Thinking)

```
POST /api/research/think
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | string | ✅ | Analysis question |
| `brandContext` | object | — | Brand context for personalized analysis |

**Example:**
```bash
curl -s -X POST http://localhost:3015/api/research/think \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Analyze the psychological triggers that make faceless YouTube channels effective"
  }'
```

**Response:** `{ text: "..." }`

---

### 7. Boardroom Session (Multi-Agent Brainstorm)

```
POST /api/boardroom/sessions
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `topic` | string | ✅ | — | Discussion topic. |
| `context` | string | — | `""` | Additional context for the discussion. |
| `participants` | array | — | Strategy Lead + Operations Lead | Array of `{ name, role, brief?, model? }`. Max 5 seats. |
| `rounds` | number | — | `5` | Number of protocol phases (1-5). |
| `depth` | string | — | `"standard"` | `"light"`, `"standard"`, or `"deep"`. |

**Example:**
```bash
curl -s -X POST http://localhost:3015/api/boardroom/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "Should we pivot our content strategy to short-form video?",
    "context": "We currently generate mostly static images for Instagram. Our audience is Gen Z.",
    "depth": "deep",
    "rounds": 3
  }'
```

**Response:** `202 Accepted` with the session object (status: `"pending"`).

**Poll until complete:**
```bash
curl -s http://localhost:3015/api/boardroom/sessions/<sessionId>
# Poll every 10-15 seconds. Sessions typically take 1-3 minutes.
# When status is "completed", the result.summary and result.nextSteps are available.
```

**List all sessions:**
```bash
curl -s http://localhost:3015/api/boardroom/sessions
```

**Extract media briefs from a completed session:**
```bash
curl -s -X POST http://localhost:3015/api/boardroom/sessions/<sessionId>/media-briefs \
  -H "Content-Type: application/json" \
  -d '{}'
```

---

### 8. Prompt Expansion (3-Step Chain)

```
POST /api/media/prompt/expand
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `basePrompt` | string | ✅ | Short prompt to expand |
| `purpose` | string | — | E.g., "Instagram post", "YouTube thumbnail" |
| `platform` | string | — | Target platform |
| `projectContext` | object | — | `{ brandName, brandDescription, targetAudience, brandVoice, styleKeywords }` |

**Response:** `{ original, expanded, chain: [...] }`

---

### 9. Prompt Variants

```
POST /api/media/prompt/variants
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `expandedPrompt` | string | ✅ | — | The expanded prompt to create variants of |
| `count` | number | — | `4` | Number of style variants |

**Response:** `{ expandedPrompt, variants: [{ style, prompt }] }`

---

### 10. Score Media (LLM-as-Judge)

```
POST /api/media/score
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `jobId` | string | ✅ | The job ID to score |
| `jobType` | string | ✅ | `"image"`, `"video"`, or `"voice"` |
| `projectContext` | object | — | Brand context for scoring alignment |
| `purpose` | string | — | What the media was for |

**Response:** `{ scores: { brandAlignment, purposeFit, technicalQuality, audienceMatch, uniqueness }, overall, reasoning, suggestions }`

---

### 11. Media Plan Suggestions

```
POST /api/media/plan/suggest
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `description` | string | ✅ | What the plan should cover |
| `projectContext` | object | — | `{ brandName, brandDescription, targetAudience, brandVoice }` |

**Response:** `{ items: MediaPlanItem[] }` where each item has `{ id, type, label, purpose, promptTemplate, model, size, aspectRatio, status, tags }`.

---

### 12. Media History & Job Status

```bash
# All media jobs
curl -s http://localhost:3015/api/media/history

# Filter by project
curl -s "http://localhost:3015/api/media/history?projectId=proj_abc123"

# Single job status
curl -s http://localhost:3015/api/media/job/image/<jobId>
curl -s http://localhost:3015/api/media/job/video/<videoJobId>
curl -s http://localhost:3015/api/media/job/voice/<voiceJobId>
```

---

### 13. Collections CRUD

```bash
# Create collection
curl -s -X POST http://localhost:3015/api/collections \
  -H "Content-Type: application/json" \
  -d '{"name": "Campaign Q2", "projectId": "proj_abc123"}'

# List collections
curl -s "http://localhost:3015/api/collections?projectId=proj_abc123"

# Get single collection
curl -s http://localhost:3015/api/collections/<collectionId>

# Add item to collection
curl -s -X POST http://localhost:3015/api/collections/<collectionId>/items \
  -H "Content-Type: application/json" \
  -d '{"jobId": "<mediaJobId>", "jobType": "image"}'

# Delete item from collection
curl -s -X DELETE http://localhost:3015/api/collections/<collectionId>/items/<itemIndex>

# Delete collection
curl -s -X DELETE http://localhost:3015/api/collections/<collectionId>

# Export collection as ZIP
curl -s -X POST http://localhost:3015/api/collections/<collectionId>/export --output collection.zip
```

---

### 14. Twilio Sales Agent Config

```bash
# Save brand config to the SMS agent
curl -s -X POST http://localhost:3015/api/twilio/config \
  -H "Content-Type: application/json" \
  -d '{
    "brandName": "FutureTech AI",
    "brandDescription": "AI automation agency",
    "targetAudience": "SMBs looking to scale with AI",
    "brandVoice": "Professional and innovative"
  }'

# Read current config
curl -s http://localhost:3015/api/twilio/config
```

---

### 15. Video Analysis

```
POST /api/media/video/analyze
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `videoData` | string | ✅ | Base64-encoded video |
| `mimeType` | string | ✅ | MIME type of the video |

---

## Accessing Generated Files

All generated media is served as static files:

```
http://localhost:3015/jobs/images/<jobId>/output_0.png
http://localhost:3015/jobs/videos/<jobId>/output.mp4
http://localhost:3015/jobs/voices/<jobId>/output.wav
```

## Common Workflows

### Generate an image and score it:
```bash
# 1. Generate
RESULT=$(curl -s -X POST http://localhost:3015/api/media/image \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Professional headshot of a businesswoman, soft lighting"}')

JOB_ID=$(echo $RESULT | jq -r '.id')

# 2. Score
curl -s -X POST http://localhost:3015/api/media/score \
  -H "Content-Type: application/json" \
  -d "{\"jobId\": \"$JOB_ID\", \"jobType\": \"image\", \"purpose\": \"LinkedIn profile photo\"}"
```

### Run a boardroom session and extract media briefs:
```bash
# 1. Start session
RESULT=$(curl -s -X POST http://localhost:3015/api/boardroom/sessions \
  -H "Content-Type: application/json" \
  -d '{"topic": "Plan Q3 social media campaign for Gen Z", "rounds": 3}')

SESSION_ID=$(echo $RESULT | jq -r '.id')

# 2. Poll until done
while true; do
  STATUS=$(curl -s http://localhost:3015/api/boardroom/sessions/$SESSION_ID | jq -r '.status')
  [ "$STATUS" = "completed" ] && break
  [ "$STATUS" = "failed" ] && echo "FAILED" && break
  sleep 15
done

# 3. Extract media briefs
curl -s -X POST http://localhost:3015/api/boardroom/sessions/$SESSION_ID/media-briefs \
  -H "Content-Type: application/json" -d '{}'
```

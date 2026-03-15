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

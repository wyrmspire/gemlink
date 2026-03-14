# Gemlink — Upgrade Plan: Bulk Media & Multi-Project Workflows

> **Goal**: Transform Gemlink from a single-brand, one-at-a-time media tool into a bulk media production engine that can generate, organize, rank, and deliver presentation-ready assets across multiple projects simultaneously.
>
> **Last updated**: 2026-03-14

---

## The Problem (What's Missing Today)

Looking at the current codebase, here's what stands between Gemlink and the "generate lots of relevant, useful media all at once" workflow you want:

| Gap | Where it hurts |
|-----|---------------|
| **Single brand context** | `BrandContext` holds one brand at a time. You can't switch between projects without manually re-entering everything in Setup. |
| **One image at a time** | `SocialMedia.tsx` fires a single `POST /api/media/image` per click. No batch queue, no prompt variants. |
| **No content planning** | There's no concept of a "media plan" — a structured list of what assets a project needs (hero images, social posts, videos, voiceovers). You're improvising every session. |
| **No relevance scoring** | Generated media goes straight to the Library with no rating, no tagging, no way to surface what's actually good for a specific purpose. |
| **No research → media pipeline** | Research results in `Research.tsx` aren't connected to the media tools. You research a topic, then manually retype insights as image prompts. |
| **No presentation export** | Media lives in the Library grid. There's no way to curate a subset, arrange it, and export or present it. |
| **Flat Library** | `Library.tsx` is a single chronological feed. No folders, no project grouping, no tags, no search. |

---

## Upgrade Tracks

### Track G — Multi-Project / Brand Profiles

> **One Gemlink instance, many projects.** Switch context in two clicks.

#### G1. Project Profiles System
- **Priority**: P0 (everything else depends on this)
- **What**: Replace the single `BrandContext` with a `ProjectContext` that manages a list of project profiles. Each profile stores:
  ```ts
  interface ProjectProfile {
    id: string;              // e.g. "proj_abc123"
    name: string;            // "SaaS Launch Campaign"
    brandName: string;
    brandDescription: string;
    targetAudience: string;
    brandVoice: string;
    colorPalette?: string[];
    styleKeywords?: string[];  // "minimalist", "bold", "corporate", etc.
    referenceImages?: string[];
    createdAt: string;
    updatedAt: string;
  }
  ```
- **UI**: A project switcher dropdown in the sidebar/header. "New Project" modal from Dashboard. Setup page becomes a per-project editor.
- **Storage**: `localStorage` initially (array of profiles), migrate to server-side JSON or SQLite later (aligns with A5 decision).
- **Files**: `src/context/ProjectContext.tsx` (new), `src/pages/Setup.tsx`, `src/components/Layout.tsx`

#### G2. Project-Scoped Media
- **Priority**: P1
- **What**: Every media job gets a `projectId` field in its manifest. Library can filter by project. Media history endpoint accepts `?projectId=...` filter.
- **Files**: `server.ts` (manifest shape, history endpoint), `src/pages/Library.tsx`, `src/pages/SocialMedia.tsx`, `src/pages/VideoLab.tsx`, `src/pages/VoiceLab.tsx`
- **Dependencies**: G1

---

### Track H — Bulk Media Generation Engine

> **Stop generating one asset at a time. Plan a batch, fire it, and review results.**

#### H1. Media Plan Builder (new page: `/plan`)
- **Priority**: P0
- **What**: A new page where you define a **media plan** — a structured list of assets your project needs. Each plan item specifies:
  ```ts
  interface MediaPlanItem {
    id: string;
    type: "image" | "video" | "voice";
    label: string;           // "Hero banner for landing page"
    purpose: string;         // "Website hero", "Instagram post", "Pitch deck slide 3"
    promptTemplate: string;  // The actual generation prompt
    model?: string;
    size?: string;
    aspectRatio?: string;
    status: "draft" | "queued" | "generating" | "review" | "approved" | "rejected";
    generatedJobIds: string[];  // links to actual media jobs
    rating?: number;           // 1-5 after review
    tags?: string[];
  }
  ```
- **UI flow**:
  1. You describe the project goal in natural language (e.g. "I'm launching a SaaS product for remote teams, I need assets for the website, social media, and an investor pitch deck")
  2. Gemini generates a suggested media plan (via `/api/media/plan/suggest`)
  3. You review, edit, reorder, add/remove items
  4. Hit "Generate All" to batch-submit everything
- **Why this matters**: This is the core of "generating lots of relevant media at once." Instead of typing prompts individually, you plan first, then execute in bulk.
- **Files**: `src/pages/MediaPlan.tsx` (new), `server.ts` (new endpoints), `src/App.tsx`

#### H2. Batch Generation Queue
- **Priority**: P0
- **What**: Server-side job queue that processes multiple generation requests concurrently (with configurable concurrency to stay within API rate limits).
  - `POST /api/media/batch` — accepts an array of generation requests, returns an array of job IDs
  - A queue runner in `server.ts` that processes N jobs at a time (start with 3 concurrent)
  - Progress tracking via existing job/manifest system — the client polls batch status
- **Why**: Without this, "Generate All" from the Media Plan would fire dozens of requests simultaneously and hit rate limits. The queue manages throughput.
- **Files**: `server.ts` (batch endpoint, queue runner), `src/pages/MediaPlan.tsx`
- **Dependencies**: H1

#### H3. AI-Powered Prompt Expansion
- **Priority**: P1
- **What**: Before sending to generation, each prompt template gets "expanded" by Gemini to be more specific and effective. The expansion uses:
  - **Brand context** (name, description, audience, voice, style keywords from G1)
  - **Purpose context** (what the media is for — social post vs. pitch deck vs. website)
  - **Platform-aware formatting** (Instagram square, Twitter landscape, YouTube thumbnail dimensions)
  - **Style consistency** (reference previous approved media for the project to maintain visual coherence)
- **Endpoint**: `POST /api/media/prompt/expand`
  ```json
  {
    "basePrompt": "team collaboration workspace",
    "purpose": "Instagram carousel slide 2",
    "projectId": "proj_abc",
    "styleReference": "approved" // use approved media from this project as style ref
  }
  ```
  Returns an expanded, platform-optimized prompt ready for generation.
- **Files**: `server.ts`, `src/pages/MediaPlan.tsx`
- **Dependencies**: G1 (project context), H1 (plan items have purpose)

#### H4. Prompt Variant Generation
- **Priority**: P2
- **What**: For any single plan item, generate 3-5 prompt variants so you get stylistic options. E.g., for "hero banner," generate: one photorealistic, one illustrated, one abstract, one typographic, one gradient-based. User picks the best.
- **Endpoint**: `POST /api/media/prompt/variants` → returns an array of expanded prompt options
- **Files**: `server.ts`, `src/pages/MediaPlan.tsx`
- **Dependencies**: H3

---

### Track I — Research-Driven Relevance & Ranking

> **Use research to make generated media actually relevant. Then score and surface the best.**

#### I1. Research → Media Pipeline
- **Priority**: P1
- **What**: Connect the R&D Lab to the Media Plan. After researching a topic (competitor analysis, trend research, audience insights), you can "Send to Media Plan" to turn research findings into media prompts.
  - New button on `Research.tsx` results: **"Create media from this"**
  - Opens a modal that shows AI-suggested media plan items derived from the research (e.g., research on "competitor visual branding" → suggested items: "Counter-positioning hero image", "Comparison infographic prompt", "Social proof testimonial card")
  - Items get added to the active project's media plan
- **Files**: `src/pages/Research.tsx`, `src/pages/MediaPlan.tsx`, `server.ts` (new endpoint)
- **Dependencies**: H1, G1

#### I2. Boardroom → Media Brief Pipeline
- **Priority**: P2
- **What**: After a Boardroom strategy session, extract actionable media briefs from the final synthesis. The convergence phase often produces asset suggestions — surface those as media plan items.
  - "Extract Media Briefs" button on completed boardroom sessions
  - AI parses the session output and suggests media plan items
- **Files**: `src/pages/Boardroom.tsx`, `server.ts`
- **Dependencies**: H1

#### I3. AI Media Scoring & Ranking
- **Priority**: P1
- **What**: After media is generated, automatically score each asset for quality and relevance. Scoring criteria:
  - **Brand alignment** (does it match the brand voice/style?)
  - **Purpose fit** (does it work for the stated purpose — e.g., "pitch deck" vs. "social post"?)
  - **Technical quality** (composition, clarity, visual appeal — scored by Gemini vision)
  - **Audience match** (would the target audience respond to this?)
- **Endpoint**: `POST /api/media/score` — accepts a job ID + project context, returns scores:
  ```json
  {
    "overall": 4.2,
    "brandAlignment": 4,
    "purposeFit": 5,
    "technicalQuality": 3,
    "audienceMatch": 5,
    "reasoning": "Strong brand match but composition could be tighter..."
  }
  ```
- **Auto-scoring**: After a batch completes, automatically score all generated items and surface the top-ranked ones first.
- **Files**: `server.ts`, `src/pages/Library.tsx`, `src/pages/MediaPlan.tsx`
- **Dependencies**: G1 (needs project context for scoring)

#### I4. Tag & Organize System
- **Priority**: P2
- **What**: AI-generated tags for every media asset (auto-tagged on creation), plus manual tags. Tags include:
  - Content type: `hero`, `social`, `thumbnail`, `icon`, `background`
  - Style: `minimal`, `bold`, `corporate`, `playful`
  - Platform: `instagram`, `twitter`, `linkedin`, `website`, `pitch-deck`
  - Custom user tags
- **Library upgrades**: Filter by tag, search by tag, group by tag. Tag cloud view.
- **Files**: `server.ts` (auto-tagging on creation), `src/pages/Library.tsx`

---

### Track J — Presentation & Export

> **Curate the good stuff and get it out of Gemlink.**

#### J1. Collections / Boards
- **Priority**: P1
- **What**: Create named collections (e.g., "Website Launch Assets", "Investor Deck Media", "Social Campaign Q2"). Drag media from the Library or Media Plan results into a collection. Reorder within collections.
- **UI**: Board view with cards, drag-and-drop ordering. Accessible from Library sidebar.
- **Files**: `src/pages/Collections.tsx` (new), `src/components/CollectionSidebar.tsx` (new)

#### J2. Presentation Preview
- **Priority**: P2
- **What**: A "Present" mode for any collection that shows assets full-screen in sequence — like a lightweight slideshow. Keyboard navigation (← →), titles on each slide, dark background. Useful for presenting to clients or team.
- **Files**: `src/pages/Present.tsx` (new)
- **Dependencies**: J1

#### J3. Bulk Export
- **Priority**: P2
- **What**: Download a collection as a ZIP (server-side zip creation). Options:
  - All media at original resolution
  - Resized for specific platform (Instagram square, Twitter banner, etc.)
  - With a manifest.txt listing all prompts/metadata
- **Endpoint**: `POST /api/collections/:id/export` → returns a ZIP download
- **Files**: `server.ts`, `src/pages/Collections.tsx`
- **Dependencies**: J1

---

## Recommended Implementation Sequence

### Phase 1 — Foundation (do first)
| Item | Why first |
|------|----------|
| **G1** (Project Profiles) | Everything is scoped to a project. Multi-project is the foundation. |
| **H1** (Media Plan Builder) | Core workflow change. Without plans, you can't batch. |
| **H2** (Batch Queue) | Enables the "generate all" button from H1. |

### Phase 2 — Quality & Intelligence
| Item | Why now |
|------|--------|
| **G2** (Project-Scoped Media) | Makes the Library useful once you have multiple projects. |
| **H3** (Prompt Expansion) | Makes batch generation produce better results. |
| **I3** (AI Scoring) | Surfaces the best media after a bulk run. |
| **I1** (Research → Media) | Connects existing research capability to the new media workflow. |

### Phase 3 — Polish & Output
| Item | Why last |
|------|---------|
| **H4** (Prompt Variants) | Nice-to-have on top of expansion. |
| **I2** (Boardroom → Media) | Nice-to-have once the pipeline exists. |
| **I4** (Tags & Organization) | Polish for the Library. |
| **J1** (Collections) | Need enough media to curate first. |
| **J2** (Presentation) | Depends on J1. |
| **J3** (Bulk Export) | Depends on J1. |

---

## Quick Wins (things that can be done today without new features)

These are small changes to existing code that immediately improve the bulk workflow:

1. **Multi-image generation**: Modify `SocialMedia.tsx` to accept a count (1-4) and loop the generation call. Gemini can return multiple images per call with different seeds — just add `numberOfImages` to the config.

2. **Generation presets**: Add a "Presets" dropdown to SocialMedia and VideoLab with common configurations:
   - Social: `Instagram Post (1:1)`, `Story (9:16)`, `Twitter Banner (16:9)`, `LinkedIn (1.91:1)`
   - Video: `YouTube Intro (16:9 1080p)`, `Instagram Reel (9:16 1080p)`, `TikTok (9:16 720p)`

3. **Library search**: Add a text filter to `Library.tsx` that searches prompts. This is a client-side filter on the existing data — no backend changes.

4. **"Regenerate" button**: On any Library card, a button that re-submits the same prompt. Instant re-roll without retyping.

5. **Copy prompt**: On any Library card, copy the prompt to clipboard. Useful for iterating.

---

## Techniques & Patterns Reference

> Research-backed techniques to make the bulk generation workflow actually produce good, relevant results — not just volume.

### 1. Structured Prompt Engineering at Scale

The biggest risk with bulk generation is garbage prompts producing garbage media. These techniques prevent that:

#### Prompt Templates with Slot Filling
Instead of freeform prompts, use **structured templates** with fillable slots. Each template is purpose-specific:

```
Template: "social_instagram_post"
Base: "Create a {style} social media image for Instagram (1080x1080).
       Brand: {brandName}. Audience: {targetAudience}.
       Visual style: {brandVoice}, {styleKeywords}.
       Subject: {userSubject}.
       Negative: no text overlays, no watermarks, no borders."
```

The system fills `{brandName}`, `{targetAudience}`, etc. from the project profile (G1), and the user only provides `{userSubject}`. This keeps every prompt brand-aligned without manual effort.

**Where in Gemlink**: The prompt expansion endpoint (H3) should maintain a library of these templates per media type + platform combination.

#### Prompt Chaining (Multi-Step Refinement)
Don't send the user's raw prompt directly to image generation. Use a **3-step chain**:

1. **Expand**: LLM takes the user prompt + brand context → produces a detailed, specific image prompt
2. **Refine**: LLM reviews the expanded prompt for brand alignment, adds style-specific details (lighting, composition, color palette from project profile)
3. **Generate**: The refined prompt goes to image generation

Each step's output feeds the next. This is more reliable than a single mega-prompt because each step has a focused job.

**Implementation**: Chain via sequential Gemini calls in the `/api/media/prompt/expand` endpoint. Cache intermediate results so users can inspect and edit the chain.

#### Negative Prompts
Always append **negative prompt guidance** to prevent common failure modes:
- `"No extra fingers, no distorted faces, no blurry text"`
- `"No watermarks, no stock photo overlays"`
- `"No generic clipart, no cartoonish elements"` (unless brand style is cartoonish)

Build a negative prompt library that adapts to the brand style (e.g., a playful brand might allow cartoon elements).

#### Few-Shot Style Anchoring
When a project has **approved media** (items rated 4-5 stars), use those as style references in subsequent prompts:
- Pass approved images as context to Gemini's vision model
- Ask it to describe the visual style (palette, composition, mood)
- Inject that style description into new generation prompts

This creates visual consistency across a project's media without manual style guides.

---

### 2. LLM-as-Judge Media Scoring

The technique of using an LLM to evaluate other AI outputs is called **"LLM-as-Judge"** (or **"MLLM-as-Judge"** for multimodal). Here's how to implement it well:

#### Multi-Criteria Rubric Scoring
Don't ask the LLM for a single "quality" score. Use a **rubric with specific dimensions** — each scored independently:

| Dimension | What it evaluates | Score range |
|-----------|------------------|-------------|
| **Brand Alignment** | Does the visual match the brand's stated voice, colors, and style? | 1-5 |
| **Purpose Fit** | Would this work for its stated purpose (e.g., hero banner vs. thumbnail)? | 1-5 |
| **Technical Quality** | Composition, clarity, absence of artifacts, visual appeal | 1-5 |
| **Audience Match** | Would the target audience respond positively? | 1-5 |
| **Uniqueness** | Is this distinctive, or could it be any brand's stock image? | 1-5 |

The scoring prompt should include the project profile, the media's stated purpose, and the image itself (via Gemini vision).

#### Structured Output for Scoring
Use Gemini's structured output / JSON mode to get reliable, parseable scores:

```json
{
  "scores": {
    "brandAlignment": 4,
    "purposeFit": 5,
    "technicalQuality": 3,
    "audienceMatch": 4,
    "uniqueness": 2
  },
  "overall": 3.6,
  "reasoning": "Strong brand colors but composition is centered/generic. The flat layout works for Instagram but wouldn't stand out in a feed. Consider adding depth or an unexpected angle.",
  "suggestions": ["Try an off-center composition", "Add subtle brand gradient overlay"]
}
```

#### Calibration with Human Feedback
LLM-as-Judge scores drift without anchoring. When the user manually approves/rejects media:
- Log the LLM's score alongside the human decision
- Over time, this creates calibration data: "LLM scored this 4.2 but user rejected it"
- Use this to adjust scoring prompts and thresholds per project

#### Comparative Ranking (Pairwise)
For choosing the best from a batch, **pairwise comparison** is more reliable than absolute scoring:
- Show the LLM two images side-by-side
- Ask "Which better serves as a [stated purpose] for [brand]?"
- Use tournament-style brackets to rank a batch efficiently
- 12 images need only ~15-20 comparisons vs. 12 independent scores

---

### 3. Content Pillars & Media Planning

Professional content planning uses **content pillars** — 3-5 core themes that all brand content maps to. This technique directly improves media relevance:

#### Pillar-Based Media Plans
During project setup (G1), the user defines 3-5 content pillars:
```
Project: "SaaS Launch"
Pillars:
  1. Product Features    — demos, screenshots, feature highlights
  2. Team & Culture      — behind-the-scenes, founder stories
  3. Customer Success    — testimonials, case studies, results
  4. Industry Thought    — trend analysis, educational content
  5. Community           — user-generated, events, partnerships
```

When the Media Plan Builder (H1) suggests items, each maps to a pillar. This ensures media diversity and prevents over-indexing on one topic.

#### Platform-Aware Specifications
Each media plan item should carry platform-specific requirements as structured metadata:

| Platform | Aspect Ratio | Ideal Res | Style Notes |
|----------|-------------|-----------|-------------|
| Instagram Feed | 1:1 or 4:5 | 1080×1080 / 1080×1350 | Bold, scroll-stopping, minimal text |
| Instagram Story/Reel | 9:16 | 1080×1920 | Dynamic, full-bleed, high contrast |
| Twitter/X | 16:9 | 1200×675 | Clean, readable, can include data |
| LinkedIn | 1.91:1 | 1200×628 | Professional, can be text-heavy |
| YouTube Thumbnail | 16:9 | 1280×720 | Faces, bold text, bright colors |
| Pitch Deck | 16:9 | 1920×1080 | Clean backgrounds, minimal, on-brand |
| Website Hero | ~21:9 | 1920×600-900 | Ambient, supports text overlay |

The prompt expansion step (H3) automatically adjusts style guidance based on the target platform.

#### Batch Cadence Planning
For recurring content (social media calendars), plan in **time blocks**:
- Generate a week of content in one batch (7 posts × 3 variants = 21 images)
- Score and rank, approve the top picks
- Schedule approved content across the week
- This lets you front-load content creation and maintain consistency

---

### 4. Batch Processing Architecture

Research-backed patterns for running bulk generation reliably:

#### Concurrency Control with Backpressure
Don't use a simple `Promise.all()` — use a **semaphore pattern**:
```ts
class GenerationQueue {
  private running = 0;
  private queue: GenerationJob[] = [];
  private readonly maxConcurrent: Record<MediaType, number> = {
    image: 3,    // Images are fast, can run 3 in parallel
    video: 1,    // Videos are slow + expensive, serialize
    voice: 2,    // TTS is moderate
  };
}
```

If a job fails with a rate limit error (429), implement **exponential backoff** — wait 2s, 4s, 8s before retry, up to 3 retries.

#### Progress Granularity
For a batch of 12 items, the client needs to know more than "3/12 done":
- Per-item status: `queued → generating → scoring → done`
- Batch-level stats: `{ total: 12, queued: 5, generating: 3, scoring: 2, done: 2 }`
- Estimated time remaining (based on average duration of completed items)

#### Idempotent Retries
If a job fails mid-batch, the user should be able to "Retry Failed" without re-running successful items. Each plan item tracks its own status independently.

---

### 5. Research-to-Media Intelligence Pipeline

The most powerful technique here: **using research output to inform media generation**, not just as inspiration, but as structured input.

#### Entity Extraction from Research
When research results come back from the R&D Lab:
1. Extract **key entities**: competitors, trends, audience pain points, market opportunities
2. Map entities to **media opportunities**: "Competitor X uses blue-heavy branding" → "Counter-position with warm tones"
3. Generate **contextual prompts**: "Create a hero image that positions {brand} as the warmer, more approachable alternative to enterprise tools like {competitor}"

#### Trend-Responsive Generation
Connect Gemini's grounded search to media planning:
- Research "visual design trends 2026 for SaaS" → get specific trends
- Auto-generate plan items that incorporate trending styles
- This keeps media fresh and aligned with what audiences are actually seeing

#### Boardroom Session Mining
The Boardroom's 5-phase protocol already produces structured output (opening brief → first-pass → challenge → refinement → convergence). The convergence phase often contains actionable recommendations. Parse these programmatically:
- Extract sentences containing words like "visual," "image," "video," "content," "asset"
- Present them as suggested media plan items
- The user approves/edits before generation

---

### 6. Presentation & Export Techniques

#### Narrative Ordering
Collections shouldn't just be random piles of approved media. Use AI to suggest **narrative ordering**:
- "For a pitch deck, start with the problem (dark/dramatic), then solution (bright/hopeful), then social proof (real/human), then CTA (bold/action)"
- The AI can reorder a collection based on its understanding of storytelling arcs

#### Context-Aware Export
When exporting, include a **media manifest** that's useful beyond just filenames:
```
media_manifest.json
{
  "project": "SaaS Launch Campaign",
  "exported": "2026-03-14",
  "items": [
    {
      "filename": "hero_banner_01.png",
      "purpose": "Website hero section",
      "platform": "website",
      "prompt": "...",
      "score": 4.6,
      "pillar": "Product Features",
      "dimensions": "1920x800"
    }
  ]
}
```

This manifest lets designers and team members understand what each asset is for without guessing.

---

## Architecture Notes

### Concurrency & Rate Limits
The batch queue (H2) needs to respect Gemini API rate limits:
- Image generation: likely 10-15 RPM depending on model
- Video generation: much slower (minutes per video)
- Start with 3 concurrent image jobs, 1 concurrent video job
- Use a simple in-memory queue (array + setInterval processor). Upgrade to a proper queue (BullMQ) only if needed.

### Storage Scaling
Currently everything is flat files in `jobs/`. This works fine up to ~500 media jobs. For bulk workflows generating 50+ assets per session:
- Consider the SQLite option (A5) for manifest metadata — it's already installed
- Keep binary files (images, videos, audio) on disk
- Index by project, tags, rating in SQLite for fast queries

### Project Data Shape
Projects should be stored server-side (not just localStorage) once G1 is implemented. A simple `projects.json` in `jobs/` works initially, mirroring the boardroom session pattern.

---

## How This Changes the Daily Workflow

**Before (current):**
1. Open Gemlink
2. Go to Setup, configure brand (if not already saved)
3. Go to Social Media, think of a prompt, generate one image
4. Go back, think of another prompt, generate another image
5. Go to Library, scroll through everything chronologically
6. Manually save/download what you like

**After (with upgrades):**
1. Open Gemlink, select project from sidebar (or create new one)
2. Go to **Media Plan**, describe what you need: "I need assets for a product launch — website hero, 5 social posts, 2 video intros, pitch deck backgrounds"
3. AI generates a 12-item media plan with platform-optimized prompts
4. Review the plan, tweak any prompts, hit **"Generate All"**
5. Batch queue processes everything (progress bar shows 0/12 → 12/12)
6. AI auto-scores and ranks results
7. Review top-ranked media, approve the best, reject/regenerate the rest
8. Add approved items to a **"Product Launch" collection**
9. Hit **Present** to walk through it, or **Export** for a ZIP

That's "lots of relevant and useful media, all at once."

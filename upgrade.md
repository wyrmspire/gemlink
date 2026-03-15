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

### Track K — Intelligent Media Planning Pipeline

> **The media plan shouldn't be a single AI call that dumps a flat list. It should be a multi-stage deliberation process with research, grading, approval, and full generation control.**

This track replaces the simple H1 "describe → suggest → generate" flow with a strategic planning system.

#### K1. Multi-Stage Plan Generation (Boardroom-Style Deliberation)

The current `POST /api/media/plan/suggest` is one Gemini call that returns a flat list. That's a convenience shortcut, not a strategic tool. The planning process should mirror the Boardroom's 5-phase protocol — because generating a media plan IS a strategy session.

**How "Generate Media Plan" should actually work:**

When the user clicks "Generate Plan," the system should spin up an **internal boardroom-like deliberation** behind the scenes — a multi-stage pipeline where each stage's output feeds the next and gets graded before proceeding:

**Stage 1 — Research & Context Gathering**
Before suggesting any media, the planner gathers intelligence:
- Pull brand context from the active project (name, audience, voice, style keywords)
- If the user has done R&D Lab research, pull recent research results for the project
- If there are completed boardroom sessions, pull convergence summaries
- Query the Style & Psychology Database (K3) for audience-appropriate visual approaches
- Optionally run a quick grounded web search for "visual trends in [industry] 2026"

Output: A **context brief** — a structured summary of everything the planner knows.

**Stage 2 — Outline Generation**
With the context brief, generate a **strategic outline** (not prompts yet):
- Content pillar breakdown (what themes should the media cover?)
- Platform distribution (how many assets per platform?)
- Style direction (which visual archetypes fit this audience?)
- Rationale for each choice (WHY this asset for this audience on this platform)

Example outline:
```
Outline: "SaaS Launch — Remote Teams"
├── Pillar: Product (40% of assets)
│   ├── 2× Hero images — clean minimalist, trust-building
│   ├── 1× Explainer video — screen-demo style
│   └── 1× Feature highlight carousel (4 slides)
├── Pillar: Social Proof (30%)
│   ├── 2× Testimonial cards — warm, human, portrait-oriented
│   └── 1× Case study visual — data-forward, dashboard aesthetic
├── Pillar: Culture (20%)
│   ├── 1× Team photo — candid, natural light
│   └── 1× Behind-the-scenes reel — 9:16
└── Pillar: Thought Leadership (10%)
    └── 1× Industry trend infographic — bold, data-heavy
Style direction: "Neubrutalism meets corporate warm" — bold shapes,
warm palette (not cold blue), high contrast, human-centric
Rationale: Target audience is SMB remote teams → they're tired of
generic "woman-pointing-at-laptop" stock. Counter-position with
authentic, slightly edgy, design-forward visuals.
```

**Stage 3 — Grade the Outline**
Run the outline through a **critic pass** (separate Gemini call acting as a reviewer):
- Completeness: "Missing any key platforms? Any audience needs unaddressed?"
- Differentiation: "Would this look different from competitor visual territory?"
- Balance: "Is the pillar distribution appropriate for the stated goal?"
- Feasibility: "Can these be generated well with AI image models?"
- Score: 1-5 per dimension + overall + specific improvement suggestions

If the outline scores below a threshold (e.g., 3.5/5), automatically refine and re-grade before presenting to the user.

**Stage 4 — Generate Prompt Suggestions**
Only now generate actual prompts — informed by the full context chain:
- Each prompt carries the style direction from Stage 2
- Each prompt references the psychology/audience reasoning
- Each prompt has platform-specific technical specs already applied
- Negative prompts are auto-appended based on style archetype

**Stage 5 — Grade the Suggestions**
Before the user sees them, each prompt gets evaluated:
- "Is this prompt specific enough to produce a distinctive result?"
- "Does this prompt match the style direction we chose?"
- "Will this serve its stated purpose (hero, social, pitch deck)?"
- Rank all suggestions. Flag weak ones with improvement notes.
- Present to user with scores visible: "Prompt quality: 4.2/5 — ⚠️ could be more specific about composition"

**Stage 6 — User Approval**
The user sees the graded plan + graded prompts. They can:
- Approve the plan as-is
- Edit individual items (prompts, config, purpose)
- Reject and re-generate with feedback ("make it more playful" / "add more video")
- Approve some items, reject others, ask for replacements

Only approved items proceed to generation.

**Implementation note**: This is conceptually a boardroom session, but specialized — the "seats" are: Strategist (outline), Critic (grading), Prompt Engineer (suggestions), Quality Reviewer (final grade). The UI should show the deliberation progress: "Researching... → Outlining... → Grading outline... → Writing prompts... → Grading prompts... → Ready for review."

---

#### K2. Per-Item Generation Config & Batch Config Editing

The current MediaPlanItem has `model`, `size`, `aspectRatio` as optional fields, but there's no UI to edit them per item, and no way to change config across multiple items at once.

**Per-Item Config Panel:**
Each plan item should be expandable to reveal its full generation config:

```ts
interface MediaPlanItem {
  // ... existing fields ...
  
  // Generation config (editable per-item)
  generationConfig: {
    model: string;           // "gemini-3.1-flash-image-preview" | "gemini-3-pro-image-preview"
    size: string;            // "512px" | "1K" | "2K" | "4K"
    aspectRatio: string;     // "1:1" | "4:5" | "9:16" | "16:9" | "1.91:1" | "21:9"
    resolution?: string;     // for video: "720p" | "1080p"
    count: number;           // how many variants to generate (1-4)
    negativePrompt?: string; // custom negative prompt override
    stylePreset?: string;    // reference to style database entry
  };
}
```

The UI for each item shows a collapsible "⚙️ Generation Settings" panel with dropdowns/inputs for model, size, aspect ratio, count, etc.

**Batch Config Editing:**
Select multiple items → apply changes to all at once. Use cases:

- "Make all items 9:16" — select all, change aspect ratio
- "Set everything to 4K" — select all, change size
- "Generate 3 variants for each" — select all, set count to 3
- "Append to all prompts: natural lighting, no artificial look" — batch prompt suffix
- "Prepend brand context to all prompts" — batch prompt prefix
- "Change all image items to Pro model" — batch model switch

UI pattern: A toolbar above the plan items with:
- Checkbox per item (+ "Select All")
- When ≥1 selected, batch action bar appears: `[Set Aspect Ratio ▾] [Set Size ▾] [Set Model ▾] [Set Count ▾] [Edit Prompts...] [Delete Selected]`
- "Edit Prompts..." opens a modal with options: Append text, Prepend text, Find & Replace, Apply style preset

**Batch prompt transformations:**
```
Transformation options:
├── Append: add text to the end of every selected prompt
├── Prepend: add text to the beginning
├── Find & Replace: "corporate" → "playful" across all prompts
├── Apply Style Preset: inject style database entry into all prompts
├── Regenerate All Prompts: re-run prompt expansion (H3) on all selected items
│   with current brand context (useful if brand context changed)
└── Simplify / Expand: ask AI to make all prompts shorter or more detailed
```

---

#### K3. Style & Psychology Reference Database

A curated, structured knowledge base that the planning pipeline (K1) consults when generating outlines and prompts. This is what makes the media plan *intelligent* rather than generic.

**Visual Psychology Principles:**
```json
{
  "color_psychology": {
    "blue": { "evokes": "trust, stability, professionalism", "best_for": "B2B, finance, healthcare", "avoid_for": "food, energy brands" },
    "orange": { "evokes": "energy, creativity, warmth", "best_for": "startups, youth audiences, food", "avoid_for": "luxury, medical" },
    "black": { "evokes": "luxury, power, exclusivity", "best_for": "premium brands, fashion, tech", "avoid_for": "children, wellness" },
    ...
  },
  "composition_psychology": {
    "rule_of_thirds": { "effect": "natural, professional", "when": "most general-purpose imagery" },
    "centered_symmetry": { "effect": "authority, power, formal", "when": "luxury, institutional branding" },
    "diagonal_lines": { "effect": "dynamic, energetic, movement", "when": "sports, startups, action" },
    "negative_space": { "effect": "premium, breathing room, clarity", "when": "minimalist brands, text-overlay-needed" },
    ...
  },
  "cognitive_load": {
    "low_entropy": { "when": "hero images, pitch decks (need text space)", "style": "clean, minimal elements" },
    "high_entropy": { "when": "Instagram feed (stop the scroll)", "style": "detailed, contrasted, busy-but-purposeful" }
  }
}
```

**Audience Archetype → Style Mapping:**
```json
{
  "enterprise_decision_maker": {
    "visual_style": ["corporate minimalism", "data visualization", "clean photography"],
    "color_tendency": ["navy", "slate", "white", "subtle gold accent"],
    "typography": "serif or geometric sans-serif, large, authoritative",
    "avoid": ["cartoon", "stock-photo-generic", "neon", "hand-drawn"],
    "psychology_note": "Values credibility over creativity. Data > emotion. Needs to justify purchase to a committee."
  },
  "gen_z_consumer": {
    "visual_style": ["neubrutalism", "y2k", "raw/authentic", "meme-adjacent"],
    "color_tendency": ["high contrast", "unexpected combos", "lime/violet/orange"],
    "typography": "variable weight, mixed case, sometimes intentionally 'ugly'",
    "avoid": ["corporate", "polished", "stock photography", "traditional layouts"],
    "psychology_note": "Detects and rejects inauthenticity instantly. Prefers raw over polished. Humor > authority."
  },
  "smb_founder": {
    "visual_style": ["clean modern", "approachable pro", "warm tech"],
    "color_tendency": ["warm neutrals", "green/teal accents", "avoiding corporate blue"],
    "typography": "friendly sans-serif (Inter, Outfit), medium weight",
    "avoid": ["enterprise-heavy", "overly playful", "generic startup gradient"],
    "psychology_note": "Time-poor, ROI-focused. Needs to look professional without being intimidating. Authenticity matters."
  }
}
```

**Named Style Archetypes:**
```json
{
  "corporate_minimalism": {
    "description": "Clean white/gray space, single subject focus, geometric shapes, muted palette",
    "works_for": ["enterprise B2B", "SaaS", "consulting"],
    "prompt_keywords": "clean, minimal, white space, professional, geometric, muted colors, studio lighting",
    "negative_keywords": "cluttered, busy, cartoonish, neon, hand-drawn"
  },
  "neubrutalism": {
    "description": "Bold outlines, raw shapes, high contrast, intentionally 'unfinished', thick black borders",
    "works_for": ["startups", "creative agencies", "Gen Z brands"],
    "prompt_keywords": "bold outlines, thick black borders, raw, unfinished, high contrast, flat color blocks",
    "negative_keywords": "gradient, smooth, polished, corporate, subtle"
  },
  "warm_tech": {
    "description": "Technology meets humanity — warm lighting, natural tones, real people using tech, not cold/sterile",
    "works_for": ["SMB SaaS", "HR tech", "collaboration tools", "health tech"],
    "prompt_keywords": "warm lighting, natural tones, real people, human-centric, cozy workspace, golden hour",
    "negative_keywords": "cold blue, sterile, dark, futuristic, robotic, cyber"
  }
}
```

**Storage**: These live as JSON files in `data/style-db/` or embedded in `server.ts`. They're injected into the planning pipeline (K1 Stage 1) as context. They're also browsable from the Media Plan UI — a "Style Guide" panel where you can explore archetypes and pin one to your project.

**Future**: Let users add their own styles — "I like what Apple does" → describe it → save as a custom archetype. Or upload reference images and let Gemini describe the style, which gets saved as a new entry.

---

#### K4. Multi-Plan Support

The Media Plan page should hold **multiple plans per project**, not just one. Plans are strategic documents — you might have:

- "Q1 Social Campaign" — 20 items, Instagram + Twitter focused
- "Investor Pitch Deck" — 8 items, all 16:9 presentation backgrounds
- "Website Redesign Assets" — 12 items, hero, features, about page
- "Competition Counter-Campaign" — 6 items, generated from research findings

**UI changes:**
- Sidebar (or tabs) listing all plans for the active project
- "New Plan" button starts the K1 deliberation pipeline
- Plans can be archived, duplicated, or deleted
- Each plan shows: name, item count, status summary (3 draft, 5 approved, 2 generating), creation date
- Plans persist to the SQLite `media_plans` table (schema already exists from Sprint 1)

**Plan status lifecycle:**
```
drafting → outlined → graded → prompts_ready → partially_approved → generating → completed
```

A plan isn't just a static list — it's a living document that tracks which items have been approved, which are generating, and which are done.

---

#### K5. Plan → Boardroom Handoff (and Vice Versa)

**"Generate Plan in Boardroom" should spin up a real deliberation.**

When a user clicks "Generate Plan" from the Media Plan page, the system should:
1. Create a **specialized boardroom session** (using the Media Strategy template from I2)
2. The boardroom seats are configured as: **Brand Strategist**, **Audience Psychologist**, **Visual Director**, **Production Manager**
3. The session runs the 5-phase protocol with a media-specific objective
4. The convergence output is structured as a media plan outline
5. The outline comes back to the Media Plan page for K1 Stage 3+ (grading, prompts, approval)

This is NOT just "extract mentions of media from a normal boardroom session." It's a **purpose-built session** where the entire boardroom is focused on building the media plan.

**Approval gate**: After the boardroom finishes, the user reviews the recommended plan. They can:
- Approve → proceed to prompt generation
- Edit → modify items before proceeding
- Reject → send feedback back, re-run with adjusted parameters
- The plan should NOT auto-generate media — it requires explicit user approval after each stage

**Vice versa**: From a regular boardroom session, "Extract Media Briefs" (I2) creates a *draft plan* that gets sent to the Media Plan page. The user can then run it through the K1 pipeline for grading and prompt generation.

---

#### K6. Generation Preview & Dry Run

Before hitting "Generate All" on an approved plan, the user should see a **generation preview** showing exactly what will happen:

```
Generation Preview — "Q1 Social Campaign"
─────────────────────────────────────────
12 items approved for generation

Resource estimate:
  • 8 images (gemini-3.1-flash, 1K) → ~40 sec total
  • 2 videos (veo-3.1-fast, 1080p 16:9) → ~8 min total
  • 2 voice clips (gemini-2.5-flash-tts) → ~10 sec total
  • Estimated total: ~9 min
  • Estimated API cost: ≈ 12 generation calls

Settings overview:
  • 6 items at 1:1 (Instagram)
  • 4 items at 16:9 (YouTube/Pitch)
  • 2 items at 9:16 (Stories/Reels)
  • 3 items generating 2 variants each (6 extra generations)

[Edit Settings] [Start Generation] [Cancel]
```

This preview prevents surprises — you see exactly how many API calls, what settings, and how long it'll take before committing.

---

### Track L — Strategy Artifacts & Referenceable Intelligence

> **Every boardroom session, research result, scoring analysis, and strategy description you feed the system should become a persistent, referenceable artifact that influences everything else. The compute shouldn't be throwaway.**

The core problem: right now, when you run a boardroom session, the output sits in a flat file under `jobs/boardroom/`. When you do research, it renders on screen and vanishes. When media gets scored, the score sits in a manifest. None of this accumulated intelligence is **referenceable** from other parts of the app. You can't say "use that boardroom insight about neubrutalism for Gen Z in my media plan prompts" — you'd have to copy-paste it manually.

Track L makes all of this connectable.

---

#### L1. Strategy Artifacts Data Model

A **Strategy Artifact** is a structured piece of intelligence that the system can reference. Types:

```ts
interface StrategyArtifact {
  id: string;                 // "art_abc123"
  projectId: string;          // linked to active project
  type: ArtifactType;
  title: string;              // "Gen Z Neubrutalism — from TikTok analysis"
  summary: string;            // 2-3 sentence AI-generated summary
  content: string;            // full text content (markdown)
  tags: string[];             // auto-generated semantic tags
  source: ArtifactSource;     // where it came from
  pinned: boolean;            // if pinned, automatically injected into generation context
  createdAt: string;
  updatedAt: string;
}

type ArtifactType =
  | "boardroom_insight"      // extracted from a boardroom session's convergence
  | "research_finding"       // saved from a Research session
  | "strategy_brief"         // user-described external strategy (L2)
  | "style_direction"        // pinned style archetype (from K3)
  | "scoring_analysis"       // aggregate scoring trends across media
  | "custom";                // freeform user-written brief

interface ArtifactSource {
  type: "boardroom" | "research" | "manual" | "scoring" | "external";
  sessionId?: string;        // if from boardroom
  timestamp: string;
}
```

**Storage**: SQLite table `strategy_artifacts` — same pattern as existing tables in `db.ts`. Indexed by `projectId` and `type` for fast lookups.

**Key behavior**: When a Strategy Artifact is **pinned** to a project, it gets automatically injected into:
- Media plan generation (K1 Stage 1 context gathering)
- Prompt expansion (H3)
- Scoring evaluation (I3 — "does this align with the strategy?")
- Boardroom session prompts (as additional context for all seats)

This is the "referenceable across the site" mechanism the user is asking about.

---

#### L2. Boardroom Strategy Extraction (Describe → Artifact)

A new boardroom session mode: **"I saw something — help me extract the strategy."**

Use case: You see a faceless YouTube channel doing something interesting, or a competitor runs a clever marketing campaign, or you read about a growth hack. You want to:
1. **Describe** what you saw in plain language
2. Have the AI **extract the underlying principles** (not just "they posted a video" but "they used pattern interrupts in the first 3 seconds, leveraged comment-bait CTAs, and maintained a warm-but-authoritative brand voice")
3. **Save the extracted strategy** as a Strategy Artifact
4. **Reference it** when generating your own media or building plans

**How it works:**

The boardroom gets a new template: **"Strategy Analysis"** with specialized seats:
- **Analyst**: Breaks down the described strategy into components (hooks, formats, emotional triggers, frequency, platform-specific tactics)
- **Psychologist**: Identifies the psychological principles at play (social proof, scarcity, authority, reciprocity, pattern interrupts)
- **Adapter**: Translates the strategy into actionable briefs for the user's brand context (how would this work for YOUR audience?)
- **Devil's Advocate**: Challenges assumptions ("this works for a faceless channel but your brand has a face — here's what changes")

The convergence output becomes a structured Strategy Artifact with:
- **Original description** (what the user saw)
- **Extracted principles** (the WHY behind it)
- **Adaptation notes** (how to apply it to your brand)
- **Suggested media** (what to generate based on this strategy)
- **Tags** (e.g., "faceless", "YouTube Shorts", "pattern interrupt", "Gen Z")

**UI flow:**
1. Boardroom page → "New Session" → Template: "Strategy Analysis"
2. User describes what they saw (long-form text area, paste links if available)
3. System runs the 4-seat boardroom analysis
4. Output is displayed as a Strategy Artifact card with sections
5. User can: **Save as Artifact** (persists to `strategy_artifacts` table), **Pin to Project** (auto-injected everywhere), or **Send to Plan** (creates draft media plan items from the suggested media)

---

#### L3. Artifact Reference Panel (Site-Wide)

A side panel or modal available on **every page** that shows all Strategy Artifacts for the active project.

**Access points:**
- Floating "📌 Artifacts" button in the bottom-right (or sidebar section)
- "Reference an artifact" button in Media Plan, Social Media Gen, Video Lab, Voice Lab
- Auto-suggested when generating: "You have 3 pinned strategy artifacts — they're being used in this prompt"

**Panel features:**
- Lists all artifacts for the project, grouped by type
- Pinned artifacts shown first with a ⭐ indicator
- Quick pin/unpin toggle
- Click to expand and read full content
- "Use in prompt" button that appends the artifact's summary/key points to the current generation prompt
- Search/filter across artifacts

**How pinning works visually:**
When a user has artifacts pinned, a small indicator appears on generation-related pages:
```
📌 2 strategy artifacts active
├── "Gen Z Neubrutalism" (style_direction) — pinned
└── "Faceless Channel Hook Formula" (strategy_brief) — pinned

These will influence all media generation and planning.
[Manage Artifacts]
```

---

#### L4. Artifact-Influenced Generation

When generating media (images, video, voice, or batch), the system checks for pinned artifacts and weaves their content into the generation pipeline:

1. **Prompt expansion** (H3): Pinned artifacts' key principles are appended to the system prompt that expands the user's base prompt. E.g., if a "Faceless Channel Hook Formula" artifact is pinned, the expanded prompt might include: "Use a pattern interrupt opening, bold text overlay, 9:16 vertical framing"

2. **Media plan generation** (K1): Pinned artifacts are included in the context brief (Stage 1), influencing the outline the planner produces

3. **Scoring** (I3): Pinned artifacts add scoring dimensions. E.g., "Does this image align with the 'warm tech' style direction artifact?" becomes a scoring criterion

4. **Boardroom sessions**: Pinned artifacts are included as background context for all seats, so the AI agents are aware of established strategies

**Implementation**: A helper function `getActiveArtifacts(projectId: string): StrategyArtifact[]` that returns all pinned artifacts for a project. This gets called at every generation entry point and the results are injected into the system prompts.

---

#### L5. Strategy Briefs Page (`/briefs`)

A new page for browsing, creating, and managing Strategy Artifacts.

**Layout:**
- **Sidebar**: Filter by artifact type (boardroom, research, strategy brief, style, custom)
- **Main area**: Card grid showing all artifacts for the active project
- **Each card**: Title, type badge, tags, summary preview, pin toggle, source indicator, timestamp
- **Actions per card**: View full, Edit, Delete, Pin/Unpin, "Send to Plan"

**Creating artifacts manually:**
- "New Artifact" button opens a form:
  - Title, Type (dropdown), Content (markdown editor)
  - OR: "Describe a strategy" (triggers L2 boardroom analysis)
  - OR: "Import from boardroom session" (picks a completed session and extracts insights)
  - OR: "Import from research" (picks a saved research result)

**Dashboard integration:**
- Add a "Strategy Briefs" card to the Dashboard under the "Strategy & Organize" section
- Shows count of artifacts + pinned count: "5 artifacts · 2 pinned"

---

#### L6. Auto-Artifact Generation from Existing Workflows

Make artifact creation seamless and automatic where possible:

- **Boardroom sessions**: After any session completes, offer "Save as Artifact" on the convergence summary. For Strategy Analysis sessions (L2), auto-save by default.
- **Research sessions**: Add a "Save Finding" button that creates a `research_finding` artifact from the current research result.
- **Media scoring rounds**: After batch scoring completes, generate a `scoring_analysis` artifact summarizing trends (e.g., "Your highest-scoring media uses warm lighting and centered composition — consider making this your default style direction").
- **Style database pins** (K3): When a user pins a style archetype to their project, it creates a `style_direction` artifact automatically.

This makes the artifact system feel like a natural part of the workflow rather than a separate thing to manage.

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

### Phase 3 — Presentation, Export & Strategy
| Item | Why now |
|------|---------|
| **H4** (Prompt Variants) | Nice-to-have on top of expansion. |
| **I2** (Boardroom → Media) | Nice-to-have once the pipeline exists. |
| **I4** (Tags & Organization) | Polish for the Library. |
| **J1** (Collections) | Need enough media to curate first. |

### Phase 4 — Strategy Artifacts
| Item | Why now |
|------|---------|
| **L1** (Strategy Artifacts Data Model) | Foundation for all L-track features. |
| **L5** (Strategy Briefs Page) | Enables manual creation and management. |
| **L3** (Artifact Reference Panel) | Makes artifacts accessible site-wide. |
| **L4** (Artifact-Influenced Generation) | Core value prop: artifacts influence generation. |
| **L2** (Boardroom Strategy Extraction) | New powerful way to create artifacts. |
| **L6** (Auto-Artifact Generation) | Makes artifact creation seamless. |
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

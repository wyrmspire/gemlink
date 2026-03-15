# boardinit — Multi-Agent Board Orchestration

> Generic workflow for setting up `board.md` and `agents.md` in any repo.
> Use this to divide work across N parallel agents with zero collisions.
> Never push/pull from git. All coordination happens through these two files.

---

## What Are The Two Files?

### `agents.md` — The Repo Library
**Purpose**: Standing context that never changes mid-sprint. Any agent reads this first to understand the repo.

**Contains**:
- Repo file map (what lives where)
- Ownership zones (which files belong to which lane)
- Coordination rules (how to avoid collisions)
- Tech stack + patterns (how things are built here)
- Common pitfalls (things that break if you're not careful)
- Server startup / test commands
- Environment setup

**Rule**: `agents.md` is updated between sprints, not during them.

### `board.md` — The Execution Plan
**Purpose**: The active work plan. Each agent reads this to find their lane and work items.

**Contains**:
- Sprint history (completed sprints summarized in a table)
- Pre-flight checklist (what must be true before starting)
- Lane definitions with work items (W1, W2, W3...)
- Status markers (⬜ → 🟡 → ✅)
- Dependency annotations (which items unlock which)
- Handoff protocol (what to do when done)
- Test summary table

**Rule**: Agents update `board.md` as they complete items. Only their own lane.

---

## How To Create `agents.md`

### Step 1: Map the repo
```markdown
## Repo Map
- **Server**: `server.ts` (routes, API)
- **Database**: `src/db.ts` (schema, queries)
- **UI Pages**: `src/pages/*`
- **Components**: `src/components/*`
- **Config**: `.env.local`, `config.ts`
- **Tests**: `tests/*`
```

### Step 2: Define ownership zones
Each zone is a set of files that ONE lane can touch. No overlap.

```markdown
## Ownership Zones
| Zone | Files | Typical Lane |
|------|-------|-------------|
| Server Core | server.ts, config.ts | Lane 1 |
| Database | src/db.ts, migrations/ | Lane 1 |
| Page: Settings | src/pages/Settings.tsx | Lane 3 |
| Components | src/components/New*.tsx | Whoever creates them |
| Tests | tests/* | Lane with testing focus |
```

### Step 3: Document patterns
```markdown
## Patterns
- All server endpoints go under `api.*` router in server.ts
- All pages lazy-load via React.lazy in App.tsx
- Toast notifications via `useToast()` from context
- API key passed via `import.meta.env.VITE_GEMINI_API_KEY`
- State persistence: localStorage with project-scoped keys
```

### Step 4: Document commands
```markdown
## Commands
- **Dev server**: `npm run dev` (runs on PORT from .env.local)
- **Type check**: `npx tsc --noEmit`
- **Tests**: `npx vitest run`
- **Build**: `npm run build`
- **Lint**: `npm run lint` (if configured)
```

### Step 5: Document pitfalls
```markdown
## Pitfalls
- Model names rotate — never hardcode, use config.ts
- Tests mock `motion/react` — copy the mock block from existing test files
- VoiceLab TTS returns PCM that needs WAV header conversion
- Don't modify files owned by another lane
```

### Step 6: Define Standard Operating Procedures (SOPs)

SOPs are the most important part of `agents.md`. They prevent the same mistake from happening twice. Start with universal rules and add repo-specific rules as you learn from bugs.

**Format**: Each SOP has a number, a title, a "Learned from" line (if it came from a bug), and ❌/✅ examples.

```markdown
### SOP-N: [Rule Name]
**Learned from**: [Sprint/bug that taught us this, or "universal"]

- ❌ [what not to do — concrete code example]
- ✅ [what to do instead — concrete code example]
- [additional guidance]
```

**Start with these universal SOPs** — they apply to every repo:

#### Universal SOP Categories

| Category | What It Prevents | Example Rule |
|----------|-----------------|-------------|
| **Config centralization** | Hardcoded values scattered everywhere | "All configurable values live in config.ts or .env — never inline" |
| **Error transparency** | Silent failures that hide bugs | "Never catch-and-swallow — always surface errors to the user" |
| **Auth/secrets** | Leaked keys, missing credentials | "Always pass keys via env vars, never hardcode, never log" |
| **Error response shape** | Inconsistent API responses | "All errors return `{ error: string }` with proper HTTP codes" |
| **Test discipline** | Regressions after UI changes | "When you change user-visible text, grep tests for the old text" |
| **No duplication** | Copy-paste code drift | "If a pattern appears 3+ times, extract a helper" |
| **Naming conventions** | Inconsistent code style | "Console logs use `[section]` prefix, storage keys use `appname-feature-id`" |
| **Dependency control** | Bloated node_modules | "Never install packages without discussion — use what's already there" |

#### How SOPs Grow From Regressions

SOPs aren't written all upfront — they accumulate from real bugs. After each sprint:

1. **Review**: What broke? What was messy? What took longer than it should?
2. **Root cause**: Was it a missing rule? A rule that wasn't specific enough?
3. **Write the SOP**: Add it to `agents.md` with a "Learned from" tag
4. **Example before/after**: Show the exact bad code and the fix
5. **Link to pitfalls**: If the SOP addresses a pitfall, cross-reference it

```markdown
### SOP-47: Always validate API responses before using data
**Learned from**: Sprint 8 → search endpoint returned `null` items array,
frontend crashed trying to `.map()` on null.

- ❌ `const items = data.items.map(...)` — crashes if items is null
- ✅ `const items = Array.isArray(data.items) ? data.items.map(...) : []`
- Always provide a safe fallback for arrays from API responses
```

The SOP section grows over time. Start with 3–5 rules. A mature repo might have 20+.

---

## How To Create `board.md`

### Size Management — Keep It Under 200 Lines

`board.md` is consumed by agents with limited context windows. A bloated board wastes tokens on completed work and buries the active sprint. Target **~200 lines** for the active board. Once it crosses **~300 lines**, compact it.

#### The Hot/Cold Split

Split board content into hot (active) and cold (archived):

| Content | Where | Why |
|---------|-------|-----|
| Active sprint lanes + items | `board.md` | Agents read this every session |
| Sprint history summary table | `board.md` (compact table, ~5 lines) | Quick context on what's done |
| Completed sprint full details | `sprints/sprint-N.md` or delete | Agents don't need old lane details |
| Pre-flight checklist | `board.md` | Agents need this every time |
| Parallelization guidance | `board.md` | Agents need the dependency map |
| Handoff protocol | `board.md` | Agents need this at the end |

**Rule**: When a sprint is complete, collapse its full lanes into one row in the history table and delete the lane details. A completed sprint should take up **1 line** in the board, not 100.

#### Lane Files — For Complex Sprints

When a sprint has 5+ lanes with 5+ items each, `board.md` gets huge. Solution: split each lane into its own file.

```
board.md              ← Dashboard: history table, status overview, dependency map, handoff
lanes/
  lane-1-server.md    ← Full W1–W5 detail for Lane 1
  lane-2-frontend.md  ← Full W1–W5 detail for Lane 2
  lane-3-testing.md   ← Full W1–W5 detail for Lane 3
```

`board.md` becomes a compact index:

```markdown
## Sprint 6 — Active Lanes

| Lane | Focus | File | Status |
|------|-------|------|--------|
| 🔴 Lane 1 | Compose Engine | `lanes/lane-1-server.md` | W1 ✅ W2 🟡 W3 ⬜ W4 ⬜ W5 ⬜ |
| 🟣 Lane 2 | Compose UI | `lanes/lane-2-frontend.md` | W1 🟡 W2 ⬜ W3 ⬜ W4 ⬜ W5 ⬜ |
| 🔵 Lane 3 | Templates | `lanes/lane-3-templates.md` | W1 ⬜ W2 ⬜ W3 ⬜ W4 ⬜ W5 ⬜ |
```

Agent prompt changes slightly:
```
Read `board.md` for the overview, then read your lane file `lanes/lane-2-frontend.md` for work details.
```

This keeps `board.md` at ~80 lines regardless of sprint complexity.

#### When To Compact

| Board Size | Action |
|-----------|--------|
| < 200 lines | ✅ Fine as-is, all lanes inline |
| 200–300 lines | ⚠️ Consider moving completed sprint details to history |
| 300–400 lines | 🟡 Split lanes into separate files |
| 400+ lines | 🔴 Definitely split — agents are wasting context on old data |

#### Compaction Checklist

When compacting between sprints:
1. Move completed lane details to `sprints/sprint-N.md` (or just delete — the git history has it)
2. Add one row to the Sprint History table: `| Sprint N | Theme | Test count | ✅ |`
3. Delete all W items, status markers, and lane sections from the completed sprint
4. Reset pre-flight checklist for the new sprint
5. Final `board.md` after compaction should be: history table + new sprint lanes

---

### Advanced Board & Agent Techniques

#### Technique 1: ASCII Dependency Graph

Put this at the top of every sprint. Agents can see at a glance what unlocks what.

```
Lane 1:  [W1 ←FAST] ──→ [W2] ──→ [W3]
              │              │
              ↓              ↓
Lane 2:  [W1 ←INDEP] → [W2] → [W3] → [W4]
                              ↑
Lane 3:  [W1 ←INDEP] → [W2] ─┘→ [W3]
```

Better than paragraphs of text. An agent grasps the entire dependency structure in 5 lines.

#### Technique 2: Velocity Tracking

Add to the sprint history table:

```markdown
| Sprint | Theme | Items | Completed | Tests | Duration | Status |
|--------|-------|-------|-----------|-------|----------|--------|
| Sprint 3 | Planning | 25 | 25 | 114 | 3h | ✅ |
```

Over time you learn: "we complete ~20–25 items per sprint across 5 agents." Size future sprints accordingly.

#### Technique 3: Risk Flags

Mark risky items in lanes:

```markdown
### W3. Template from Strategy Artifact (P1) ⬜ ⚠️ RISK: depends on Gemini structured output
```

The `⚠️ RISK:` tag tells the agent to handle this item defensively — add fallbacks, test edge cases, don't assume success.

#### Technique 4: Blockers Section

Add a shared section at the top of the board for cross-lane blockers:

```markdown
## 🚫 Active Blockers
| Blocker | Affects | Waiting On | Workaround |
|---------|---------|------------|------------|
| config.ts not yet created | L2:W2, L3:W3 | L1:W1 | Stub imports, wire later |
```

Agents check this section first. If they see their lane listed, they skip to non-blocked items.

#### Technique 5: Lane Contracts

At the top of each lane, state what the lane **produces** (outputs) and what it **consumes** (inputs from other lanes):

```markdown
## Lane 2 — Server Migration
**Produces**: All server.ts model refs use config.models.* (no more hardcoded strings)
**Consumes**: config.ts from Lane 1 (imports { models } from "./config")
```

This makes the inter-lane interface explicit. An agent knows exactly what it needs from other lanes and what other lanes expect from it.

#### Technique 6: Done Definitions

Each W item can have a "Done when:" line:

```markdown
### W2. Migrate server.ts (P0) ⬜
- **Done when**: `grep -n "gemini-2.5-flash-preview-04-17" server.ts` returns zero results AND `npx tsc --noEmit` passes
```

Removes ambiguity. The agent knows exactly when to mark ✅.

#### Technique 7: Agent Memory in agents.md

Keep a "Lessons Learned" changelog at the bottom of `agents.md`:

```markdown
## Lessons Learned (Changelog)
- **2026-03-15**: Added SOP-1 (no hardcoded models) after 403 errors from retired preview models
- **2026-03-14**: Added SOP-2 (no silent fallbacks) after Quick Plan hid API errors behind mock data
- **2026-03-13**: Added SOP-7 (update tests on UI change) after "Suggest Plan" → "Quick Plan" rename broke tests
```

This is the institutional memory. New sprints inherit all previous lessons automatically.

#### Technique 8: Sprint Retro Block

Add to the bottom of `board.md` after each sprint, before compaction:

```markdown
## Sprint N — Retro
- **What worked**: Lane files kept board.md small; weaving prevented idle agents
- **What broke**: Lane 2 blocked for 20 min waiting on Lane 1 W1 — make foundation items smaller
- **New SOPs added**: SOP-15 (always validate JSON from Gemini before using)
- **Velocity**: 22/25 items completed, 3 deferred to Sprint N+1
```

This feeds into the next sprint's planning and the agents.md SOP list.

---

### The Weaving Principle

The key to parallel agents is **dependency weaving**: design work items so early items in one lane unlock later items in another lane. All agents start at the same time, but they hit dependencies at different points.

```
Lane 1:  [W1: config.ts] → [W2: API endpoint] → [W3: tests]
              ↓ unlocks              ↓ unlocks
Lane 2:  [W1: prep/analysis] → [W2: use config.ts] → [W3: migrate files]
                                     ↑ needs L1:W1
Lane 3:  [W1: UI layout] → [W2: components] → [W3: wire to API]
                                                     ↑ needs L1:W2
```

**Design rules:**
1. **Front-load independent work** — each lane's W1 should need NOTHING from other lanes
2. **Small foundation items** — the "unlocking" item (e.g., creating `config.ts`) should be tiny (< 50 lines) so it ships fast
3. **Mark dependencies explicitly** — use `(AFTER L1:W2)` annotations
4. **Provide stubs** — if Lane 3 needs an API that Lane 1 builds, tell Lane 3 to stub it and wire later
5. **Buffer with busy-work** — give dependent lanes prep work to do while waiting (analysis, component skeletons, doc writing)

### Board Structure Template

```markdown
# Project Execution Board

> Last updated: YYYY-MM-DD (Sprint N — theme)

---

## Sprint History

| Sprint | Theme | Tests | Status |
|--------|-------|-------|--------|
| Sprint 1 | ... | N | ✅ |

---

## Status Key

| Symbol | Meaning |
|--------|---------|
| ⬜ | Not started |
| 🟡 | In progress |
| ✅ | Done |
| 🔴 | Blocked |

---

## Parallelization Guidance

> Describe how lanes interlock. Which early items unlock which later items.
> Call out the critical path.

---

## Sprint N — Pre-Flight Checklist

- [ ] All previous tests passing
- [ ] Dev server running
- [ ] Each lane has read `agents.md`

---

## 🔴 Lane 1 — [Name] (Server/Foundation)

**Focus**: ...
**Owns**: file1, file2 (no other lane touches these)

### W1. [Foundation Item] (P0) ⬜
- **Files**: ...
- **What**: ...
- **Unlocks**: Lane 2 W2, Lane 3 W3

### W2. [Next Item] (P0) ⬜
- **Files**: ...
- **What**: ...

---

## 🟣 Lane 2 — [Name]

### W1. [Independent Prep] (P0) ⬜
- **Files**: ...
- **What**: ... (can start immediately, no dependencies)

### W2. [Depends on L1:W1] (P0) ⬜
- **Files**: ...
- **What**: ...
- **Depends**: Lane 1 W1 (config.ts must exist)
- **If blocked**: Work on W3 documentation while waiting

---

## Handoff Protocol

1. Mark each W item ⬜→🟡→✅ as you go
2. Add "- **Done**: ..." line summarizing what shipped
3. Run `npx tsc --noEmit` — must pass
4. Run `npx vitest run` — report total count
5. Commit: `"L<N>-S<M>: <scope>"`
```

---

## Weaving Patterns

### Pattern 1: Foundation → Migration → UI
Best for: refactoring, config changes, model migrations

```
Lane 1: Create the new thing (module, config, schema)
Lane 2: Migrate existing code to use the new thing
Lane 3: Build UI on top of the new thing
```

Lane 1 ships W1 fast. Lane 2 starts with analysis of what needs migrating. Lane 3 starts building UI skeletons.

### Pattern 2: Server → Frontend → Testing
Best for: new features

```
Lane 1: Build server endpoints + DB schema
Lane 2: Build frontend pages + components
Lane 3: Write tests + CI + docs
```

Lane 3 writes test skeletons with stubbed imports while waiting.

### Pattern 3: Core → Extensions → Polish
Best for: enhancing existing features

```
Lane 1: Core new logic (engine, algorithm, module)
Lane 2: Integration with existing features
Lane 3: UX polish, error handling, edge cases
```

### Pattern 4: Independent Vertical Slices
Best for: unrelated features that don't share files

```
Lane 1: Feature A (own files, own tests)
Lane 2: Feature B (own files, own tests)
Lane 3: Feature C (own files, own tests)
```

No weaving needed — just file ownership boundaries.

### Anti-Patterns (avoid these)

❌ **Two lanes editing the same file** — always assign clear file ownership
❌ **Lane 2 W1 depends on Lane 1 W5** — dependency too late, Lane 2 idles for too long
❌ **No independent W1** — every lane must have something to start on immediately
❌ **Vague "coordinate with Lane X"** — be specific: "AFTER L1:W2, import `models` from config.ts"
❌ **Pushing/pulling git** — agents don't use git. All coordination is file-based.
❌ **Modifying agents.md during a sprint** — that's the stable reference doc

---

## Agent Prompt Template

Keep agent prompts minimal. All context lives in `board.md` and `agents.md`.

```
You are Lane N for this project.

1. Read `agents.md` for repo context, file map, patterns, and commands.
2. Read `board.md` and find "Lane N — [Name]". That's your work.
3. For each work item (W1–WN):
   - Change status ⬜ → 🟡 when you start
   - Change status 🟡 → ✅ when done, add "- **Done**: ..." summary
   - If an item says "AFTER L1:W2", check if that item is ✅ first
   - If blocked, work on the next non-blocked item
4. When all items are done:
   - Run the type checker and test suite (see agents.md for commands)
   - Report final test count
5. Do NOT modify files owned by other lanes.
6. Do NOT push/pull from git.
```

---

## Delivering The Prompts — Required Final Step

After `board.md` and `agents.md` are written, you MUST post the lane prompts directly in the chat as copyable code blocks. This is what the user actually pastes into each parallel agent session. Without this step the board is just a doc — the prompts are what launch the agents.

### Rules For The Delivery

1. **One code block per lane** — each prompt is self-contained in a fenced ` ``` ` block with no language tag, so it copies cleanly with zero formatting noise
2. **Minimal prompt body** — the prompt must NOT repeat all the work details. Those live in `board.md`. The prompt is just an entry point with 5–6 bullet instructions
3. **Name each block** — use a `## Lane N — [Name]` header above each code block so the user can see at a glance which is which
4. **Always include these lines in every prompt**:
   - Read `agents.md` first
   - Read `board.md` and find their specific lane section by name
   - Update status markers ⬜ → 🟡 → ✅ as they go
   - Add `- **Done**: ...` line when each item completes
   - Check dependency status before starting dependent items
   - Run type check + test suite at the end and report count
   - Do NOT touch files owned by other lanes
   - Do NOT push/pull from git
5. **Note any lane-specific extras** — if a lane has a critical extra doc to read (e.g., `settings.md`, `editor.md`), add one line for it

### The Exact Delivery Format

Post this in the chat after writing the board:

---

**## Lane 1 — [Name]**

```
You are Lane 1 for this project.

1. Read `agents.md` for repo context, file map, patterns, and commands.
2. Read `board.md` and find "Lane 1 — [Name]". That's your work.
3. For each work item (W1–WN):
   - Change status ⬜ → 🟡 when you start
   - Change status 🟡 → ✅ when done, add "- **Done**: ..." summary
   - If an item says "Depends: Lane X WY", check if that item is ✅ first
   - If blocked, skip to the next non-blocked item
4. When all items are done:
   - Run `npx tsc --noEmit` — must pass
   - Run `npx vitest run` — all tests must still pass
   - Report final test count in board.md
5. Do NOT modify files owned by other lanes.
6. Do NOT push/pull from git.
```

**## Lane 2 — [Name]**

```
You are Lane 2 for this project.
[same structure, mention any specific dependency on L1 items]
```

**## Lane 3 — [Name]**

```
You are Lane 3 for this project.
[same structure, add any extra doc references if needed]
```

---

### What NOT To Put In The Prompt

❌ A summary of all the work items — that's in `board.md`
❌ File paths and implementation details — those are in `board.md`
❌ Tech stack explanations — those are in `agents.md`
❌ Model names, patterns, pitfalls — those are in `agents.md`
❌ Long paragraphs the agent has to parse — keep it to a numbered list

**The entire prompt body should fit in ≤ 10 lines.** If you're tempted to put more in, put it in `board.md` instead.

### Why This Matters

The user copies these prompts directly into N separate agent sessions simultaneously. The agents then:
1. Read `agents.md` → understand the repo
2. Read `board.md` → find their specific lane and work items
3. Update status markers in `board.md` → visible progress, real-time coordination
4. Check dependencies in `board.md` → don't start blocked work

The prompt is the ignition key. The board is the engine.

---

## Scaling: 3 vs 5 vs 7 Lanes

| Agents | Best For | Risk |
|--------|----------|------|
| 2–3 | Config changes, refactors, small features | Low — easy to track |
| 4–5 | Full sprints with server + frontend + tests | Medium — need clear file ownership |
| 6–7 | Large feature sets with docs + polish | High — more coordination overhead |

**Rule of thumb**: if you can't clearly separate file ownership for N lanes, use fewer lanes.

---

## Recovery: What To Do After A Crash

If agents are interrupted (crash, timeout, lost context):

1. Run the type checker — does it pass?
2. Run the test suite — how many pass/fail?
3. Read `board.md` — which items are ✅ vs ⬜?
4. Audit the code — look for items marked ⬜ that actually have code written
5. Update `board.md` to reflect reality
6. Fix any test failures caused by partial work
7. Resume with a new sprint or continue the current one

# boardinit — Multi-Agent Board Orchestration

> Generic workflow for setting up `board.md` and `agents.md` in any repo.
> Use this to divide work across N parallel agents with zero collisions.
> Never push/pull from git. All coordination happens through these two files.

---

## Required Outputs (Checklist — All Must Be Done)

Before you are finished with boardinit, you MUST produce ALL of these:

- [ ] `agents.md` — updated (see contract below)
- [ ] `board.md` — written with new sprint inline (compacted history + new lanes)
- [ ] Copy boxes posted in chat — one per lane, ready to paste into a new agent

Do not stop after writing the files. The copy boxes in chat are required.

---

## The Two Files — Strict Contracts

### `agents.md` — Evergreen Context (Never Sprint-Specific)

**Purpose**: Standing context for any agent entering this repo, at any time, regardless of what sprint is active or whether a sprint is running at all.

**Contains (always appropriate)**:
- Repo file map (what lives where)
- Tech stack and patterns (how things are built here)
- Standard Operating Procedures / SOPs (rules learned from bugs)
- Commands (dev, test, build, lint)
- Common pitfalls (things that break if you're not careful)
- Lessons Learned changelog (append after each sprint)

**NEVER put these in `agents.md`**:
- ❌ Sprint names or numbers marked "Active"
- ❌ File ownership tables per lane (e.g., "Lane 1 owns server.ts this sprint")
- ❌ Work items (W1, W2, W3...)
- ❌ Sprint-specific "done when" criteria
- ❌ A sprint status table (that belongs in board.md)

**Rule**: If the content would become stale or wrong the moment the sprint ends, it does NOT belong in `agents.md`.

---

### `board.md` — The Active Sprint Plan

**Purpose**: The live execution plan. Agents read this to find their lane and current work items. Updated during a sprint as items complete.

**Contains**:
- Sprint history table (compact — one row per completed sprint, never full lane details)
- Current sprint lanes with work items (W1, W2, W3...)
- Status markers (⬜ → 🟡 → ✅)
- Dependency/parallelization graph (ASCII, at top of new sprint)
- Ownership zones (which files belong to which lane — sprint-specific, lives HERE not agents.md)
- Pre-flight checklist
- Handoff protocol
- Test summary table

---

## Size Management

| board.md Line Count | Action |
|--------------------|--------|
| < 280 lines | ✅ All lanes inline in board.md |
| ≥ 280 lines | Split lanes into `lanes/lane-N-name.md` files; board.md becomes a compact dashboard |

**Hard rule**: Do not create lane files unless inline content would exceed 280 lines.

When splitting into lane files, board.md shows:

```markdown
| Lane | Focus | File | Status |
|------|-------|------|--------|
| 🔴 Lane 1 | Bug Fixes | `lanes/lane-1-bugfixes.md` | W1 🟡 W2 ⬜ |
```

And each lane file gets the full W1–WN detail.

---

## How To Create/Update `agents.md`

### Step 1: Preserve all existing SOPs

Never delete SOPs — they are institutional memory. Only add new ones.

### Step 2: Update the repo map

Add any new files that were created since the last sprint (new pages, new modules, new docs).

### Step 3: Add new SOPs from bugs discovered this sprint

Format:
```markdown
### SOP-N: [Rule Name]
**Learned from**: [Sprint/bug that taught us this, or "universal"]

- ❌ [what not to do — concrete code example]
- ✅ [what to do instead — concrete code example]
```

### Step 4: Append to Lessons Learned changelog

```markdown
## Lessons Learned (Changelog)
- **2026-03-15**: Added SOP-17 (batch field mismatches) after check.md cataloged CHECK-001/002
```

### Step 5: Update test count + build status at the bottom

```markdown
Current test count: **223 passing** | Build: clean | TSC: clean
```

**Do NOT add**: sprint ownership tables, active sprint markers, W items, or anything that will be wrong next sprint.

---

## How To Create/Update `board.md`

### Step 1: Compact completed sprint

Reduce completed sprint to ONE row in the history table:
```markdown
| Sprint 8 | UX Polish + MediaPlan improvements | 200 | ✅ |
```
Delete all the old lane details. Git has them if anyone ever needs them.

### Step 2: Write the new sprint section

Always starts with the ASCII dependency graph:

```
Lane 1:  [W1 ←FAST] ──→ [W2] ──→ [W3]
              │
              ↓
Lane 2:  [W1 ←INDEP] → [W2] → [W3]
```

Then the ownership zones table (sprint-specific — this is the right home for it):

```markdown
## Sprint N Ownership Zones
| Zone | Files | Lane |
|------|-------|------|
| Server batch | `server.ts` (L1296–L1650) | Lane 1 |
| Compose editor | `Compose.tsx`, `SlideTimeline.tsx`, `compose.ts` | Lane 2 |
```

Then each lane section with W items, status markers, and "Done when" criteria.

### Step 3: Pre-flight and handoff sections

Always include:
```markdown
## Pre-Flight Checklist
- [ ] All N tests passing
- [ ] TSC clean
- [ ] Dev server confirmed running

## Handoff Protocol
1. Mark W items ⬜→🟡→✅ as you go
2. Run tsc + vitest before marking ✅
3. Never touch files owned by other lanes
4. Never push/pull from git
```

---

## How To Write Lane Prompt Copy Boxes

This step is REQUIRED. After writing the files, post one copy box per lane directly in the chat. The user will paste each one into a new agent. Do not summarize — give the actual paste-ready prompt.

**Format for each copy box**:

````
## Lane N — [Theme]

```
You are Lane N for this project.

1. Read `agents.md` — this is your standing context for the entire repo. Read it first.
2. Read `board.md` — find "Lane N — [Theme]". That is your work.
3. [Any lane-specific reading: check.md, editor.md, medpln.md, etc.]
4. For each work item (W1–WN):
   - Mark ⬜ → 🟡 when you start it
   - Mark 🟡 → ✅ when done; add "- **Done**: [one sentence summary]"
   - [Any lane-specific instructions]
5. When all items are done:
   - Run `npx tsc --noEmit` — must pass
   - Run `npx vitest run` — report total passing count
   - Update the test count row in board.md for your lane
6. Own only the files listed in board.md Sprint N Ownership Zones for Lane N
7. Never push/pull from git
```
````

Each lane gets its own copy box. Do not merge them.

---

## SOPs That Apply to Every Review

After any sprint, before writing the new board:

1. **What regressed?** → Add SOP to agents.md
2. **What was confusing?** → Add to Common Pitfalls in agents.md
3. **What new files were created?** → Add to Repo Map in agents.md
4. **Did the board exceed 280 lines?** → Use lane files next sprint

---

## Lane Sizing — Right-Sizing Workload

This is the most important planning decision. Getting it wrong means agents finish in 15 minutes (under-loaded) or stall on a single item for hours (over-loaded).

### What Makes a Good W Item

A well-sized W item is approximately **30–150 lines of code** touching 1–3 files. It takes an agent roughly 5–20 minutes to complete. It has a clear "done when" that can be verified.

| W Item Size | Lines Changed | Example | Verdict |
|-------------|--------------|---------|---------|
| Too small | < 20 lines | "Add `music` to one allowed-list array" | ❌ Merge into a broader W item |
| Right-sized | 30–150 lines | "Fix all batch field mismatches in server.ts" | ✅ |
| Too large | > 300 lines | "Rewrite the entire compose pipeline" | ❌ Split into multiple W items |

**Signs your W items are too small**: the lane could be completed in a single file edit, or several items touch the same file for the same feature. Merge them.

**Signs your W items are too large**: the description has multiple "and also" clauses, or you can't write a single "Done when" without listing 4 sub-criteria. Split them.

### How Many Lanes to Create

Use the fewest lanes that allow true parallelism. Do NOT create a lane just to fill a 5-lane template.

| Situation | Right call |
|-----------|-----------|
| All work touches the same 1–2 files | 1 lane |
| Work splits cleanly: server vs UI vs tests | 2–3 lanes |
| Work splits across 4+ completely separate feature areas | 4–5 lanes |
| You have 5 items total | 1–2 lanes, not 5 |

**The test**: could any two of your lanes be merged without creating file conflicts? If yes, merge them. A lane should exist because two agents *cannot* work on it simultaneously without collisions — not just to parallelize for the sake of it.

### Right-Sizing the Sprint Itself

| Total W Items | Recommended Lanes | Notes |
|--------------|------------------|-------|
| 4–8 | 1–2 | Consolidate; don't force 5 lanes |
| 8–15 | 2–3 | Solid mid-size sprint |
| 15–25 | 3–5 | Full sprint, all lanes meaningfully loaded |
| 25+ | 5 lanes max + consider splitting sprint | Don't exceed 5 lanes |

**Target**: each lane should have **5–8 W items** of right-sized scope. A lane with 3 tiny items is underloaded; merge it with another lane or add more scope.

### Consolidation Heuristic

Before finalizing lanes, ask: *"If I merged Lane A and Lane B, would there be file conflicts?"*
- If no → merge them. Two small lanes become one healthy lane.
- If yes → keep them separate.

This sprint (Sprint 9) was a good example of over-splitting: Lane 1 had 8 small bug fixes (~15 lines each) that could have been 3–4 right-sized items; Lane 3 had 5 small UI additions all in the same file — that's 1 lane, but could have been merged with Lane 2 since both were Compose/MediaPlan UI work with no file conflicts up front.

---

## Anti-Patterns (Common Mistakes)

| Mistake | Why It's Wrong | Fix |
|---------|---------------|-----|
| Putting ownership zones in agents.md | Becomes stale after one sprint | Move to board.md under "Ownership Zones" |
| Deleting old SOPs from agents.md | Loses institutional memory | Never delete SOPs — they're historical |
| Creating lane files when board < 280 lines | Over-engineering | Keep inline |
| Forgetting to post copy boxes | Agents can't start without prompts | It's a required output — checklist enforces this |
| Marking sprint as "Active" in agents.md | agents.md is never sprint-specific | Never reference sprint state in agents.md |
| Forgetting to compact old sprint | board.md balloons past 400 lines | One row per completed sprint in history table |

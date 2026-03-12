# Boardroom protocol redesign handoff

## What changed
- Reworked `boardroom.ts` so sessions now start by generating an **objective anchor** before seat debate.
- Added explicit objective buckets:
  - `primaryGoal`
  - `hardConstraints`
  - `softHints`
  - `throwawayExamples`
  - `importantFocus`
  - `namingExplicitlyRequested`
- Replaced the old generic multi-round loop with a visible **protocol script**:
  1. Opening brief
  2. First-pass reactions
  3. Challenge round
  4. Refinement round
  5. Convergence
- Added **state snapshots** after each active discussion phase, including:
  - room focus
  - open questions
  - emerging consensus
  - tensions
  - provisional vs important items
  - compact per-seat state (`focus`, `priorities`, `concerns`, `internalNotes`)
- Updated seat prompting so each seat responds to:
  - the anchored objective
  - the latest room state
  - prior room turns
  - the current protocol phase
  instead of only reacting to the last reply.
- Updated `src/pages/Boardroom.tsx` to expose the new structure in the UI:
  - objective anchor card
  - protocol preview / active protocol display
  - turn cards labeled by phase
  - room state evolution section
  - final synthesis still preserved

## Why this should fix the current failure mode
The new prompting and state model explicitly tell the room to treat rough names and offhand examples as provisional unless the user clearly asks for naming work. That should reduce the current tendency to obsess over a tossed-off example name when the real task is something like positioning, funnel design, or business shape.

## Practical notes
- I kept the implementation local-first and file-backed in `jobs/boardroom`.
- I did **not** change media generation flows.
- Existing session JSON files without the new fields may render with missing sections, but new sessions will contain the richer protocol/state data.

## Tested
- `npm run lint` ✅
- `npm run build` ✅

## Not tested
- I did not run a live Gemini-backed boardroom session end-to-end in this pass, so the exact output quality still depends on model behavior.

## Repo state note
There were already unrelated local modifications in:
- `server.ts`
- `vite.config.ts`
- `WORKSPACE-NOTES.md`

I avoided touching those in this redesign and committed only the Boardroom files plus this handoff.

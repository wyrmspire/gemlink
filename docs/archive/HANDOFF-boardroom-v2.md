# Boardroom v2 handoff

## What changed
- Upgraded `boardroom.ts` from single-pass perspectives to a true multi-round exchange.
- Added session config fields:
  - `seatCount` (1-5)
  - `rounds` (1-5)
  - `depth` (`light` | `standard` | `deep`)
- Expanded turn records to include:
  - `round`
  - `kind` (`perspective` / `response` / `summary`)
  - structured stance/risk/opportunity/recommendation fields per seat turn
- Kept sessions saved locally as JSON in `jobs/boardroom/`.
- Updated `src/pages/Boardroom.tsx` so the UI can control seats, rounds, and thought depth.
- Expanded default seat roster to 5 practical roles and slices it by selected seat count.

## Implementation notes
- Round 1 = initial perspectives.
- Later rounds = each seat sees the prior round transcript from the other seats, then refines/challenges/responds.
- Final synthesis uses the full turn log plus final seat perspectives.
- Kept the approach practical: one sequential backend flow, local JSON persistence, no background job system added.

## Test run completed
- Typecheck: `npm run lint`
- Frontend build: `npm run build`
- High-intensity saved session executed directly against the updated backend with `npx tsx`:
  - session id: `boardroom-1773342452808-awir1f`
  - saved file: `jobs/boardroom/boardroom-1773342452808-awir1f.json`
  - config: 5 seats / 4 rounds / deep
  - result: completed
  - turn count: 21

## Honest testing note
- I verified the upgraded backend by executing `createBoardroomSession(...)` directly with `npx tsx`, which saved the session file successfully.
- I also ran typecheck and production build successfully.
- I did **not** do a browser-manual UI walkthrough in this pass.

## Files changed for this task
- `boardroom.ts`
- `src/pages/Boardroom.tsx`

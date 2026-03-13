# Boardroom backend handoff

## What changed
- Added a first-pass Boardroom backend in `boardroom.ts`.
- Added API endpoints in `server.ts`:
  - `POST /api/boardroom/sessions`
  - `GET /api/boardroom/sessions`
  - `GET /api/boardroom/sessions/:id`
- Sessions are now saved locally in-repo under `jobs/boardroom/*.json`.
- Each saved session includes:
  - topic
  - context
  - participants
  - turns/messages
  - per-seat perspectives
  - summary
  - next steps
  - logs/status/error
- Updated `src/pages/Boardroom.tsx` to use the backend instead of calling Gemini directly in the browser.

## Current scope
- Implemented for **2 Gemini-backed seats by default**.
- Backend validation and data shapes are set up to allow up to **5 seats later**.
- The orchestration is intentionally simple: each seat produces a perspective, then the backend asks Gemini for a final synthesis.

## What is not implemented
- No background job queue yet; session creation is currently handled in-request.
- No live streaming or incremental UI updates while seats are thinking.
- No auth/user scoping.

## How to test
1. Set `GEMINI_API_KEY` in `.env.local`.
2. Run the app:
   - `npm run dev`
3. Open `/boardroom`.
4. Enter:
   - a topic
   - optional extra context
5. Start the session.
6. Confirm the UI shows:
   - seat turns
   - summary
   - next steps
   - per-seat risk/opportunity/recommendation blocks
7. Confirm a durable file was written under `jobs/boardroom/`.

## Validation done
- `npm run lint`
- `npm run build`

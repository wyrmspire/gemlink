# Gemlink media backend handoff

## What was broken
- In normal local runtime, `GET /api/media/history` could fall through to the Vite SPA HTML instead of returning JSON, which broke the Library view and made the backend feel inconsistent.
- Media job persistence existed, but manifests were thin/inconsistent and video jobs did not record enough status/log detail to understand what the backend was doing.
- Voice/Video UI still behaved like stubs: it told you to "check later" instead of showing the returned job state, and the Library page did not refresh itself while jobs were pending.
- Server env loading relied on ambient process env; `.env.local` was not explicitly loaded by `server.ts`.

## What was fixed
- Reworked the Express/Vite integration in `server.ts` so `/api/*` is mounted explicitly before the SPA fallback, and Vite now runs in `appType: "custom"` with a manual non-API catch-all. This prevents API GETs from being swallowed by the SPA.
- Added explicit `.env.local` / dotenv loading on server startup.
- Standardized media manifests with:
  - `id`, `type`, `createdAt`, `updatedAt`
  - `status` (`pending` / `completed` / `failed`)
  - `outputs`
  - `logs`
  - `error`
  - `providerOperationName` for video jobs
- Kept all generated assets under stable local folders:
  - `jobs/images/<job-id>/...`
  - `jobs/videos/<job-id>/...`
  - `jobs/voice/<job-id>/...`
  - each with `manifest.json`
- Added background video polling manifest updates so pending jobs accumulate readable status logs and can fail cleanly with an error message.
- Updated the Library page to:
  - fetch backend history with `cache: "no-store"`
  - show status pills and last-log/error info
  - auto-refresh every 10s while any job is pending
- Updated Video Lab and Voice Lab so they show the returned job state immediately instead of only alerting.

## What is now proven
Tested locally against the running app runtime (`npm run dev`):
- `GET /api/health` returns JSON.
- `GET /api/media/history` now returns JSON instead of the SPA HTML.
- `POST /api/media/voice` completed successfully and saved:
  - `jobs/voice/<job-id>/manifest.json`
  - `jobs/voice/<job-id>/output.mp3`
- `POST /api/media/image` completed successfully and saved:
  - `jobs/images/<job-id>/manifest.json`
  - `jobs/images/<job-id>/output_0.png`
- `POST /api/media/video` successfully created a pending backend job, persisted a manifest, and recorded polling logs in `jobs/videos/<job-id>/manifest.json`.

## What still remains rough
- I did **not** wait for a full Veo render to finish end-to-end in this pass, so video completion/download is improved and instrumented but only proven through pending/polling state, not a completed `.mp4` on this run.
- The app still passes API keys from the client when available; server-side env fallback now works, but the broader key-handling model could be tightened later.
- The non-media pages still make some direct provider calls from the browser; this pass focused only on making the media backend/runtime actually work.

## How to run / test
1. Ensure `.env.local` contains a valid `GEMINI_API_KEY`.
2. Start the app:
   ```bash
   npm run dev
   ```
3. Verify runtime routing:
   ```bash
   curl http://localhost:3000/api/health
   curl http://localhost:3000/api/media/history
   ```
4. In the UI:
   - use **Social Media Gen** to create an image
   - use **Voice Lab** to create audio
   - use **Video Lab** to start a video job
   - open **Media Library** and confirm jobs/status/logs update from the backend
5. Generated files/manifests appear under `jobs/`.

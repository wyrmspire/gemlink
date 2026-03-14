# Gemlink

**AI-powered brand workspace** — generate media, run strategy sessions, research markets, and manage brand identity, all from one local-first interface backed by Google Gemini.

---

## What Is Gemlink?

Gemlink is a full-stack TypeScript app that wires Google Gemini into a multi-tool brand workspace. Every AI call is server-side; no API keys are ever exposed to the browser.

### Features

| Page | What it does |
|------|-------------|
| **Dashboard** | Overview and quick access to all tools |
| **Setup** | Configure brand name, description, target audience, and voice (persisted to localStorage) |
| **Social Media** | AI-generated social posts tailored to your brand |
| **Video Lab** | Generate videos with Veo and analyze existing video content — background job polling |
| **Voice Lab** | Text-to-speech with Gemini TTS; live audio sessions via Gemini Live API |
| **The Boardroom** | Multi-seat AI strategy sessions with a 5-phase protocol (opening brief → first-pass → challenge → refinement → convergence); async, fully replayable, with per-phase filtering |
| **R&D Lab** | Grounded web search and deep strategic thinking powered by Gemini |
| **Sales Agent** | Twilio SMS webhook powered by Gemini |
| **Media Library** | Browse all generated images, videos, and voice assets with auto-refresh |

---

## Architecture

```
Browser (React + Vite)
    │
    │  fetch() calls only — no Gemini keys in the client
    ▼
Express server (server.ts)
    ├── /api/media/*          Image, video, voice generation + job status
    ├── /api/boardroom/*      Session create (async), list, read
    ├── /api/research/*       Web search + deep thinking
    ├── /api/twilio/sms       SMS webhook handler
    └── /jobs/**              Static file serving for generated assets
    │
    ▼
boardroom.ts                  Boardroom orchestration engine
jobs/                         Local JSON manifests + media files (gitignored)
```

**Key design decisions:**
- All Gemini calls run server-side via `server.ts` — the `GEMINI_API_KEY` never reaches the browser
- Long-running operations (video generation, boardroom sessions) fire as background jobs and are polled from the client
- Brand context is persisted to `localStorage` so settings survive page refreshes
- Session data (boardroom, media) is stored as JSON files in `jobs/` — no database required

---

## Local Development

**Prerequisites:** Node.js 18+

### 1. Install dependencies

```bash
npm install
```

### 2. Configure your API key

Copy the example env file and fill in your Gemini API key:

```bash
cp .env.example .env.local
# then edit .env.local:
# GEMINI_API_KEY="your-key-here"
```

### 3. Start the dev server

```bash
npm run dev
```

Opens at [http://localhost:3000](http://localhost:3000). The Express server serves both the API and the Vite dev middleware in one process.

---

## Production Build

```bash
npm run build              # Compile frontend to dist/
NODE_ENV=production npm start   # Serve dist/ + API from Express
```

---

## Testing

```bash
npm test          # Run all tests once (Vitest)
npm run test:watch        # Watch mode
npm run test:coverage     # Coverage report
```

Test files live in `tests/api/`. The suite covers health, media history, job status validation, boardroom session endpoints (including no-cache header assertions), and input validation for research and video-analyze routes.

---

## Scripts Reference

| Script | Purpose |
|--------|---------|
| `npm run dev` | Dev server with hot reload (tsx + Vite middleware) |
| `npm start` | Production server (requires `npm run build` first) |
| `npm run build` | Vite production build → `dist/` |
| `npm run lint` | TypeScript type check (`tsc --noEmit`) |
| `npm test` | Run test suite |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:coverage` | Coverage report |

---

## Project Structure

```
gemlink/
├── server.ts          Express API server + Vite dev middleware
├── boardroom.ts       Boardroom session orchestration engine
├── src/
│   ├── App.tsx        Route definitions
│   ├── components/    Layout, ApiKeyGuard, ErrorBoundary
│   ├── context/       BrandContext (localStorage-persisted)
│   └── pages/         One file per workspace tool
├── tests/
│   └── api/           Vitest + supertest integration tests
├── docs/
│   ├── archive/       Past HANDOFF notes (historical reference)
│   └── decisions/     ADRs for A5 (SQLite) and B2 (Twilio brand context)
├── jobs/              Runtime job data (gitignored)
└── dist/              Production build output (gitignored)
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | ✅ | Google Gemini API key — server-side only |
| `APP_URL` | Optional | Public URL of the deployed app |
| `PORT` | Optional | Server port (default: `3000`) |

---

## Known Limitations

- **VoiceLab live sessions** open a Gemini Live WebSocket directly from the browser (the only remaining client-side key exposure). Proxying real-time bidirectional audio adds latency; a design decision is pending in `docs/decisions/`.
- `better-sqlite3` is listed as a dependency but currently unused. See `docs/decisions/A5-better-sqlite3.md`.

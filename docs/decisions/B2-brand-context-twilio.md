# Decision Note: B2 — Wire BrandContext into Twilio SMS Endpoint

> Status: **Options captured — awaiting decision**
> Author: Lane 5 | Date: 2026-03-13
> Depends on: **B1** (BrandContext persistence)

## Context

The `/api/twilio/sms` endpoint in `server.ts` (line 436) currently uses a hardcoded prompt:

```typescript
contents: `You are a helpful sales agent for our brand. The user says: "${Body}". Reply concisely via SMS.`
```

The `SalesAgent.tsx` UI displays brand context (brand name, description, audience, voice) but the server never receives or uses this data. The Twilio webhook is called externally by Twilio — it doesn't come from the frontend, so the brand context can't be passed per-request from the React app.

### Current Brand Context Shape

```typescript
interface BrandContextType {
  brandName: string;        // default: "FutureTech AI"
  brandDescription: string; // default: "A forward-thinking AI automation agency."
  targetAudience: string;   // default: "Small to medium businesses looking to scale with AI."
  brandVoice: string;       // default: "Professional, innovative, and approachable."
}
```

## The Core Problem

Twilio webhooks are **external inbound requests** — Twilio calls our `/api/twilio/sms` endpoint when an SMS arrives. The React frontend is not involved in this flow at all. So brand context must be **available server-side** at the time the webhook fires.

## Option A: Server-Side Brand Config File (Recommended)

**Action**: Create a `brand-config.json` file (in `jobs/` or project root), exposed via:
- `GET /api/brand` — read current brand config
- `PUT /api/brand` — update brand config from the Settings UI

The Twilio handler reads this file on each incoming SMS.

**Pros**:
- Brand context is always available server-side — works with Twilio webhooks
- Simple — no database needed
- The Settings page (or BrandContext) can push updates via `PUT /api/brand`
- Works alongside B1 (localStorage syncs the UI; server file provides the canonical data)

**Cons**:
- Two sources of truth (localStorage + server file) unless we make the server the primary
- Need to handle the case where the file doesn't exist yet (fall back to defaults)

**Effort**: ~1 hour for the endpoint + Twilio integration; ~30 min for UI wiring.

**Changes required**:
- `server.ts` (Lane 5 section): add `GET/PUT /api/brand`, update Twilio handler
- `src/context/BrandContext.tsx` (Lane 3): optionally sync with server on load/save

## Option B: Per-Session Config via Twilio Cookie/State

**Action**: Use Twilio's session state capability to attach brand context when a conversation starts, then the webhook reads it on subsequent messages.

**Pros**:
- No server-side storage needed

**Cons**:
- Complex — requires understanding Twilio session cookies
- Brand context could diverge if the user updates settings mid-conversation
- Only works if there's a frontend-initiated start to the SMS conversation

**Effort**: 3–5 hours.

## Option C: SQLite-backed Brand Config

**Action**: Store brand config in SQLite (ties into A5 Option C).

**Pros**:
- Clean server-side persistence with structured access
- Could accommodate multi-user later

**Cons**:
- Requires keeping `better-sqlite3` (contradicts A5 recommendation)
- More infrastructure for a simple key-value config

**Effort**: 2–3 hours.

## Recommendation

**Go with Option A.** A simple JSON file for brand config is the most pragmatic approach:

1. **B1 lands first** (Lane 3 persists BrandContext to localStorage)
2. **Lane 5 adds** `GET/PUT /api/brand` endpoints backed by `brand-config.json`
3. **Lane 5 updates** the Twilio handler to read brand config from this file
4. **Lane 3 optionally wires** the Settings page to sync with the server endpoint

This keeps things simple, file-backed (consistent with the rest of the persistence model), and gives the Twilio webhook access to real brand data.

## Decision Required From

- **Lane 3** (owns BrandContext) — needs to coordinate on the sync approach
- **Lane 5** (owns Twilio endpoint) — would implement the server-side piece
- Blocked on **B1** completing first

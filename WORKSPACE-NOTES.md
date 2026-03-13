# Gemlink workspace notes

Local orientation note for the imported `gemlink/` project.

## What this folder is

- An imported Gemini / AI Studio-style app workspace
- Likely to have upstream-looking docs that describe how the app was originally scaffolded
- A place where local workspace notes can live without overwriting the upstream-flavored `README.md`

## Safe maintenance guidance

- Prefer documenting local context here instead of editing generated scaffolding notes unless the change is clearly helpful
- Treat `.env.local` and any real credentials as sensitive local state
- Keep unattended upkeep focused on docs, notes, and clearly safe organization
- Avoid large project reshuffles during workspace sweeps

## Handy orientation

- `README.md` explains the basic AI Studio local run flow
- `AGENTS.md` captures the app's internal agent/role concepts
- Root workspace `README.md` explains how `gemlink/` fits into the broader OpenClaw workspace

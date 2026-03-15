#!/usr/bin/env bash
# scripts/ci.sh — Gemlink CI pipeline
#
# Runs the full verification pipeline in sequence:
#   1. Lint (tsc --noEmit)
#   2. Test (vitest run)
#   3. Build (vite build)
#
# Fails fast on the first error (set -e).
# Usage:
#   bash scripts/ci.sh
#   npm run ci

set -euo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
RESET='\033[0m'

log_step() {
  echo -e "\n${BOLD}${YELLOW}▶ $1${RESET}"
}

log_ok() {
  echo -e "${GREEN}✓ $1${RESET}"
}

log_fail() {
  echo -e "${RED}✗ $1${RESET}"
}

# ── Step 1: Lint ───────────────────────────────────────────────────────────────
log_step "Step 1/3 — Lint (tsc --noEmit)"
if npm run lint; then
  log_ok "Lint passed"
else
  log_fail "Lint failed — aborting CI"
  exit 1
fi

# ── Step 2: Test ───────────────────────────────────────────────────────────────
log_step "Step 2/3 — Test (vitest run)"
if npm test; then
  log_ok "All tests passed"
else
  log_fail "Tests failed — aborting CI"
  exit 1
fi

# ── Step 3: Build ──────────────────────────────────────────────────────────────
log_step "Step 3/3 — Build (vite build)"
if npm run build; then
  log_ok "Build succeeded"
else
  log_fail "Build failed — aborting CI"
  exit 1
fi

echo -e "\n${GREEN}${BOLD}✅ CI pipeline passed — lint + test + build all green${RESET}\n"

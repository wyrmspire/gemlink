#!/usr/bin/env bash
# scripts/ci.sh — Gemlink CI pipeline
#
# Runs the full verification pipeline in sequence:
#   0. FFmpeg check (informational — compose tests may be skipped if unavailable)
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
CYAN='\033[0;36m'
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

log_info() {
  echo -e "${CYAN}ℹ $1${RESET}"
}

# ── Step 0: FFmpeg check (informational — does NOT fail CI) ────────────────────
log_step "Step 0/3 — FFmpeg availability check"
if which ffmpeg > /dev/null 2>&1; then
  FFMPEG_VERSION=$(ffmpeg -version 2>&1 | head -1 | grep -o 'version [^ ]*' || echo "unknown")
  log_ok "FFmpeg available (${FFMPEG_VERSION})"
  FFMPEG_OK=true
else
  echo -e "${YELLOW}⚠ FFmpeg not installed — compose tests may be limited${RESET}"
  echo -e "${YELLOW}  To install: sudo apt install ffmpeg${RESET}"
  FFMPEG_OK=false
fi

if [ "$FFMPEG_OK" = true ] && which ffprobe > /dev/null 2>&1; then
  log_ok "ffprobe available"
else
  [ "$FFMPEG_OK" = false ] || echo -e "${YELLOW}⚠ ffprobe not available${RESET}"
fi

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
  # Check for >500KB chunk warnings in build output
  if npm run build 2>&1 | grep -q "chunk.*500"; then
    echo -e "${YELLOW}⚠ Large chunk detected — consider code splitting${RESET}"
  fi
else
  log_fail "Build failed — aborting CI"
  exit 1
fi

echo -e "\n${GREEN}${BOLD}✅ CI pipeline passed — lint + test + build all green${RESET}\n"

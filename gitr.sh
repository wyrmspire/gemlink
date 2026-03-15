#!/bin/bash
# gitr.sh - Commit everything and push to remote
msg="${1:-Music Generation support}"
git add .
git commit -m "$msg"
git push origin $(git rev-parse --abbrev-ref HEAD)

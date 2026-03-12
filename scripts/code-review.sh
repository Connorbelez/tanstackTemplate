#!/usr/bin/env bash
set -euo pipefail

REVIEW_DIR="reviews"
BRANCH=$(git rev-parse --abbrev-ref HEAD)
COMMIT=$(git rev-parse --short HEAD)
SAFE_BRANCH=$(echo "$BRANCH" | tr '/' '-')

mkdir -p "$REVIEW_DIR/$SAFE_BRANCH"

OUTFILE="$REVIEW_DIR/$SAFE_BRANCH/$COMMIT.md"

echo "Running coderabbit review..."
echo "Branch: $BRANCH"
echo "Commit: $COMMIT"
echo "Output: $OUTFILE"

coderabbit review --plain -t committed 2>&1 | tee "$OUTFILE"

echo ""
echo "Review saved to $OUTFILE"

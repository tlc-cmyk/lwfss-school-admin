#!/usr/bin/env bash
# Rebuild vendored ascii-sharks IIFE for GitHub Pages (run from repo root).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
npx --yes esbuild "$ROOT/docs/vendor/ascii-sharks/browser-entry.ts" \
  --bundle --format=iife --global-name=AsciiSharks \
  --outfile="$ROOT/docs/js/vendor/ascii-sharks.js" \
  --target=es2018 --minify
echo "Wrote docs/js/vendor/ascii-sharks.js"

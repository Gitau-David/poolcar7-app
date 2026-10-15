#!/usr/bin/env bash
# Runs the API + logic tests against an in-memory Supabase mock (no database or network needed).
# Usage, from the project root:  bash tests/run.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
cp -r "$ROOT/lib" "$ROOT/app" "$ROOT/components" "$TMP/"
cp "$ROOT/tests/mock-supabase.ts" "$TMP/lib/supabase.ts"
cp "$ROOT/tests/api.test.tsx" "$TMP/"
sed 's/"jsx": "preserve"/"jsx": "react-jsx"/' "$ROOT/tsconfig.json" > "$TMP/tsconfig.json"
ln -s "$ROOT/node_modules" "$TMP/node_modules"
cd "$TMP" && npx --yes tsx --tsconfig tsconfig.json api.test.tsx

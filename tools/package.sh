#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="$ROOT/dist"

mkdir -p "$DIST"
cd "$ROOT"

gnome-extensions pack --force --out-dir "$DIST" .

echo "Package written to: $DIST"

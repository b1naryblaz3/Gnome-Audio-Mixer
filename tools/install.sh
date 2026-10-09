#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXTENSION_UUID="app-volume-panel-v4@appvol.local"
EXTENSION_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$EXTENSION_UUID"
STAGING_DIR="$(mktemp -d)"
trap 'rm -rf "$STAGING_DIR"' EXIT

command -v glib-compile-schemas >/dev/null || {
    echo "glib-compile-schemas is required (glib2 on Arch/CachyOS)." >&2
    exit 1
}
mkdir -p "$STAGING_DIR/schemas"
for source_file in extension.js audio.js outputs.js ui.js stylesheet.css metadata.json; do
    cp "$PROJECT_ROOT/$source_file" "$STAGING_DIR/$source_file"
done
cp "$PROJECT_ROOT"/schemas/*.gschema.xml "$STAGING_DIR/schemas/"
glib-compile-schemas --strict "$STAGING_DIR/schemas"

gnome-extensions disable "$EXTENSION_UUID" 2>/dev/null || true
mkdir -p "$EXTENSION_DIR/schemas"
cp "$STAGING_DIR"/*.js "$STAGING_DIR/stylesheet.css" "$STAGING_DIR/metadata.json" "$EXTENSION_DIR/"
cp "$STAGING_DIR"/schemas/* "$EXTENSION_DIR/schemas/"
gnome-extensions enable "$EXTENSION_UUID" 2>/dev/null || true
echo "Installed App Volume Panel Mixer. Log out and back in to reload GNOME Shell."
echo "Then choose outputs under Preset 1 and Preset 2."

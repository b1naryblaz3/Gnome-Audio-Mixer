#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="$PROJECT_ROOT/dist"
STAGING_DIR="$(mktemp -d)"
trap 'rm -rf "$STAGING_DIR"' EXIT

mkdir -p "$DIST"
mkdir -p "$STAGING_DIR/schemas"
for source_file in extension.js audio.js outputs.js ui.js stylesheet.css metadata.json LICENSE; do
    cp "$PROJECT_ROOT/$source_file" "$STAGING_DIR/$source_file"
done
cp "$PROJECT_ROOT"/schemas/*.gschema.xml "$STAGING_DIR/schemas/"
glib-compile-schemas --strict "$STAGING_DIR/schemas"

python3 - "$STAGING_DIR" "$DIST" <<'PY'
from pathlib import Path
import json
import sys
import zipfile

stage = Path(sys.argv[1])
dist = Path(sys.argv[2])
metadata = json.loads((stage / 'metadata.json').read_text())
output = dist / f"{metadata['uuid']}.zip"
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(stage.rglob('*')):
        if path.is_file():
            archive.write(path, path.relative_to(stage))
with zipfile.ZipFile(output) as archive:
    if archive.testzip() is not None:
        raise SystemExit('Package integrity check failed')
    if 'schemas/gschemas.compiled' not in archive.namelist():
        raise SystemExit('Compiled settings schema is missing')
print(f'Package written to: {output}')
PY

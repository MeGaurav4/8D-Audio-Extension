#!/usr/bin/env bash
# Makes a zip you can load in chrome://extensions (unzip, then Load unpacked) or upload to the Web Store.
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=$(node -p "require('./manifest.json').version")
mkdir -p build
OUT="build/8d-audio-converter-v${VERSION}.zip"
rm -f "$OUT"
zip -qr "$OUT" manifest.json background.js engine.js content.js popup.html popup.js images
echo "Built $OUT"

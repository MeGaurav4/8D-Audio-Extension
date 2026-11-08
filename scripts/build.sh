#!/usr/bin/env bash
# Builds two zips into build/:
#   8d-audio-converter-v<ver>-chrome.zip   Chrome / Edge / Brave (unzip, Load unpacked; or Web Store upload)
#   8d-audio-converter-v<ver>-firefox.zip  Firefox 128+ (about:debugging -> Load Temporary Add-on; or AMO upload)
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=$(node -p "require('./manifest.json').version")
FILES=(background.js engine.js content.js popup.html popup.js converter.html converter.js wav.js images)
mkdir -p build
rm -rf build/tmp && mkdir -p build/tmp/chrome build/tmp/firefox

cp -r "${FILES[@]}" manifest.json build/tmp/chrome/
cp -r "${FILES[@]}" build/tmp/firefox/
node -e '
const m = require("./manifest.json");
m.background = { scripts: ["background.js"] };
m.browser_specific_settings = { gecko: { id: "8d-audio-converter@megaurav4", strict_min_version: "128.0" } };
require("fs").writeFileSync("build/tmp/firefox/manifest.json", JSON.stringify(m, null, 2));
'
for t in chrome firefox; do
  OUT="$PWD/build/8d-audio-converter-v${VERSION}-${t}.zip"
  rm -f "$OUT"
  (cd build/tmp/$t && zip -qr "$OUT" .)
  echo "Built build/$(basename "$OUT")"
done
rm -rf build/tmp

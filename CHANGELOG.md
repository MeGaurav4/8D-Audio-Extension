# Changelog

## v1.1.0
Same extension, same buttons and sliders, just working properly.

**Fixed**
- Rotation no longer stutters or freezes when YouTube is in a background tab (motion now runs on the audio thread instead of a timer).
- No more clicks or zipper noise while the sound moves.
- "Effect Intensity" no longer just turns the volume down; it now sets how strongly the sound circles you, at steady loudness.
- Turning 8D off now gives back the original sound (true bypass).
- Content script was being injected twice; that could throw errors after YouTube navigation.
- Removed a call to a missing function (`logAudioState`) and a missing popup icon that threw errors.
- Removed a click handler that could never fire.
- Saved settings are no longer reset when the extension updates.
- Tabs opened before installing no longer need a refresh; the popup connects to them on its own.
- Slider changes are batched so Chrome's storage write limit is never hit.

**New (small)**
- Popup shows the rotation speed as seconds per lap.
- Toggle button shows when 8D is on.

**Repo**
- Removed committed build output (`dist/`, `dist (2)/`, `dist.zip`) and duplicate icons.
- Dropped webpack; the extension now loads straight from the repo folder.
- `npm run build` makes a ready-to-load zip; `npm test` checks the audio effect offline.
- Added `.gitignore`; package license now matches MIT.

## v1.0
First release.

# Changelog

## v2.1.0
Same sound, same buttons. Classic 8D and every other preset render bit-for-bit identical to v2.0.0.

**Fixed**
- The toolbar badge could keep saying "8D" after you reloaded the page, even though 8D was off. The page now reports its real state, so the badge is always right.
- Double-clicking the on/off button could fire two switches. Clicks while it is switching are ignored.
- The highlighted preset could disagree with your settings. It is now worked out from the settings themselves, so it's always true (move a slider back and the preset lights up again).
- A slider change made just before ticking "Remember settings for this site" could be saved to the wrong place.
- If the page stopped answering, a checkbox could stay ticked even though nothing was saved. It now snaps back and the popup says so.
- File converter: adding files while a batch was converting could start a second run and convert the same file twice.

**Better**
- The popup shows clear states: Connecting…, Turning on…, Turning off…, Waiting for permission…, and a Try again button when the page can't be reached (no more reopening the popup).
- Converter button shows Converting… while it works; files you add mid-run join the run.

**Dev**
- New `machines.js`: every mode (power, auto-start, settings scope, popup, converter file and batch) is an explicit state machine with allowed transitions in one place.
- New `AGENTS.md`: a map of each machine, its events and its files, for anyone (or any coding tool) changing the code.
- 39 automated tests, including new state-machine and popup checks.

## v2.0.0
Your v1 sound is still the default: it's the **Classic 8D** preset.

**New**
- **Presets:** Classic 8D, Slow orbit, Fast spin, Concert hall, Lo-fi room, Halo, Ping-pong.
- **Reverb**, the missing ingredient of real 8D songs.
- **Movement patterns:** Circle, Figure 8, Side to side, Halo (rises and falls), Wander.
- **Equalizer:** bass, mid, treble (±12 dB).
- **Beat sync:** lock a lap to the song's BPM (4/8/16/32 beats per lap), with tap tempo.
- **Live visualizer:** a dot shows where the sound is around your head.
- **Any site:** turn 8D on for any site from the popup (Spotify-style DRM sites are detected and refused instead of going silent).
- **Per-site memory:** remember settings for one site, and auto-start 8D there.
- **Keyboard shortcut:** Alt+Shift+8 toggles 8D (change it at chrome://extensions/shortcuts). Icon badge shows when it's on.
- **File converter:** drop songs in, get 8D WAV files back. Runs fully offline in the browser, batch friendly, with preview.
- **Firefox build** (Firefox 128+).
- Moving sound now comes back to roughly the original loudness, with a soft limiter to stop clipping.

**Kept**
- Same toggle, Edit Controls, intensity and speed sliders, Reset to Defaults.
- Saved v1/v1.1 settings carry over.

**Dev**
- 21 automated tests (`npm test`): offline audio renders for every pattern, reverb, EQ, WAV export, and the page script's message flow.
- `npm run build` makes Chrome and Firefox zips.

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

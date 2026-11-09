# 8D Audio Converter
> Turn YouTube, YouTube Music, or any site into immersive 8D audio. Or convert your own songs to 8D files.

```
╔══════════════════════════════════════════════╗
║   🎧 8D Audio · YouTube · Any site · Files  🎧 ║
║      spatial · smooth · immersive            ║
╚══════════════════════════════════════════════╝
```

## Overview
A browser extension that processes audio in real time with the Web Audio API's HRTF panner, driven by audio-thread oscillators, so the sound glides smoothly around your head, even in a background tab. Everything runs locally: no servers, no accounts, free.

## Features
- **One-tap 8D** on YouTube and YouTube Music, with a clean off switch (off = the original sound)
- **Presets:** Classic 8D (the original sound), Slow orbit, Fast spin, Concert hall, Lo-fi room, Halo, Ping-pong
- **Movement patterns:** Circle, Figure 8, Side to side, Halo, Wander
- **Reverb** and a **3-band EQ**
- **Beat sync** with BPM input and tap tempo
- **Live visualizer** of where the sound is
- **Any site:** switch it on per site from the popup
- **Per-site memory** and **auto-start**
- **Keyboard shortcut:** `Alt+Shift+8`
- **File converter:** drop songs in, download 8D WAVs, fully offline
- Chrome, Edge, Brave and Firefox 128+

## Tech Stack
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black) ![WebAudio](https://img.shields.io/badge/Web_Audio_API-000000?style=flat-square) ![Chrome](https://img.shields.io/badge/Chrome_Extension-4285F4?style=flat-square&logo=google-chrome&logoColor=white) ![Firefox](https://img.shields.io/badge/Firefox-FF7139?style=flat-square&logo=firefox-browser&logoColor=white) ![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

## Installation
**Chrome / Edge / Brave**
1. Download the repo (Code → Download ZIP, or a release's Source code) and unzip
2. Open `chrome://extensions` and turn on Developer mode
3. Click **Load unpacked** and pick the folder

**Firefox**
1. Run `npm run build` (or grab the firefox zip if you built one)
2. Open `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → pick the firefox zip

## Usage
- Open a YouTube video, click the extension icon, hit **Enable 8D Audio**
- Pick a preset, or open **Edit Controls** to fine-tune
- On another site, click **Use 8D on this site** once
- **Convert a song file to 8D** opens the converter page
- Headphones make all the difference

## Project layout
| File | What it does |
|---|---|
| `engine.js` | The 8D audio graph (shared by page, converter and tests) |
| `machines.js` | Every mode the extension can be in, as explicit state machines (see `AGENTS.md`) |
| `content.js` | Hooks the page's player to the engine, stores settings |
| `popup.html/js` | Controls, presets, visualizer |
| `background.js` | Shortcut, per-site scripts, first-run setup |
| `converter.html/js`, `wav.js` | Offline file converter + WAV export |
| `tests/` | `npm test` (uses the free `node-web-audio-api`) |

## Development
```bash
npm install
npm test        # offline audio renders, state machines, page script + popup checks
npm run build   # build/…-chrome.zip and build/…-firefox.zip
```

Working on the code? Read `AGENTS.md` first: it maps every state machine, its events and the rules that keep the sound unchanged.

## License
MIT

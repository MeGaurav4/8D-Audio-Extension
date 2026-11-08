# 8D Audio Extension
> Transform YouTube into an immersive 8D audio experience

```
╔══════════════════════════════════════════════╗
║   🎧 8D Audio · YouTube · YouTube Music     🎧 ║
║      spatial · smooth · immersive           ║
╚══════════════════════════════════════════════╝
```

## Overview
A Chrome extension that processes YouTube and YouTube Music audio in real time using the Web Audio API's HRTF PannerNode, driven by audio-thread oscillators, creating a smooth rotating 8D effect that makes listeners feel the sound moving around them.

## Features
- Real-time spatial audio on any YouTube video and on YouTube Music
- Perfectly smooth rotation, even in a background tab
- Adjustable intensity and rotation speed (shown as seconds per lap), steady volume
- Clean on/off: off means the original sound
- Lightweight, no external services, all client-side

## Tech Stack
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black) ![WebAudio](https://img.shields.io/badge/Web_Audio_API-000000?style=flat-square) ![Chrome](https://img.shields.io/badge/Chrome_Extension-4285F4?style=flat-square&logo=google-chrome&logoColor=white) ![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

## Installation
1. Clone this repo
2. Open Chrome → `chrome://extensions`
3. Enable "Developer mode"
4. Click "Load unpacked" → select this repo folder

## Development
- `npm install` then `npm test` renders audio offline and checks the effect (uses the free `node-web-audio-api`)
- `npm run build` makes `build/8d-audio-converter-v<version>.zip`

## Usage
- Open any YouTube video
- Click the extension icon
- Toggle 8D audio on
- Adjust speed/intensity to taste

## License
MIT
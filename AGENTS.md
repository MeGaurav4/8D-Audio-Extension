# AGENTS.md

Notes for anyone, human or coding tool, changing this extension.

## Hard rules
- **The sound must not change.** Classic 8D is the original v1 sound and the default. Any change to `engine.js` must keep every preset's offline render identical (compare renders before and after; `npm test` must pass).
- **Don't remove working behavior:** toggle, intensity and speed sliders on YouTube and YouTube Music, old v1 messages (`setIntensity`, `setRotationSpeed`, `getIntensity`), old saved settings.
- Free tools only. No build step: plain browser JavaScript, loaded by `<script>` tags and the manifest.
- New script files must be added everywhere scripts are listed: `manifest.json` (content_scripts), `background.js` (`FILES`), `popup.js` (`getStateOrInject`), `popup.html` / `converter.html`, `scripts/build.sh` (`FILES`), and the test loaders.

## Map
| File | Owns |
|---|---|
| `engine.js` | Audio graph, presets, patterns, `presetFor()`. No DOM. |
| `machines.js` | All state machine definitions + `createMachine()`. No DOM, no audio. |
| `content.js` | POWER, AUTOSTART, SCOPE machines; settings; storage; media attach. |
| `popup.js` | POPUP machine; renders the popup from it. |
| `background.js` | Badge (driven by `powerChanged` from the page), shortcut, per-site script registration. |
| `converter.js` | FILE (one per file) and BATCH machines. |

## How the machines work
`createMachine(DEFS.X)` returns `{ state, send(event), can(event), is(...states), onChange(fn) }`.
`send()` only follows a transition the current state allows; anything else returns `false` and changes nothing. Never keep a separate boolean for something a machine already tracks: ask the machine (`power.is('on')`).

### POWER (content.js): is 8D on in this page?
| State | Meaning |
|---|---|
| `detached` | No audio graph yet. Page audio untouched. |
| `off` | Graph built, bypassed (sound passes through unchanged). |
| `on` | 8D effect playing. |

`detached --ATTACHED--> off --ENABLE--> on --DISABLE--> off`

The `onChange` handler is the only place that calls `engine.setEnabled()` and sends `powerChanged` to the background (badge). A fresh page sends `powerChanged:false` once to clear a stale badge.

### AUTOSTART (content.js): "Turn on automatically on this site"
`idle --ARM--> armed --FIRE--> fired`, `armed --DISARM--> idle`. `fired` is final for the page load, so auto-start never fights a user who turned 8D off. The saved preference itself is the `autoStart` boolean in storage.

### SCOPE (content.js): where settings are saved
`global` (chrome.storage.sync, top-level keys, v1 compatible) `--USE_SITE--> site` (chrome.storage.local `site:<host>`) `--USE_GLOBAL--> global`. Pending batched saves are flushed before switching, so a change lands in the scope it was made in.

### Preset (derived, not a machine)
The active preset is never stored as truth. `presetFor(settings)` returns the preset whose values all match (and beat sync off), else `''` (custom). `preset` is still written to storage only for older readers.

### POPUP (popup.js): what the popup shows
| State | Button | Live controls | "Use 8D on this site" |
|---|---|---|---|
| `loading` | Connecting… (disabled) | hidden | hidden |
| `unsupported` | Not available on this page (disabled) | hidden | hidden |
| `needsPermission` | Not on this site yet (disabled) | hidden | shown |
| `requestingPermission` | Waiting for permission… (disabled) | hidden | shown, disabled |
| `off` | Enable 8D Audio | shown | hidden |
| `turningOn` | Turning on… (disabled) | shown | hidden |
| `on` | Disable 8D Audio | shown | hidden |
| `turningOff` | Turning off… (disabled) | shown | hidden |
| `failed` | Try again | hidden | hidden |

Transitions: `loading --UNSUPPORTED|NEEDS_PERMISSION|READY_OFF|READY_ON|FAIL-->`; `needsPermission --REQUEST--> requestingPermission --GRANTED--> loading | --DENIED--> needsPermission`; `off --TOGGLE--> turningOn --TURNED_ON--> on | --REFUSED--> off`; `on --TOGGLE--> turningOff --TURNED_OFF--> off`; `off|on|turningOn|turningOff --LOST--> failed --RETRY--> loading`.
The table lives in `VIEW` inside `popup.js`; `renderView()` is the only function that touches those elements. The toggle sends `setEnabled` with the target value, so a repeated message can't flip it twice.

### FILE and BATCH (converter.js)
FILE: `queued --START--> reading --DECODED--> rendering --FINISHED--> done`, `reading|rendering --FAIL--> failed`. `done` and `failed` are final.
BATCH: `idle --START--> running --FINISHED--> idle`. The run keeps taking the next `queued` file, so files added mid-run are included; the button stays disabled while `running`.

## Messages (popup/background -> page)
`toggle`, `setEnabled {value}`, `getState`, `getPosition`, `set {patch}`, `setPerSite {value}`, `setAutoStart {value}`, plus v1 `setIntensity`, `setRotationSpeed`, `getIntensity`.
Page -> background: `powerChanged {enabled}`. Popup -> background: `siteEnabled {tabId}`.

## Checks
```bash
npm install
npm test        # engine renders, machines, content script flow, popup states
npm run build   # build/…-chrome.zip (unzips to a folder) and build/…-firefox.zip
```
To add a mode: add its definition to `DEFS` in `machines.js` (the test checks every target exists and every state is reachable), drive it with `send()`, react in `onChange`, and document it here.

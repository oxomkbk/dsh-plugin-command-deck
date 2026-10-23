# Third-party components

The plugin's own code (`lib/`) has a single runtime dependency. Everything else listed here ships inside `deck/`, the Command Deck web app.

| Component | Version | Use | License | Origin |
|---|---|---|---|---|
| @deepseek-ai/schemastery | ~3.18.5 | settings schema for the console (DSH's own schema library) | MIT | npm |
| three.js | r169 (0.169.0) | WebGL orbital scene and post-processing add-ons (`deck/vendor/three/`) | MIT (`deck/vendor/three/LICENSE`) | npm / jsDelivr |
| world-atlas (Natural Earth 110 m land) | 2.0.2 | land outline for the globe (`deck/vendor/geo/land-110m.json`) | ISC (`deck/vendor/geo/LICENSE-world-atlas`); Natural Earth data is public domain | npm |
| @localmode/core | 2.5.0 | hand-tracker helper (`deck/vendor/localmode/core.js`) | MIT (`deck/vendor/localmode/LICENSE-core`) | npm |
| @mediapipe/tasks-vision | 0.10.35 | on-device hand landmark inference (bundle + WASM, `deck/vendor/mediapipe/`) | Apache-2.0 (`deck/vendor/mediapipe/LICENSE`) | npm |
| Hand Landmarker model (float16 v1) | 1 | on-device hand model | Apache-2.0 | storage.googleapis.com/mediapipe-models |
| Orbitron, Rajdhani, Share Tech Mono, JetBrains Mono | Fontsource 5.1.0 | deck and skin typefaces | SIL OFL 1.1 (`deck/vendor/fonts/LICENSE-*`) | npm `@fontsource/*` |
| Audiowide, Chakra Petch, Exo 2, Michroma, Oxanium, Syncopate, Tektur, VT323 | Google Fonts (2026-10) | theme typefaces | SIL OFL 1.1 (`deck/vendor/fonts/LICENSE-theme-fonts.txt`) | fonts.google.com |

The first-screen sample (`deck/assets/sample/`) replays a recorded run; its images are NASA/JPL-Caltech photographs of the Cassini mission (public domain, via Wikimedia Commons), stored as 500 px thumbnails.

The shaders, HUD, boot sequence and skins are original work for this project. The look is inspired by *The Matrix*, *Iron Man* (Jarvis) and *The Wandering Earth*; no assets from those films are used. Sound effects are synthesised at runtime with WebAudio, so no audio files ship.

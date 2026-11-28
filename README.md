# Snakebyte

A pixel-art snake game built with React, TypeScript, Vite, and Canvas 2D. Artwork and fonts are self-hosted, sound is synthesized with Web Audio, and the game is fully playable offline. There are no accounts, ads, tracking, or external network requests. Dark mode is the default and a persistent warm light theme is available from the header. A persistent leaderboard is stored locally on the device.

## Play

```sh
npm install
npm run dev
```

Choose Easy, Medium, or Hard, then press **Start game**. You begin with seven segments and the first apple is two ticks ahead. Each apple grows the snake. The fruit is drawn oversized for readability while its hitbox stays one grid cell. A wall **or body** hit costs one or more fragments and grants a brief grace period with a shield and countdown. The snake can recover until it reaches its minimum safe length; a collision below that threshold ends the run. Every fifth apple is golden and earns triple points. The snake renders with bold outlined segments and a larger head, and the pace rises every four apples.

| Control            | Action                              |
| ------------------ | ----------------------------------- |
| Arrow keys or WASD | Steer                               |
| Swipe              | Touch steering                      |
| Space              | Start, pause, resume, or play again |
| P / Escape         | Pause or resume                     |
| R                  | Immediately restart                 |
| H                  | Open the local leaderboard          |
| G                  | Open the game rules                 |
| C                  | Cycle snake colors                  |
| ?                  | Open the field manual               |
| Theme              | Toggle dark or light mode           |

Easy, Medium, and Hard award 10, 20, and 30 points per regular apple. Base ticks are 148 ms, 106 ms, and 76 ms; the tick interval continues to shrink every four apples down to 35% of that base interval (floored at 28 ms). The run guide shows the live pace. Two buffered turns allow precise cornering without accidental reversals.

Completed runs are saved automatically to a local leaderboard on this device, with difficulty and Classic/Custom rule-set filters, custom-rule summaries, reserved Classic personal-best slots, timestamps, and a guarded clear action. The cabinet shows the top five, a private personal best, and a golden-apple progress guide. It remembers the selected difficulty and sound setting. There is no score sharing or network leaderboard; if storage is unavailable or embedded in a frame, the game still works for the current session.

## Security

Snakebyte is local-only, so there is no shared score trust boundary to defend. The remaining surface is hardened:

- strict CSP with no third-party network access, frames, objects, workers, or media;
- Trusted Types, no inline event handlers, and no dangerous HTML sinks;
- validated and bounded local score records and hex-only snake colors;
- COOP/CORP/COEP, HSTS, clickjacking, nosniff, referrer, permissions, and exact SHA-256 CSP script hashes generated into `dist/_headers` during build;
- a runtime application firewall that denies outbound browser APIs and foreign storage keys;
- a deployable host firewall / WAF baseline in `firewall/nginx.conf`;
- only React and React DOM in production dependencies;
- a static release auditor, dependency audit, CodeQL, Dependabot, and a CI security gate.

Run the release gate:

```sh
npm run verify
npm audit --omit=dev --audit-level=low
npm run test:e2e
```

The full threat model, deployment checklist, and honest residual risks are in `SECURITY.md`. A browser game cannot protect against a person editing their own local JavaScript or storage; because scores are private to their browser, this cannot affect anyone else.

## Snake customization

Choose one of eight arcade palettes or pick/type any `#RRGGBB` hex color directly in the **Snake color** panel (including contrast-protected rims for ultra-dark colors). The canvas derives outlines, highlights, shadows, alternating segments, head details, score floaters, and green particle flecks from that color, so the whole snake stays cohesive. Press **C** to cycle presets. The choice is saved privately in this browser and applies immediately without restarting a run.

## Game rules

Open the rulebook with **G** or the **Rules** button. Grouped sliders and exact numeric inputs give full control of per-mode tick speed, speed ramp, per-mode apple money, golden apple rate, golden multiplier, starting/maximum/minimum length, growth per apple, collision fragment cost, and collision grace duration. The HUD labels earned points as **Money** and the game-over readout as **Coins**. Presets include **Classic**, **Gold rush**, and **High stakes**. Changing a rule resets the current run, while completed runs keep a snapshot of their exact rules so custom scores remain valid on the local leaderboard.

## Audio

Snakebyte generates its soundtrack locally with Web Audio: a three-channel chiptune loop with melody, bass, arpeggio, and percussion. Easy, Medium, and Hard have distinct melodies and tempos; the title screen plays a softer arrangement, and music fades out on pause, game over, and victory. **Sound** and **Music** have separate on/off controls. No audio files or network requests are used.

## Easter eggs

A few cabinet secrets are hidden in plain sight: a classic code, a secret word, a title ritual, a palette order, and a golden-apple streak. They unlock temporary pixel toasts, sound, screen pulses, and—when a run is active—particle bursts. Rainbow mode cycles the snake through the full palette without restarting the game.

## Build integrity

Every application change changes the production bundle fingerprint. A SHA-256 seal over the built inline JavaScript and marked application CSS (`data-snakebyte-style`) is generated and embedded directly into `dist/index.html` automatically during `npm run build`:

```sh
npm run build
```

Older releases loaded `./integrity.js` separately; deploying without `integrity.js` or from a subpath made the app show “build seal is missing or invalid.” That was a build-integrity warning, **not** a missing account, login, or client.

The app reads the embedded seal and verifies it before it mounts. No account or client is required, and `dist/integrity.js` is only a generated audit mirror (pass `--write-source` to `scripts/seal.mjs` if you explicitly want to sync `index.html` and `public/integrity.js` in source). Marking the application stylesheet with `data-snakebyte-style` ensures browser extensions such as Dark Reader or Stylus do not trigger false resets. If any delivered application script or stylesheet character is modified or unsealed, the app clears the local leaderboard and settings, returns to defaults, and disables persistence for that session (**Reset mode**). When a newly sealed release replaces an older build, old baseline progress is cleared while keeping persistence enabled for new runs in the current session.

## Implementation

`src/App.tsx` owns the cabinet and its ready, playing, paused, game-over, and victory states. It stores up to 20 validated local run records, which feed the cabinet table, the full local leaderboard, and the personal-best display. `src/game/engine.ts` handles fixed-step simulation independently of rendering. `src/components/GameCanvas.tsx` interpolates sprite movement using `requestAnimationFrame`, caches the board background, and caps render resolution at 2x device density. React does not rerender for animation frames.

Swipes use native non-passive touch listeners for reliable mobile steering, while Pointer Events handle mouse and pen input. Rendering stops when paused or idle. Leaving the tab pauses the active run and suspends Web Audio playback. Reduced-motion preferences disable screen shake, particle rendering, and decorative animation. Native fullscreen includes an in-page fallback.

## Verify

```sh
npm test
npm run typecheck
npm run build
npm run security-check
npx playwright install chromium
npm run test:e2e
```

Engine tests cover all difficulties, buffered input, collision handling, bonuses, victory, pause, restart, and frame-rate independence. Color tests cover safe hex validation and derived pixel-art shades; Easter egg tests cover hidden sequences and golden-streak logic; music tests cover note conversion, arrangement length, and phase mixing; rule tests cover validation, presets, and custom scoring. Static security tests inspect the CSP, headers, dependencies, and source for unsafe primitives. The browser suite runs the production bundle and verifies that remote requests and string-to-HTML injection are blocked. Browser tests exercise keyboard and real touch input, local leaderboard persistence and management, audio preferences, fullscreen, dialogs, responsive layouts, and the absence of shared network features.

`npm run preview` serves the production build. The `dist` directory can be deployed to a static web host.

## Assets

Original forest and snake key art is in `public/images/snakebyte-forest.webp`. Press Start 2P, IBM Plex Mono, and Space Grotesk are embedded in `src/fonts.css` under the SIL Open Font License. License files are in `public/fonts`. The app makes no external network requests and does not load third-party runtime code.

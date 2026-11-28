# Snakebyte security

Snakebyte is a single-player, local-first browser game. It has no accounts, no shared score tables, no score sharing, no telemetry, and no external network connections.

## Threat model

The valuable assets are the player's local data and the integrity of the page itself. This project treats the browser as untrusted input to the user interface: stored records, URL fragments, and any future relay/user content must be validated before use.

In scope:

- **Remote code execution or content injection.** A compromised dependency, injected markup, or unsafe HTML sink must not execute script.
- **Data exfiltration.** The game must not contact third parties or include a compromised third-party script. No such script is loaded, and the policy blocks programmatic network APIs.
- **Malformed local data.** Corrupted or casually edited `localStorage` records must not crash the game, spoof the UI, or poison later sessions.
- **Supply-chain exposure.** Production must ship only the runtime dependencies it actually needs.
- **Clickjacking, MIME confusion, and referrer leakage.** Deployment must send defensive response headers where the static host supports them.

Out of scope:

- A person editing JavaScript or local storage in their own browser. They can only change their own private local board.
- Compromise of the hosting provider, TLS termination, or the developer's machine.
- Server-authoritative cheat prevention. There is no server and no competitive ranking.

## Build integrity seal

Production `dist/index.html` inlines all application JavaScript and CSS (`dist/images/snakebyte-forest.webp` and `dist/favicon.svg` are served as relative static assets alongside it from `dist/`). During `npm run build`, `scripts/seal.mjs` marks the bundled stylesheet with `data-snakebyte-style`, hashes the inline application script and stylesheet blocks with SHA-256, and embeds the expected fingerprint in `<script data-snakebyte-seal>`. Marking the application stylesheet prevents browser extensions (such as Dark Reader or Stylus) from triggering false-positive resets while still catching edits or removal of the application stylesheet. Before React mounts, `src/game/integrity.ts` recomputes the fingerprint:

- A missing or invalid seal, a modified inline script, or a modified/missing marked stylesheet causes an immediate **hard reset**: all local runs, settings, and the integrity baseline are deleted, the cabinet returns to defaults, and persistence is disabled for that session (**Reset mode**).
- A newly sealed release replacing an older build clears records from the old baseline, records the verified new baseline, and keeps persistence enabled so runs played in the new session save normally.
- The static release audit independently recomputes the fingerprint from `dist/index.html` and fails the release if the embedded seal is missing, external, or does not match. The browser suite also verifies that a tampered bundle resets local progress.

This is strong protection against casual tampering: changing one delivered line without resealing produces a reset and blocks persistent scores. It is not cryptographic proof against a determined attacker, who can alter the verification code and compute a new seal. Client-side checks are inherently bypassable; the defense-in-depth CSP, Trusted Types, and lack of remote score storage remain important.

### Why does the game say the seal is missing or invalid?

It is not an account, login, or client error. It means the embedded build fingerprint was absent, malformed, or different from the delivered code. Older versions loaded `./integrity.js` as a separate request; if a deployment served only `index.html`, used a different base path, or cached an old HTML file with a new bundle, that request failed and the guard showed the warning. The seal is now embedded in the HTML and the release auditor rejects external seal dependencies. The current message explicitly says no account or client is required.

## Controls

- **No third-party network surface.** `connect-src 'none'` blocks script-initiated data transfer through `fetch`, XHR, WebSockets, beacons, and event streams. There are no external links, redirects, resource tags, third-party scripts, analytics, or error reporting. Font faces are embedded in the build and the only image is a same-origin asset.
- **Strict Content Security Policy.** The built page applies `default-src 'none'`, blocks objects, frames, workers, media, manifests, form submissions, base-tag changes, remote images, remote scripts and styles, inline event handlers, and inline style attributes. It requires Trusted Types for script sinks and allows no Trusted Types policies. `package.json` production dependencies contain only React and React DOM.
- **Trusted Types / DOM XSS.** React escapes all rendered text. There is no `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`, `document.write`, or `postMessage` in application source or tests. The CSP additionally makes string-to-HTML assignments throw in Chromium.
- **Local record validation.** Every loaded run must have a safe ID, a known mode, an in-range apple count, a plausible date, and a score that exactly matches the engine's apple/golden-bonus formula. Records are copied into normalized objects, deduplicated, capped at 20, validated against the exact rule snapshot stored with each run, and rejected if the stored JSON exceeds 100 KB. Rule values and custom snake colors are strictly bounded. Malformed storage never prevents play.
- **Verified writes.** The UI reports a saved rank only when `localStorage.setItem` succeeds and the entry passed validation. A failed write does not claim success.
- **Legacy cleanup.** On startup, network-era ladder caches and identities from earlier releases are deleted. Local runs are preserved.
- **Security headers.** `public/_headers` supplies CSP including `frame-ancestors 'none'` (which cannot be delivered in a meta tag), HSTS with preload, clickjacking protection, nosniff, no-referrer, COOP/CORP/COEP, origin-agent isolation, DNS-prefetch suppression, strict Permissions Policy, `no-store` HTML caching, and immutable caching for `/images/*` and `/fonts/*` (add `X-Robots-Tag: noindex, nofollow` if deploying a private copy). Browsers also receive a CSP meta fallback in `index.html` (relaxed only during local `vite` dev-server HMR).
- **Application and host firewall.** `src/game/firewall.ts` installs before boot and denies outbound browser APIs, external navigation, foreign storage keys, and bulk storage clears—and additionally blocks all persistent storage access if cross-origin framing or cleartext non-localhost HTTP is detected. `firewall/nginx.conf` supplies the authoritative deployment layer: HTTP-to-HTTPS redirect, method limits, path rules, `=404` static file resolution, and security headers. See `firewall/README.md` for managed-WAF rules. Client-side guards are defense in depth and cannot replace the host firewall.
- **Artifact audit.** `scripts/security-check.mjs` parses the built HTML and headers and fails the release if remote resources, inline handlers, source maps, network directives, missing assets, weak headers, or unexpected production dependencies are found. `npm audit --omit=dev` reports zero known vulnerabilities.
- **No source maps.** The production bundle contains no source maps, and the built page is self-contained.

## Residual risks

- **JavaScript is inspectable and editable by the player.** Client-side validation is not a security boundary for local scores. The leaderboard is explicitly private to the browser, so this cannot affect another player. A determined user can change their own saved records.
- **Single-file CSP trade-off.** The deployed app is intentionally a single HTML file, which requires `script-src 'unsafe-inline'` for the bundled bootstrap and `style-src 'unsafe-inline'` for the bundled stylesheet. This does **not** allow remote scripts, event-handler attributes, objects, frames, workers, or network access; Trusted Types and the absence of dangerous HTML sinks mitigate the inline-script risk. A future multi-file build can move to hash-based or nonce-based script authorization.
- **Headers and firewall rules must be applied by the host.** The CSP meta tag works in any browser, but HSTS, COEP, clickjacking, Permissions Policy, method limits, and WAF rules require a server or static host that honors `public/_headers` or `firewall/nginx.conf`. Serve over HTTPS and verify with `curl -I` and `curl -X POST`.
- **Compromised hosting or developer tooling** is outside the threat model. Keep dependencies pinned, review lockfile changes, and deploy from a trusted pipeline.

## Release checklist

```sh
npm ci
npm run verify
npm audit --omit=dev
npm run test:e2e
```

`npm run build` automatically runs `scripts/seal.mjs` to embed the matching build seal into `dist/index.html`.

Then serve `dist/` over HTTPS with `_headers` applied. Check the response includes CSP, HSTS, `X-Frame-Options: DENY`, COOP/CORP/COEP, and the Permissions-Policy. Open the page with DevTools → Network to confirm that only same-origin assets load.

## Reporting

Report suspected security issues privately to the repository owner with reproduction steps. Do not publish exploitable details first.

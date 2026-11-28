# Firewall and WAF baseline

There are two layers.

## 1. Host / network firewall (authoritative)

`nginx.conf` is a deployable reverse-proxy baseline for static hosting. It:

- allows only `GET`, `HEAD`, and `OPTIONS`;
- denies dotfiles, certificate/key/log/env/source-map files, VCS directories, common CMS probes, and path traversal;
- sends HSTS, strict CSP, clickjacking, COOP/CORP/COEP, MIME, referrer, permissions, and no-store headers;
- serves the single-file `dist/index.html` build.

Replace the certificate paths and `root`, then test with `nginx -t` before deploying. If the host terminates TLS before nginx, apply these headers at the edge instead and remove the SSL listener.

For a managed WAF such as Cloudflare, create a Block rule with this shape:

```text
(http.request.method ne "GET" and http.request.method ne "HEAD")
or (http.request.uri.path contains "..")
or (http.request.uri.path contains ".env")
or (http.request.uri.path contains ".git")
or (http.request.uri.path contains "wp-login.php")
or (http.request.uri.path matches "\\.(map|log|pem|key|sql|bak)$")
```

Also enable: HTTPS-only/HSTS, Bot Fight Mode or equivalent rate limiting, and WAF managed rules. A CDN/WAF controls traffic before it reaches the browser, so tampering with client JavaScript cannot disable it.

## 2. Application firewall (defense in depth)

`src/game/firewall.ts` installs before React and denies:

- `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`;
- external `window.open` navigation;
- cross-origin framing and non-HTTPS origins except localhost;
- storage keys outside `bitarcade.snakebyte.v1.*`;
- bulk `Storage.clear()`.

The browser CSP is the primary enforcement mechanism. The runtime guard is a second layer that produces a clear `SecurityError` and a visible footer status. It is intentionally not described as a network firewall: a person who fully controls the browser can rewrite or bypass it.

## Verify

```sh
npm run verify
npm run test:e2e
```

The browser suite checks that outbound APIs are actively blocked and that no external request leaves the page. On a deployed host, run `curl -I https://YOUR_DOMAIN/` and confirm the security headers and `X-Snakebyte-Firewall` are present, and `curl -X POST` returns `405`.

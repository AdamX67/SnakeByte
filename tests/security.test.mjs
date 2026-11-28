import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { test } from "node:test";

const html = readFileSync("index.html", "utf8");
const headers = readFileSync("public/_headers", "utf8");
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const csp =
  html.match(
    /<meta[^>]+http-equiv="Content-Security-Policy"[^>]+content="([^"]+)"/i,
  )?.[1] ?? "";

function directive(name) {
  const match = csp
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.toLowerCase().startsWith(name.toLowerCase()));
  return match ? match.split(/\s+/).slice(1) : [];
}

test("CSP denies by default and allows no network or injection surface", () => {
  assert.deepEqual(directive("default-src"), ["'none'"]);
  assert.deepEqual(directive("connect-src"), ["'none'"]);
  assert.deepEqual(directive("object-src"), ["'none'"]);
  assert.deepEqual(directive("frame-src"), ["'none'"]);
  assert.deepEqual(directive("child-src"), ["'none'"]);
  assert.deepEqual(directive("worker-src"), ["'none'"]);
  assert.deepEqual(directive("media-src"), ["'none'"]);
  assert.deepEqual(directive("base-uri"), ["'none'"]);
  assert.deepEqual(directive("form-action"), ["'none'"]);
  assert.deepEqual(directive("script-src-attr"), ["'none'"]);
  assert.deepEqual(directive("style-src-attr"), ["'none'"]);
  assert.deepEqual(directive("require-trusted-types-for"), ["'script'"]);
  assert.deepEqual(directive("trusted-types"), ["'none'"]);
  assert.ok(!csp.includes("unsafe-eval"));
  assert.ok(!csp.includes("*"));
  assert.ok(!/https?:|wss:|ws:/.test(csp));
  assert.ok(directive("script-src").includes("'self'"));
  assert.ok(directive("img-src").includes("'self'"));
  assert.ok(directive("img-src").includes("data:"));
});

test("deployment headers contain the full defense set", () => {
  for (const expected of [
    "Content-Security-Policy",
    "Strict-Transport-Security: max-age=",
    "includeSubDomains",
    "preload",
    "X-Content-Type-Options: nosniff",
    "X-Frame-Options: DENY",
    "Referrer-Policy: no-referrer",
    "Cross-Origin-Opener-Policy: same-origin",
    "Cross-Origin-Resource-Policy: same-origin",
    "Cross-Origin-Embedder-Policy: require-corp",
    "Origin-Agent-Cluster: ?1",
    "X-DNS-Prefetch-Control: off",
    "X-Permitted-Cross-Domain-Policies: none",
    "Permissions-Policy",
    "X-Snakebyte-Firewall",
    "camera=()",
    "microphone=()",
    "geolocation=()",
    "payment=()",
    "fullscreen=(self)",
    "frame-ancestors 'none'",
    "Cache-Control: no-store",
  ])
    assert.ok(headers.includes(expected), `headers should include ${expected}`);
});

test("source contains no dangerous injection or network primitives", () => {
  const source = readdirSync("src", { recursive: true })
    .map(String)
    // The firewall is the only module allowed to wrap blocked browser APIs.
    .filter(
      (file) => /\.(?:ts|tsx)$/.test(file) && !file.endsWith("firewall.ts"),
    )
    .map((file) => readFileSync(join("src", file), "utf8"))
    .join("\n");
  assert.doesNotMatch(source, /dangerouslySetInnerHTML/);
  assert.doesNotMatch(source, /\.innerHTML\s*=/);
  assert.doesNotMatch(source, /\beval\s*\(/);
  assert.doesNotMatch(source, /new\s+Function\s*\(/);
  assert.doesNotMatch(source, /document\.write\s*\(/);
  assert.doesNotMatch(source, /postMessage\s*\(/);
  assert.doesNotMatch(source, /https?:\/\//);
  assert.match(source, /savedTheme === "light" \|\| savedTheme === "dark"/);
  assert.doesNotMatch(source, /wss?:\/\//);
  assert.doesNotMatch(source, /target=["']_blank["']/);
  assert.doesNotMatch(source, /serviceWorker\s*\.\s*register/);
  assert.doesNotMatch(source, /document\.cookie/);
  assert.doesNotMatch(source, /indexedDB|IDBDatabase/);
  assert.doesNotMatch(source, /new WebSocket/);
  assert.doesNotMatch(source, /sendBeacon/);

  const nonStorageSource = readdirSync("src", { recursive: true })
    .map(String)
    .filter(
      (file) =>
        /\.(?:ts|tsx)$/.test(file) &&
        !file.endsWith("firewall.ts") &&
        !file.endsWith("storage.ts") &&
        !file.endsWith("integrity.ts"),
    )
    .map((file) => readFileSync(join("src", file), "utf8"))
    .join("\n");
  assert.doesNotMatch(
    nonStorageSource,
    /\blocalStorage\b/,
    "only storage.ts, integrity.ts, and firewall.ts may touch localStorage directly",
  );
});

test("the SVG favicon contains no active content", () => {
  const favicon = readFileSync("public/favicon.svg", "utf8");
  assert.doesNotMatch(
    favicon,
    /<script|foreignObject|\son[a-z]+\s*=|javascript:/i,
  );
});

test("application firewall installs before boot and host rules ship", () => {
  assert.ok(existsSync("src/game/firewall.ts"));
  const main = readFileSync("src/main.tsx", "utf8");
  const install = main.indexOf("installAppFirewall()");
  const verify = main.indexOf("verifyCodeIntegrity()");
  assert.ok(install >= 0, "main.tsx should install the firewall");
  assert.ok(verify >= 0, "main.tsx should verify code integrity");
  assert.ok(
    install < verify,
    "the firewall must install before integrity checks",
  );
  assert.ok(existsSync("firewall/nginx.conf"));
  const rules = readFileSync("firewall/nginx.conf", "utf8");
  assert.match(rules, /limit_except GET HEAD OPTIONS/);
  assert.match(rules, /return 405;/);
  assert.match(rules, /X-Snakebyte-Firewall/);
  assert.match(rules, /Content-Security-Policy/);
});

test("production dependencies stay minimal and framework-only", () => {
  assert.deepEqual(Object.keys(pkg.dependencies ?? {}).sort(), [
    "react",
    "react-dom",
  ]);
  assert.equal(pkg.dependencies?.clsx, undefined);
  assert.equal(pkg.dependencies?.["tailwind-merge"], undefined);
  assert.equal(pkg.dependencies?.["nostr-tools"], undefined);
});

test("HTML loads only same-origin assets and has no inline handlers", () => {
  assert.doesNotMatch(html, /<script[^>]+src="https?:/i);
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
  assert.doesNotMatch(html, /javascript:/i);
  assert.doesNotMatch(html, /sourceMappingURL=/);
  assert.match(html, /src="\/src\/main\.tsx"/);
  assert.match(html, /href="\/favicon\.svg"/);
  assert.match(html, /href="\/images\/snakebyte-forest\.webp"/);
  assert.match(html, /<script[^>]*data-snakebyte-seal/);
  assert.doesNotMatch(
    html,
    /<script[^>]+src=["'](?:\.\/|\/)?integrity\.js["']/i,
    "the seal must be embedded, not loaded as a separate file",
  );
});

test("built bundle matches its embedded SHA-256 seal", () => {
  if (!existsSync("dist/index.html")) return;
  const built = readFileSync("dist/index.html", "utf8");
  const scripts = [];
  for (const match of built.matchAll(
    /<script\b([^>]*)>([\s\S]*?)<\/script>/gi,
  )) {
    const attributes = match[1] ?? "";
    if (/\bsrc\s*=/.test(attributes)) continue;
    if (/\bdata-snakebyte-seal\b/.test(attributes)) continue;
    scripts.push(match[2]);
  }
  const styles = [];
  for (const match of built.matchAll(
    /<style\b([^>]*)>([\s\S]*?)<\/style>/gi,
  )) {
    const attributes = match[1] ?? "";
    if (!/\bdata-snakebyte-style\b/.test(attributes)) continue;
    styles.push(match[2]);
  }
  assert.ok(
    styles.length > 0,
    "built bundle should mark application style tag with data-snakebyte-style",
  );
  const payload = [
    "snakebyte-integrity-v1",
    ...scripts.map((text) => `script:${text.length}\n${text}`),
    ...styles.map((text) => `style:${text.length}\n${text}`),
  ].join("\n--\n");
  const actual = createHash("sha256").update(payload).digest("hex");
  const sealTag = built.match(
    /<script\b[^>]*\bdata-snakebyte-seal\b[^>]*>[\s\S]*?<\/script>/i,
  );
  assert.ok(sealTag, "the production page should contain an inline seal");
  assert.match(sealTag[0], new RegExp(`fingerprint:\\s*"${actual}"`));
  assert.doesNotMatch(
    built,
    /<script[^>]+src=["'](?:\.\/|\/)?integrity\.js["']/i,
    "the page must not depend on an external seal script",
  );

  if (existsSync("dist/_headers")) {
    const builtHeaders = readFileSync("dist/_headers", "utf8");
    assert.doesNotMatch(
      builtHeaders,
      /script-src[^;\n]*'unsafe-inline'/i,
      "dist/_headers must replace script-src 'unsafe-inline' with SHA-256 hashes",
    );
    for (const match of built.matchAll(
      /<script\b([^>]*)>([\s\S]*?)<\/script>/gi,
    )) {
      if (/\bsrc\s*=/i.test(match[1] ?? "")) continue;
      const digest = createHash("sha256")
        .update(match[2], "utf8")
        .digest("base64");
      assert.ok(
        builtHeaders.includes(`'sha256-${digest}'`),
        `dist/_headers should include 'sha256-${digest}'`,
      );
    }
  }
});

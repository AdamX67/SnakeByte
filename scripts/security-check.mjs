#!/usr/bin/env node
/**
 * Static release audit. Run after `npm run build`.
 * Fails closed when the built page exposes network capabilities, loads remote
 * resources, embeds inline event handlers, ships source maps, or weakens the
 * security policy documented in SECURITY.md.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { extractEmbeddedFingerprint, fingerprintHtml } from "./seal-lib.mjs";

const failures = [];
const checks = [];
const pass = (name) => checks.push(name);
const fail = (name, detail) =>
  failures.push(`${name}${detail ? `: ${detail}` : ""}`);
const read = (path) => readFileSync(path, "utf8");
const exists = (path) => {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
};
const dirExists = (path) => {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
};

let html = "";
try {
  html = read("dist/index.html");
} catch {
  fail("dist/index.html exists");
}
let headers = "";
try {
  headers = read("dist/_headers");
} catch {
  fail("dist/_headers exists");
}
let pkg = {};
try {
  pkg = JSON.parse(read("package.json"));
} catch {
  fail("package.json parses");
}

if (html) {
  const meta =
    html.match(
      /<meta[^>]+http-equiv="Content-Security-Policy"[^>]+content="([^"]+)"/i,
    )?.[1] ?? "";
  const directives = new Map(
    meta
      .split(";")
      .map((part) => part.trim().split(/\s+/))
      .filter(([key]) => key)
      .map(([key, ...values]) => [key.toLowerCase(), values]),
  );
  const required = [
    ["default-src", "'none'"],
    ["object-src", "'none'"],
    ["base-uri", "'none'"],
    ["form-action", "'none'"],
    ["frame-src", "'none'"],
    ["child-src", "'none'"],
    ["worker-src", "'none'"],
    ["connect-src", "'none'"],
    ["media-src", "'none'"],
    ["script-src-attr", "'none'"],
    ["style-src-attr", "'none'"],
    ["require-trusted-types-for", "'script'"],
    ["trusted-types", "'none'"],
  ];
  for (const [key, value] of required) {
    if (!directives.get(key)?.includes(value))
      fail(`CSP ${key}`, `${key} must include ${value}`);
  }
  if (meta.includes("*")) fail("CSP wildcard", "wildcards are not permitted");
  if (/connect-src[^;]*(https?:|wss:|ws:)/i.test(meta))
    fail("CSP network access", "connect-src must remain 'none'");
  if (/script-src[^;]*https?:/i.test(meta))
    fail("CSP remote script", "script-src must not allow remote origins");
  if (!meta) fail("CSP meta tag", "CSP must be present in the built document");
  else pass("strict CSP meta present");

  if (/<script\b[^>]*\bsrc=["'](?:https?:)?\/\//i.test(html))
    fail("remote script", "external scripts are forbidden");
  if (
    /<(?:link|img|source|iframe|object|embed|form)\b[^>]*(?:src|href|action)=["'](?:https?:)?\/\//i.test(
      html,
    )
  )
    fail("remote resource", "external resources are forbidden");
  if (/\son[a-z]+\s*=/i.test(html))
    fail(
      "inline event handler",
      "CSP script-src-attr 'none' must back this up",
    );
  if (/(?:href|src|action)=["']\s*javascript:/i.test(html))
    fail("javascript URI", "javascript: URLs are forbidden in attributes");
  if (/sourceMappingURL=/i.test(html))
    fail("source map reference", "source maps must not ship");

  // Same-origin asset references must resolve in dist.
  for (const match of html.matchAll(
    /<(?:script|link|img)\b[^>]*(?:src|href)=["']([^"']+)["']/gi,
  )) {
    const ref = match[1];
    if (/^(?:data:|#)/.test(ref)) continue;
    if (!/^(?:\.\/|\/)/.test(ref)) {
      fail("asset reference", `unexpected ${ref}`);
      continue;
    }
    const local = join("dist", ref.replace(/^\.?\//, ""));
    if (!exists(local)) fail("missing asset", ref);
  }
  pass("no remote resources, inline handlers, or source maps");
}

const requiredHeaders = [
  "Content-Security-Policy",
  "Strict-Transport-Security",
  "X-Content-Type-Options: nosniff",
  "X-Frame-Options: DENY",
  "Referrer-Policy: no-referrer",
  "Cross-Origin-Opener-Policy: same-origin",
  "Cross-Origin-Resource-Policy: same-origin",
  "Cross-Origin-Embedder-Policy: require-corp",
  "Permissions-Policy",
  "X-Snakebyte-Firewall",
  "frame-ancestors 'none'",
  "Cache-Control: no-store",
];
for (const header of requiredHeaders)
  if (!headers.includes(header)) fail("security headers", `missing ${header}`);
if (headers) pass("deployment headers present");

const expectedSeal = extractEmbeddedFingerprint(html);
if (!expectedSeal) {
  fail(
    "embedded build seal",
    "dist/index.html must contain an inline seal script",
  );
} else {
  const { hash: actual, markedStyleCount } = fingerprintHtml(html);
  if (markedStyleCount === 0)
    fail(
      "marked app stylesheet",
      "dist/index.html <style> must carry data-snakebyte-style",
    );
  if (actual !== expectedSeal)
    fail("build seal mismatch", "run `npm run seal` after building");
  else pass("embedded SHA-256 build seal matches application code and styles");
  const mirror = "dist/integrity.js";
  if (exists(mirror) && !read(mirror).includes(expectedSeal))
    fail(
      "seal mirror mismatch",
      "dist/integrity.js differs from the embedded seal",
    );
  if (/<script[^>]+src=["'](?:\.\/|\/)?integrity\.js["']/i.test(html))
    fail(
      "external seal dependency",
      "the seal must be embedded in index.html",
    );
  else pass("no external seal script is required");
}

const prodDeps = Object.keys(pkg.dependencies ?? {}).sort();
if (JSON.stringify(prodDeps) !== JSON.stringify(["react", "react-dom"]))
  fail(
    "production dependencies",
    `expected only react and react-dom, got ${prodDeps.join(", ")}`,
  );
else pass("minimal production dependency surface");

if (
  dirExists("dist") &&
  readdirSync("dist", { recursive: true }).some((name) =>
    String(name).endsWith(".map"),
  )
)
  fail("source maps", "remove .map files from dist");

const faviconPath = "dist/favicon.svg";
if (!exists(faviconPath)) fail("favicon", "missing dist/favicon.svg");
else {
  const favicon = read(faviconPath);
  if (/<script|foreignObject|\son[a-z]+\s*=|javascript:/i.test(favicon))
    fail("favicon safety", "SVG contains active content");
  else pass("static SVG favicon has no active content");
}
const imagePath = "dist/images/snakebyte-forest.webp";
if (!exists(imagePath))
  fail("hero image", "missing dist/images/snakebyte-forest.webp");
else {
  const image = readFileSync(imagePath);
  if (
    image.subarray(0, 4).toString("ascii") !== "RIFF" ||
    image.subarray(8, 12).toString("ascii") !== "WEBP"
  )
    fail("hero image type", "expected a WebP binary");
}

const sourceFiles = readdirSync("src", { recursive: true })
  .map(String)
  .filter((name) => /\.(?:ts|tsx)$/.test(name));
// firewall.ts is the single allowlisted policy guard: it wraps the very APIs
// that the rest of the application is forbidden from touching.
const sourceText = sourceFiles
  .filter((name) => !name.endsWith("firewall.ts"))
  .map((name) => read(join("src", name)))
  .join("\n");
const nonStorageSourceText = sourceFiles
  .filter(
    (name) =>
      !name.endsWith("storage.ts") &&
      !name.endsWith("integrity.ts") &&
      !name.endsWith("firewall.ts"),
  )
  .map((name) => read(join("src", name)))
  .join("\n");

for (const [name, pattern, scoped] of [
  ["service worker", /serviceWorker\s*\.\s*register/, sourceText],
  ["web storage outside adapter", /\blocalStorage\b/, nonStorageSourceText],
  ["cookies", /document\.cookie/, sourceText],
  ["indexeddb", /indexedDB|IDBDatabase/, sourceText],
  ["websocket", /new WebSocket/, sourceText],
  ["remote fetch", /\bfetch\s*\(/, sourceText],
  ["beacon", /sendBeacon/, sourceText],
  ["HTML injection sink", /dangerouslySetInnerHTML|\.innerHTML\s*=/, sourceText],
  [
    "dynamic code",
    /\beval\s*\(|new\s+Function\s*\(|document\.write\s*\(/,
    sourceText,
  ],
  ["cross-window messaging", /postMessage\s*\(/, sourceText],
  ["remote origin", /https?:\/\/|wss?:\/\//, sourceText],
  ["new tab", /target=["']_blank["']/, sourceText],
]) {
  if (pattern.test(scoped))
    fail(name, "unexpected browser persistence or network API in source");
}
pass(
  "no service worker, cookies, indexedDB, WebSocket, fetch, beacon, HTML-injection, dynamic-code, messaging, unguarded localStorage, or remote-origin APIs in app source",
);

const firewallSource = "src/game/firewall.ts";
const firewallConfig = "firewall/nginx.conf";
const mainSource = "src/main.tsx";
if (!exists(firewallSource)) {
  fail("application firewall", "missing src/game/firewall.ts");
} else if (!exists(mainSource)) {
  fail("application firewall", "missing src/main.tsx");
} else {
  const main = read(mainSource);
  const installAt = main.indexOf("installAppFirewall()");
  const verifyAt = main.indexOf("verifyCodeIntegrity()");
  if (installAt < 0 || verifyAt < 0 || installAt > verifyAt)
    fail(
      "firewall install order",
      "installAppFirewall() must run before verifyCodeIntegrity()",
    );
  else pass("application firewall installs before the integrity check");
}
if (!exists(firewallConfig)) {
  fail("host firewall", "missing firewall/nginx.conf");
} else {
  const rules = read(firewallConfig);
  if (
    !/limit_except GET HEAD OPTIONS/.test(rules) ||
    !/return 405;/.test(rules) ||
    !/Content-Security-Policy/.test(rules) ||
    !/X-Snakebyte-Firewall/.test(rules)
  )
    fail("host firewall", "nginx rules are incomplete");
  else pass("deployable host firewall rules are present");
}

if (failures.length) {
  console.error("\nSECURITY AUDIT FAILED\n");
  for (const failure of failures) console.error(` ✗ ${failure}`);
  process.exit(1);
}
console.log(`SECURITY AUDIT PASSED — ${checks.length} groups`);
for (const check of checks) console.log(` ✓ ${check}`);

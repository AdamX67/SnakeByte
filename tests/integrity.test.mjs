import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { test } from "node:test";
import { buildSync } from "esbuild";

const bundled = buildSync({
  entryPoints: ["src/game/integrity.ts"],
  bundle: true,
  format: "esm",
  platform: "browser",
  write: false,
}).outputFiles[0].text;

if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    configurable: true,
  });
}

function createIntegrityDom({
  scripts = [{ attrs: {}, text: "console.log('app');" }],
  styles = [{ attrs: { "data-snakebyte-style": "" }, text: "body{margin:0}" }],
  seal = null,
  initialStorage = {},
} = {}) {
  const store = new Map(Object.entries(initialStorage));
  const localStorage = {
    get length() {
      return store.size;
    },
    key(index) {
      return [...store.keys()][index] ?? null;
    },
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(String(key), String(value));
    },
    removeItem(key) {
      store.delete(String(key));
    },
  };

  const makeEl = (attrs, text) => ({
    src: attrs.src ?? "",
    textContent: text,
    hasAttribute: (name) => Object.prototype.hasOwnProperty.call(attrs, name),
  });

  const scriptEls = scripts.map((s) => makeEl(s.attrs ?? {}, s.text));
  const markedStyleEls = styles
    .filter((s) =>
      Object.prototype.hasOwnProperty.call(s.attrs ?? {}, "data-snakebyte-style"),
    )
    .map((s) => makeEl(s.attrs ?? {}, s.text));

  const document = {
    scripts: scriptEls,
    querySelectorAll(selector) {
      if (selector === "style[data-snakebyte-style]") return markedStyleEls;
      return [];
    },
  };

  const win = {
    __SNAKEBYTE_SEAL__: seal ?? undefined,
    localStorage,
    crypto: webcrypto,
    dispatchEvent: () => true,
  };

  globalThis.window = win;
  globalThis.document = document;
  globalThis.localStorage = localStorage;
  return { store, scriptEls, markedStyleEls, document };
}

const {
  fingerprintPayload,
  verifyCodeIntegrity,
  recheckCodeIntegrity,
  isPersistenceTrusted,
} = await import(
  `data:text/javascript;base64,${Buffer.from(bundled).toString("base64")}`
);

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await webcrypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

test("integrity verifies matching build seal and ignores unmarked extension styles", async () => {
  const appScript = "const x = 42;";
  const appCss = "body { background: #111315; }";

  const { store, document } = createIntegrityDom({
    scripts: [
      { attrs: { "data-snakebyte-seal": "" }, text: "seal()" },
      { attrs: {}, text: appScript },
    ],
    styles: [
      { attrs: { "data-snakebyte-style": "" }, text: appCss },
      // Unmarked extension style (e.g., Dark Reader) must NOT invalidate the seal!
      { attrs: { class: "darkreader" }, text: "* { filter: invert(1); }" },
    ],
  });
  const expected = await sha256Hex(fingerprintPayload(document));
  globalThis.window.__SNAKEBYTE_SEAL__ = { v: 1, fingerprint: expected };

  const result = await verifyCodeIntegrity({ dev: false });
  assert.equal(result.status, "verified");
  assert.equal(result.resetNotice, undefined);
  assert.equal(isPersistenceTrusted(), true);
  assert.equal(store.get("bitarcade.snakebyte.v1.integrityBaseline"), expected);
});

test("upgrading to a newly sealed build resets old baseline data while keeping persistence trusted", async () => {
  const appScript = "const release = 2;";
  const appCss = "body { color: #fff; }";

  const { store, document } = createIntegrityDom({
    scripts: [{ attrs: {}, text: appScript }],
    styles: [{ attrs: { "data-snakebyte-style": "" }, text: appCss }],
    initialStorage: {
      "bitarcade.snakebyte.v1.integrityBaseline": "e".repeat(64),
      "bitarcade.snakebyte.v1.scores": '[{"id":"old"}]',
      "bitarcade.snakebyte.v1.mode": '"hard"',
    },
  });
  const expected = await sha256Hex(fingerprintPayload(document));
  globalThis.window.__SNAKEBYTE_SEAL__ = { v: 1, fingerprint: expected };

  const result = await verifyCodeIntegrity({ dev: false });
  assert.equal(result.status, "verified");
  assert.equal(result.resetNotice, true);
  assert.equal(isPersistenceTrusted(), true);
  assert.equal(store.has("bitarcade.snakebyte.v1.scores"), false);
  assert.equal(store.has("bitarcade.snakebyte.v1.mode"), false);
  assert.equal(store.get("bitarcade.snakebyte.v1.integrityBaseline"), expected);
});

test("tampered script or missing seal triggers reset mode and disables persistence", async () => {
  const appScript = "const tampered = true;";
  const appCss = "body { color: #fff; }";

  const { store } = createIntegrityDom({
    scripts: [{ attrs: {}, text: appScript }],
    styles: [{ attrs: { "data-snakebyte-style": "" }, text: appCss }],
    seal: { v: 1, fingerprint: "a".repeat(64) },
    initialStorage: {
      "bitarcade.snakebyte.v1.scores": '[{"id":"old"}]',
    },
  });

  const result = await verifyCodeIntegrity({ dev: false });
  assert.equal(result.status, "reset");
  assert.equal(isPersistenceTrusted(), false);
  assert.equal(store.has("bitarcade.snakebyte.v1.scores"), false);

  // Runtime recheck catches live DOM mutation after a clean boot
  const live = createIntegrityDom({
    scripts: [{ attrs: {}, text: "clean()" }],
    styles: [{ attrs: { "data-snakebyte-style": "" }, text: appCss }],
  });
  const cleanHash = await sha256Hex(fingerprintPayload(live.document));
  globalThis.window.__SNAKEBYTE_SEAL__ = { v: 1, fingerprint: cleanHash };
  const boot = await verifyCodeIntegrity({ dev: false });
  assert.equal(boot.status, "verified");

  live.scriptEls[0].textContent = "mutated()";
  const rechecked = await recheckCodeIntegrity();
  assert.equal(rechecked.status, "reset");
  assert.equal(isPersistenceTrusted(), false);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSync } from "esbuild";

const bundled = buildSync({
  entryPoints: ["src/game/firewall.ts"],
  bundle: true,
  format: "esm",
  platform: "browser",
  write: false,
}).outputFiles[0].text;

const { applyFirewallToEnvironment } = await import(
  `data:text/javascript;base64,${Buffer.from(bundled).toString("base64")}`
);

function createMockEnv({
  protocol = "https:",
  hostname = "snakebyte.example",
  framed = false,
  topThrows = false,
} = {}) {
  const store = new Map();
  class MockStorage {
    get length() {
      return store.size;
    }
    key(index) {
      return [...store.keys()][index] ?? null;
    }
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    }
    setItem(key, value) {
      store.set(String(key), String(value));
    }
    removeItem(key) {
      store.delete(String(key));
    }
    clear() {
      store.clear();
    }
  }
  const storage = new MockStorage();
  const nav = {
    sendBeacon: () => true,
  };
  const win = {
    location: { protocol, hostname },
    open: () => null,
    fetch: () => Promise.resolve(),
    XMLHttpRequest: class {},
    WebSocket: class {},
    EventSource: class {},
    Storage: MockStorage,
    localStorage: storage,
    sessionStorage: new MockStorage(),
    navigator: nav,
    dispatchEvent: () => true,
  };
  win.self = win;
  if (topThrows) {
    Object.defineProperty(win, "top", {
      get() {
        throw new Error("Blocked cross-origin frame access");
      },
    });
  } else {
    win.top = framed ? {} : win;
  }
  return {
    env: {
      dev: false,
      win,
      nav,
      storageProto: MockStorage.prototype,
    },
    win,
    nav,
    store,
  };
}

test("firewall blocks outbound network APIs, foreign storage keys, and clear()", () => {
  const { env, win, nav } = createMockEnv();
  const status = applyFirewallToEnvironment(env);
  assert.equal(status.active, true);
  assert.equal(status.reason, "Active");

  for (const action of [
    () => win.fetch("https://example.com"),
    () => new win.XMLHttpRequest(),
    () => new win.WebSocket("wss://example.com"),
    () => new win.EventSource("https://example.com"),
    () => nav.sendBeacon("https://example.com"),
    () => win.open("https://example.com"),
    () => win.localStorage.setItem("foreign.key", "1"),
    () => win.localStorage.getItem("foreign.key"),
    () => win.localStorage.clear(),
  ]) {
    assert.throws(action, /Blocked by Snakebyte firewall/);
  }

  win.localStorage.setItem("bitarcade.snakebyte.v1.mode", '"hard"');
  assert.equal(win.localStorage.getItem("bitarcade.snakebyte.v1.mode"), '"hard"');
  win.localStorage.removeItem("bitarcade.snakebyte.v1.mode");
  assert.equal(win.localStorage.getItem("bitarcade.snakebyte.v1.mode"), null);
});

test("firewall still installs network/storage guards and denies storage when framed or over cleartext HTTP", () => {
  for (const scenario of [
    { framed: true, expectedReason: /Cross-origin framing restricted/ },
    { topThrows: true, expectedReason: /Cross-origin framing restricted/ },
    {
      protocol: "http:",
      hostname: "public.example.com",
      expectedReason: /Insecure transport restricted/,
    },
  ]) {
    const { env, win, nav } = createMockEnv(scenario);
    const status = applyFirewallToEnvironment(env);
    assert.equal(status.active, false);
    assert.match(status.reason, scenario.expectedReason);

    // Network and navigation guards must still be installed even when untrusted!
    assert.throws(
      () => win.fetch("https://example.com"),
      /Blocked by Snakebyte firewall: fetch/,
    );
    assert.throws(
      () => nav.sendBeacon("https://example.com"),
      /Blocked by Snakebyte firewall: sendBeacon/,
    );
    assert.throws(
      () => win.open("https://example.com"),
      /Blocked by Snakebyte firewall: window\.open/,
    );

    // Even allowlisted keys must be denied in untrusted framing/transport!
    assert.throws(
      () => win.localStorage.setItem("bitarcade.snakebyte.v1.mode", '"easy"'),
      /Blocked by Snakebyte firewall: (?:frame-deny|secure-origin)/,
    );
    assert.throws(
      () => win.localStorage.getItem("bitarcade.snakebyte.v1.mode"),
      /Blocked by Snakebyte firewall: (?:frame-deny|secure-origin)/,
    );
  }
});

test("firewall permits localhost HTTP development", () => {
  const { env, win } = createMockEnv({ protocol: "http:", hostname: "127.0.0.1" });
  const status = applyFirewallToEnvironment(env);
  assert.equal(status.active, true);
  win.localStorage.setItem("bitarcade.snakebyte.v1.theme", '"light"');
  assert.equal(
    win.localStorage.getItem("bitarcade.snakebyte.v1.theme"),
    '"light"',
  );
});

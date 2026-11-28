/**
 * Snakebyte application firewall.
 *
 * This is a browser-side, deny-by-default policy guard. It is defense in depth
 * behind the CSP and Trusted Types: it cannot control actual network packets,
 * and a determined attacker who rewrites the bundle can remove it. The host
 * firewall / WAF configuration lives in `firewall/`.
 */
const STORAGE_PREFIX = "bitarcade.snakebyte.v1.";
const BLOCK_PREFIX = "Blocked by Snakebyte firewall";

export type FirewallStatus = {
  active: boolean;
  blocked: number;
  reason: string;
  rules: string[];
};

export type FirewallEnvironment = {
  dev?: boolean;
  win?: Window & typeof globalThis;
  nav?: Navigator;
  storageProto?: Storage;
};

const RULES = [
  "network-deny",
  "navigation-deny",
  "frame-deny",
  "secure-origin",
  "storage-prefix",
] as const;

const status: FirewallStatus = {
  active: false,
  blocked: 0,
  reason: "Not installed",
  rules: [...RULES],
};

let installed = false;

function createDeny(targetStatus: FirewallStatus, eventTarget?: EventTarget) {
  return function deny(api: string): never {
    targetStatus.blocked += 1;
    try {
      eventTarget?.dispatchEvent(
        new CustomEvent("snakebyte:firewall-block", { detail: { api } }),
      );
    } catch {
      /* Event delivery must never mask the denial. */
    }
    throw new DOMException(`${BLOCK_PREFIX}: ${api}`, "SecurityError");
  };
}

function guard(target: object, key: string, value: unknown) {
  try {
    Object.defineProperty(target, key, {
      value,
      writable: false,
      configurable: false,
    });
    return true;
  } catch {
    return false;
  }
}

function installStorageGuard(
  storageProto: Storage | undefined,
  deny: (api: string) => never,
  denyAllReason?: string,
) {
  if (!storageProto) return true;
  const proto = storageProto as unknown as Record<string, unknown>;
  const originalGet = proto.getItem as (
    this: Storage,
    key: string,
  ) => string | null;
  const originalSet = proto.setItem as (
    this: Storage,
    key: string,
    value: string,
  ) => void;
  const originalRemove = proto.removeItem as (
    this: Storage,
    key: string,
  ) => void;

  const check = (api: string, key: unknown) => {
    if (denyAllReason) deny(denyAllReason);
    if (typeof key !== "string" || !key.startsWith(STORAGE_PREFIX)) deny(api);
  };
  const guardedGet = function (this: Storage, key: string) {
    check("storage.getItem", key);
    return originalGet.call(this, key);
  };
  const guardedSet = function (this: Storage, key: string, value: string) {
    check("storage.setItem", key);
    return originalSet.call(this, key, value);
  };
  const guardedRemove = function (this: Storage, key: string) {
    check("storage.removeItem", key);
    return originalRemove.call(this, key);
  };

  return (
    guard(storageProto, "getItem", guardedGet) &&
    guard(storageProto, "setItem", guardedSet) &&
    guard(storageProto, "removeItem", guardedRemove) &&
    guard(storageProto, "clear", () => deny(denyAllReason ?? "storage.clear"))
  );
}

function isCrossOriginFramed(win: Window): boolean {
  try {
    return win.top !== win.self;
  } catch {
    return true;
  }
}

function isSecureOrLocalOrigin(loc: Location): boolean {
  const localHost =
    loc.protocol === "file:" ||
    loc.hostname === "localhost" ||
    loc.hostname === "127.0.0.1" ||
    loc.hostname === "[::1]" ||
    loc.hostname === "::1";
  return localHost || loc.protocol === "https:";
}

/**
 * Installs policy guards on a provided environment (used directly by unit tests
 * and once at startup for the browser window).
 */
export function applyFirewallToEnvironment(
  env: FirewallEnvironment = {},
  targetStatus: FirewallStatus = {
    active: false,
    blocked: 0,
    reason: "Not installed",
    rules: [...RULES],
  },
): FirewallStatus {
  const isDev = env.dev ?? Boolean(import.meta.env?.DEV);
  if (isDev) {
    targetStatus.active = false;
    targetStatus.reason = "Development mode";
    return { ...targetStatus, rules: [...targetStatus.rules] };
  }

  const win = (env.win ?? window) as Window & typeof globalThis;
  const nav = env.nav ?? navigator;
  const storageProto =
    env.storageProto ??
    (typeof Storage !== "undefined" ? Storage.prototype : undefined);
  const deny = createDeny(targetStatus, win);

  const framed = isCrossOriginFramed(win);
  const secureOrigin = isSecureOrLocalOrigin(win.location);
  const envViolation = framed
    ? "frame-deny"
    : !secureOrigin
      ? "secure-origin"
      : undefined;

  // Always install outbound network, navigation, and storage guards — especially
  // when framed or served over an untrusted transport.
  const winRecord = win as unknown as Record<string, unknown>;
  const navRecord = nav as unknown as Record<string, unknown>;
  let ok = true;
  ok = guard(winRecord, "fetch", () => deny("fetch")) && ok;
  ok =
    guard(winRecord, "XMLHttpRequest", function () {
      deny("XMLHttpRequest");
    }) && ok;
  ok =
    guard(winRecord, "WebSocket", function () {
      deny("WebSocket");
    }) && ok;
  ok =
    guard(winRecord, "EventSource", function () {
      deny("EventSource");
    }) && ok;
  ok = guard(navRecord, "sendBeacon", () => deny("sendBeacon")) && ok;
  ok = guard(winRecord, "open", () => deny("window.open")) && ok;
  ok = installStorageGuard(storageProto, deny, envViolation) && ok;

  targetStatus.active = ok && !envViolation;
  if (!ok) {
    targetStatus.reason = "Partially installed";
  } else if (framed) {
    targetStatus.reason = "Cross-origin framing restricted";
  } else if (!secureOrigin) {
    targetStatus.reason = "Insecure transport restricted";
  } else {
    targetStatus.reason = "Active";
  }
  return { ...targetStatus, rules: [...targetStatus.rules] };
}

/** Installs the guard before React or the integrity check runs. */
export function installAppFirewall(): FirewallStatus {
  if (installed) return getFirewallStatus();
  installed = true;
  return applyFirewallToEnvironment({}, status);
}

export function getFirewallStatus(): FirewallStatus {
  return { ...status, rules: [...status.rules] };
}

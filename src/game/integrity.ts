import {
  formatSealPayload,
  SEAL_SCRIPT_ATTR,
  SEAL_STYLE_ATTR,
  SEAL_VERSION,
} from "./sealPayload";

const PREFIX = "bitarcade.snakebyte.v1.";
const BASELINE_KEY = "integrityBaseline";
const RESET_KEYS = [
  "scores",
  "mode",
  "sound",
  "music",
  "theme",
  "rules",
  "snakeColor",
  "best",
  "liveEntries",
  "liveProfile",
  "integrityBaseline",
];

export type IntegrityStatus = "verified" | "reset" | "unsealed";
export type IntegrityResult = {
  status: IntegrityStatus;
  message: string;
  /** Set when a valid newly sealed build cleared progress from an older build. */
  resetNotice?: boolean;
};
type Seal = { v: number; fingerprint: string };

let result: IntegrityResult = {
  status: "unsealed",
  message: "Integrity check has not run.",
};

export function getIntegrityResult() {
  return result;
}

/** Only a sealed, matching build may read or write persistent game data. */
export function isPersistenceTrusted() {
  return result.status !== "reset";
}

function isSealScript(script: HTMLScriptElement) {
  return script.hasAttribute(SEAL_SCRIPT_ATTR);
}

/**
 * Extracts inline application scripts and marked application styles.
 * Because `scripts/seal.mjs` marks the bundled stylesheet with
 * `data-snakebyte-style`, browser-extension `<style>` injections (Dark Reader,
 * Stylus, password managers, accessibility readers) are excluded consistently
 * on both initial boot and runtime re-checks without weakening tamper checks.
 */
export function fingerprintPayload(doc: Document = document) {
  const scripts = Array.from(doc.scripts)
    .filter((script) => !script.src && !isSealScript(script))
    .map((script) => script.textContent ?? "");
  const styles = Array.from(
    doc.querySelectorAll(`style[${SEAL_STYLE_ATTR}]`),
  ).map((style) => style.textContent ?? "");
  return formatSealPayload(scripts, styles);
}

async function sha256(value: string) {
  if (!globalThis.crypto?.subtle) return null;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function hardReset() {
  try {
    for (const key of RESET_KEYS) localStorage.removeItem(PREFIX + key);
  } catch {
    /* Reset still proceeds with in-memory defaults. */
  }
}

function readBaseline() {
  try {
    return localStorage.getItem(PREFIX + BASELINE_KEY);
  } catch {
    return null;
  }
}

function writeBaseline(value: string) {
  try {
    localStorage.setItem(PREFIX + BASELINE_KEY, value);
  } catch {
    /* Integrity checks still run without persistence. */
  }
}

/**
 * Verifies the exact inline code and stylesheet fingerprint sealed at build
 * time. Any mismatch clears local game progress before React mounts.
 */
export async function verifyCodeIntegrity(
  options: { dev?: boolean } = {},
): Promise<IntegrityResult> {
  const isDev = options.dev ?? Boolean(import.meta.env?.DEV);
  if (isDev) {
    result = { status: "unsealed", message: "Development build is unsealed." };
    return result;
  }
  try {
    const seal = window.__SNAKEBYTE_SEAL__ as Seal | undefined;
    const actual = await sha256(fingerprintPayload());
    if (!actual) {
      hardReset();
      result = {
        status: "reset",
        message: "Secure hashing is unavailable. Local progress was reset.",
      };
      return result;
    }
    if (
      !seal ||
      seal.v !== SEAL_VERSION ||
      !/^[a-f0-9]{64}$/.test(seal.fingerprint)
    ) {
      hardReset();
      result = {
        status: "reset",
        message:
          "This copy of the game is unsealed. No account or client is required; local progress was reset.",
      };
      return result;
    }
    if (seal.fingerprint !== actual) {
      hardReset();
      result = {
        status: "reset",
        message:
          "Code changed since this cabinet was sealed. Local progress was reset.",
      };
      return result;
    }
    const previous = readBaseline();
    if (previous !== null && previous !== actual) {
      // A different sealed build was played in this browser. Clear old records,
      // adopt the verified new baseline, and allow new runs in this session.
      hardReset();
      writeBaseline(actual);
      result = {
        status: "verified",
        resetNotice: true,
        message: "A new sealed build was detected. Local progress was reset.",
      };
      return result;
    }
    writeBaseline(actual);
    result = {
      status: "verified",
      message: "Build integrity verified.",
    };
    return result;
  } catch {
    hardReset();
    result = {
      status: "reset",
      message: "Integrity verification failed. Local progress was reset.",
    };
    return result;
  }
}

/** Re-check the current document at runtime; catches DOM script/style edits. */
export async function recheckCodeIntegrity() {
  if (result.status !== "verified") return result;
  const seal = window.__SNAKEBYTE_SEAL__ as Seal | undefined;
  const actual = await sha256(fingerprintPayload());
  if (!seal || actual !== seal.fingerprint) {
    hardReset();
    result = {
      status: "reset",
      message: "Running code changed. Local progress was reset.",
    };
    window.dispatchEvent(new CustomEvent("snakebyte:integrity-reset"));
  }
  return result;
}

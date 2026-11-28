import { isPersistenceTrusted } from "./integrity";
import { MODES, type Mode } from "./engine";
import { DEFAULT_SNAKE_COLOR, normalizeSnakeColor } from "./snakeColor";
import {
  DEFAULT_GAME_RULES,
  expectedRunScore,
  isCustomRules,
  normalizeGameRules,
  type GameRules,
} from "./rules";

const PREFIX = "bitarcade.snakebyte.v1.";
const SCORES_KEY = "scores";
const SNAKE_COLOR_KEY = "snakeColor";
const RULES_KEY = "rules";
const THEME_KEY = "theme";
const LEGACY_NETWORK_KEYS = ["liveEntries", "liveProfile", "best"];
export const MAX_SAVED_RUNS = 20;
export const RESERVED_CLASSIC_SLOTS = 5;
export const MAX_STORED_CHARS = 100_000;
/**
 * Custom `maxLength` caps and recoverable wall/body fragment losses let runs
 * legitimately collect far more than `COLS * ROWS` apples while remaining
 * bounded against runaway score inputs.
 */
export const MAX_APPLES = 10_000;
const MIN_DATE = Date.UTC(2024, 0, 1);
const FUTURE_ALLOWANCE_MS = 5 * 60_000;

export type Theme = "dark" | "light";

export type HighScore = {
  id: string;
  score: number;
  mode: Mode;
  apples: number;
  date: number;
  /** Optional for scores saved before custom rules existed. */
  rules?: GameRules;
};

function safeRead(key: string): string | null {
  if (!isPersistenceTrusted()) return null;
  try {
    const value = localStorage.getItem(PREFIX + key);
    return value !== null && value.length <= MAX_STORED_CHARS ? value : null;
  } catch {
    return null;
  }
}

export const INTEGRITY_BASELINE_KEY = "integrityBaseline";

export function readSetting<T>(key: string, fallback: T): T {
  const saved = safeRead(key);
  if (saved === null) return fallback;
  try {
    return JSON.parse(saved) as T;
  } catch {
    return fallback;
  }
}

export function saveSetting(key: string, value: unknown) {
  if (!isPersistenceTrusted()) return;
  try {
    const serialized = JSON.stringify(value);
    if (serialized.length <= MAX_STORED_CHARS)
      localStorage.setItem(PREFIX + key, serialized);
  } catch {
    /* Play also works without storage. */
  }
}

export function readTheme(): Theme {
  const savedTheme = readSetting<unknown>(THEME_KEY, "dark");
  return savedTheme === "light" || savedTheme === "dark" ? savedTheme : "dark";
}

export function saveTheme(theme: Theme) {
  saveSetting(THEME_KEY, theme);
}

/** Remove network-era artifacts from older releases; never touch local scores. */
export function cleanupLegacyRemoteData() {
  if (!isPersistenceTrusted()) return;
  try {
    for (const key of LEGACY_NETWORK_KEYS)
      localStorage.removeItem(PREFIX + key);
  } catch {
    /* Nothing to clean when storage is unavailable. */
  }
}

export function readMode(): Mode {
  const saved = readSetting<unknown>("mode", "easy");
  return typeof saved === "string" &&
    Object.prototype.hasOwnProperty.call(MODES, saved)
    ? (saved as Mode)
    : "easy";
}

export function readSnakeColor(): string {
  return (
    normalizeSnakeColor(
      readSetting<unknown>(SNAKE_COLOR_KEY, DEFAULT_SNAKE_COLOR),
    ) ?? DEFAULT_SNAKE_COLOR
  );
}

export function saveSnakeColor(value: unknown): string | null {
  const normalized = normalizeSnakeColor(value);
  if (!normalized) return null;
  saveSetting(SNAKE_COLOR_KEY, normalized);
  return normalized;
}

export function readGameRules(): GameRules {
  return normalizeGameRules(
    readSetting<unknown>(RULES_KEY, DEFAULT_GAME_RULES),
  );
}

export function saveGameRules(value: unknown) {
  saveSetting(RULES_KEY, normalizeGameRules(value));
}

/**
 * The score a run must have for its mode and apple count. This mirrors the
 * engine's golden-apple rule and rejects casually edited or corrupted local
 * records. It is an integrity check, not a trust boundary: a person can always
 * edit their own storage, but this board never ranks anyone else.
 */
export function expectedScore(mode: Mode, apples: number) {
  return expectedRunScore(DEFAULT_GAME_RULES, mode, apples);
}

export function normalizeScore(value: unknown): HighScore | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Partial<HighScore>;
  const now = Date.now();
  if (
    typeof entry.id !== "string" ||
    !/^[a-zA-Z0-9_-]{8,96}$/.test(entry.id) ||
    typeof entry.mode !== "string" ||
    !Object.prototype.hasOwnProperty.call(MODES, entry.mode) ||
    typeof entry.apples !== "number" ||
    !Number.isInteger(entry.apples) ||
    entry.apples < 1 ||
    entry.apples > MAX_APPLES ||
    typeof entry.score !== "number" ||
    !Number.isInteger(entry.score) ||
    entry.score < 1 ||
    entry.score > 9_999_999 ||
    entry.score !==
      expectedRunScore(
        normalizeGameRules(entry.rules ?? DEFAULT_GAME_RULES),
        entry.mode as Mode,
        entry.apples,
      ) ||
    typeof entry.date !== "number" ||
    !Number.isFinite(entry.date) ||
    entry.date < MIN_DATE ||
    entry.date > now + FUTURE_ALLOWANCE_MS
  )
    return null;
  // Copy only validated fields so unexpected properties cannot travel through.
  return {
    id: entry.id,
    score: entry.score,
    mode: entry.mode as Mode,
    apples: entry.apples,
    date: entry.date,
    rules: normalizeGameRules(entry.rules ?? DEFAULT_GAME_RULES),
  };
}

export function sortScores(entries: HighScore[]) {
  return [...entries].sort(
    (a, b) => b.score - a.score || a.date - b.date || a.id.localeCompare(b.id),
  );
}

/**
 * Caps the leaderboard at `MAX_SAVED_RUNS` while reserving up to
 * `RESERVED_CLASSIC_SLOTS` entries for Classic-rule runs so high-multiplier
 * custom runs cannot evict every Classic personal best.
 */
export function selectLeaderboardRuns(entries: HighScore[]): HighScore[] {
  const sorted = sortScores(entries);
  if (sorted.length <= MAX_SAVED_RUNS) return sorted;

  const top = sorted.slice(0, MAX_SAVED_RUNS);
  const classicRuns = sorted.filter((entry) => !isCustomRules(entry.rules));
  const targetClassicCount = Math.min(
    RESERVED_CLASSIC_SLOTS,
    classicRuns.length,
  );
  const currentClassicCount = top.filter(
    (entry) => !isCustomRules(entry.rules),
  ).length;
  if (currentClassicCount >= targetClassicCount) return top;

  const preservedClassic = classicRuns.slice(0, targetClassicCount);
  const preservedIds = new Set(preservedClassic.map((entry) => entry.id));
  const remainingSlots = MAX_SAVED_RUNS - preservedClassic.length;
  const others = sorted
    .filter((entry) => !preservedIds.has(entry.id))
    .slice(0, remainingSlots);
  return sortScores([...preservedClassic, ...others]);
}

export function readScores(): HighScore[] {
  const raw = safeRead(SCORES_KEY);
  if (raw === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const unique = new Map<string, HighScore>();
  for (const value of parsed.slice(0, 100)) {
    const entry = normalizeScore(value);
    if (entry) unique.set(entry.id, entry);
  }
  return selectLeaderboardRuns([...unique.values()]);
}

/** Returns false when storage rejected or is unavailable for the write. */
export function saveScores(entries: HighScore[]): boolean {
  if (!isPersistenceTrusted()) return false;
  const unique = new Map<string, HighScore>();
  for (const raw of entries.slice(0, 100)) {
    const entry = normalizeScore(raw);
    if (entry) unique.set(entry.id, entry);
  }
  const payload = selectLeaderboardRuns([...unique.values()]);
  try {
    localStorage.setItem(PREFIX + SCORES_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function clearScores() {
  if (!isPersistenceTrusted()) return;
  try {
    localStorage.removeItem(PREFIX + SCORES_KEY);
  } catch {
    /* Nothing to clear when storage is unavailable. */
  }
}

function randomId() {
  try {
    if (crypto.randomUUID) return crypto.randomUUID();
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
      "",
    );
  } catch {
    return `${Date.now()}-${Array.from({ length: 12 }, () =>
      Math.floor(Math.random() * 16).toString(16),
    ).join("")}`;
  }
}

export function newScoreEntry(
  score: number,
  mode: Mode,
  apples: number,
  rules: GameRules = DEFAULT_GAME_RULES,
): HighScore | null {
  const entry: HighScore = {
    id: randomId(),
    score,
    mode,
    apples,
    date: Date.now(),
    rules: normalizeGameRules(rules),
  };
  return normalizeScore(entry);
}

export const formatScore = (score: number) =>
  Math.floor(score).toString().padStart(5, "0");

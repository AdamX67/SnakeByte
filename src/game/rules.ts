export type Mode = "easy" | "medium" | "hard";

export type GameRules = {
  /** Money earned for one ordinary apple on each difficulty. */
  moneyEasy: number;
  moneyMedium: number;
  moneyHard: number;
  /** Every Nth collected apple is golden. */
  goldenEvery: number;
  goldenMultiplier: number;
  /** Milliseconds between snake steps; lower is faster. */
  speedEasyMs: number;
  speedMediumMs: number;
  speedHardMs: number;
  /** Speed gained per four apples, as a percentage of the base tick. */
  speedRampPercent: number;
  startingLength: number;
  maxLength: number;
  minimumLength: number;
  /** Extra segments gained per apple, spread over following ticks. */
  growthPerApple: number;
  /** Fragments removed by a recoverable wall or body collision. */
  wallCost: number;
  /** Milliseconds of free wall/body bumps after losing fragments. */
  wallGraceMs: number;
};

export const RULE_LIMITS = {
  moneyEasy: { min: 1, max: 100, step: 1 },
  moneyMedium: { min: 1, max: 200, step: 1 },
  moneyHard: { min: 1, max: 300, step: 1 },
  goldenEvery: { min: 2, max: 20, step: 1 },
  goldenMultiplier: { min: 1, max: 10, step: 1 },
  speedEasyMs: { min: 40, max: 300, step: 1 },
  speedMediumMs: { min: 35, max: 250, step: 1 },
  speedHardMs: { min: 30, max: 200, step: 1 },
  speedRampPercent: { min: 0, max: 10, step: 1 },
  startingLength: { min: 3, max: 30, step: 1 },
  maxLength: { min: 3, max: 540, step: 1 },
  minimumLength: { min: 2, max: 20, step: 1 },
  growthPerApple: { min: 1, max: 5, step: 1 },
  wallCost: { min: 1, max: 5, step: 1 },
  wallGraceMs: { min: 0, max: 5000, step: 1 },
} as const;

export const DEFAULT_GAME_RULES: GameRules = {
  moneyEasy: 10,
  moneyMedium: 20,
  moneyHard: 30,
  goldenEvery: 5,
  goldenMultiplier: 3,
  speedEasyMs: 148,
  speedMediumMs: 106,
  speedHardMs: 76,
  speedRampPercent: 4,
  startingLength: 7,
  maxLength: 540,
  minimumLength: 3,
  growthPerApple: 1,
  wallCost: 1,
  wallGraceMs: 1100,
};

export const RULES_PRESETS = [
  { id: "classic", name: "Classic", rules: DEFAULT_GAME_RULES },
  {
    id: "goldRush",
    name: "Gold rush",
    rules: {
      ...DEFAULT_GAME_RULES,
      moneyEasy: 15,
      moneyMedium: 30,
      moneyHard: 45,
      goldenEvery: 3,
      goldenMultiplier: 4,
      startingLength: 8,
      wallGraceMs: 1300,
    },
  },
  {
    id: "highStakes",
    name: "High stakes",
    rules: {
      ...DEFAULT_GAME_RULES,
      moneyEasy: 20,
      moneyMedium: 40,
      moneyHard: 60,
      goldenEvery: 6,
      goldenMultiplier: 5,
      speedEasyMs: 110,
      speedMediumMs: 84,
      speedHardMs: 60,
      speedRampPercent: 7,
      startingLength: 5,
      minimumLength: 2,
      growthPerApple: 2,
      wallCost: 2,
      wallGraceMs: 700,
    },
  },
] as const;

const RULE_KEYS: readonly (keyof GameRules)[] = [
  "moneyEasy",
  "moneyMedium",
  "moneyHard",
  "goldenEvery",
  "goldenMultiplier",
  "speedEasyMs",
  "speedMediumMs",
  "speedHardMs",
  "speedRampPercent",
  "startingLength",
  "maxLength",
  "minimumLength",
  "growthPerApple",
  "wallCost",
  "wallGraceMs",
];

function clampField(
  key: keyof GameRules,
  raw: unknown,
  fallback = DEFAULT_GAME_RULES[key],
) {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return fallback;
  const limits = RULE_LIMITS[key];
  const snapped = Math.round(raw / limits.step) * limits.step;
  return Math.max(limits.min, Math.min(limits.max, snapped));
}

function legacyMoney(source: Record<string, unknown>) {
  const legacy = source.applePoints;
  return typeof legacy === "number" && Number.isFinite(legacy)
    ? clampField("moneyEasy", legacy)
    : null;
}

/** Converts stored, imported, or legacy values into a bounded rule set. */
export function normalizeGameRules(value: unknown): GameRules {
  const source =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const oldMoney = legacyMoney(source);
  const money = (key: keyof GameRules, multiplier: number) =>
    typeof source[key] === "number" && Number.isFinite(source[key])
      ? clampField(key, source[key])
      : oldMoney !== null
        ? clampField(key, oldMoney * multiplier)
        : DEFAULT_GAME_RULES[key];

  const base: GameRules = {
    moneyEasy: money("moneyEasy", 1),
    moneyMedium: money("moneyMedium", 2),
    moneyHard: money("moneyHard", 3),
    goldenEvery: clampField("goldenEvery", source.goldenEvery),
    goldenMultiplier: clampField("goldenMultiplier", source.goldenMultiplier),
    speedEasyMs: clampField("speedEasyMs", source.speedEasyMs),
    speedMediumMs: clampField("speedMediumMs", source.speedMediumMs),
    speedHardMs: clampField("speedHardMs", source.speedHardMs),
    speedRampPercent: clampField("speedRampPercent", source.speedRampPercent),
    startingLength: clampField("startingLength", source.startingLength),
    maxLength: clampField("maxLength", source.maxLength),
    minimumLength: clampField("minimumLength", source.minimumLength),
    growthPerApple: clampField("growthPerApple", source.growthPerApple),
    wallCost: clampField("wallCost", source.wallCost),
    wallGraceMs: clampField("wallGraceMs", source.wallGraceMs),
  };

  // Cross-field invariants keep a custom board playable.
  const minimumLength = Math.min(base.minimumLength, base.startingLength - 1);
  const startingLength = Math.max(
    base.startingLength,
    minimumLength + 1,
    RULE_LIMITS.startingLength.min,
  );
  return {
    ...base,
    minimumLength,
    startingLength,
    maxLength: Math.max(base.maxLength, startingLength),
  };
}

export function rulesSignature(rules: GameRules) {
  const normalized = normalizeGameRules(rules);
  return RULE_KEYS.map((key) => normalized[key]).join("-");
}

export function rulesEqual(a: GameRules, b: GameRules) {
  return rulesSignature(a) === rulesSignature(b);
}

export function isGoldenApple(rules: GameRules, applesBefore: number) {
  return (applesBefore + 1) % rules.goldenEvery === 0;
}

export function modeMoney(rules: GameRules, mode: Mode) {
  const normalized = normalizeGameRules(rules);
  switch (mode) {
    case "easy":
      return normalized.moneyEasy;
    case "medium":
      return normalized.moneyMedium;
    case "hard":
      return normalized.moneyHard;
  }
}

export function modeSpeed(rules: GameRules, mode: Mode) {
  const normalized = normalizeGameRules(rules);
  switch (mode) {
    case "easy":
      return normalized.speedEasyMs;
    case "medium":
      return normalized.speedMediumMs;
    case "hard":
      return normalized.speedHardMs;
  }
}

export function appleScore(rules: GameRules, mode: Mode, appleIndex: number) {
  const normalized = normalizeGameRules(rules);
  const golden = isGoldenApple(normalized, appleIndex - 1);
  return (
    modeMoney(normalized, mode) * (golden ? normalized.goldenMultiplier : 1)
  );
}

export function expectedRunScore(rules: GameRules, mode: Mode, apples: number) {
  if (!Number.isInteger(apples) || apples <= 0) return 0;
  const normalized = normalizeGameRules(rules);
  const goldenCount = Math.floor(apples / normalized.goldenEvery);
  const regularCount = apples - goldenCount;
  return (
    modeMoney(normalized, mode) *
    (regularCount + goldenCount * normalized.goldenMultiplier)
  );
}

export function formatRuleValue(key: keyof GameRules, value: number) {
  switch (key) {
    case "moneyEasy":
    case "moneyMedium":
    case "moneyHard":
      return `${value} coins`;
    case "goldenEvery":
      return `every ${value}`;
    case "goldenMultiplier":
      return `${value}×`;
    case "speedEasyMs":
    case "speedMediumMs":
    case "speedHardMs":
      return `${value} ms`;
    case "speedRampPercent":
      return `${value}%/4`;
    case "startingLength":
    case "maxLength":
    case "minimumLength":
      return `${value} seg`;
    case "growthPerApple":
      return `+${value}/apple`;
    case "wallGraceMs":
      return `${(value / 1000).toFixed(2)}s`;
    case "wallCost":
      return `${value} ${value === 1 ? "frag" : "frags"}`;
  }
}

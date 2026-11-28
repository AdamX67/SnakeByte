import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSync } from "esbuild";

const bundle = buildSync({
  entryPoints: ["src/game/rules.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
});
const {
  DEFAULT_GAME_RULES,
  RULE_LIMITS,
  RULES_PRESETS,
  appleScore,
  expectedRunScore,
  formatRuleValue,
  isGoldenApple,
  modeMoney,
  modeSpeed,
  normalizeGameRules,
  rulesEqual,
  rulesSignature,
} = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
);

test("every rule has a numeric exact range and normalization is total", () => {
  assert.equal(Object.keys(RULE_LIMITS).length, 15);
  assert.equal(Object.keys(DEFAULT_GAME_RULES).length, 15);
  for (const [key, limit] of Object.entries(RULE_LIMITS)) {
    assert.equal(limit.step, 1, `${key} must allow exact integers`);
    assert.ok(limit.min < limit.max);
  }
  assert.deepEqual(normalizeGameRules(null), DEFAULT_GAME_RULES);
  assert.deepEqual(normalizeGameRules("bad"), DEFAULT_GAME_RULES);
  assert.deepEqual(normalizeGameRules(DEFAULT_GAME_RULES), DEFAULT_GAME_RULES);

  const clamped = normalizeGameRules({
    moneyEasy: 0,
    moneyMedium: 9999,
    moneyHard: -3,
    speedEasyMs: 1,
    speedMediumMs: 9999,
    speedHardMs: "fast",
    speedRampPercent: 999,
    startingLength: 2,
    maxLength: 1,
    minimumLength: 99,
    growthPerApple: 99,
    wallCost: 99,
    wallGraceMs: -1,
    goldenEvery: 1,
    goldenMultiplier: 99,
  });
  assert.equal(clamped.moneyEasy, RULE_LIMITS.moneyEasy.min);
  assert.equal(clamped.moneyMedium, RULE_LIMITS.moneyMedium.max);
  assert.equal(clamped.moneyHard, RULE_LIMITS.moneyHard.min);
  assert.equal(clamped.speedEasyMs, RULE_LIMITS.speedEasyMs.min);
  assert.equal(clamped.speedMediumMs, RULE_LIMITS.speedMediumMs.max);
  assert.equal(clamped.speedHardMs, DEFAULT_GAME_RULES.speedHardMs);
  assert.ok(clamped.minimumLength < clamped.startingLength);
  assert.ok(clamped.maxLength >= clamped.startingLength);
  assert.ok(clamped.wallGraceMs >= 0);
});

test("legacy saved rules migrate into independent per-mode money values", () => {
  const migrated = normalizeGameRules({ applePoints: 25 });
  assert.equal(migrated.moneyEasy, 25);
  assert.equal(migrated.moneyMedium, 50);
  assert.equal(migrated.moneyHard, 75);
  assert.equal(migrated.speedEasyMs, DEFAULT_GAME_RULES.speedEasyMs);
  assert.equal(migrated.minimumLength, DEFAULT_GAME_RULES.minimumLength);

  const modern = normalizeGameRules({
    ...DEFAULT_GAME_RULES,
    applePoints: 25,
    moneyEasy: 7,
    moneyMedium: 11,
    moneyHard: 13,
  });
  assert.deepEqual(
    [modern.moneyEasy, modern.moneyMedium, modern.moneyHard],
    [7, 11, 13],
  );
});

test("presets are valid, distinct, and have stable signatures", () => {
  assert.equal(RULES_PRESETS.length, 3);
  const signatures = RULES_PRESETS.map((preset) =>
    rulesSignature(preset.rules),
  );
  assert.equal(new Set(signatures).size, signatures.length);
  for (const preset of RULES_PRESETS)
    assert.deepEqual(normalizeGameRules(preset.rules), preset.rules);
  assert.ok(rulesEqual(DEFAULT_GAME_RULES, { ...DEFAULT_GAME_RULES }));
  assert.ok(!rulesEqual(DEFAULT_GAME_RULES, RULES_PRESETS[1].rules));
});

test("money, golden cadence, speed, and formatting are fully independent", () => {
  const custom = normalizeGameRules({
    moneyEasy: 7,
    moneyMedium: 11,
    moneyHard: 13,
    goldenEvery: 4,
    goldenMultiplier: 2,
    speedEasyMs: 200,
    speedMediumMs: 150,
    speedHardMs: 100,
    speedRampPercent: 3,
    startingLength: 12,
    maxLength: 24,
    minimumLength: 4,
    growthPerApple: 3,
    wallCost: 2,
    wallGraceMs: 1234,
  });
  assert.deepEqual(
    ["easy", "medium", "hard"].map((mode) => modeMoney(custom, mode)),
    [7, 11, 13],
  );
  assert.deepEqual(
    ["easy", "medium", "hard"].map((mode) => modeSpeed(custom, mode)),
    [200, 150, 100],
  );
  assert.equal(isGoldenApple(custom, 2), false);
  assert.equal(isGoldenApple(custom, 3), true);
  assert.equal(appleScore(custom, "medium", 1), 11);
  assert.equal(appleScore(custom, "hard", 4), 26);
  assert.equal(expectedRunScore(custom, "hard", 4), 65);
  assert.equal(formatRuleValue("wallGraceMs", 1234), "1.23s");
  assert.equal(formatRuleValue("speedRampPercent", 3), "3%/4");
  assert.equal(formatRuleValue("growthPerApple", 3), "+3/apple");
  assert.equal(formatRuleValue("moneyEasy", 7), "7 coins");

  assert.equal(appleScore(DEFAULT_GAME_RULES, "medium", 1), 20);
  assert.equal(appleScore(DEFAULT_GAME_RULES, "hard", 5), 90);
  assert.equal(expectedRunScore(DEFAULT_GAME_RULES, "medium", 5), 140);
});

test("closed-form expectedRunScore matches step-by-step accumulation for large apple counts", () => {
  const custom = normalizeGameRules({
    moneyEasy: 13,
    moneyMedium: 29,
    moneyHard: 47,
    goldenEvery: 7,
    goldenMultiplier: 5,
  });
  for (const mode of ["easy", "medium", "hard"]) {
    let cumulative = 0;
    for (let apples = 0; apples <= 250; apples++) {
      if (apples > 0) cumulative += appleScore(custom, mode, apples);
      assert.equal(expectedRunScore(custom, mode, apples), cumulative);
    }
  }
  assert.equal(expectedRunScore(custom, "easy", 0), 0);
  assert.equal(expectedRunScore(custom, "easy", -5), 0);
  assert.equal(expectedRunScore(custom, "easy", 3.5), 0);
  assert.equal(
    expectedRunScore(DEFAULT_GAME_RULES, "hard", 10_000),
    10_000 * 30 + 2_000 * 30 * (3 - 1),
  );
});

import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { test } from "node:test";
import { buildSync } from "esbuild";

const bundled = buildSync({
  entryPoints: ["src/game/storage.ts"],
  bundle: true,
  format: "esm",
  platform: "browser",
  write: false,
}).outputFiles[0].text;

if (!globalThis.crypto) {
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto,
    configurable: true,
  });
}

const store = new Map();
globalThis.localStorage = {
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

const {
  cleanupLegacyRemoteData,
  newScoreEntry,
  normalizeScore,
  readScores,
  readTheme,
  saveScores,
  saveTheme,
} = await import(
  `data:text/javascript;base64,${Buffer.from(bundled).toString("base64")}`
);

test("storage validates custom high-apple runs up to 10,000 apples and rejects forged scores", () => {
  store.clear();
  const marathonRules = {
    moneyEasy: 10,
    moneyMedium: 20,
    moneyHard: 30,
    goldenEvery: 5,
    goldenMultiplier: 3,
    growthPerApple: 0,
    startingLength: 7,
    maxLength: 7,
    minimumLength: 3,
  };
  const expectedScore = 1_200 * 30 + 240 * 30 * 2;
  const entry = newScoreEntry(expectedScore, "hard", 1_200, marathonRules);
  assert.ok(entry, "custom zero-growth marathon run over 600 apples must save");
  assert.equal(saveScores([entry]), true);
  assert.equal(readScores().length, 1);
  assert.equal(readScores()[0].apples, 1_200);

  // Forged score mismatch must be rejected
  assert.equal(
    normalizeScore({
      ...entry,
      score: expectedScore + 10,
    }),
    null,
  );
  // Apples beyond MAX_APPLES (10,000) must be rejected
  assert.equal(
    newScoreEntry(10_001 * 10, "easy", 10_001, {
      goldenEvery: 2,
      goldenMultiplier: 1,
      moneyEasy: 10,
    }),
    null,
  );
});

test("storage rejects oversized JSON, deduplicates IDs, caps at 20, and validates theme", () => {
  store.clear();
  store.set("bitarcade.snakebyte.v1.scores", "x".repeat(100_001));
  assert.deepEqual(readScores(), []);

  store.clear();
  const entries = [];
  for (let i = 1; i <= 25; i++) {
    const score = newScoreEntry(i * 10, "easy", i, {
      moneyEasy: 10,
      goldenEvery: 20,
      goldenMultiplier: 1,
    });
    assert.ok(score);
    entries.push(score);
  }
  // Duplicate first entry
  entries.push({ ...entries[0] });
  assert.equal(saveScores(entries), true);
  const loaded = readScores();
  assert.equal(loaded.length, 20);
  assert.equal(loaded[0].apples, 25);

  assert.equal(readTheme(), "dark");
  saveTheme("light");
  assert.equal(readTheme(), "light");
  store.set("bitarcade.snakebyte.v1.theme", '"neon-pink"');
  assert.equal(readTheme(), "dark");
});

test("cleanupLegacyRemoteData removes legacy keys while keeping v1 records", () => {
  store.clear();
  store.set("bitarcade.snakebyte.v1.mode", '"medium"');
  store.set("bitarcade.snakebyte.v1.liveEntries", "legacy");
  store.set("bitarcade.snakebyte.v1.liveProfile", "secret");
  store.set("bitarcade.snakebyte.v1.best", "999");
  cleanupLegacyRemoteData();
  assert.equal(store.get("bitarcade.snakebyte.v1.mode"), '"medium"');
  assert.equal(store.has("bitarcade.snakebyte.v1.liveEntries"), false);
  assert.equal(store.has("bitarcade.snakebyte.v1.liveProfile"), false);
  assert.equal(store.has("bitarcade.snakebyte.v1.best"), false);
});

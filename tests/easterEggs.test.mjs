import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSync } from "esbuild";

const bundle = buildSync({
  entryPoints: ["src/game/easterEggs.ts"],
  bundle: true,
  write: false,
  format: "esm",
});
const {
  EGG_DETAILS,
  GOLD_RUSH_TARGET,
  KONAMI_SEQUENCE,
  SECRET_WORD,
  TITLE_TAP_TARGET,
  advanceGoldenStreak,
  advanceSequence,
  normalizeEggKey,
} = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
);

test("every Easter egg has a title, message, duration, and color burst", () => {
  const kinds = Object.keys(EGG_DETAILS);
  assert.equal(kinds.length, 5);
  for (const kind of kinds) {
    const details = EGG_DETAILS[kind];
    assert.ok(details.title.length > 0);
    assert.ok(details.message.length > 0);
    assert.ok(details.duration >= 5_000);
    assert.ok(details.colors.length >= 3);
    for (const color of details.colors)
      assert.match(color, /^#[0-9a-f]{6}$/i);
  }
});

test("secret keys normalize without changing arrow keys", () => {
  assert.equal(normalizeEggKey("A"), "a");
  assert.equal(normalizeEggKey("b"), "b");
  assert.equal(normalizeEggKey("ArrowUp"), "ArrowUp");
  assert.equal(normalizeEggKey(" "), " ");
});

test("the classic code and hidden word match exactly", () => {
  assert.equal(KONAMI_SEQUENCE.length, 10);
  assert.deepEqual([...SECRET_WORD], ["b", "y", "t", "e"]);
  let konami = [];
  let matched = false;
  for (const key of KONAMI_SEQUENCE) {
    const result = advanceSequence(konami, key, KONAMI_SEQUENCE);
    konami = result.buffer;
    matched ||= result.matched;
  }
  assert.equal(matched, true);
  assert.deepEqual(konami, []);

  let word = [];
  let wordMatched = false;
  for (const key of ["x", ...SECRET_WORD]) {
    const result = advanceSequence(word, key, SECRET_WORD);
    word = result.buffer;
    wordMatched ||= result.matched;
  }
  assert.equal(wordMatched, true);
});

test("partial sequences recover, but wrong keys break the chain", () => {
  const partial = advanceSequence(
    ["ArrowUp", "ArrowUp", "ArrowDown"],
    "ArrowLeft",
    KONAMI_SEQUENCE,
  );
  assert.equal(partial.matched, false);
  assert.deepEqual(partial.buffer, []);
  const overlap = advanceSequence(
    ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown"],
    "ArrowLeft",
    KONAMI_SEQUENCE,
  );
  assert.equal(overlap.matched, false);
  assert.deepEqual(overlap.buffer, [
    "ArrowUp",
    "ArrowUp",
    "ArrowDown",
    "ArrowDown",
    "ArrowLeft",
  ]);
  const broken = advanceSequence(
    ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown"],
    "x",
    KONAMI_SEQUENCE,
  );
  assert.equal(broken.matched, false);
  assert.deepEqual(broken.buffer, []);
});

test("the golden streak award fires once at three golden apples", () => {
  assert.equal(GOLD_RUSH_TARGET, 3);
  assert.equal(TITLE_TAP_TARGET, 7);
  const first = advanceGoldenStreak(0, false);
  assert.deepEqual(first, { streak: 1, award: false });
  const second = advanceGoldenStreak(first.streak, false);
  assert.deepEqual(second, { streak: 2, award: false });
  const third = advanceGoldenStreak(second.streak, false);
  assert.deepEqual(third, { streak: 3, award: true });
  const fourth = advanceGoldenStreak(third.streak, true);
  assert.deepEqual(fourth, { streak: 4, award: false });
});

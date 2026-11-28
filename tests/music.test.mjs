import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSync } from "esbuild";

const bundle = buildSync({
  entryPoints: ["src/game/music.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
});
const { MUSIC_PATTERNS, noteFrequency, phaseGain } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
);

test("note conversion handles sharps, octaves, and invalid input", () => {
  assert.ok(Math.abs(noteFrequency("A4") - 440) < 0.001);
  assert.ok(Math.abs(noteFrequency("C4") - 261.626) < 0.01);
  assert.ok(Math.abs(noteFrequency("F#5") - 739.989) < 0.01);
  assert.ok(Math.abs(noteFrequency("A3") - 220) < 0.001);
  assert.equal(noteFrequency("H4"), 0);
  assert.equal(noteFrequency("nonsense"), 0);
});

test("each difficulty has a complete 16-step chiptune arrangement", () => {
  const modes = Object.keys(MUSIC_PATTERNS);
  assert.deepEqual(modes, ["easy", "medium", "hard"]);
  const tempos = [];
  for (const mode of modes) {
    const pattern = MUSIC_PATTERNS[mode];
    tempos.push(pattern.tempo);
    assert.equal(pattern.lead.length, 16);
    assert.equal(pattern.bass.length, 16);
    assert.equal(pattern.arp.length, 16);
    assert.ok(pattern.lead.filter(Boolean).length >= 8);
    assert.ok(pattern.bass.filter(Boolean).length >= 4);
    assert.ok(pattern.arp.filter(Boolean).length >= 8);
    for (const note of [...pattern.lead, ...pattern.bass, ...pattern.arp])
      if (note) assert.ok(noteFrequency(note) > 0, `invalid note ${note}`);
  }
  assert.ok(tempos[0] < tempos[1] && tempos[1] < tempos[2]);
});

test("music mixing is loudest in play, softer on the title, silent otherwise", () => {
  assert.ok(phaseGain("playing") > phaseGain("ready"));
  assert.ok(phaseGain("ready") > phaseGain("paused"));
  assert.equal(phaseGain("paused"), phaseGain("over"));
  assert.equal(phaseGain("over"), phaseGain("won"));
});

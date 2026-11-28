import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSync } from "esbuild";

const bundle = buildSync({
  entryPoints: ["src/game/snakeColor.ts"],
  bundle: true,
  write: false,
  format: "esm",
});
const {
  DEFAULT_SNAKE_COLOR,
  SNAKE_COLOR_PRESETS,
  colorPresetName,
  makeSnakePalette,
  normalizeSnakeColor,
  tintedParticleColor,
} = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
);

test("only safe hex colors are accepted", () => {
  assert.equal(normalizeSnakeColor("#B7EB66"), "#b7eb66");
  assert.equal(normalizeSnakeColor(" #abc "), "#aabbcc");
  assert.equal(normalizeSnakeColor("#123456"), "#123456");
  for (const unsafe of [
    "red",
    "rgb(1,2,3)",
    "javascript:alert(1)",
    "#12345",
    "#1234567",
    "#ggg",
    null,
    42,
    { hex: "#ffffff" },
  ])
    assert.equal(normalizeSnakeColor(unsafe), null);
});

test("palettes are complete, named, and distinct", () => {
  assert.equal(DEFAULT_SNAKE_COLOR, "#b7eb66");
  assert.equal(SNAKE_COLOR_PRESETS.length, 8);
  assert.equal(new Set(SNAKE_COLOR_PRESETS.map((preset) => preset.hex)).size, 8);
  assert.equal(colorPresetName(DEFAULT_SNAKE_COLOR), "Lime");
  assert.equal(colorPresetName("#123456"), "Custom");
});

test("the chosen base color stays exact and all derived shades are hex", () => {
  for (const preset of SNAKE_COLOR_PRESETS) {
    const palette = makeSnakePalette(preset.hex);
    assert.equal(palette.head, preset.hex);
    assert.equal(palette.base, preset.hex);
    for (const value of Object.values(palette))
      assert.match(value, /^#[0-9a-f]{6}$/);
    assert.notEqual(palette.outline, palette.highlight);
  }
  const dark = makeSnakePalette("#000000");
  assert.equal(dark.head, "#000000");
  assert.match(dark.highlight, /^#[0-9a-f]{6}$/);
  assert.notEqual(dark.highlight, dark.head);
});

test("green engine particles follow the selected palette", () => {
  const palette = makeSnakePalette("#ff0000");
  assert.equal(tintedParticleColor("#bcf771", palette), palette.highlight);
  assert.equal(tintedParticleColor("#c4fa74", palette), palette.highlight);
  assert.equal(tintedParticleColor("#e7efce", palette), palette.headHighlight);
  assert.equal(tintedParticleColor("#7dad46", palette), palette.shadow);
  assert.equal(tintedParticleColor("#ff7867", palette), "#ff7867");
});

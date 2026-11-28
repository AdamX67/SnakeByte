export const DEFAULT_SNAKE_COLOR = "#b7eb66";

export type SnakeColorPreset = {
  id: string;
  name: string;
  hex: string;
};

export const SNAKE_COLOR_PRESETS: readonly SnakeColorPreset[] = [
  { id: "lime", name: "Lime", hex: DEFAULT_SNAKE_COLOR },
  { id: "mint", name: "Mint", hex: "#63e6be" },
  { id: "cyan", name: "Cyan", hex: "#5ed5f5" },
  { id: "blue", name: "Blue", hex: "#7aa7ff" },
  { id: "violet", name: "Violet", hex: "#bd8cff" },
  { id: "magenta", name: "Magenta", hex: "#f07ad9" },
  { id: "coral", name: "Coral", hex: "#ff8f7a" },
  { id: "gold", name: "Gold", hex: "#f5d36b" },
] as const;

/** Accepts only safe 3- or 6-digit hex colors; never CSS names or URLs. */
export function normalizeSnakeColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return null;
  const digits = match[1].toLowerCase();
  return digits.length === 3
    ? `#${digits
        .split("")
        .map((digit) => digit + digit)
        .join("")}`
    : `#${digits}`;
}

export function colorPresetName(hex: string) {
  return SNAKE_COLOR_PRESETS.find((preset) => preset.hex === hex)?.name ?? "Custom";
}

export type SnakePalette = {
  base: string;
  head: string;
  bodyA: string;
  bodyB: string;
  highlight: string;
  headHighlight: string;
  shadow: string;
  edge: string;
  outline: string;
  connector: string;
  speckle: string;
  nostril: string;
  floatText: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function rgbToHsl(hex: string) {
  const r = Number.parseInt(hex.slice(1, 3), 16) / 255;
  const g = Number.parseInt(hex.slice(3, 5), 16) / 255;
  const b = Number.parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2;
  let hue = 0;
  let saturation = 0;
  if (delta !== 0) {
    saturation = delta / (1 - Math.abs(2 * lightness - 1));
    switch (max) {
      case r:
        hue = ((g - b) / delta) % 6;
        break;
      case g:
        hue = (b - r) / delta + 2;
        break;
      default:
        hue = (r - g) / delta + 4;
    }
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  return { hue, saturation, lightness };
}

function hslToHex(hue: number, saturation: number, lightness: number) {
  const s = clamp(saturation, 0, 1);
  const l = clamp(lightness, 0, 1);
  const chroma = s * Math.min(l, 1 - l);
  const channel = (n: number) => {
    const k = (n + hue / 30) % 12;
    const value = l - chroma * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * value)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

/**
 * Turns one chosen color into a cohesive chunky pixel palette. The selected
 * base remains exact; extremely dark, bright, or desaturated choices still get
 * readable outlines and highlights without changing their hue.
 */
export function makeSnakePalette(input: string): SnakePalette {
  const base = normalizeSnakeColor(input) ?? DEFAULT_SNAKE_COLOR;
  const { hue, saturation, lightness } = rgbToHsl(base);
  const renderSaturation = clamp(Math.max(saturation, 0.36), 0.36, 1);
  const renderLightness = clamp(lightness, 0.38, 0.72);
  const shade = (lightnessDelta: number, saturationFactor = 1) =>
    hslToHex(
      hue,
      renderSaturation * saturationFactor,
      renderLightness + lightnessDelta,
    );

  return {
    base,
    head: base,
    bodyA: shade(-0.025),
    bodyB: base,
    highlight: shade(0.16, 0.95),
    headHighlight: shade(0.2, 0.9),
    shadow: shade(-0.17),
    edge: shade(-0.26, 0.9),
    outline: shade(-0.34, 0.84),
    connector: shade(-0.27, 0.9),
    speckle: shade(-0.12),
    nostril: shade(-0.34, 0.84),
    floatText: shade(0.19, 0.9),
  };
}

/** Maps the engine's original green burst flecks to the selected palette. */
export function tintedParticleColor(original: string, palette: SnakePalette) {
  switch (original.toLowerCase()) {
    case "#c4fa74":
    case "#bcf771":
      return palette.highlight;
    case "#e7efce":
      return palette.headHighlight;
    case "#7dad46":
      return palette.shadow;
    default:
      return original;
  }
}

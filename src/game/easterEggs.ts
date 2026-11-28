export type EggKind =
  | "rainbow"
  | "pixelParty"
  | "chromaMaster"
  | "goldRush"
  | "byteCabinet";

export type ActiveEasterEgg = {
  kind: EggKind;
  id: number;
  expiresAt: number;
};

export type EggDetails = {
  title: string;
  message: string;
  duration: number;
  colors: readonly string[];
};

export const EGG_DETAILS: Record<EggKind, EggDetails> = {
  rainbow: {
    title: "Rainbow run",
    message: "Chromatic coils engaged. The snake is cycling the whole arcade palette.",
    duration: 12_000,
    colors: ["#b7eb66", "#5ed5f5", "#f07ad9", "#f5d36b"],
  },
  pixelParty: {
    title: "Pixel party",
    message: "You found the cabinet's hidden confetti switch.",
    duration: 5_500,
    colors: ["#b7eb66", "#ff8f7a", "#f5d36b", "#5ed5f5"],
  },
  chromaMaster: {
    title: "Chroma master",
    message: "Every preset in perfect order. The cabinet salutes you.",
    duration: 6_000,
    colors: ["#b7eb66", "#63e6be", "#5ed5f5", "#bd8cff"],
  },
  goldRush: {
    title: "Gold rush",
    message: "Three golden apples in one run. Legendary.",
    duration: 6_500,
    colors: ["#ffcf59", "#fff0ac", "#ff9a41", "#b6ee77"],
  },
  byteCabinet: {
    title: "Byte unlocked",
    message: "A secret from the old arcade cabinets.",
    duration: 5_500,
    colors: ["#b7eb66", "#d2fa87", "#5ed5f5", "#f5d36b"],
  },
};

export const KONAMI_SEQUENCE = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "b",
  "a",
] as const;

export const SECRET_WORD = ["b", "y", "t", "e"] as const;
export const TITLE_TAP_TARGET = 7;
export const TITLE_TAP_WINDOW_MS = 2_500;
export const GOLD_RUSH_TARGET = 3;

export function normalizeEggKey(key: string) {
  return key.length === 1 ? key.toLowerCase() : key;
}

/** Tracks a secret sequence while allowing overlapping partial matches. */
export function advanceSequence(
  buffer: readonly string[],
  key: string,
  sequence: readonly string[],
): { buffer: string[]; matched: boolean } {
  let next = [...buffer, key];
  while (
    next.length > 0 &&
    !next.every((value, index) => value === sequence[index])
  ) {
    next = next.slice(1);
  }
  if (next.length === sequence.length) return { buffer: [], matched: true };
  return { buffer: next.slice(-sequence.length), matched: false };
}

export function advanceGoldenStreak(streak: number, alreadyAwarded: boolean) {
  const next = streak + 1;
  return {
    streak: next,
    award: !alreadyAwarded && next >= GOLD_RUSH_TARGET,
  };
}

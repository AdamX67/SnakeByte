import assert from "node:assert/strict";
import { mkdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const cacheDir = join(process.cwd(), "node_modules", ".cache");
mkdirSync(cacheDir, { recursive: true });
const bundlePath = join(
  cacheDir,
  `snakebyte-ui-test-${process.pid}-${Date.now()}.mjs`,
);

buildSync({
  stdin: {
    contents: `
      export { ThemeToggle } from "./src/components/ThemeToggle.tsx";
      export { SidePanel } from "./src/components/SidePanel.tsx";
      export { LocalLeaderboardDialog } from "./src/components/LocalLeaderboardDialog.tsx";
      export { GameRulesDialog, canAutoCommit } from "./src/components/GameRulesDialog.tsx";
      export { DEFAULT_GAME_RULES, normalizeGameRules } from "./src/game/rules.ts";
      export { prefersReducedMotion, subscribeReducedMotion } from "./src/game/motion.ts";
    `,
    resolveDir: process.cwd(),
    loader: "tsx",
  },
  bundle: true,
  outfile: bundlePath,
  format: "esm",
  platform: "node",
  external: ["react", "react-dom", "react-dom/server", "react/jsx-runtime"],
});

let loaded;
try {
  loaded = await import(pathToFileURL(bundlePath).href);
} finally {
  try {
    unlinkSync(bundlePath);
  } catch {
    /* ignore cleanup errors */
  }
}

const {
  ThemeToggle,
  SidePanel,
  LocalLeaderboardDialog,
  GameRulesDialog,
  canAutoCommit,
  DEFAULT_GAME_RULES,
  normalizeGameRules,
  prefersReducedMotion,
  subscribeReducedMotion,
} = loaded;

test("ThemeToggle uses clean action semantics without contradictory aria-pressed", () => {
  const darkHtml = renderToStaticMarkup(
    React.createElement(ThemeToggle, { theme: "dark", onToggle: () => {} }),
  );
  assert.match(darkHtml, /aria-label="Switch to light mode"/);
  assert.doesNotMatch(darkHtml, /aria-pressed=/);
  assert.match(darkHtml, /Dark mode/);

  const lightHtml = renderToStaticMarkup(
    React.createElement(ThemeToggle, { theme: "light", onToggle: () => {} }),
  );
  assert.match(lightHtml, /aria-label="Switch to dark mode"/);
  assert.doesNotMatch(lightHtml, /aria-pressed=/);
  assert.match(lightHtml, /Light mode/);
});

test("SidePanel renders roving radiogroup tabindex, dynamic goldenEvery pips, and clickable hex control", () => {
  const customRules = normalizeGameRules({
    ...DEFAULT_GAME_RULES,
    goldenEvery: 7,
    moneyMedium: 35,
  });
  const scores = [
    {
      id: "custom-1",
      score: 175,
      mode: "medium",
      apples: 5,
      date: Date.now(),
      rules: customRules,
    },
  ];
  const html = renderToStaticMarkup(
    React.createElement(SidePanel, {
      mode: "medium",
      phase: "playing",
      apples: 6,
      length: 10,
      pace: 9,
      snakeColor: "#3366ff",
      rules: customRules,
      scores,
      latestId: "custom-1",
      onMode: () => {},
      onSnakeColor: () => {},
      onOpenScores: () => {},
    }),
  );

  // Roving tabindex: Medium is 0, Easy and Hard are -1
  assert.match(
    html,
    /aria-checked="false"\s+tabindex="-1"[^>]*aria-label="Easy difficulty"/,
  );
  assert.match(
    html,
    /aria-checked="true"\s+tabindex="0"[^>]*aria-label="Medium difficulty"/,
  );
  assert.match(
    html,
    /aria-checked="false"\s+tabindex="-1"[^>]*aria-label="Hard difficulty"/,
  );

  // Dynamic goldenEvery = 7 with 6 apples -> progress 6, "Next one"
  assert.match(html, /aria-valuemax="7"\s+aria-valuenow="6"/);
  assert.match(html, /data-testid="golden-countdown">Next one</);
  const pipCount = (
    html.match(/data-testid="golden-pips">([\s\S]*?)<\/div>/)?.[1].match(/<i\b/g) ??
    []
  ).length;
  assert.equal(pipCount, 7);

  // Clickable hex badge with exact uppercase value + custom run marker
  assert.match(html, /data-testid="snake-color-hex"[^>]*>#3366FF<\/button>/);
  assert.match(html, /Custom rules: 10\/35\/30 coins · golden every 7/);
});

test("LocalLeaderboardDialog displays Classic best, rule-set filter, and Custom rule tooltips", () => {
  const customRules = normalizeGameRules({
    ...DEFAULT_GAME_RULES,
    moneyHard: 100,
    goldenEvery: 2,
    goldenMultiplier: 5,
  });
  const html = renderToStaticMarkup(
    React.createElement(LocalLeaderboardDialog, {
      scores: [
        {
          id: "custom-top",
          score: 600,
          mode: "hard",
          apples: 2,
          date: Date.now(),
          rules: customRules,
        },
        {
          id: "classic-top",
          score: 240,
          mode: "hard",
          apples: 6,
          date: Date.now() - 10_000,
          rules: DEFAULT_GAME_RULES,
        },
      ],
      latestId: "custom-top",
      onClear: () => {},
    }),
  );

  assert.match(html, /Personal best<\/span><strong>00600<\/strong>/);
  assert.match(
    html,
    /data-testid="board-classic-best"><span>Classic best<\/span><strong>00240<\/strong>/,
  );
  assert.match(html, /data-testid="board-rule-filters"/);
  assert.match(
    html,
    /class="custom-rule-badge"[^>]*title="10\/20\/100 coins · golden every 2 · 5× golden"/,
  );
});

test("GameRulesDialog renders all rule groups and canAutoCommit guards multi-digit typing", () => {
  const html = renderToStaticMarkup(
    React.createElement(GameRulesDialog, {
      rules: DEFAULT_GAME_RULES,
      onChange: () => {},
      onPreset: () => {},
      onClose: () => {},
    }),
  );
  for (const group of ["speed", "money", "length", "grace"]) {
    assert.match(html, new RegExp(`data-testid="rules-group-${group}"`));
  }
  assert.match(html, /data-testid="rules-active-label">Classic</);

  // Typing "120" into speedEasyMs (min 40, max 300): "1" and "12" stay in draft, "120" auto-commits!
  assert.equal(canAutoCommit("speedEasyMs", 1, DEFAULT_GAME_RULES), false);
  assert.equal(canAutoCommit("speedEasyMs", 12, DEFAULT_GAME_RULES), false);
  assert.equal(canAutoCommit("speedEasyMs", 120, DEFAULT_GAME_RULES), true);
  assert.equal(canAutoCommit("speedEasyMs", 999, DEFAULT_GAME_RULES), false);

  // Cross-field invariants: startingLength must remain > minimumLength and <= maxLength
  const current = normalizeGameRules({
    ...DEFAULT_GAME_RULES,
    startingLength: 10,
    minimumLength: 8,
    maxLength: 25,
  });
  assert.equal(canAutoCommit("startingLength", 3, current), false);
  assert.equal(canAutoCommit("startingLength", 8, current), false);
  assert.equal(canAutoCommit("startingLength", 20, current), true);
  assert.equal(canAutoCommit("startingLength", 30, current), false);
});

test("motion helper caches MediaQueryList and notifies subscribers when reduced-motion changes", () => {
  let changeHandler = null;
  let currentMatches = false;
  globalThis.window = {
    matchMedia() {
      return {
        get matches() {
          return currentMatches;
        },
        addEventListener(type, cb) {
          if (type === "change") changeHandler = cb;
        },
      };
    },
  };

  let notifications = 0;
  const unsubscribe = subscribeReducedMotion(() => {
    notifications += 1;
  });
  assert.equal(prefersReducedMotion(), false);
  assert.ok(changeHandler, "should register single change listener");

  currentMatches = true;
  changeHandler({ matches: true });
  assert.equal(prefersReducedMotion(), true);
  assert.equal(notifications, 1);
  unsubscribe();
});

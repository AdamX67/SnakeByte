import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSync } from "esbuild";

const bundle = buildSync({
  entryPoints: ["src/game/engine.ts"],
  bundle: true,
  write: false,
  format: "esm",
});
const {
  SnakeEngine,
  MODES,
  COLS,
  ROWS,
  START_LENGTH,
  START_HEAD,
  GRACE_MS,
  MIN_LENGTH,
  FRUIT_SCALE,
} = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
);

test("each mode starts, awards its first apple in under one second, and grows", () => {
  for (const mode of Object.keys(MODES)) {
    const game = new SnakeEngine(mode);
    game.start();
    assert.equal(game.phase, "playing");
    for (let i = 0; i < 4; i++) game.step();
    assert.equal(game.score, MODES[mode].points);
    assert.equal(game.apples, 1);
    assert.equal(game.snake.length, START_LENGTH + 1);
    assert.ok(game.interval * 4 < 1000);
    assert.ok(game.particles.length > 0 && game.floaters.length > 0);
    assert.ok(
      !game.snake.some((p) => p.x === game.food.x && p.y === game.food.y),
    );
  }
  assert.ok(
    MODES.easy.interval > MODES.medium.interval &&
      MODES.medium.interval > MODES.hard.interval,
  );
});

test("two-turn buffer is responsive and rejects reversals, duplicates, and overflow", () => {
  const game = new SnakeEngine();
  game.start();
  game.turn("left");
  game.turn("right");
  assert.deepEqual(game.queue, []);
  game.turn("up");
  game.turn("down");
  game.turn("left");
  game.turn("down");
  assert.deepEqual(game.queue, ["up", "left"]);
  game.step();
  assert.deepEqual(game.snake[0], { x: 9, y: 8 });
  game.step();
  assert.deepEqual(game.snake[0], { x: 8, y: 8 });
});

test("pause freezes motion and time; resume continues exactly where the run stopped", () => {
  const game = new SnakeEngine();
  game.start();
  game.update(70);
  game.graceMs = 500;
  game.pause();
  const before = JSON.stringify([
    game.snake,
    game.elapsed,
    game.clock,
    game.graceMs,
  ]);
  game.update(60000);
  game.turn("down");
  game.step();
  assert.equal(
    JSON.stringify([game.snake, game.elapsed, game.clock, game.graceMs]),
    before,
  );
  assert.equal(game.graceMs, 500);
  assert.deepEqual(game.queue, []);
  game.resume();
  game.step();
  assert.equal(game.snake[0].x, 10);
});

test("every fifth apple is golden, triples points, and speeds the run up", () => {
  const game = new SnakeEngine("medium");
  game.start();
  const events = [];
  game.onEvent = (x) => events.push(x);
  for (let i = 0; i < 5; i++) {
    game.food = { x: game.snake[0].x + 1, y: game.snake[0].y };
    assert.equal(game.golden, i === 4);
    game.step();
  }
  assert.equal(game.score, 140);
  assert.deepEqual(events, ["eat", "eat", "eat", "eat", "gold"]);
  assert.ok(game.interval < MODES.medium.interval);
});

test("wall hit costs one fragment, grants grace, and repeated bumps are free", () => {
  const game = new SnakeEngine("hard");
  const events = [];
  game.onEvent = (x) => events.push(x);
  game.start();
  game.snake = Array.from({ length: 5 }, (_, i) => ({
    x: COLS - 1 - i,
    y: 9,
  }));
  game.previous = game.snake.map((p) => ({ ...p }));
  game.direction = "right";
  game.food = { x: 2, y: 2 };
  game.step();
  assert.equal(game.phase, "playing");
  assert.equal(game.snake.length, 4);
  assert.equal(game.wallHits, 1);
  assert.equal(game.graceMs, GRACE_MS);
  assert.notEqual(game.direction, "right");
  assert.ok(events.includes("wall"));
  assert.ok(game.shake > 0);

  const savedLength = game.snake.length;
  game.direction = "right";
  game.step();
  assert.equal(game.phase, "playing");
  assert.equal(game.snake.length, savedLength);
  assert.equal(game.wallHits, 1);

  game.graceMs = 10;
  game.elapsed = 0;
  game.update(20);
  assert.equal(game.graceMs, 0);
  assert.ok(events.includes("graceEnd"));

  game.start();
  assert.equal(game.score, 0);
  assert.equal(game.apples, 0);
  assert.equal(game.phase, "playing");
  assert.equal(game.mode, "hard");
  assert.equal(game.snake.length, START_LENGTH);
  assert.equal(game.graceMs, 0);
  assert.equal(game.wallHits, 0);
  assert.deepEqual(game.particles, []);
});

test("a wall hit at minimum length ends the run", () => {
  const game = new SnakeEngine("hard");
  const events = [];
  game.onEvent = (x) => events.push(x);
  game.start();
  game.snake = Array.from({ length: MIN_LENGTH }, (_, i) => ({
    x: COLS - 1 - i,
    y: 9,
  }));
  game.previous = game.snake.map((p) => ({ ...p }));
  game.direction = "right";
  game.food = { x: 2, y: 2 };
  game.graceMs = 0;
  game.step();
  assert.equal(game.phase, "over");
  assert.ok(events.includes("over"));
  assert.equal(events.filter((x) => x === "over").length, 1);
});

test("self collision loses a fragment and grants grace, but departing tail is allowed", () => {
  const game = new SnakeEngine();
  game.start();
  game.snake = [
    { x: 3, y: 3 },
    { x: 3, y: 4 },
    { x: 4, y: 4 },
    { x: 4, y: 3 },
  ];
  game.direction = "right";
  game.step();
  assert.equal(game.phase, "playing");
  assert.equal(game.wallHits, 0);
  assert.equal(game.graceMs, 0);

  game.snake = [
    { x: 3, y: 3 },
    { x: 3, y: 4 },
    { x: 4, y: 4 },
    { x: 4, y: 3 },
    { x: 4, y: 2 },
  ];
  game.previous = game.snake.map((p) => ({ ...p }));
  game.direction = "right";
  game.food = { x: 0, y: 0 };
  game.graceMs = 0;
  game.step();
  assert.equal(game.phase, "playing");
  assert.equal(game.snake.length, 4);
  assert.equal(game.wallHits, 1);
  assert.equal(game.graceMs, GRACE_MS);
  assert.notEqual(game.direction, "right");
});

test("body bumps during grace are free, and collision at minimum length ends the run", () => {
  const shape = () => [
    { x: 3, y: 3 },
    { x: 3, y: 4 },
    { x: 4, y: 4 },
    { x: 4, y: 3 },
    { x: 4, y: 2 },
  ];
  const graceGame = new SnakeEngine();
  graceGame.start();
  graceGame.snake = shape();
  graceGame.previous = graceGame.snake.map((p) => ({ ...p }));
  graceGame.direction = "right";
  graceGame.food = { x: 0, y: 0 };
  graceGame.graceMs = 500;
  graceGame.step();
  assert.equal(graceGame.phase, "playing");
  assert.equal(graceGame.snake.length, 5);
  assert.equal(graceGame.wallHits, 0);
  assert.equal(graceGame.graceMs, 500);

  const fatal = new SnakeEngine();
  fatal.start();
  fatal.snake = [
    { x: 3, y: 3 },
    { x: 3, y: 4 },
    { x: 4, y: 4 },
  ];
  fatal.previous = fatal.snake.map((p) => ({ ...p }));
  fatal.direction = "down";
  fatal.food = { x: 0, y: 0 };
  fatal.graceMs = 0;
  fatal.step();
  assert.equal(fatal.phase, "over");
});

test("filling the field finishes with a win instead of an endless spawn search", () => {
  const game = new SnakeEngine();
  game.start();
  game.snake = [];
  for (let i = COLS * ROWS - 2; i >= 0; i--)
    game.snake.push({ x: i % COLS, y: Math.floor(i / COLS) });
  game.food = { x: COLS - 1, y: ROWS - 1 };
  game.direction = "right";
  game.step();
  assert.equal(game.phase, "won");
  assert.equal(game.snake.length, COLS * ROWS);
});

test("fixed-step movement is independent of rendering rate", () => {
  const heads = [];
  for (const hz of [30, 60, 90, 120]) {
    const game = new SnakeEngine();
    game.start();
    for (let i = 0; i < hz; i++) game.update(1000 / hz);
    heads.push(game.snake[0].x);
    assert.ok(game.score >= 10);
  }
  assert.equal(new Set(heads).size, 1);
});

test("fruit is visually oversized without changing its one-cell hitbox", () => {
  assert.ok(FRUIT_SCALE >= 1.5 && FRUIT_SCALE <= 2);
  const game = new SnakeEngine();
  game.start();
  assert.deepEqual(game.food, { x: START_HEAD + 2, y: 9 });
  const head = game.snake[0];
  game.food = { x: head.x + 1, y: head.y };
  game.step();
  assert.equal(game.apples, 1);
  assert.equal(game.snake.length, START_LENGTH + 1);
});

test("the snake starts longer, is bolder, and each mode is snappier", () => {
  assert.equal(START_LENGTH, 7);
  for (const mode of Object.keys(MODES)) {
    const game = new SnakeEngine(mode);
    game.start();
    assert.equal(game.snake.length, START_LENGTH);
    assert.equal(game.snapshot().length, START_LENGTH);
    assert.equal(game.snapshot().pace, Math.round(1000 / game.interval));
    // The first apple is two ticks away, comfortably inside the opening beat.
    assert.ok(game.interval * 2 < 1000);
  }
  assert.ok(MODES.easy.interval <= 148);
  assert.ok(MODES.medium.interval <= 106);
  assert.ok(MODES.hard.interval <= 76);
  const accelerated = new SnakeEngine("hard");
  accelerated.start();
  accelerated.apples = 40;
  assert.ok(accelerated.interval < MODES.hard.interval);
  assert.ok(accelerated.interval >= MODES.hard.interval * 0.35);
});

test("returning to the title restores the full starting board", () => {
  const game = new SnakeEngine("hard");
  game.start();
  for (let i = 0; i < 3; i++) game.step();
  assert.ok(game.snake.length > START_LENGTH);
  game.wallHits = 2;
  game.graceMs = 200;
  game.ready();
  assert.equal(game.phase, "ready");
  assert.equal(game.snake.length, START_LENGTH);
  assert.deepEqual(game.snake[0], { x: START_HEAD, y: 9 });
  assert.deepEqual(game.food, { x: START_HEAD + 2, y: 9 });
  assert.equal(game.score, 0);
  assert.equal(game.apples, 0);
  assert.equal(game.elapsed, 0);
  assert.equal(game.direction, "right");
  assert.deepEqual(game.queue, []);
  assert.equal(game.graceMs, 0);
  assert.equal(game.wallHits, 0);
  assert.equal(game.snapshot().length, START_LENGTH);
  assert.equal(game.snapshot().pace, Math.round(1000 / game.interval));
  assert.equal(game.snapshot().grace, 0);
  assert.equal(game.snapshot().wallHits, 0);
});

test("custom rules change length, golden cadence, points, and wall behavior", () => {
  const custom = {
    applePoints: 25,
    goldenEvery: 3,
    goldenMultiplier: 4,
    startingLength: 9,
    wallGraceMs: 800,
    wallCost: 2,
  };
  const game = new SnakeEngine("hard", custom);
  game.start();
  assert.equal(game.snake.length, 9);
  for (let i = 0; i < 3; i++) {
    game.food = { x: game.snake[0].x + 1, y: game.snake[0].y };
    game.step();
  }
  assert.equal(game.apples, 3);
  assert.equal(game.score, 450);

  const wallGame = new SnakeEngine("easy", custom);
  wallGame.start();
  wallGame.snake = Array.from({ length: 5 }, (_, i) => ({
    x: COLS - 1 - i,
    y: 9,
  }));
  wallGame.previous = wallGame.snake.map((point) => ({ ...point }));
  wallGame.direction = "right";
  wallGame.food = { x: 2, y: 2 };
  wallGame.step();
  assert.equal(wallGame.phase, "playing");
  assert.equal(wallGame.graceMs, 800);
  assert.equal(wallGame.snake.length, 3);
  assert.equal(wallGame.wallHits, 1);
});

test("full-control rules independently drive speed, money, length, and grace", () => {
  const custom = {
    moneyEasy: 7,
    moneyMedium: 11,
    moneyHard: 13,
    goldenEvery: 4,
    goldenMultiplier: 2,
    speedEasyMs: 200,
    speedMediumMs: 150,
    speedHardMs: 100,
    speedRampPercent: 0,
    startingLength: 12,
    maxLength: 14,
    minimumLength: 4,
    growthPerApple: 3,
    wallCost: 2,
    wallGraceMs: 1234,
  };
  const speed = new SnakeEngine("easy", custom);
  speed.start();
  assert.equal(speed.interval, 200);
  speed.apples = 20;
  assert.equal(speed.interval, 200);
  assert.equal(new SnakeEngine("medium", custom).interval, 150);
  assert.equal(new SnakeEngine("hard", custom).interval, 100);

  const money = new SnakeEngine("hard", custom);
  money.start();
  for (let i = 0; i < 4; i++) {
    money.food = { x: money.snake[0].x + 1, y: money.snake[0].y };
    money.step();
  }
  assert.equal(money.score, 65);

  const growth = new SnakeEngine("easy", custom);
  growth.start();
  assert.equal(growth.snake.length, 12);
  assert.deepEqual(growth.food, { x: 13, y: 9 });
  for (let i = 0; i < 2; i++) growth.step();
  assert.equal(growth.score, 7);
  assert.equal(growth.snake.length, 13);
  growth.food = { x: 1, y: 1 };
  growth.step();
  assert.equal(growth.snake.length, 14);
  growth.step();
  assert.equal(growth.snake.length, 14, "maxLength must cap growth");
  assert.equal(growth.pendingGrowth, 0);

  const wall = new SnakeEngine("easy", custom);
  wall.start();
  wall.snake = Array.from({ length: 8 }, (_, i) => ({
    x: COLS - 1 - i,
    y: 9,
  }));
  wall.previous = wall.snake.map((point) => ({ ...point }));
  wall.direction = "right";
  wall.food = { x: 2, y: 2 };
  wall.step();
  assert.equal(wall.phase, "playing");
  assert.equal(wall.snake.length, 6);
  assert.equal(wall.graceMs, 1234);
  wall.direction = "right";
  wall.step();
  assert.equal(wall.snake.length, 6, "grace bumps must be free");
  assert.deepEqual(
    wall.previous,
    wall.snake,
    "grace bounce should sync interpolation previous positions",
  );
});

test("constructor and ready-phase setRules immediately reflect startingLength", () => {
  const game = new SnakeEngine("easy", { startingLength: 14, maxLength: 30 });
  assert.equal(game.phase, "ready");
  assert.equal(game.snake.length, 14);
  assert.equal(game.snapshot().length, 14);

  game.setRules({ startingLength: 20, maxLength: 40 });
  assert.equal(game.snake.length, 20);
  assert.equal(game.snapshot().length, 20);
});

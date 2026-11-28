import {
  appleScore,
  DEFAULT_GAME_RULES,
  isGoldenApple,
  modeSpeed,
  normalizeGameRules,
  type GameRules,
} from "./rules";

export const COLS = 30;
export const ROWS = 18;
/** A longer, more readable snake from the first frame. */
export const START_LENGTH = DEFAULT_GAME_RULES.startingLength;
export const START_HEAD = 9;
/** Visual fruit size in grid cells; the hitbox remains the center cell. */
export const FRUIT_SCALE = 1.65;
/** Below this length, a wall hit ends the run instead of costing a fragment. */
export const MIN_LENGTH = DEFAULT_GAME_RULES.minimumLength;
/** Temporary protection after a wall or body collision; extra bumps are free. */
export const GRACE_MS = DEFAULT_GAME_RULES.wallGraceMs;
const START_Y = 9;

export const MODES = {
  easy: {
    label: "Easy",
    description: "Steady and forgiving",
    interval: DEFAULT_GAME_RULES.speedEasyMs,
    points: DEFAULT_GAME_RULES.moneyEasy,
  },
  medium: {
    label: "Medium",
    description: "Quick, lively corners",
    interval: DEFAULT_GAME_RULES.speedMediumMs,
    points: DEFAULT_GAME_RULES.moneyMedium,
  },
  hard: {
    label: "Hard",
    description: "Blistering pace",
    interval: DEFAULT_GAME_RULES.speedHardMs,
    points: DEFAULT_GAME_RULES.moneyHard,
  },
} as const;

export type Mode = keyof typeof MODES;
export type Phase = "ready" | "playing" | "paused" | "over" | "won";
export type Direction = "up" | "down" | "left" | "right";
export type Point = { x: number; y: number };
export type GameEvent =
  | "start"
  | "eat"
  | "gold"
  | "over"
  | "won"
  | "wall"
  | "graceEnd"
  | "pause"
  | "resume"
  | "ready"
  | "mode";
export type GameView = {
  phase: Phase;
  mode: Mode;
  score: number;
  apples: number;
  length: number;
  pace: number;
  grace: number;
  wallHits: number;
};
export type Particle = Point & {
  vx: number;
  vy: number;
  life: number;
  ttl: number;
  size: number;
  color: string;
};
export type Floater = Point & { text: string; life: number; golden: boolean };

const vector: Record<Direction, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};
const opposite: Record<Direction, Direction> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};

export class SnakeEngine {
  phase: Phase = "ready";
  mode: Mode;
  score = 0;
  apples = 0;
  snake: Point[] = [];
  previous: Point[] = [];
  direction: Direction = "right";
  food: Point = { x: 11, y: 9 };
  queue: Direction[] = [];
  elapsed = 0;
  clock = 0;
  foodAge = 1;
  shake = 0;
  flash = 0;
  graceMs = 0;
  wallHits = 0;
  pendingGrowth = 0;
  rules: GameRules = normalizeGameRules(DEFAULT_GAME_RULES);
  particles: Particle[] = [];
  floaters: Floater[] = [];
  onEvent: (event: GameEvent) => void = () => {};

  constructor(mode: Mode = "easy", rules: GameRules = DEFAULT_GAME_RULES) {
    this.mode = mode;
    this.rules = normalizeGameRules(rules);
    this.resetBoard();
  }

  get interval() {
    // Speed and its ramp are entirely controlled by the active rule set.
    const base = modeSpeed(this.rules, this.mode);
    const ramp =
      Math.floor(this.apples / 4) * (this.rules.speedRampPercent / 100);
    return Math.max(28, base * Math.max(0.35, 1 - ramp));
  }

  get pace() {
    return Math.round(1000 / this.interval);
  }

  get golden() {
    return isGoldenApple(this.rules, this.apples);
  }

  setRules(rules: GameRules) {
    this.rules = normalizeGameRules(rules);
    this.graceMs = 0;
    this.pendingGrowth = 0;
    if (this.phase === "ready") {
      this.resetBoard();
    }
  }

  private resetBoard() {
    const length = this.rules.startingLength;
    // Keep the entire opening snake inside the board, even at length 30.
    const headX = Math.max(START_HEAD, length - 1);
    this.snake = Array.from({ length }, (_, i) => ({
      x: headX - i,
      y: START_Y,
    }));
    this.previous = this.snake.map((p) => ({ ...p }));
    this.pendingGrowth = 0;
    if (headX + 2 < COLS) {
      this.direction = "right";
      this.food = { x: headX + 2, y: START_Y };
    } else {
      this.direction = "up";
      this.food = { x: headX, y: START_Y - 2 };
    }
  }

  snapshot(): GameView {
    return {
      phase: this.phase,
      mode: this.mode,
      score: this.score,
      apples: this.apples,
      length: this.snake.length || this.rules.startingLength,
      pace: this.pace,
      grace: this.graceMs,
      wallHits: this.wallHits,
    };
  }

  start(mode: Mode = this.mode) {
    this.mode = mode;
    this.phase = "playing";
    this.resetBoard();
    this.queue = [];
    this.score = 0;
    this.apples = 0;
    this.elapsed = 0;
    this.clock = 0;
    this.shake = 0;
    this.flash = 0;
    this.graceMs = 0;
    this.wallHits = 0;
    this.foodAge = 0;
    this.particles = [];
    this.floaters = [];
    this.onEvent("start");
  }

  ready() {
    this.phase = "ready";
    this.resetBoard();
    this.queue = [];
    this.score = 0;
    this.apples = 0;
    this.elapsed = 0;
    this.clock = 0;
    this.foodAge = 1;
    this.shake = 0;
    this.flash = 0;
    this.graceMs = 0;
    this.wallHits = 0;
    this.particles = [];
    this.floaters = [];
    this.onEvent("ready");
  }

  setMode(mode: Mode) {
    this.mode = mode;
    this.onEvent("mode");
  }

  turn(direction: Direction) {
    if (this.phase !== "playing" || this.queue.length >= 2) return;
    const last = this.queue[this.queue.length - 1] ?? this.direction;
    if (direction !== last && direction !== opposite[last])
      this.queue.push(direction);
  }

  pause() {
    if (this.phase !== "playing") return;
    this.phase = "paused";
    this.queue = [];
    this.onEvent("pause");
  }

  resume() {
    if (this.phase !== "paused") return;
    this.phase = "playing";
    this.onEvent("resume");
  }

  burst(point: Point, colors: string[], count: number, power: number) {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.45;
      const speed = (0.3 + Math.random() * 0.7) * power;
      const ttl = 0.25 + Math.random() * 0.42;
      this.particles.push({
        x: point.x + 0.5,
        y: point.y + 0.5,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1,
        life: ttl,
        ttl,
        size: 0.11 + Math.random() * 0.15,
        color: colors[i % colors.length],
      });
    }
    if (this.particles.length > 96)
      this.particles.splice(0, this.particles.length - 96);
  }

  private endRun(head: Point) {
    this.phase = "over";
    this.graceMs = 0;
    this.queue = [];
    this.pendingGrowth = 0;
    this.shake = 7;
    this.flash = 0.24;
    this.burst(head, ["#c4fa74", "#e7efce", "#7dad46", "#ff977b"], 36, 8);
    this.onEvent("over");
  }

  /**
   * Choose a safe recovery direction after a wall or body collision.
   * ignoreTailFragments previews the board after fragment loss, so a freshly
   * freed tail cell can be used for the escape.
   */
  private bounceFromCollision(ignoreTailFragments = 0): boolean {
    const head = this.snake[0];
    if (!head) return false;
    const effectiveLength = Math.max(
      this.rules.minimumLength,
      this.snake.length - ignoreTailFragments,
    );
    const occupied = new Set(
      this.snake
        .slice(0, Math.max(0, effectiveLength - 1))
        .map((p) => p.y * COLS + p.x),
    );
    const order: Direction[] =
      this.direction === "left" || this.direction === "right"
        ? ["up", "down", "left", "right"]
        : ["left", "right", "up", "down"];
    for (const candidate of order) {
      if (candidate === opposite[this.direction]) continue;
      const move = vector[candidate];
      const x = head.x + move.x;
      const y = head.y + move.y;
      if (x < 0 || y < 0 || x >= COLS || y >= ROWS) continue;
      if (occupied.has(y * COLS + x)) continue;
      this.direction = candidate;
      this.queue = [];
      return true;
    }
    return false;
  }

  /**
   * Wall and self collisions share one recovery rule: lose fragments, bounce
   * into a safe direction, and grant temporary protection. During grace,
   * further bumps only redirect. Below the minimum length, the run ends.
   */
  private recoverFromCollision(head: Point) {
    this.pendingGrowth = 0;
    if (this.graceMs > 0) {
      if (!this.bounceFromCollision()) {
        this.endRun(head);
        return;
      }
      this.previous = this.snake.map((p) => ({ ...p }));
      return;
    }
    const remaining = this.snake.length - this.rules.wallCost;
    if (
      remaining < this.rules.minimumLength ||
      !this.bounceFromCollision(this.rules.wallCost)
    ) {
      this.endRun(head);
      return;
    }
    this.snake = this.snake.slice(
      0,
      Math.max(this.rules.minimumLength, remaining),
    );
    this.previous = this.snake.map((p) => ({ ...p }));
    this.wallHits += 1;
    this.graceMs = this.rules.wallGraceMs;
    this.shake = 5;
    this.flash = 0.18;
    this.burst(head, ["#f5d36b", "#ff9a41", "#b6ee77", "#ff7867"], 26, 5.8);
    this.onEvent("wall");
  }

  private placeFood(): boolean {
    const occupied = new Set(this.snake.map((p) => p.y * COLS + p.x));
    const head = this.snake[0];
    const nearby: Point[] = [];
    const free: Point[] = [];
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (occupied.has(y * COLS + x)) continue;
        const p = { x, y };
        free.push(p);
        const distance = Math.abs(x - head.x) + Math.abs(y - head.y);
        if (
          distance >= 4 &&
          distance <= 9 &&
          x > 1 &&
          x < COLS - 2 &&
          y > 1 &&
          y < ROWS - 2
        )
          nearby.push(p);
      }
    }
    if (!free.length) {
      this.phase = "won";
      this.onEvent("won");
      return false;
    }
    const options = nearby.length && !this.golden ? nearby : free;
    this.food = options[Math.floor(Math.random() * options.length)];
    this.foodAge = 0;
    return true;
  }

  step() {
    if (this.phase !== "playing") return;
    this.direction = this.queue.shift() ?? this.direction;
    const head = this.snake[0];
    const move = vector[this.direction];
    const next = { x: head.x + move.x, y: head.y + move.y };
    const eating = next.x === this.food.x && next.y === this.food.y;
    const wallHit =
      next.x < 0 || next.y < 0 || next.x >= COLS || next.y >= ROWS;
    if (this.snake.length >= this.rules.maxLength) this.pendingGrowth = 0;
    // The tail stays when eating, or while queued growth is being applied.
    const willGrow = eating
      ? this.snake.length < this.rules.maxLength
      : this.pendingGrowth > 0;
    const bodyLength = this.snake.length - (willGrow ? 0 : 1);
    const bodyHit = this.snake.some(
      (p, i) => i < bodyLength && p.x === next.x && p.y === next.y,
    );

    if (wallHit || bodyHit) {
      this.recoverFromCollision(head);
      return;
    }
    this.previous = this.snake;
    this.snake = [next, ...this.snake];
    if (eating && !willGrow) this.snake.pop();
    if (!eating) {
      if (willGrow) this.pendingGrowth -= 1;
      else this.snake.pop();
      return;
    }
    if (willGrow && this.rules.growthPerApple > 1)
      this.pendingGrowth += this.rules.growthPerApple - 1;

    const gold = this.golden;
    const points = appleScore(this.rules, this.mode, this.apples + 1);
    this.score += points;
    this.apples++;
    this.shake = gold ? 3.5 : 1.7;
    this.burst(
      next,
      gold
        ? ["#ffcf59", "#fff0ac", "#ff9a41"]
        : ["#ff7867", "#ffe1b0", "#bcf771", "#e94e4d"],
      gold ? 30 : 18,
      gold ? 6.5 : 4.8,
    );
    this.floaters.push({
      x: next.x + 0.5,
      y: next.y - 0.1,
      text: `+${points}`,
      life: 0.9,
      golden: gold,
    });
    this.onEvent(gold ? "gold" : "eat");
    this.placeFood();
  }

  update(ms: number) {
    if (this.phase === "paused" || this.phase === "ready") return;
    const dt = Math.max(0, Math.min(ms, 85)) / 1000;
    this.clock += dt;
    this.foodAge += dt;
    this.shake = Math.max(0, this.shake - dt * 18);
    this.flash = Math.max(0, this.flash - dt);
    if (this.phase === "playing") {
      if (this.graceMs > 0) {
        this.graceMs = Math.max(0, this.graceMs - dt * 1000);
        if (this.graceMs === 0) this.onEvent("graceEnd");
      }
      this.elapsed += dt * 1000;
      while (this.elapsed >= this.interval && this.phase === "playing") {
        this.elapsed -= this.interval;
        this.step();
      }
    }
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += dt * 7;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const f of this.floaters) {
      f.y -= dt * 1.8;
      f.life -= dt;
    }
    this.floaters = this.floaters.filter((f) => f.life > 0);
  }
}

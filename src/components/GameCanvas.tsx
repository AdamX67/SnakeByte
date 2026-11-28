import { useEffect, useRef } from "react";
import {
  COLS,
  FRUIT_SCALE,
  ROWS,
  type Phase,
  type SnakeEngine,
} from "../game/engine";
import {
  makeSnakePalette,
  SNAKE_COLOR_PRESETS,
  tintedParticleColor,
} from "../game/snakeColor";

function makeApple(golden: boolean) {
  const sprite = document.createElement("canvas");
  sprite.width = 16;
  sprite.height = 16;
  const ctx = sprite.getContext("2d")!;
  const pixels = [
    "........b.......",
    "........bb..gg..",
    ".........bgggg..",
    ".........bgG....",
    "....rrr.rrr.....",
    "..rRRRRrRRRrr...",
    ".rRhhRRRRRRRRr..",
    ".RhhRRRRRRRRRr..",
    ".RhRRRRRRRRRRr..",
    ".RRRRRRRRRRRRd..",
    ".rRRRRRRRRRRrd..",
    "..rRRRRRRRRrdd..",
    "..drRRRRRRrdd...",
    "...drrRRrrdd....",
    "....ddd.ddd.....",
    "................",
  ];
  const colors: Record<string, string> = {
    b: "#af7d4e",
    g: "#68a642",
    G: "#bcf37a",
    r: golden ? "#e79f35" : "#d74b50",
    R: golden ? "#ffd264" : "#fc7567",
    h: golden ? "#fff4c2" : "#ffcfab",
    d: golden ? "#936329" : "#903a46",
  };
  pixels.forEach((row, y) =>
    [...row].forEach((p, x) => {
      if (p !== ".") {
        ctx.fillStyle = colors[p];
        ctx.fillRect(x, y, 1, 1);
      }
    }),
  );
  return sprite;
}

function makeField(width: number, height: number, dpr: number) {
  const surface = document.createElement("canvas");
  surface.width = Math.round(width * dpr);
  surface.height = Math.round(height * dpr);
  const ctx = surface.getContext("2d")!;
  ctx.scale(dpr, dpr);
  const cw = width / COLS,
    ch = height / ROWS;
  ctx.fillStyle = "#11151e";
  ctx.fillRect(0, 0, width, height);
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      ctx.fillStyle = (x + y) % 2 ? "#191e29" : "#171b26";
      ctx.fillRect(
        Math.round(x * cw) + 1,
        Math.round(y * ch) + 1,
        Math.ceil(cw) - 1,
        Math.ceil(ch) - 1,
      );
      if ((x * 13 + y * 23) % 37 === 0) {
        ctx.fillStyle = "#303341";
        const px = Math.round((x + 0.72) * cw),
          py = Math.round((y + 0.3) * ch);
        ctx.fillRect(px, py, 2, 2);
        ctx.fillRect(px + 3, py + 4, 2, 1);
      }
    }
  }
  ctx.fillStyle = "#555665";
  for (const [x, y, dx, dy] of [
    [0, 0, 1, 1],
    [width, 0, -1, 1],
    [0, height, 1, -1],
    [width, height, -1, -1],
  ]) {
    ctx.fillRect(x, y, dx * 13, dy * 2);
    ctx.fillRect(x, y, dx * 2, dy * 13);
  }
  return surface;
}

export function GameCanvas({
  game,
  phase,
  snakeColor,
  rainbowActive = false,
}: {
  game: SnakeEngine;
  phase: Phase;
  snakeColor: string;
  rainbowActive?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const fixedPalette = makeSnakePalette(snakeColor);
    const rainbowPalettes = SNAKE_COLOR_PRESETS.map((preset) =>
      makeSnakePalette(preset.hex),
    );
    const apples = [makeApple(false), makeApple(true)];
    let width = 0,
      height = 0,
      request = 0,
      previousTime = performance.now();
    let field: HTMLCanvasElement;

    function paint() {
      if (!ctx || !width || !height) return;
      const cw = width / COLS,
        ch = height / ROWS,
        unit = Math.min(cw, ch);
      const time = game.clock;
      const palette = rainbowActive
        ? rainbowPalettes[Math.floor(time * 2.6) % rainbowPalettes.length]
        : fixedPalette;
      ctx.save();
      ctx.fillStyle = "#10131b";
      ctx.fillRect(0, 0, width, height);
      if (game.shake > 0 && !reduced) {
        ctx.translate(
          Math.round(Math.sin(time * 170) * game.shake),
          Math.round(Math.cos(time * 130) * game.shake * 0.65),
        );
      }
      ctx.drawImage(field, 0, 0, width, height);

      const foodX = (game.food.x + 0.5) * cw,
        foodY = (game.food.y + 0.5) * ch;
      const bob = reduced ? 0 : Math.sin(time * 4.5) * unit * 0.045;
      const pop = reduced ? 1 : Math.min(1, 0.78 + game.foodAge * 4);
      const appleSize = unit * FRUIT_SCALE * pop;
      ctx.fillStyle = "#0e1118";
      ctx.fillRect(
        Math.round(foodX - appleSize * 0.29),
        Math.round(foodY + appleSize * 0.31),
        Math.round(appleSize * 0.58),
        Math.max(2, Math.round(unit * 0.11)),
      );
      ctx.drawImage(
        apples[game.golden ? 1 : 0],
        Math.round(foodX - appleSize / 2),
        Math.round(foodY - appleSize / 2 + bob),
        appleSize,
        appleSize,
      );
      if (game.golden || Math.sin(time * 4) > 0.65) {
        ctx.fillStyle = game.golden ? "#ffdf7b" : "#ffd6b4";
        const x = foodX + appleSize * 0.39,
          y = foodY - appleSize * 0.27 + bob;
        ctx.fillRect(Math.round(x - 3), Math.round(y), 8, 2);
        ctx.fillRect(Math.round(x), Math.round(y - 3), 2, 8);
        if (game.golden) {
          ctx.fillRect(
            Math.round(foodX - appleSize * 0.48),
            Math.round(foodY + appleSize * 0.1 + bob),
            5,
            2,
          );
        }
      }

      const fraction =
        game.phase === "over" || game.phase === "won"
          ? 1
          : Math.min(1, game.elapsed / game.interval);
      const centers = game.snake.map((p, i) => {
        const old =
          game.previous[i] ?? game.previous[game.previous.length - 1] ?? p;
        return {
          x: (old.x + (p.x - old.x) * fraction + 0.5) * cw,
          y: (old.y + (p.y - old.y) * fraction + 0.5) * ch,
        };
      });
      // Connecting the inset segments keeps the body continuous through buffered turns.
      if (centers.length) {
        ctx.lineWidth = unit * 0.74;
        ctx.strokeStyle = palette.connector;
        ctx.lineJoin = "bevel";
        ctx.beginPath();
        ctx.moveTo(centers[0].x, centers[0].y);
        for (const p of centers) ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
      for (let i = centers.length - 1; i >= 1; i--) {
        const p = centers[i];
        // The last two segments taper into a chunky pixel tail.
        const scale =
          i === centers.length - 1
            ? 0.72
            : i === centers.length - 2
              ? 0.84
              : 0.9;
        const w = Math.round(cw * scale),
          h = Math.round(ch * scale);
        const x = Math.round(p.x - w / 2),
          y = Math.round(p.y - h / 2);
        const edge = Math.max(1, Math.round(unit * 0.04));
        ctx.fillStyle = palette.outline;
        ctx.fillRect(x + edge, y + edge * 2, w, h);
        ctx.fillStyle = palette.edge;
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = i % 2 ? palette.bodyA : palette.bodyB;
        ctx.fillRect(x + edge, y + edge, w - edge * 2, h - edge * 2);
        ctx.fillStyle = palette.highlight;
        ctx.fillRect(
          x + edge * 2,
          y + edge,
          Math.max(2, w - edge * 4),
          Math.max(2, h * 0.14),
        );
        ctx.fillStyle = palette.shadow;
        ctx.fillRect(x + edge, y + h - edge - h * 0.19, w - edge * 2, h * 0.19);
        ctx.fillStyle = palette.speckle;
        ctx.fillRect(
          x + w * 0.25,
          y + h * 0.39,
          Math.max(2, w * 0.2),
          Math.max(2, h * 0.2),
        );
        ctx.fillStyle = palette.shadow;
        ctx.fillRect(
          x + w * 0.7,
          y + h * 0.28,
          Math.max(1, w * 0.09),
          Math.max(1, h * 0.09),
        );
      }
      if (centers[0]) {
        const head = centers[0],
          // Oversized head silhouette keeps the snake bold and readable.
          s = unit * 1.08;
        ctx.save();
        ctx.translate(Math.round(head.x), Math.round(head.y));
        ctx.rotate(
          { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[
            game.direction
          ],
        );
        ctx.fillStyle = palette.outline;
        ctx.fillRect(-s * 0.5, -s * 0.44, s * 0.98, s * 0.9);
        ctx.fillStyle = palette.edge;
        ctx.fillRect(-s * 0.44, -s * 0.4, s * 0.9, s * 0.82);
        ctx.fillStyle = palette.head;
        ctx.fillRect(-s * 0.38, -s * 0.46, s * 0.7, s * 0.92);
        ctx.fillRect(s * 0.12, -s * 0.35, s * 0.4, s * 0.7);
        ctx.fillStyle = palette.headHighlight;
        ctx.fillRect(-s * 0.28, -s * 0.29, s * 0.22, s * 0.12);
        ctx.fillStyle = "#f4f1db";
        const blink = time % 3.4 > 3.26;
        for (const eye of [-1, 1]) {
          const ey = eye * s * 0.26;
          ctx.fillRect(
            s * 0.06,
            ey - s * 0.14,
            s * 0.29,
            blink ? s * 0.055 : s * 0.28,
          );
          ctx.fillStyle = "#172020";
          ctx.fillRect(
            s * 0.23,
            ey - s * 0.08,
            s * 0.13,
            blink ? s * 0.055 : s * 0.18,
          );
          if (!blink) {
            ctx.fillStyle = "#eef8d0";
            ctx.fillRect(s * 0.34, ey - s * 0.06, s * 0.045, s * 0.06);
          }
          ctx.fillStyle = "#f4f1db";
        }
        ctx.fillStyle = palette.nostril;
        ctx.fillRect(s * 0.43, -s * 0.02, s * 0.1, s * 0.06);
        if (time % 2 < 0.55 && game.phase === "playing") {
          ctx.fillStyle = "#f67c77";
          ctx.fillRect(s * 0.46, -s * 0.04, s * 0.25, s * 0.09);
          ctx.fillRect(s * 0.66, -s * 0.14, s * 0.14, s * 0.09);
          ctx.fillRect(s * 0.66, s * 0.04, s * 0.14, s * 0.09);
        }
        ctx.restore();
      }
      if (game.graceMs > 0 && game.phase === "playing" && centers[0]) {
        const head = centers[0];
        const ratio = Math.max(
          0,
          Math.min(1, game.graceMs / Math.max(1, game.rules.wallGraceMs)),
        );
        const pulse = reduced ? 1 : 0.78 + Math.sin(time * 22) * 0.18;
        ctx.save();
        ctx.globalAlpha = Math.max(0.35, ratio * pulse);
        ctx.strokeStyle = "#f5d36b";
        ctx.lineWidth = Math.max(2, unit * 0.07);
        ctx.setLineDash([unit * 0.18, unit * 0.11]);
        ctx.strokeRect(
          head.x - unit * 0.64,
          head.y - unit * 0.64,
          unit * 1.28,
          unit * 1.28,
        );
        ctx.setLineDash([]);
        ctx.font = `${Math.max(8, Math.round(unit * 0.34))}px 'Pixel', monospace`;
        ctx.textAlign = "center";
        ctx.fillStyle = "#ffe6a1";
        ctx.fillText(
          `GRACE ${(game.graceMs / 1000).toFixed(1)}`,
          head.x,
          head.y - unit * 0.82,
        );
        ctx.restore();
      }
      if (!reduced)
        for (const p of game.particles) {
          ctx.globalAlpha = Math.min(1, (p.life / p.ttl) * 2);
          ctx.fillStyle = tintedParticleColor(p.color, palette);
          ctx.fillRect(
            Math.round(p.x * cw),
            Math.round(p.y * ch),
            Math.ceil(p.size * unit),
            Math.ceil(p.size * unit),
          );
        }
      for (const f of game.floaters) {
        ctx.globalAlpha = Math.min(1, f.life * 3);
        ctx.font = `${Math.max(9, Math.round(unit * 0.46))}px 'Pixel', monospace`;
        ctx.textAlign = "center";
        ctx.fillStyle = "#0e1219";
        ctx.fillText(f.text, f.x * cw + 1, f.y * ch + 2);
        ctx.fillStyle = f.golden ? "#ffdd7b" : palette.floatText;
        ctx.fillText(f.text, f.x * cw, f.y * ch);
      }
      ctx.globalAlpha = 1;
      if (game.flash > 0 && !reduced) {
        ctx.fillStyle = `rgba(238, 142, 130, ${game.flash * 0.6})`;
        ctx.fillRect(0, 0, width, height);
      }
      ctx.restore();
    }

    function resize() {
      if (!canvas || !ctx) return;
      const bounds = canvas.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      field = makeField(width, height, dpr);
      paint();
    }

    function frame(time: number) {
      game.update(time - previousTime);
      previousTime = time;
      paint();
      if (
        game.phase === "playing" ||
        (game.phase !== "paused" &&
          (game.particles.length || game.floaters.length))
      ) {
        request = requestAnimationFrame(frame);
      }
    }
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    if (phase !== "paused") request = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(request);
      observer.disconnect();
    };
  }, [game, phase, snakeColor, rainbowActive]);

  return (
    <canvas
      ref={ref}
      className="game-canvas"
      data-fruit-scale={FRUIT_SCALE}
      aria-label="Snakebyte playfield. Steer with the arrow keys, WASD, or a swipe."
    />
  );
}

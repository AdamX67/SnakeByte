import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Icon } from "./components/Icon";
import { GameCanvas } from "./components/GameCanvas";
import { SidePanel } from "./components/SidePanel";
import {
  COLS,
  MODES,
  ROWS,
  SnakeEngine,
  type Direction,
  type Mode,
} from "./game/engine";
import { ArcadeAudio } from "./game/audio";
import {
  clearScores,
  cleanupLegacyRemoteData,
  formatScore,
  newScoreEntry,
  readGameRules,
  readMode,
  readScores,
  readSetting,
  readSnakeColor,
  readTheme,
  saveGameRules,
  saveScores,
  saveSetting,
  saveSnakeColor,
  saveTheme,
  sortScores,
  type HighScore,
} from "./game/storage";
import { LocalLeaderboardDialog } from "./components/LocalLeaderboardDialog";
import { GameRulesDialog } from "./components/GameRulesDialog";
import { ThemeToggle } from "./components/ThemeToggle";
import { EasterEggToast } from "./components/EasterEggToast";
import {
  DEFAULT_SNAKE_COLOR,
  normalizeSnakeColor,
  SNAKE_COLOR_PRESETS,
} from "./game/snakeColor";
import {
  advanceGoldenStreak,
  advanceSequence,
  EGG_DETAILS,
  KONAMI_SEQUENCE,
  normalizeEggKey,
  SECRET_WORD,
  TITLE_TAP_TARGET,
  TITLE_TAP_WINDOW_MS,
  type ActiveEasterEgg,
  type EggKind,
} from "./game/easterEggs";
import { getFirewallStatus } from "./game/firewall";
import { normalizeGameRules, type GameRules } from "./game/rules";
import {
  getIntegrityResult,
  recheckCodeIntegrity,
  type IntegrityResult,
} from "./game/integrity";

const DIRECTIONS: Record<string, Direction> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  w: "up",
  s: "down",
  a: "left",
  d: "right",
};
type Dialog =
  | { type: "help" }
  | { type: "mode"; mode: Mode }
  | { type: "scores" }
  | { type: "rules" }
  | null;

function Hotkey({ children }: { children: React.ReactNode }) {
  return <kbd>{children}</kbd>;
}

export default function App() {
  const [rules, setRules] = useState<GameRules>(readGameRules);
  const [game] = useState(() => new SnakeEngine(readMode(), rules));
  const rulesRef = useRef(rules);
  const [audio] = useState(() => new ArcadeAudio());
  const [view, setView] = useState(() => game.snapshot());
  const [theme, setTheme] = useState<"dark" | "light">(readTheme);
  const [sound, setSound] = useState(() => readSetting("sound", true) === true);
  const [musicOn, setMusicOn] = useState(
    () => readSetting("music", true) === true,
  );
  const [snakeColor, setSnakeColor] = useState(readSnakeColor);
  const [scores, setScores] = useState<HighScore[]>(readScores);
  const scoresRef = useRef(scores);
  const sessionBestRef = useRef(scores[0]?.score ?? 0);
  const [latestId, setLatestId] = useState<string | null>(null);
  const [savedRank, setSavedRank] = useState<number | null>(null);
  const [newBest, setNewBest] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [expanded, setExpanded] = useState(false);
  const [integrity, setIntegrity] =
    useState<IntegrityResult>(getIntegrityResult);
  const [egg, setEgg] = useState<ActiveEasterEgg | null>(null);
  const konamiBuffer = useRef<string[]>([]);
  const wordBuffer = useRef<string[]>([]);
  const chromaIndex = useRef(0);
  const goldenStreak = useRef(0);
  const goldRushAwarded = useRef(false);
  const titleTaps = useRef(0);
  const lastTitleTap = useRef(0);
  const screen = useRef<HTMLDivElement>(null);
  const cabinet = useRef<HTMLElement>(null);
  const dialogEl = useRef<HTMLDialogElement>(null);
  const resumeAfterDialog = useRef(false);
  const swipe = useRef<{ x: number; y: number; id: number } | null>(null);
  const touchGesture = useRef<{ x: number; y: number; id: number } | null>(
    null,
  );

  const triggerEgg = useCallback(
    (kind: EggKind) => {
      const details = EGG_DETAILS[kind];
      audio.unlock();
      audio.play("gold");
      setEgg({
        kind,
        id: Date.now() + Math.random(),
        expiresAt: Date.now() + details.duration,
      });
      if (
        game.phase === "playing" &&
        !window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        game.shake = Math.max(game.shake, 3.5);
        game.burst(
          game.snake[0] ?? {
            x: Math.floor(COLS / 2),
            y: Math.floor(ROWS / 2),
          },
          [...details.colors],
          36,
          6.5,
        );
      }
    },
    [audio, game],
  );

  useEffect(() => {
    if (!egg) return;
    const timeout = window.setTimeout(
      () => setEgg(null),
      Math.max(0, egg.expiresAt - Date.now()),
    );
    return () => window.clearTimeout(timeout);
  }, [egg]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    saveTheme(theme);
  }, [theme]);

  useEffect(() => {
    audio.setSfxEnabled(sound);
    saveSetting("sound", sound);
  }, [audio, sound]);

  useEffect(() => {
    audio.setMusicEnabled(musicOn);
    saveSetting("music", musicOn);
  }, [audio, musicOn]);

  useEffect(() => {
    audio.setMode(view.mode);
    audio.setPhase(view.phase);
  }, [audio, view.mode, view.phase]);

  useEffect(() => {
    rulesRef.current = rules;
    game.setRules(rules);
    saveGameRules(rules);
  }, [game, rules]);

  // Browsers require a gesture before Web Audio can start. This is idempotent.
  useEffect(() => {
    const unlock = () => audio.unlock();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [audio]);

  useEffect(() => {
    saveSnakeColor(snakeColor);
  }, [snakeColor]);

  useEffect(() => {
    cleanupLegacyRemoteData();
  }, []);

  useEffect(() => {
    if (integrity.status !== "verified") return;
    let active = true;
    const verify = async () => {
      const next = await recheckCodeIntegrity();
      if (!active || next.status === "verified") return;
      setIntegrity(next);
      setScores([]);
      scoresRef.current = [];
      sessionBestRef.current = 0;
      setLatestId(null);
      setSavedRank(null);
      setNewBest(false);
      setSnakeColor(DEFAULT_SNAKE_COLOR);
      game.ready();
    };
    const interval = window.setInterval(() => void verify(), 30_000);
    const onVisibility = () => {
      if (!document.hidden) void verify();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [game, integrity.status]);

  useEffect(() => {
    scoresRef.current = scores;
    sessionBestRef.current = Math.max(
      sessionBestRef.current,
      scores[0]?.score ?? 0,
    );
  }, [scores]);

  useEffect(() => {
    return () => {
      audio.dispose();
    };
  }, [audio]);

  useEffect(() => {
    game.onEvent = (event) => {
      setView(game.snapshot());
      if (
        event === "start" ||
        event === "ready" ||
        event === "over" ||
        event === "won"
      ) {
        swipe.current = null;
        touchGesture.current = null;
      }
      if (event !== "ready" && event !== "mode") audio.play(event);
      if (event === "start") {
        setNewBest(false);
        setSavedRank(null);
        goldenStreak.current = 0;
        goldRushAwarded.current = false;
      }
      if (event === "gold") {
        const streak = advanceGoldenStreak(
          goldenStreak.current,
          goldRushAwarded.current,
        );
        goldenStreak.current = streak.streak;
        if (streak.award) {
          goldRushAwarded.current = true;
          triggerEgg("goldRush");
        }
      }
      if (
        (event === "eat" ||
          event === "gold" ||
          event === "wall" ||
          event === "over") &&
        !window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        navigator.vibrate?.(
          event === "over"
            ? 38
            : event === "wall"
              ? 24
              : event === "gold"
                ? 16
                : 7,
        );
      }
      if (event === "over" || event === "won") {
        const previous = scoresRef.current;
        const entry =
          game.score > 0
            ? newScoreEntry(game.score, game.mode, game.apples, game.rules)
            : null;
        if (entry) {
          const next = sortScores([...previous, entry]).slice(0, 20);
          const rank = next.findIndex((item) => item.id === entry.id) + 1;
          const priorBest = Math.max(
            previous[0]?.score ?? 0,
            sessionBestRef.current,
          );
          const isBest = game.score > priorBest;
          sessionBestRef.current = Math.max(sessionBestRef.current, game.score);
          if (saveScores(next)) {
            setNewBest(game.score > (previous[0]?.score ?? 0));
            setLatestId(entry.id);
            setSavedRank(rank > 0 ? rank : null);
            scoresRef.current = next;
            setScores(next);
          } else {
            setNewBest(isBest);
            setSavedRank(null);
          }
        } else {
          const isSessionBest =
            game.score > 0 && game.score > sessionBestRef.current;
          sessionBestRef.current = Math.max(sessionBestRef.current, game.score);
          setNewBest(isSessionBest);
          setSavedRank(null);
        }
      }
    };
    const onHidden = () => {
      audio.setSuspended(document.hidden);
      if (document.hidden) game.pause();
    };
    const onBlur = () => game.pause();
    const onStorage = (event: StorageEvent) => {
      if (event.key?.endsWith("snakebyte.v1.scores")) {
        const next = readScores();
        scoresRef.current = next;
        sessionBestRef.current = next[0]?.score ?? 0;
        setScores(next);
      }
    };
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("blur", onBlur);
    window.addEventListener("storage", onStorage);
    return () => {
      game.onEvent = () => {};
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("storage", onStorage);
    };
  }, [game, audio, triggerEgg]);

  const focusScreen = useCallback(
    () => screen.current?.focus({ preventScroll: true }),
    [],
  );
  const start = useCallback(
    (mode?: Mode) => {
      audio.unlock();
      setSavedRank(null);
      game.start(mode);
      focusScreen();
    },
    [audio, game, focusScreen],
  );

  const togglePause = useCallback(() => {
    audio.unlock();
    if (game.phase === "playing") game.pause();
    else if (game.phase === "paused") game.resume();
    focusScreen();
  }, [audio, game, focusScreen]);

  const steer = useCallback(
    (direction: Direction) => {
      if (game.phase === "ready") start();
      game.turn(direction);
    },
    [game, start],
  );

  const openDialog = useCallback(
    (next: Exclude<Dialog, null>) => {
      resumeAfterDialog.current = game.phase === "playing";
      if (game.phase === "playing") game.pause();
      setDialog(next);
    },
    [game],
  );

  const dismissDialog = useCallback(() => {
    setDialog(null);
    if (resumeAfterDialog.current && !document.hidden) game.resume();
    resumeAfterDialog.current = false;
  }, [game]);

  useEffect(() => {
    const el = dialogEl.current;
    if (dialog && el && !el.open) el.showModal();
    else if (!dialog && el?.open) {
      el.close();
      // Move keyboard focus out of any dialog input so WASD keeps steering.
      focusScreen();
    }
  }, [dialog, focusScreen]);

  function chooseMode(mode: Mode) {
    if (mode === game.mode) {
      focusScreen();
      return;
    }
    audio.unlock();
    audio.play("select");
    if (game.phase === "playing" || game.phase === "paused") {
      openDialog({ type: "mode", mode });
      return;
    }
    if (game.phase === "over" || game.phase === "won") game.ready();
    game.setMode(mode);
    saveSetting("mode", mode);
    focusScreen();
  }

  const openScores = useCallback(() => {
    openDialog({ type: "scores" });
  }, [openDialog]);

  const openRules = useCallback(() => {
    openDialog({ type: "rules" });
  }, [openDialog]);

  const applyRules = useCallback(
    (value: GameRules) => {
      const normalized = normalizeGameRules(value);
      rulesRef.current = normalized;
      setRules(normalized);
      game.setRules(normalized);
      saveGameRules(normalized);
      if (game.phase !== "ready") {
        resumeAfterDialog.current = false;
        game.ready();
      }
      setView(game.snapshot());
    },
    [game],
  );

  const changeRule = useCallback(
    (key: keyof GameRules, value: number) => {
      applyRules({ ...rulesRef.current, [key]: value });
    },
    [applyRules],
  );

  const applySnakeColor = useCallback(
    (value: string) => {
      const normalized = normalizeSnakeColor(value);
      if (!normalized) return;
      const expected = SNAKE_COLOR_PRESETS[chromaIndex.current];
      if (expected && normalized === expected.hex) {
        chromaIndex.current += 1;
        if (chromaIndex.current === SNAKE_COLOR_PRESETS.length) {
          chromaIndex.current = 0;
          triggerEgg("chromaMaster");
        }
      } else {
        chromaIndex.current = normalized === SNAKE_COLOR_PRESETS[0].hex ? 1 : 0;
      }
      setSnakeColor(normalized);
    },
    [triggerEgg],
  );

  const cycleSnakeColor = useCallback(() => {
    const index = SNAKE_COLOR_PRESETS.findIndex(
      (preset) => preset.hex === snakeColor,
    );
    applySnakeColor(
      SNAKE_COLOR_PRESETS[(index + 1) % SNAKE_COLOR_PRESETS.length].hex,
    );
  }, [snakeColor, applySnakeColor]);

  const registerTitleTap = useCallback(() => {
    if (game.phase !== "ready") return;
    const now = Date.now();
    if (now - lastTitleTap.current > TITLE_TAP_WINDOW_MS) titleTaps.current = 0;
    lastTitleTap.current = now;
    titleTaps.current += 1;
    if (titleTaps.current >= TITLE_TAP_TARGET) {
      titleTaps.current = 0;
      triggerEgg("pixelParty");
    }
  }, [game, triggerEgg]);

  const clearLocalScores = useCallback(() => {
    clearScores();
    scoresRef.current = [];
    sessionBestRef.current = 0;
    setScores([]);
    setLatestId(null);
    setSavedRank(null);
    setNewBest(false);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
      setExpanded(false);
    } else if (expanded) setExpanded(false);
    else {
      try {
        if (!cabinet.current?.requestFullscreen)
          throw new Error("Use focus mode");
        await cabinet.current.requestFullscreen();
        setExpanded(true);
      } catch {
        setExpanded(true);
      }
    }
    focusScreen();
  }, [expanded, focusScreen]);

  useEffect(() => {
    const changed = () => setExpanded(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", changed);
    return () => document.removeEventListener("fullscreenchange", changed);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("is-cabinet-expanded", expanded);
    return () => {
      document.body.classList.remove("is-cabinet-expanded");
    };
  }, [expanded]);

  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (dialog || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement;
      const input = target instanceof HTMLInputElement ? target : null;
      const textEntry =
        !!input &&
        ["text", "search", "email", "password", "tel", "url"].includes(
          input.type.toLowerCase(),
        );
      // Range, number, and color controls do not consume letter keys. Let
      // WASD steer even when one of them retains focus after a dialog.
      if (
        target.isContentEditable ||
        textEntry ||
        /^(TEXTAREA|SELECT)$/.test(target.tagName)
      )
        return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (!event.repeat) {
        const eggKey = normalizeEggKey(key);
        const konami = advanceSequence(
          konamiBuffer.current,
          eggKey,
          KONAMI_SEQUENCE,
        );
        konamiBuffer.current = konami.buffer;
        if (konami.matched) triggerEgg("rainbow");
        const word = advanceSequence(wordBuffer.current, eggKey, SECRET_WORD);
        wordBuffer.current = word.buffer;
        if (word.matched && game.phase === "ready") triggerEgg("byteCabinet");
      }
      if (DIRECTIONS[key]) {
        // A focused range/number input should keep native Arrow key editing.
        if (
          key.startsWith("Arrow") &&
          input &&
          (input.type === "range" || input.type === "number")
        )
          return;
        event.preventDefault();
        if (
          !event.repeat &&
          (game.phase === "playing" || game.phase === "ready")
        )
          steer(DIRECTIONS[key]);
        return;
      }
      if (event.repeat) return;
      if (key === " " || key === "Enter") {
        if (
          target.closest("button, a") &&
          !(
            key === " " &&
            (game.phase === "playing" || game.phase === "paused")
          )
        )
          return;
        event.preventDefault();
        if (
          game.phase === "ready" ||
          game.phase === "over" ||
          game.phase === "won"
        )
          start();
        else if (key === " ") togglePause();
      } else if (key === "p") {
        event.preventDefault();
        togglePause();
      } else if (key === "r") {
        event.preventDefault();
        start();
      } else if (key === "Escape") {
        if (expanded && !document.fullscreenElement) setExpanded(false);
        else if (game.phase === "playing" || game.phase === "paused")
          togglePause();
      } else if (key === "c") {
        event.preventDefault();
        cycleSnakeColor();
      } else if (key === "?") {
        event.preventDefault();
        openDialog({ type: "help" });
      } else if (key === "h") {
        event.preventDefault();
        openDialog({ type: "scores" });
      } else if (key === "g") {
        event.preventDefault();
        openRules();
      }
    }
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [
    game,
    dialog,
    expanded,
    start,
    steer,
    togglePause,
    openDialog,
    cycleSnakeColor,
    triggerEgg,
    openRules,
  ]);

  useEffect(() => {
    const element = screen.current;
    if (!element) return;

    const isButton = (target: EventTarget | null) => {
      const node = target as HTMLElement | null;
      return !!node?.closest?.("button");
    };
    const findTouch = (list: TouchList, id: number) => {
      for (let i = 0; i < list.length; i++) {
        const touch = list.item(i);
        if (touch && touch.identifier === id) return touch;
      }
      return null;
    };
    const turnFromDelta = (dx: number, dy: number) => {
      game.turn(
        Math.abs(dx) > Math.abs(dy)
          ? dx > 0
            ? "right"
            : "left"
          : dy > 0
            ? "down"
            : "up",
      );
    };

    const onTouchStart = (event: TouchEvent) => {
      if (game.phase !== "playing" || isButton(event.target)) return;
      if (touchGesture.current) return;
      const touch = event.changedTouches.item(0);
      if (!touch) return;
      touchGesture.current = {
        x: touch.clientX,
        y: touch.clientY,
        id: touch.identifier,
      };
      swipe.current = null;
      event.preventDefault();
      focusScreen();
    };
    const onTouchMove = (event: TouchEvent) => {
      const gesture = touchGesture.current;
      if (!gesture || game.phase !== "playing") return;
      const touch =
        findTouch(event.touches, gesture.id) ??
        findTouch(event.changedTouches, gesture.id);
      if (!touch) return;
      event.preventDefault();
      const dx = touch.clientX - gesture.x;
      const dy = touch.clientY - gesture.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 12) return;
      turnFromDelta(dx, dy);
      gesture.x = touch.clientX;
      gesture.y = touch.clientY;
    };
    const onTouchEnd = (event: TouchEvent) => {
      const gesture = touchGesture.current;
      if (!gesture) return;
      const ended = findTouch(event.changedTouches, gesture.id);
      const stillActive = findTouch(event.touches, gesture.id);
      if (!ended && stillActive) return;
      touchGesture.current = null;
      event.preventDefault();
    };

    // Native non-passive listeners work on browsers where Pointer Events or
    // pointer capture are unreliable. React's delegated touch listeners can
    // be passive, so preventDefault must be registered here.
    const options: AddEventListenerOptions = {
      passive: false,
      capture: true,
    };
    element.addEventListener("touchstart", onTouchStart, options);
    element.addEventListener("touchmove", onTouchMove, options);
    element.addEventListener("touchend", onTouchEnd, options);
    element.addEventListener("touchcancel", onTouchEnd, options);
    return () => {
      element.removeEventListener("touchstart", onTouchStart, true);
      element.removeEventListener("touchmove", onTouchMove, true);
      element.removeEventListener("touchend", onTouchEnd, true);
      element.removeEventListener("touchcancel", onTouchEnd, true);
    };
  }, [game, focusScreen]);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    // Touch input is handled by the native non-passive listener above.
    if (event.pointerType === "touch") return;
    const target = event.target as HTMLElement | null;
    if (game.phase !== "playing" || target?.closest?.("button")) return;
    swipe.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* Pointer moves still bubble without capture. */
    }
    focusScreen();
  }
  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "touch") return;
    const origin = swipe.current;
    if (!origin || origin.id !== event.pointerId || game.phase !== "playing")
      return;
    const dx = event.clientX - origin.x,
      dy = event.clientY - origin.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 13) return;
    game.turn(
      Math.abs(dx) > Math.abs(dy)
        ? dx > 0
          ? "right"
          : "left"
        : dy > 0
          ? "down"
          : "up",
    );
    origin.x = event.clientX;
    origin.y = event.clientY;
  }

  const finished = view.phase === "over" || view.phase === "won";
  const isActive = view.phase === "playing" || view.phase === "paused";
  const best = Math.max(scores[0]?.score ?? 0, view.score);
  const firewallStatus = getFirewallStatus();
  const toggleTheme = () =>
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  const status =
    view.grace > 0 && view.phase === "playing"
      ? "Recovery grace"
      : {
          ready: "Awaiting input",
          playing: "Run in progress",
          paused: "Game paused",
          over: "Run complete",
          won: "Board cleared",
        }[view.phase];

  return (
    <div className="app">
      <a className="skip-link" href="#arcade-main">
        Skip to game
      </a>
      <header className="site-header">
        <div className="page-width header-inner">
          <div className="brand" aria-label="Bit Arcade">
            <Icon name="alien" size={33} />
            <span>
              BIT<span className="brand-gap"> </span>ARCADE
            </span>
          </div>
          <nav className="header-actions" aria-label="Arcade controls">
            <button
              type="button"
              className="help-button"
              aria-label="How to play"
              onClick={() => openDialog({ type: "help" })}
            >
              <Icon name="help" size={16} />
              <span>How to play</span>
            </button>
            <span className="header-divider" />
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
            <span className="header-divider" />
            <button
              type="button"
              className={`sound-button ${sound ? "sound-enabled" : ""}`}
              aria-label={sound ? "Mute sound" : "Enable sound"}
              aria-pressed={sound}
              onClick={() => {
                audio.setSfxEnabled(!sound);
                if (!sound) {
                  audio.unlock();
                  audio.play("select");
                }
                setSound(!sound);
              }}
            >
              <Icon name={sound ? "sound" : "mute"} size={16} />
              <span>Sound {sound ? "on" : "off"}</span>
            </button>
            <button
              type="button"
              className={`sound-button music-button ${musicOn ? "sound-enabled" : ""}`}
              aria-label={musicOn ? "Mute music" : "Enable music"}
              aria-pressed={musicOn}
              data-testid="music-toggle"
              onClick={() => {
                const next = !musicOn;
                audio.setMusicEnabled(next);
                if (next) {
                  audio.unlock();
                  audio.play("select");
                }
                setMusicOn(next);
              }}
            >
              <Icon name={musicOn ? "music" : "mute"} size={16} />
              <span>Music {musicOn ? "on" : "off"}</span>
            </button>
            <button
              type="button"
              className="help-button rules-button"
              aria-label="Game rules"
              title="Game rules (G)"
              data-testid="rules-button"
              onClick={openRules}
            >
              <Icon name="sliders" size={16} />
              <span>Rules</span>
            </button>
          </nav>
        </div>
      </header>

      <main id="arcade-main" className="page-width main-content">
        <div className="collection-line">
          <div className="collection-label">
            <span className="collection-stripes" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span>Arcade collection</span>
            <b>/</b>
            <span className="cartridge-no">No. 001</span>
          </div>
          <span
            className={`online solo-status ${integrity.status === "reset" ? "integrity-bad" : ""}`}
            title={
              integrity.status === "verified"
                ? "Build integrity verified"
                : integrity.status === "reset"
                  ? integrity.message
                  : "Single-player arcade"
            }
            data-testid="integrity-status"
          >
            <i />
            {integrity.status === "verified"
              ? "Sealed build"
              : integrity.status === "reset"
                ? "Reset mode"
                : "Solo arcade"}
          </span>
        </div>

        {(integrity.status === "reset" || integrity.resetNotice) && (
          <div
            className="integrity-notice"
            role="alert"
            data-testid="integrity-reset"
          >
            <Icon name="check" size={18} />
            <div>
              <strong>Cabinet reset</strong>
              <p>
                {integrity.message}{" "}
                {integrity.status === "reset"
                  ? "Local scores are disabled for this session."
                  : "New runs in this session will be saved normally."}
              </p>
            </div>
          </div>
        )}

        <div className="arcade-layout">
          <section
            ref={cabinet}
            className={`cabinet ${expanded ? "is-expanded" : ""}`}
            aria-label="Snakebyte arcade cabinet"
          >
            <div className="cabinet-hud">
              <div className="hud-metrics">
                <div className="hud-metric">
                  <Icon name="coin" size={24} />
                  <div>
                    <span className="metric-label">Money</span>
                    <strong
                      className={`score-value ${view.score ? "score-bump" : ""}`}
                      key={`s-${view.score}`}
                      data-testid="score"
                    >
                      {formatScore(view.score)}
                    </strong>
                  </div>
                </div>
                <span className="metric-separator" />
                <div className="hud-metric best-metric">
                  <Icon name="flag" size={25} />
                  <div>
                    <span className="metric-label">Best</span>
                    <strong
                      className="score-value best-value"
                      data-testid="best"
                    >
                      {formatScore(best)}
                    </strong>
                  </div>
                </div>
              </div>
              <div className="hud-actions">
                <button
                  type="button"
                  className="cabinet-key"
                  onClick={togglePause}
                  disabled={!isActive}
                  aria-label={
                    view.phase === "paused" ? "Resume game" : "Pause game"
                  }
                  title="Pause or resume (Space)"
                >
                  <Icon
                    name={view.phase === "paused" ? "play" : "pause"}
                    size={15}
                  />
                </button>
                <button
                  type="button"
                  className="cabinet-key"
                  onClick={() => void toggleFullscreen()}
                  aria-label={expanded ? "Exit fullscreen" : "Enter fullscreen"}
                  title={expanded ? "Exit fullscreen" : "Fullscreen"}
                >
                  <Icon name={expanded ? "collapse" : "expand"} size={15} />
                </button>
              </div>
            </div>

            <div className="screen-bezel">
              <div
                ref={screen}
                className={`game-screen phase-${view.phase} ${egg ? "egg-active" : ""}`}
                tabIndex={0}
                role="region"
                aria-label="Snakebyte game screen"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={() => {
                  swipe.current = null;
                }}
                onPointerCancel={() => {
                  swipe.current = null;
                }}
              >
                {view.phase === "ready" ? (
                  <div className="start-scene">
                    <img
                      className="forest-art"
                      src={`${import.meta.env.BASE_URL}images/snakebyte-forest.webp`}
                      alt="A bright green pixel snake meets a red apple in a moonlit mountain forest."
                      draggable={false}
                    />
                    <div className="art-shade" />
                    <div className="starfield" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                      <i />
                      <i />
                    </div>
                    <div className="start-content">
                      <div className="game-eyebrow">
                        <i />
                        Arcade original
                      </div>
                      <h1
                        className="game-title secret-title"
                        aria-label="Snakebyte"
                        title="The cabinet keeps a few secrets."
                        data-testid="secret-title"
                        onClick={registerTitleTap}
                      >
                        <span>SNAKE</span>
                        <span>BYTE</span>
                      </h1>
                      <p className="game-tagline">Eat. Grow. Beat your best.</p>
                      <div className="start-actions">
                        <button
                          type="button"
                          className="arcade-button"
                          onClick={() => start()}
                        >
                          <Icon name="play" size={15} />
                          Start game
                        </button>
                        <span className="keyboard-prompt">
                          or press <Hotkey>Space</Hotkey>
                        </span>
                        <span className="touch-prompt">Tap to play</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <GameCanvas
                    game={game}
                    phase={view.phase}
                    snakeColor={snakeColor}
                    rainbowActive={egg?.kind === "rainbow"}
                  />
                )}
                <div className="screen-scanlines" aria-hidden="true" />
                <EasterEggToast egg={egg} />

                {view.phase === "paused" && (
                  <div className="state-overlay pause-overlay">
                    <div className="state-eyebrow">
                      <i />
                      Run on hold
                    </div>
                    <h2>Paused</h2>
                    <p>Your next bite can wait.</p>
                    <button
                      type="button"
                      className="arcade-button"
                      onClick={togglePause}
                    >
                      <Icon name="play" size={14} />
                      Resume
                    </button>
                    <div className="pause-actions">
                      <button
                        type="button"
                        className="text-action"
                        aria-label="Restart paused run"
                        onClick={() => start()}
                      >
                        <Icon name="restart" size={13} />
                        Restart run
                      </button>
                      <span />
                      <button
                        type="button"
                        className="text-action"
                        onClick={() => {
                          game.ready();
                          focusScreen();
                        }}
                      >
                        Back to title
                      </button>
                    </div>
                  </div>
                )}
                {finished && (
                  <div className="state-overlay end-overlay">
                    <div className={`state-eyebrow ${newBest ? "record" : ""}`}>
                      {newBest ? (
                        <>
                          <Icon name="trophy" size={16} />
                          New personal best
                        </>
                      ) : (
                        <>
                          <Icon name="flag" size={15} />
                          Run complete
                        </>
                      )}
                    </div>
                    <h2>{view.phase === "won" ? "You win!" : "Game over"}</h2>
                    <div className="result-score">
                      {formatScore(view.score)}
                      <span>Coins</span>
                    </div>
                    <p className="run-summary">
                      {view.apples} {view.apples === 1 ? "apple" : "apples"}
                      <i />
                      {MODES[view.mode].label} mode
                    </p>
                    {savedRank !== null && (
                      <button
                        type="button"
                        className="saved-rank"
                        onClick={openScores}
                        aria-label="Open local leaderboard"
                      >
                        <Icon name="trophy" size={13} />
                        {savedRank === 1
                          ? "Top of the board"
                          : `On the board at #${savedRank}`}
                        <Icon name="right" size={11} />
                      </button>
                    )}
                    <button
                      type="button"
                      className="arcade-button"
                      onClick={() => start()}
                    >
                      <Icon name="restart" size={16} />
                      Play again
                    </button>
                    <div className="end-shortcuts">
                      <span className="keyboard-prompt">
                        press <Hotkey>Space</Hotkey>
                      </span>
                      <button
                        className="text-action"
                        type="button"
                        onClick={() => game.ready()}
                      >
                        Back to title
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="cabinet-status">
              <span
                className={`status-label status-${view.phase} ${view.grace > 0 ? "status-grace" : ""}`}
              >
                <i />
                {status}
                <span className="status-cursor">_</span>
              </span>
              {view.grace > 0 && (
                <span
                  className="grace-chip"
                  data-testid="grace-status"
                  title="Wall and body bumps are free until grace expires"
                >
                  <Icon name="heart" size={11} />
                  Grace active
                </span>
              )}
              <div className="cabinet-detail">
                <span data-testid="cabinet-id">SB-01</span>
                <div className="vents" aria-hidden="true">
                  {Array.from({ length: 7 }, (_, i) => (
                    <i key={i} />
                  ))}
                </div>
              </div>
            </div>
            <div
              className="touch-controls swipe-only"
              aria-label="Touch steering instructions"
            >
              <span className="swipe-hint-icon" aria-hidden="true">
                <Icon name="touch" size={17} />
              </span>
              <span className="swipe-hint-copy">
                <strong>Swipe to steer</strong>
                <small>Up · Down · Left · Right</small>
              </span>
            </div>
          </section>

          <SidePanel
            mode={view.mode}
            phase={view.phase}
            apples={view.apples}
            length={view.length}
            pace={view.pace}
            snakeColor={snakeColor}
            rules={rules}
            scores={scores}
            latestId={latestId}
            onMode={chooseMode}
            onSnakeColor={applySnakeColor}
            onOpenScores={openScores}
          />
        </div>

        <section className="controls-strip" aria-label="Keyboard shortcuts">
          <div className="controls-heading">
            <Icon name="keyboard" size={18} />
            <span>Controls</span>
          </div>
          <div className="control-item steer-legend">
            <span className="arrow-keys" aria-hidden="true">
              <Hotkey>
                <Icon name="left" size={12} />
              </Hotkey>
              <Hotkey>
                <Icon name="up" size={12} />
              </Hotkey>
              <Hotkey>
                <Icon name="down" size={12} />
              </Hotkey>
              <Hotkey>
                <Icon name="right" size={12} />
              </Hotkey>
            </span>
            <small>or</small>
            <Hotkey>WASD</Hotkey>
            <span>Move</span>
          </div>
          <button
            type="button"
            className="control-item shortcut-button"
            onClick={togglePause}
            disabled={!isActive}
            aria-label="Pause or resume run"
          >
            <Hotkey>Space</Hotkey>
            <span>{view.phase === "paused" ? "Resume" : "Pause"}</span>
          </button>
          <button
            type="button"
            className="control-item shortcut-button"
            onClick={() => start()}
            aria-label="Restart run"
          >
            <Hotkey>R</Hotkey>
            <span>Restart</span>
          </button>
          <button
            type="button"
            className="control-item shortcut-button"
            onClick={cycleSnakeColor}
            aria-label="Cycle snake color"
          >
            <Hotkey>C</Hotkey>
            <span>Color</span>
          </button>
          <button
            type="button"
            className="touch-ready solo-note board-shortcut"
            onClick={openScores}
            aria-label="Open local leaderboard"
          >
            <Icon name="trophy" size={14} />
            Local leaderboard
          </button>
        </section>
      </main>

      <footer className="site-footer">
        <div className="page-width footer-inner">
          <span>
            <Icon name="coin" size={14} />
            No coins required
          </span>
          <span className="footer-build">
            Bit Arcade <i>/</i> v1.3
            <span
              className={`footer-firewall ${firewallStatus.active ? "" : "firewall-off"}`}
              data-testid="firewall-status"
              title={`${firewallStatus.reason}: ${firewallStatus.rules.join(", ")}`}
            >
              <Icon
                name={firewallStatus.active ? "check" : "close"}
                size={10}
              />
              {firewallStatus.active ? "Firewall" : "Firewall off"}
            </span>
            <span className="footer-pixels" aria-hidden="true">
              <b />
              <b />
              <b />
            </span>
          </span>
        </div>
      </footer>
      <div aria-live="polite" role="status" className="sr-only">
        {view.phase === "ready"
          ? `Ready. ${MODES[view.mode].label} difficulty. Press Space to start.`
          : `${status}. Score ${view.score}. ${Math.max(0, view.length - rules.minimumLength)} fragments left.`}
      </div>

      <dialog
        ref={dialogEl}
        className={`arcade-dialog ${dialog?.type === "scores" ? "board-dialog" : ""} ${dialog?.type === "rules" ? "rules-dialog" : ""}`}
        aria-labelledby="dialog-title"
        onCancel={(event) => {
          event.preventDefault();
          dismissDialog();
        }}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const r = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < r.left ||
            event.clientX > r.right ||
            event.clientY < r.top ||
            event.clientY > r.bottom
          )
            dismissDialog();
        }}
      >
        <button
          type="button"
          className="dialog-close cabinet-key"
          onClick={dismissDialog}
          aria-label="Close dialog"
        >
          <Icon name="close" size={15} />
        </button>
        <div className="dialog-kicker">
          <Icon
            name={
              dialog?.type === "scores"
                ? "trophy"
                : dialog?.type === "rules"
                  ? "sliders"
                  : "cartridge"
            }
            size={15}
          />
          {dialog?.type === "scores"
            ? "Snakebyte / Local scoreboard"
            : dialog?.type === "rules"
              ? "Snakebyte / Rulebook"
              : "Snakebyte / Field manual"}
        </div>
        {dialog?.type === "help" ? (
          <>
            <h2 id="dialog-title">How to play</h2>
            <p className="dialog-intro">
              You start with {rules.startingLength} chunky segments and a clear
              run to the first apple. Eat to grow. A wall or body hit costs{" "}
              {rules.wallCost === 1
                ? "a fragment"
                : `${rules.wallCost} fragments`}{" "}
              and grants brief grace; at the minimum safe length (
              {rules.minimumLength}), another collision ends the run. The pace
              climbs as you eat.
            </p>
            <div className="manual-controls">
              <div>
                <span>Steer</span>
                <span>
                  <Hotkey>Arrows</Hotkey>
                  <small>or</small>
                  <Hotkey>WASD</Hotkey>
                </span>
              </div>
              <div>
                <span>Pause / resume</span>
                <Hotkey>Space</Hotkey>
              </div>
              <div>
                <span>Instant restart</span>
                <Hotkey>R</Hotkey>
              </div>
              <div>
                <span>Leaderboard</span>
                <Hotkey>H</Hotkey>
              </div>
              <div>
                <span>Snake color</span>
                <Hotkey>C</Hotkey>
              </div>
              <div>
                <span>Game rules</span>
                <Hotkey>G</Hotkey>
              </div>
              <div>
                <span>On mobile</span>
                <span className="manual-touch">Swipe in any direction</span>
              </div>
            </div>
            <div className="manual-points">
              <Icon name="apple" size={23} />
              <div>
                <strong>Every bite counts.</strong>
                <p>
                  Easy: {rules.moneyEasy} pts. Medium: {rules.moneyMedium}.
                  Hard: {rules.moneyHard}.
                  <br />
                  Every {rules.goldenEvery === 5 ? "fifth" : `${rules.goldenEvery}th`}{" "}
                  apple is golden and worth {rules.goldenMultiplier}x points.
                </p>
              </div>
            </div>
            <div className="manual-privacy-note">
              <Icon name="disk" size={17} />
              <p>
                <strong>Private by design.</strong> No account, no network
                requests. Your local leaderboard and chosen color stay in this
                browser.
              </p>
            </div>
            <button
              type="button"
              className="arcade-button dialog-primary"
              onClick={dismissDialog}
            >
              Got it
              <Icon name="check" size={16} />
            </button>
          </>
        ) : dialog?.type === "rules" ? (
          <GameRulesDialog
            rules={rules}
            onChange={changeRule}
            onPreset={applyRules}
            onClose={dismissDialog}
          />
        ) : dialog?.type === "scores" ? (
          <LocalLeaderboardDialog
            scores={scores}
            latestId={latestId}
            onClear={clearLocalScores}
          />
        ) : dialog?.type === "mode" ? (
          <>
            <h2 id="dialog-title">Switch mode?</h2>
            <p className="dialog-intro">
              Start a new run on <strong>{MODES[dialog.mode].label}</strong>.
              Your current run will end.
            </p>
            <button
              type="button"
              className="arcade-button dialog-primary"
              onClick={() => {
                const mode = dialog.mode;
                resumeAfterDialog.current = false;
                setDialog(null);
                saveSetting("mode", mode);
                start(mode);
              }}
            >
              <Icon name="play" size={14} />
              Start {MODES[dialog.mode].label}
            </button>
            <button
              type="button"
              className="dialog-secondary text-action"
              onClick={dismissDialog}
            >
              Keep this run
            </button>
          </>
        ) : null}
      </dialog>
    </div>
  );
}

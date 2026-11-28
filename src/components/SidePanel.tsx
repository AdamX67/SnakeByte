import { useEffect, useRef, useState } from "react";
import { Icon, LevelBars } from "./Icon";
import { MODES, type Mode, type Phase } from "../game/engine";
import { formatScore, type HighScore } from "../game/storage";
import {
  describeRuleChanges,
  isCustomRules,
  modeMoney,
  type GameRules,
} from "../game/rules";
import {
  colorPresetName,
  DEFAULT_SNAKE_COLOR,
  normalizeSnakeColor,
  SNAKE_COLOR_PRESETS,
} from "../game/snakeColor";

export function SidePanel({
  mode,
  phase,
  apples,
  length,
  pace,
  snakeColor,
  rules,
  scores,
  latestId,
  onMode,
  onSnakeColor,
  onOpenScores,
  onFinishHexEdit,
}: {
  mode: Mode;
  phase: Phase;
  apples: number;
  length: number;
  pace: number;
  snakeColor: string;
  rules: GameRules;
  scores: HighScore[];
  latestId: string | null;
  onMode: (mode: Mode) => void;
  onSnakeColor: (color: string) => void;
  onOpenScores: () => void;
  onFinishHexEdit?: () => void;
}) {
  const modes = Object.keys(MODES) as Mode[];
  const goldenEvery = Math.max(2, rules.goldenEvery);
  const progress = apples % goldenEvery;
  const untilGolden = goldenEvery - progress;
  const top = scores.slice(0, 5);
  const activePreset = SNAKE_COLOR_PRESETS.find(
    (preset) => preset.hex === snakeColor,
  );
  const customActive = !activePreset;
  const colorName = colorPresetName(snakeColor);

  const [editingHex, setEditingHex] = useState(false);
  const [hexDraft, setHexDraft] = useState(() => snakeColor.toUpperCase());
  const hexInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editingHex) {
      setHexDraft(snakeColor.toUpperCase());
    }
  }, [snakeColor, editingHex]);

  useEffect(() => {
    if (editingHex) {
      hexInputRef.current?.focus();
      hexInputRef.current?.select();
    }
  }, [editingHex]);

  const chooseCustomColor = (value: string) => {
    const normalized = normalizeSnakeColor(value);
    if (normalized) onSnakeColor(normalized);
  };

  const commitHexDraft = (returnFocus = false) => {
    const candidate = hexDraft.trim().startsWith("#")
      ? hexDraft.trim()
      : `#${hexDraft.trim()}`;
    const normalized = normalizeSnakeColor(candidate);
    if (normalized) onSnakeColor(normalized);
    setEditingHex(false);
    if (returnFocus) onFinishHexEdit?.();
  };

  return (
    <aside
      className="side-panel"
      aria-label="Game settings and local leaderboard"
    >
      <section
        className="difficulty-section"
        aria-labelledby="difficulty-title"
      >
        <div className="section-heading">
          <Icon name="sliders" size={17} />
          <h2 id="difficulty-title">Difficulty</h2>
        </div>
        <div className="mode-list" role="radiogroup" aria-label="Difficulty">
          {modes.map((key, index) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={mode === key}
              tabIndex={mode === key ? 0 : -1}
              className={`mode-option ${mode === key ? "selected" : ""}`}
              aria-label={`${MODES[key].label} difficulty`}
              onClick={() => onMode(key)}
              onKeyDown={(event) => {
                if (
                  ![
                    "ArrowDown",
                    "ArrowRight",
                    "ArrowUp",
                    "ArrowLeft",
                    "Home",
                    "End",
                  ].includes(event.key)
                )
                  return;
                event.preventDefault();
                event.stopPropagation();
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? modes.length - 1
                      : (index +
                          (event.key === "ArrowDown" ||
                          event.key === "ArrowRight"
                            ? 1
                            : modes.length - 1)) %
                        modes.length;
                onMode(modes[next]);
                (
                  event.currentTarget.parentElement?.children[
                    next
                  ] as HTMLButtonElement
                )?.focus();
              }}
            >
              <LevelBars level={index + 1} />
              <span className="mode-copy">
                <strong>{MODES[key].label}</strong>
                <span>{MODES[key].description}</span>
              </span>
              <span className="radio-indicator" aria-hidden="true">
                <i />
              </span>
            </button>
          ))}
        </div>
      </section>

      <section
        className="snake-color-section"
        aria-labelledby="snake-color-title"
      >
        <div className="section-heading">
          <Icon name="palette" size={17} />
          <h2 id="snake-color-title">Snake color</h2>
          <span className="active-color-name" data-testid="snake-color-name">
            {colorName}
          </span>
        </div>
        <div
          className="color-swatches"
          role="group"
          aria-label="Snake color presets"
        >
          {SNAKE_COLOR_PRESETS.map((preset) => {
            const selected = preset.hex === snakeColor;
            return (
              <button
                key={preset.id}
                type="button"
                className={`snake-swatch swatch-${preset.id} ${selected ? "selected" : ""}`}
                aria-pressed={selected}
                aria-label={`${preset.name} snake color`}
                title={`${preset.name} · ${preset.hex.toUpperCase()}`}
                data-testid={`snake-color-${preset.id}`}
                onClick={() => onSnakeColor(preset.hex)}
              >
                {selected && <Icon name="check" size={10} />}
                <span className="sr-only">{preset.name}</span>
              </button>
            );
          })}
        </div>
        <div
          className={`color-custom-row ${customActive ? "custom-active" : ""}`}
        >
          <div className="color-input-wrap">
            <label className="color-well-label">
              <input
                type="color"
                className="snake-color-input"
                value={snakeColor}
                aria-label="Custom snake color"
                title="Choose a custom snake color"
                data-testid="snake-color-custom"
                autoComplete="off"
                onChange={(event) =>
                  chooseCustomColor(event.currentTarget.value)
                }
                onInput={(event) =>
                  chooseCustomColor(event.currentTarget.value)
                }
              />
              <span className="custom-label">Custom</span>
            </label>
            {editingHex ? (
              <>
                <input
                  ref={hexInputRef}
                  type="text"
                  className="snake-color-hex-input"
                  value={hexDraft}
                  maxLength={7}
                  spellCheck={false}
                  autoComplete="off"
                  aria-label="Custom snake hex code"
                  data-testid="snake-color-hex-input"
                  onChange={(event) => {
                    const raw = event.currentTarget.value.replace(
                      /[^#0-9a-fA-F]/g,
                      "",
                    );
                    setHexDraft(raw.toUpperCase());
                    const candidate = raw.startsWith("#") ? raw : `#${raw}`;
                    if (/^#[0-9a-fA-F]{6}$/.test(candidate)) {
                      chooseCustomColor(candidate);
                    }
                  }}
                  onBlur={() => commitHexDraft(false)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      commitHexDraft(true);
                    } else if (event.key === "Escape") {
                      event.preventDefault();
                      event.stopPropagation();
                      setHexDraft(snakeColor.toUpperCase());
                      setEditingHex(false);
                      onFinishHexEdit?.();
                    }
                  }}
                />
                <span className="sr-only" data-testid="snake-color-hex">
                  {snakeColor.toUpperCase()}
                </span>
              </>
            ) : (
              <button
                type="button"
                className="snake-color-hex snake-color-hex-button"
                data-testid="snake-color-hex"
                aria-label={`Hex color ${snakeColor.toUpperCase()}. Activate to type a hex code.`}
                title="Click to type a #RRGGBB hex code"
                onClick={() => {
                  setHexDraft(snakeColor.toUpperCase());
                  setEditingHex(true);
                }}
              >
                {snakeColor.toUpperCase()}
              </button>
            )}
          </div>
          <button
            type="button"
            className="color-reset"
            onClick={() => {
              setEditingHex(false);
              onSnakeColor(DEFAULT_SNAKE_COLOR);
            }}
            aria-label="Reset snake color to Lime"
            title="Reset to Lime"
            data-testid="snake-color-reset"
          >
            <Icon name="restart" size={11} />
            Reset
          </button>
        </div>
        <p className="color-note">
          Press C to cycle · click hex to type #RRGGBB
        </p>
      </section>

      <section
        className="local-board-section"
        aria-labelledby="leaderboard-title"
      >
        <div className="section-heading board-heading">
          <Icon name="trophy" size={19} />
          <h2 id="leaderboard-title">Leaderboard</h2>
          <span className="local-badge">Local</span>
        </div>
        <p className="board-caption">
          {scores.length
            ? `${scores.length} ${scores.length === 1 ? "run" : "runs"} saved on this device`
            : "Your best runs on this device"}
        </p>
        <table className="side-board" data-testid="side-leaderboard">
          <caption className="sr-only">
            Your top five local scores on this device
          </caption>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Mode</th>
              <th scope="col">Score</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }, (_, index) => {
              const entry = top[index];
              const custom = entry ? isCustomRules(entry.rules) : false;
              return (
                <tr
                  key={entry?.id ?? index}
                  className={`${entry ? "has-entry" : "empty-entry"} ${
                    entry && entry.id === latestId ? "latest-entry" : ""
                  }`}
                >
                  <td>
                    <span className={`board-rank board-rank-${index + 1}`}>
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  </td>
                  <td>
                    {entry ? (
                      <>
                        <span className={`board-mode board-mode-${entry.mode}`}>
                          {MODES[entry.mode].label}
                        </span>
                        {custom && (
                          <span
                            className="side-custom-dot"
                            title={`Custom rules: ${describeRuleChanges(entry.rules)}`}
                            aria-label="Custom rules"
                          >
                            *
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="board-empty">---</span>
                    )}
                  </td>
                  <td className="board-score">
                    {entry ? (
                      formatScore(entry.score)
                    ) : (
                      <span className="board-empty board-dashes">-----</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="local-board-footer">
          <span className="local-save-note">
            <Icon name="disk" size={12} />
            Private to this browser
          </span>
          <button
            type="button"
            className="board-open"
            onClick={onOpenScores}
            aria-label="View all local scores"
          >
            View all
            <Icon name="right" size={13} />
          </button>
        </div>
      </section>

      <section
        className="run-guide-section compact-guide"
        aria-labelledby="run-guide-title"
      >
        <div className="section-heading">
          <Icon name="apple" size={17} />
          <h2 id="run-guide-title">Golden bite</h2>
          <span
            className={`guide-state guide-${phase}`}
            data-testid="golden-countdown"
          >
            {untilGolden === 1 ? "Next one" : `In ${untilGolden}`}
          </span>
        </div>
        <div
          className="golden-pips"
          role="progressbar"
          aria-label="Progress to the next golden apple"
          aria-valuemin={0}
          aria-valuemax={goldenEvery}
          aria-valuenow={progress}
          data-testid="golden-pips"
        >
          {Array.from({ length: goldenEvery }, (_, index) => (
            <i
              key={index}
              className={
                index < progress
                  ? "filled"
                  : index === goldenEvery - 1
                    ? "golden"
                    : undefined
              }
            />
          ))}
        </div>
        <div className="run-mini-stats">
          <span>
            Apples <b>{String(apples).padStart(2, "0")}</b>
          </span>
          <span>
            Length <b>{String(length).padStart(2, "0")}</b>
          </span>
          <span>
            Pace <b>{pace}/s</b>
          </span>
          <span title="Money earned for a regular apple on this difficulty">
            Money <b data-testid="rules-money-live">{modeMoney(rules, mode)}</b>
          </span>
          <span title="Extra collision-recovery fragments">
            Fragments{" "}
            <b>
              {String(Math.max(0, length - rules.minimumLength)).padStart(
                2,
                "0",
              )}
            </b>
          </span>
        </div>
        <p
          className="guide-note"
          data-testid="rules-status"
          title={`Easy ${rules.speedEasyMs}ms · Medium ${rules.speedMediumMs}ms · Hard ${rules.speedHardMs}ms · ramp ${rules.speedRampPercent}%/4 apples · Easy money ${rules.moneyEasy} · Medium money ${rules.moneyMedium} · Hard money ${rules.moneyHard} · golden every ${rules.goldenEvery} · ${rules.goldenMultiplier}× bonus · start ${rules.startingLength} · max ${rules.maxLength} · minimum ${rules.minimumLength} · growth +${rules.growthPerApple}/apple · collision cost ${rules.wallCost} · grace ${rules.wallGraceMs}ms`}
        >
          {modeMoney(rules, mode)} coins/apple · golden every{" "}
          {rules.goldenEvery} · {rules.goldenMultiplier}× ·{" "}
          {rules.startingLength}–{rules.maxLength} length · +
          {rules.growthPerApple}/apple · {rules.wallCost} collision cost ·{" "}
          {(rules.wallGraceMs / 1000).toFixed(2)}s grace
        </p>
      </section>
    </aside>
  );
}

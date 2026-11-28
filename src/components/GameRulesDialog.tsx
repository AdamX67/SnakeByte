import { useState } from "react";
import {
  DEFAULT_GAME_RULES,
  formatRuleValue,
  normalizeGameRules,
  RULE_LIMITS,
  RULES_PRESETS,
  rulesSignature,
  type GameRules,
} from "../game/rules";

type RuleField = {
  key: keyof GameRules;
  label: string;
  hint: string;
};

type RuleGroup = {
  id: string;
  title: string;
  fields: readonly RuleField[];
};

const GROUPS: readonly RuleGroup[] = [
  {
    id: "speed",
    title: "Speed",
    fields: [
      {
        key: "speedEasyMs",
        label: "Easy tick",
        hint: "Milliseconds per Easy step. Lower is faster.",
      },
      {
        key: "speedMediumMs",
        label: "Medium tick",
        hint: "Milliseconds per Medium step.",
      },
      {
        key: "speedHardMs",
        label: "Hard tick",
        hint: "Milliseconds per Hard step.",
      },
      {
        key: "speedRampPercent",
        label: "Speed ramp",
        hint: "Percent gained every four apples; set 0 for constant speed.",
      },
    ],
  },
  {
    id: "money",
    title: "Money",
    fields: [
      {
        key: "moneyEasy",
        label: "Easy money",
        hint: "Coins earned for one ordinary apple on Easy.",
      },
      {
        key: "moneyMedium",
        label: "Medium money",
        hint: "Coins earned for one ordinary apple on Medium.",
      },
      {
        key: "moneyHard",
        label: "Hard money",
        hint: "Coins earned for one ordinary apple on Hard.",
      },
      {
        key: "goldenEvery",
        label: "Golden apple rate",
        hint: "Collect every Nth apple to trigger a golden bonus.",
      },
      {
        key: "goldenMultiplier",
        label: "Golden bonus",
        hint: "Money multiplier applied to a golden apple.",
      },
    ],
  },
  {
    id: "length",
    title: "Length",
    fields: [
      {
        key: "startingLength",
        label: "Starting length",
        hint: "Segments on a fresh run; long snakes open facing up.",
      },
      {
        key: "maxLength",
        label: "Maximum length",
        hint: "The snake stops growing at this cap, but still scores.",
      },
      {
        key: "minimumLength",
        label: "Minimum length",
        hint: "A wall or body hit below this safe length ends the run.",
      },
      {
        key: "growthPerApple",
        label: "Growth per apple",
        hint: "Extra segments are added smoothly over following ticks.",
      },
    ],
  },
  {
    id: "grace",
    title: "Grace & collisions",
    fields: [
      {
        key: "wallCost",
        label: "Collision cost",
        hint: "Fragments lost when a wall or body hit is recovered.",
      },
      {
        key: "wallGraceMs",
        label: "Collision grace",
        hint: "Exact milliseconds when extra wall and body bumps are free.",
      },
    ],
  },
];

function canAutoCommit(
  key: keyof GameRules,
  parsed: number,
  current: GameRules,
): boolean {
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) return false;
  const limits = RULE_LIMITS[key];
  if (parsed < limits.min || parsed > limits.max) return false;
  if (key === "startingLength") {
    return parsed > current.minimumLength && parsed <= current.maxLength;
  }
  if (key === "minimumLength") {
    return parsed < current.startingLength;
  }
  if (key === "maxLength") {
    return parsed >= current.startingLength;
  }
  return true;
}

export function GameRulesDialog({
  rules,
  onChange,
  onPreset,
  onClose,
}: {
  rules: GameRules;
  onChange: (key: keyof GameRules, value: number) => void;
  onPreset: (rules: GameRules) => void;
  onClose: () => void;
}) {
  const [drafts, setDrafts] = useState<
    Partial<Record<keyof GameRules, string>>
  >({});
  const signature = rulesSignature(rules);
  const activePreset = RULES_PRESETS.find(
    (preset) => rulesSignature(preset.rules) === signature,
  );

  function clearDraft(key: keyof GameRules) {
    setDrafts((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function commitField(key: keyof GameRules) {
    const raw = drafts[key];
    if (raw === undefined) return;
    const trimmed = raw.trim();
    if (trimmed !== "") {
      const parsed = Number(trimmed);
      if (Number.isFinite(parsed)) onChange(key, parsed);
    }
    clearDraft(key);
  }

  function handleDone() {
    const pendingEntries = Object.entries(drafts) as Array<
      [keyof GameRules, string | undefined]
    >;
    if (pendingEntries.length > 0) {
      const merged: Record<string, number> = { ...rules };
      let changed = false;
      for (const [key, raw] of pendingEntries) {
        if (raw === undefined) continue;
        const trimmed = raw.trim();
        if (trimmed === "") continue;
        const parsed = Number(trimmed);
        if (Number.isFinite(parsed) && parsed !== rules[key]) {
          merged[key] = parsed;
          changed = true;
        }
      }
      setDrafts({});
      if (changed) onPreset(normalizeGameRules(merged));
    }
    onClose();
  }

  return (
    <div className="rules-dialog-body" data-testid="rules-dialog">
      <div className="rules-topline">
        <div>
          <h2 id="dialog-title">Game rules</h2>
          <p>Full control. Changes start a fresh run.</p>
        </div>
        <span
          className={`rules-active-label ${activePreset ? "preset-active" : "custom-active"}`}
          data-testid="rules-active-label"
        >
          {activePreset?.name ?? "Custom"}
        </span>
      </div>

      <div className="rules-presets" role="group" aria-label="Rule presets">
        {RULES_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={`preset-button ${activePreset?.id === preset.id ? "active" : ""}`}
            aria-pressed={activePreset?.id === preset.id}
            data-testid={`rules-preset-${preset.id}`}
            onClick={() => {
              setDrafts({});
              onPreset(normalizeGameRules(preset.rules));
            }}
          >
            {preset.name}
          </button>
        ))}
      </div>

      {GROUPS.map((group) => (
        <section
          className="rules-section"
          key={group.id}
          aria-labelledby={`rules-${group.id}-title`}
          data-testid={`rules-group-${group.id}`}
        >
          <h3 id={`rules-${group.id}-title`}>{group.title}</h3>
          <div className="rules-grid">
            {group.fields.map((field) => {
              const limits = RULE_LIMITS[field.key];
              const value = rules[field.key];
              const displayedNumber = drafts[field.key] ?? String(value);
              const id = `rule-${field.key}`;
              return (
                <div className="rule-row" key={field.key}>
                  <div className="rule-heading">
                    <label htmlFor={id}>{field.label}</label>
                    <output
                      htmlFor={id}
                      data-testid={`rules-${field.key}-value`}
                    >
                      {formatRuleValue(field.key, value)}
                    </output>
                  </div>
                  <div className="rule-controls">
                    <input
                      id={id}
                      className="rule-slider"
                      type="range"
                      min={limits.min}
                      max={limits.max}
                      step={limits.step}
                      value={value}
                      aria-label={field.label}
                      title={field.hint}
                      data-testid={`rules-${field.key}`}
                      onChange={(event) => {
                        clearDraft(field.key);
                        onChange(field.key, Number(event.currentTarget.value));
                      }}
                    />
                    <input
                      className="rule-number"
                      type="number"
                      min={limits.min}
                      max={limits.max}
                      step={limits.step}
                      value={displayedNumber}
                      aria-label={`${field.label} exact value`}
                      title={`Enter an exact ${field.label.toLowerCase()} value`}
                      data-testid={`rules-${field.key}-number`}
                      onChange={(event) => {
                        const raw = event.currentTarget.value;
                        setDrafts((prev) => ({ ...prev, [field.key]: raw }));
                        const trimmed = raw.trim();
                        if (trimmed === "") return;
                        const next = Number(trimmed);
                        if (canAutoCommit(field.key, next, rules)) {
                          onChange(field.key, next);
                        }
                      }}
                      onBlur={() => commitField(field.key)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          commitField(field.key);
                        }
                      }}
                    />
                  </div>
                  <p className="rule-hint">{field.hint}</p>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <p className="rules-note">
        Scores are tagged with the exact rules used, so custom runs stay valid
        on the local leaderboard. Pause, color, audio, and security settings are
        unchanged.
      </p>

      <div className="rules-actions">
        <button
          type="button"
          className="rules-reset"
          data-testid="rules-reset"
          onClick={() => {
            setDrafts({});
            onPreset(DEFAULT_GAME_RULES);
          }}
        >
          Reset to Classic
        </button>
        <button
          type="button"
          className="arcade-button rules-done"
          data-testid="rules-done"
          onClick={handleDone}
        >
          Done
        </button>
      </div>
    </div>
  );
}

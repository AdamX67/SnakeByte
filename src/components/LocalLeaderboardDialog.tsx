import { useState } from "react";
import { Icon } from "./Icon";
import { MODES, type Mode } from "../game/engine";
import { formatScore, type HighScore } from "../game/storage";
import { describeRuleChanges, isCustomRules } from "../game/rules";

type Filter = "all" | Mode;
type RuleFilter = "all" | "classic" | "custom";

function relativeDate(timestamp: number) {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604_800) return `${Math.floor(seconds / 86_400)}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function LocalLeaderboardDialog({
  scores,
  latestId,
  onClear,
}: {
  scores: HighScore[];
  latestId: string | null;
  onClear: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [ruleFilter, setRuleFilter] = useState<RuleFilter>("all");
  const [confirming, setConfirming] = useState(false);

  const hasCustomRuns = scores.some((entry) => isCustomRules(entry.rules));
  const classicBest =
    scores.find((entry) => !isCustomRules(entry.rules))?.score ?? 0;

  const filtered = scores.filter((entry) => {
    if (filter !== "all" && entry.mode !== filter) return false;
    if (ruleFilter === "classic" && isCustomRules(entry.rules)) return false;
    if (ruleFilter === "custom" && !isCustomRules(entry.rules)) return false;
    return true;
  });

  const best = scores[0]?.score ?? 0;
  const modesPlayed = new Set(scores.map((entry) => entry.mode)).size;
  const filters: Array<{ value: Filter; label: string }> = [
    { value: "all", label: "All" },
    { value: "easy", label: "Easy" },
    { value: "medium", label: "Medium" },
    { value: "hard", label: "Hard" },
  ];
  const ruleFilters: Array<{ value: RuleFilter; label: string }> = [
    { value: "all", label: "All rules" },
    { value: "classic", label: "Classic" },
    { value: "custom", label: "Custom" },
  ];

  return (
    <div className="local-board-dialog" data-testid="local-leaderboard-dialog">
      <div className="board-dialog-title">
        <div>
          <h2 id="dialog-title">Leaderboard</h2>
          <p>Your best runs, saved only in this browser.</p>
        </div>
        <span className="local-only-badge">
          <Icon name="disk" size={12} />
          Local
        </span>
      </div>

      <div className="board-summary" aria-label="Leaderboard summary">
        <div className="board-summary-stat">
          <span>Personal best</span>
          <strong>{formatScore(best)}</strong>
        </div>
        {hasCustomRuns && (
          <>
            <div className="board-summary-divider" />
            <div
              className="board-summary-stat"
              data-testid="board-classic-best"
            >
              <span>Classic best</span>
              <strong>{formatScore(classicBest)}</strong>
            </div>
          </>
        )}
        <div className="board-summary-divider" />
        <div className="board-summary-stat">
          <span>Saved runs</span>
          <strong>{String(scores.length).padStart(2, "0")}</strong>
        </div>
        <div className="board-summary-divider" />
        <div className="board-summary-stat">
          <span>Modes played</span>
          <strong>
            {modesPlayed}
            <small>/3</small>
          </strong>
        </div>
      </div>

      <div className="board-toolbar">
        <div className="board-filter-groups">
          <div
            className="board-filters"
            role="group"
            aria-label="Filter local leaderboard by difficulty"
          >
            {filters.map((item) => (
              <button
                key={item.value}
                type="button"
                className={filter === item.value ? "active" : ""}
                aria-pressed={filter === item.value}
                onClick={() => setFilter(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
          {hasCustomRuns && (
            <div
              className="board-filters board-rule-filters"
              role="group"
              aria-label="Filter local leaderboard by rule set"
              data-testid="board-rule-filters"
            >
              {ruleFilters.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={ruleFilter === item.value ? "active" : ""}
                  aria-pressed={ruleFilter === item.value}
                  onClick={() => setRuleFilter(item.value)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
        {scores.length > 0 && (
          <button
            type="button"
            className="board-clear"
            onClick={() => setConfirming(true)}
          >
            Clear
          </button>
        )}
      </div>

      {confirming && (
        <div
          className="clear-confirm"
          role="alert"
          aria-label="Confirm clear scores"
        >
          <p>
            Clear all {scores.length} saved runs? This only affects this browser
            and cannot be undone.
          </p>
          <div>
            <button
              type="button"
              className="clear-confirm-yes"
              onClick={() => {
                onClear();
                setConfirming(false);
              }}
            >
              Clear scores
            </button>
            <button
              type="button"
              className="clear-confirm-no"
              onClick={() => setConfirming(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="board-table-wrap">
        <table className="board-table" aria-label="Local high scores">
          <caption className="sr-only">
            Your top runs on this device, ranked by score
          </caption>
          <thead>
            <tr>
              <th scope="col">Rank</th>
              <th scope="col">Mode</th>
              <th scope="col">Apples</th>
              <th scope="col">When</th>
              <th scope="col">Score</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((entry, index) => {
              const custom = isCustomRules(entry.rules);
              const ruleSummary = describeRuleChanges(entry.rules);
              return (
                <tr
                  key={entry.id}
                  className={
                    entry.id === latestId ? "board-latest-row" : undefined
                  }
                >
                  <td>
                    <span className={`board-rank board-rank-${index + 1}`}>
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  </td>
                  <td>
                    <span className={`board-mode board-mode-${entry.mode}`}>
                      {MODES[entry.mode].label}
                    </span>
                    {custom && (
                      <span
                        className="custom-rule-badge"
                        title={ruleSummary}
                        aria-label={`Custom rules: ${ruleSummary}`}
                      >
                        Custom
                      </span>
                    )}
                  </td>
                  <td>
                    <span className="board-apples">
                      <Icon name="apple" size={12} />
                      {entry.apples}
                    </span>
                  </td>
                  <td>
                    <time
                      className="board-when"
                      dateTime={new Date(entry.date).toISOString()}
                      title={new Date(entry.date).toLocaleString()}
                    >
                      {relativeDate(entry.date)}
                    </time>
                  </td>
                  <td className="board-score">{formatScore(entry.score)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!filtered.length && (
          <div className="board-empty-state">
            <Icon name="trophy" size={24} />
            <strong>
              {scores.length
                ? ruleFilter !== "all"
                  ? `No ${ruleFilter} ${filter === "all" ? "" : `${filter} `}runs yet.`
                  : `No ${filter} runs yet.`
                : "Your first run sets the pace."}
            </strong>
            <span>
              {scores.length
                ? "Try another filter or finish a new run."
                : "Every completed run is saved here automatically."}
            </span>
          </div>
        )}
      </div>

      <p className="board-footnote">
        <Icon name="disk" size={12} />
        Stored in this browser only. No account, no rankings from other players,
        and no network connection. Hover a Custom badge to inspect its rule set.
      </p>
    </div>
  );
}

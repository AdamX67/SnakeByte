import { Icon } from "./Icon";
import { EGG_DETAILS, type ActiveEasterEgg } from "../game/easterEggs";

export function EasterEggToast({ egg }: { egg: ActiveEasterEgg | null }) {
  if (!egg) return null;
  const details = EGG_DETAILS[egg.kind];
  return (
    <div
      key={egg.id}
      className={`egg-toast egg-${egg.kind}`}
      data-testid="easter-egg-toast"
      role="status"
      aria-live="polite"
    >
      <span className="egg-kicker">
        <Icon name="coin" size={13} />
        Secret found
      </span>
      <strong data-testid="easter-egg-title">{details.title}</strong>
      <p>{details.message}</p>
      <span className="egg-pixels" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </span>
    </div>
  );
}

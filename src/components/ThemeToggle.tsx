export function ThemeToggle({
  theme,
  onToggle,
}: {
  theme: "dark" | "light";
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`theme-toggle ${theme === "dark" ? "theme-toggle-dark" : "theme-toggle-light"}`}
      aria-pressed={theme === "dark"}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Dark mode. Switch to light." : "Light mode. Switch to dark."}
      data-testid="theme-toggle"
      onClick={onToggle}
    >
      <svg className="theme-bulb" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M9 18h6M10 21h4M8 10a5 5 0 1 1 8.4 3.7c-.8.8-1.4 1.3-1.4 2.3H9c0-1-.6-1.5-1.4-2.3A5 5 0 0 1 8 10z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
      </svg>
      <span className="theme-toggle-label">
        <span>{theme === "dark" ? "Dark mode" : "Light mode"}</span>
        <small>{theme === "dark" ? "On" : "Off"}</small>
      </span>
    </button>
  );
}

export type IconName =
  | "alien"
  | "sound"
  | "mute"
  | "music"
  | "help"
  | "trophy"
  | "apple"
  | "play"
  | "pause"
  | "expand"
  | "collapse"
  | "sliders"
  | "disk"
  | "keyboard"
  | "restart"
  | "close"
  | "left"
  | "up"
  | "down"
  | "right"
  | "coin"
  | "cartridge"
  | "heart"
  | "check"
  | "touch"
  | "flag"
  | "palette";

type IconProps = {
  name: IconName;
  size?: number;
  className?: string;
};

export function Icon({ name, size = 18, className = "" }: IconProps) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    className: `icon ${className}`,
    "aria-hidden": true as const,
  };
  if (name === "alien")
    return (
      <svg
        {...common}
        fill="currentColor"
        viewBox="0 0 22 20"
        shapeRendering="crispEdges"
      >
        <path d="M4 0h2v2H4zm12 0h2v2h-2zM6 2h2v2H6zm8 0h2v2h-2zM4 4h14v2h2v2h2v8h-2v-4h-2v4h-4v-2H8v2H4v-4H2v4H0V8h2V6h2zM4 16h4v2H4zm10 0h4v2h-4z" />
        <path d="M6 7h3v3H6zm7 0h3v3h-3z" fill="#151719" />
      </svg>
    );
  if (name === "apple")
    return (
      <svg {...common} viewBox="0 0 16 16" shapeRendering="crispEdges">
        <path fill="#966944" d="M8 1h2v4H8z" />
        <path fill="#a2d85a" d="M10 1h4v2h-2v1H9V2h1z" />
        <path
          fill="#b84144"
          d="M2 5h4V4h2v1h3V4h2v2h2v6h-1v2h-2v1H9v-1H7v1H4v-2H2v-2H1V7h1z"
        />
        <path fill="#f57362" d="M3 5h4v1h3V5h3v2h1v4h-2v2H5v-1H3v-2H2V7h1z" />
        <path fill="#ffd0a1" d="M4 6h3v2H5v2H3V7h1z" />
      </svg>
    );
  if (name === "trophy")
    return (
      <svg {...common} viewBox="0 0 18 18" shapeRendering="crispEdges">
        <path
          fill="#b88b44"
          d="M1 3h4v2H3v2h2v2H3V8H1zm12 0h4v5h-2v1h-2V7h2V5h-2zM8 10h2v4h3v1H5v-1h3zM4 15h10v2H4z"
        />
        <path fill="#eac773" d="M4 2h10v6h-1v2h-2v1H7v-1H5V8H4z" />
        <path fill="#fff0ac" d="M5 3h2v5H5zm2 0h5v1H7z" />
        <path fill="#d7a348" d="M11 4h2v4h-1v2h-2V8h1z" />
      </svg>
    );
  if (name === "play")
    return (
      <svg
        {...common}
        viewBox="0 0 14 16"
        fill="currentColor"
        shapeRendering="crispEdges"
      >
        <path d="M1 1h3v2h3v2h3v2h3v2h-3v2H7v2H4v2H1z" />
      </svg>
    );
  if (name === "pause")
    return (
      <svg {...common} fill="currentColor" shapeRendering="crispEdges">
        <path d="M5 4h5v16H5zm9 0h5v16h-5z" />
      </svg>
    );
  if (name === "heart")
    return (
      <svg
        {...common}
        viewBox="0 0 16 14"
        fill="currentColor"
        shapeRendering="crispEdges"
      >
        <path d="M2 0h4v2h4V0h4v2h2v5h-2v2h-2v2h-2v2H6v-2H4V9H2V7H0V2h2z" />
      </svg>
    );
  if (name === "coin")
    return (
      <svg
        {...common}
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        shapeRendering="crispEdges"
      >
        <path d="M5 1h6v2h2v2h2v6h-2v2h-2v2H5v-2H3v-2H1V5h2V3h2zM8 4v8" />
      </svg>
    );
  const paths: Record<string, React.ReactNode> = {
    sound: (
      <>
        <path d="M3 9h4l5-4v14l-5-4H3z" />
        <path d="M16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />
      </>
    ),
    mute: (
      <>
        <path d="M3 9h4l5-4v14l-5-4H3z" />
        <path d="m16 9 6 6m0-6-6 6" />
      </>
    ),
    music: (
      <>
        <path d="M9 18V5l11-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="17" cy="16" r="3" />
      </>
    ),
    help: (
      <>
        <path d="M4 4h16v16H4z" />
        <path d="M9 9c0-3 6-3 6 0 0 2-3 2-3 5m0 2v1" />
      </>
    ),
    expand: <path d="M3 9V3h6m6 0h6v6m0 6v6h-6m-6 0H3v-6" />,
    collapse: <path d="M9 3v6H3m12-6v6h6m0 6h-6v6m-6 0v-6H3" />,
    sliders: (
      <>
        <path d="M3 6h5m5 0h8M3 17h10m5 0h3" />
        <path d="M8 3h5v6H8zm5 11h5v6h-5z" />
      </>
    ),
    disk: (
      <>
        <path d="M4 3h13l4 4v14H3V3z" />
        <path d="M7 3v6h9V3M7 21v-8h10v8m-4-18v4" />
      </>
    ),
    keyboard: (
      <>
        <path d="M2 5h20v14H2z" />
        <path d="M5 9h2m2 0h2m2 0h2m2 0h2M5 12h2m2 0h2m2 0h2m2 0h2M7 15h10" />
      </>
    ),
    restart: (
      <>
        <path d="M4 10a8 8 0 1 1 1 8M4 4v6h6" />
      </>
    ),
    close: <path d="m5 5 14 14M19 5 5 19" />,
    left: <path d="M20 12H4l7-7m-7 7 7 7" />,
    right: <path d="M4 12h16l-7-7m7 7-7 7" />,
    up: <path d="M12 20V4l-7 7m7-7 7 7" />,
    down: <path d="M12 4v16l-7-7m7 7 7-7" />,
    cartridge: (
      <>
        <path d="M4 3h13l3 3v15H4z" />
        <path d="M7 3v8h10V3M7 16h10m-10 3h10" />
      </>
    ),
    check: <path d="m4 12 5 5L20 6" />,
    touch: (
      <path d="M8 13V5a2 2 0 0 1 4 0v7-3h3v2h3v2h3v5l-3 4h-7L4 14a2 2 0 0 1 3-2l1 1z" />
    ),
    flag: (
      <>
        <path d="M5 21V3h14v10H5" />
        <path d="M8 3v4h4V3m0 4v4h4V7" />
      </>
    ),
    palette: (
      <>
        <path d="M12 3a9 9 0 0 0 0 18h1a2 2 0 0 0 0-4h-1a2 2 0 0 1 0-4h3a4 4 0 0 0 4-4c0-3.3-3-6-7-6z" />
        <circle cx="7.5" cy="11" r="1.1" fill="currentColor" stroke="none" />
        <circle cx="10" cy="7.5" r="1.1" fill="currentColor" stroke="none" />
        <circle cx="15" cy="7.5" r="1.1" fill="currentColor" stroke="none" />
      </>
    ),
  };
  return (
    <svg
      {...common}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="square"
      strokeLinejoin="miter"
    >
      {paths[name]}
    </svg>
  );
}

export function LevelBars({ level }: { level: number }) {
  return (
    <span className={`level-bars level-${level}`} aria-hidden="true">
      {[1, 2, 3].map((bar) => (
        <i key={bar} className={bar <= level ? "lit" : ""} />
      ))}
    </span>
  );
}

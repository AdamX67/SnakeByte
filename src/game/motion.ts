import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

let mediaQuery: MediaQueryList | null = null;
let cachedValue = false;
let initialized = false;
const listeners = new Set<() => void>();

function ensureMediaQuery() {
  if (initialized) return;
  initialized = true;
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return;
  }
  try {
    mediaQuery = window.matchMedia(QUERY);
    cachedValue = mediaQuery.matches;
    const onChange = (event: MediaQueryListEvent) => {
      cachedValue = event.matches;
      for (const listener of listeners) listener();
    };
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", onChange);
    } else if (typeof mediaQuery.addListener === "function") {
      mediaQuery.addListener(onChange);
    }
  } catch {
    cachedValue = false;
  }
}

export function prefersReducedMotion(): boolean {
  ensureMediaQuery();
  return mediaQuery ? mediaQuery.matches : cachedValue;
}

export function subscribeReducedMotion(listener: () => void): () => void {
  ensureMediaQuery();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    prefersReducedMotion,
    () => false,
  );
}

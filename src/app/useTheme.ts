import { useCallback, useEffect, useState } from "react";
import { syncWindowBackground } from "./windowBackground";

export type Theme = "light" | "dark";

const WHITE_FALLBACK = "#9e9e9e";

function resolveAccent(accent: string | null): string | null {
  if (!accent) return null;
  return accent.toLowerCase() === "#ffffff" ? WHITE_FALLBACK : accent;
}

function instantly(change: () => void) {
  const root = document.documentElement;
  root.setAttribute("data-switching", "");
  change();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => root.removeAttribute("data-switching"));
  });
}

function applyAccent(accent: string | null) {
  const resolved = resolveAccent(accent);
  if (resolved) {
    document.documentElement.style.setProperty("--accent-base", resolved);
  } else {
    document.documentElement.style.removeProperty("--accent-base");
  }
}

export function useTheme(profileAccent?: string | null) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
  });
  const [accent, setAccentState] = useState<string | null>(() =>
    localStorage.getItem("accentColor"),
  );

  useEffect(() => {
    instantly(() => applyAccent(accent ?? profileAccent ?? null));
    syncWindowBackground();
  }, [accent, profileAccent]);

  useEffect(() => {
    syncWindowBackground();
  }, [theme]);

  const handleSetTheme = useCallback((next: Theme) => {
    instantly(() => {
      document.documentElement.dataset.theme = next;
    });
    localStorage.setItem("theme", next);
    setThemeState(next);
    syncWindowBackground();
  }, []);

  const handleSetAccent = useCallback(
    (next: string | null) => {
      if (next) localStorage.setItem("accentColor", next);
      else localStorage.removeItem("accentColor");
      instantly(() => applyAccent(next ?? profileAccent ?? null));
      setAccentState(next);
    },
    [profileAccent],
  );

  return { theme, accent, handleSetTheme, handleSetAccent };
}

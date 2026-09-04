import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";

const WHITE_FALLBACK = "#9e9e9e";

function resolveAccent(accent: string | null): string | null {
  if (!accent) return null;
  return accent.toLowerCase() === "#ffffff" ? WHITE_FALLBACK : accent;
}

function applyAccent(accent: string | null) {
  const resolved = resolveAccent(accent);
  if (resolved) {
    document.documentElement.style.setProperty("--accent-base", resolved);
  } else {
    document.documentElement.style.removeProperty("--accent-base");
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
  });
  const [accent, setAccentState] = useState<string | null>(() =>
    localStorage.getItem("accentColor"),
  );

  useEffect(() => {
    applyAccent(accent);
  }, [accent]);

  const handleSetTheme = useCallback((next: Theme) => {
    document.documentElement.dataset.theme = next;
    localStorage.setItem("theme", next);
    setThemeState(next);
  }, []);

  const handleSetAccent = useCallback((next: string | null) => {
    if (next) localStorage.setItem("accentColor", next);
    else localStorage.removeItem("accentColor");
    applyAccent(next);
    setAccentState(next);
  }, []);

  return { theme, accent, handleSetTheme, handleSetAccent };
}

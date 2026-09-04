/**
 * Window width, not operating system. Anything that depends on the OS belongs
 * in `src/platforms`.
 */
import { useEffect, useState } from "react";

export const NARROW_MAX_WIDTH = 640;

export const COMPACT_COLUMNS_MAX_WIDTH = 820;

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", onChange);
    setMatches(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

export function useIsNarrow(): boolean {
  return useMediaQuery(`(max-width: ${NARROW_MAX_WIDTH}px)`);
}

export function useCompactColumns(): boolean {
  return useMediaQuery(`(max-width: ${COMPACT_COLUMNS_MAX_WIDTH}px)`);
}

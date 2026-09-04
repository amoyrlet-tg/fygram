import { useCallback, useState } from "react";

export function useUnavailableTracks() {
  const [unavailableIds, setUnavailableIds] = useState<Set<string>>(new Set());

  const markUnavailable = useCallback((trackId: string) => {
    setUnavailableIds((prev) => {
      if (prev.has(trackId)) return prev;
      const next = new Set(prev);
      next.add(trackId);
      return next;
    });
  }, []);

  const markAvailable = useCallback((trackId: string) => {
    setUnavailableIds((prev) => {
      if (!prev.has(trackId)) return prev;
      const next = new Set(prev);
      next.delete(trackId);
      return next;
    });
  }, []);

  return { unavailableIds, markUnavailable, markAvailable };
}

import { useEffect, useState } from "react";
import { ambientColor } from "@/shared/api/system";
import { LruMap } from "@/shared/lib/lruCache";

const AMBIENT_CACHE_LIMIT = 300;
const ambientColorCache = new LruMap<string, string | null>(AMBIENT_CACHE_LIMIT);

export function useAmbientColor(path: string | null): string | null {
  const [color, setColor] = useState<string | null>(null);

  useEffect(() => {
    if (!path) {
      setColor(null);
      return;
    }
    const cached = ambientColorCache.get(path);
    if (cached !== undefined) {
      setColor(cached);
      return;
    }
    let cancelled = false;
    ambientColor(path)
      .catch(() => null)
      .then((result) => {
        ambientColorCache.set(path, result ?? null);
        if (!cancelled) setColor(result ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return color;
}

export const ambientCacheSize = () => ambientColorCache.size;

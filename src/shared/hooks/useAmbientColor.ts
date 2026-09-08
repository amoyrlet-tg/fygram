import { useEffect, useState } from "react";
import { ambientColor } from "@/shared/api/system";
import { LruMap } from "@/shared/lib/lruCache";

// capped so a long session does not keep a colour for every track ever shown
const AMBIENT_CACHE_LIMIT = 300;
const ambientColorCache = new LruMap<string, string | null>(AMBIENT_CACHE_LIMIT);

/**
 * The colour the picture at `path` reads as, for tinting the page behind it.
 *
 * The backend does the reading. Fetching the file itself - a base64 data URL,
 * an `Image`, a canvas - put a megabyte of string and a full-size bitmap into
 * the webview per cover, and the webview kept them.
 */
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

/** For the memory log: how much this module is holding on to. */
export const ambientCacheSize = () => ambientColorCache.size;

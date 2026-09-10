import { useEffect, useState } from "react";
import { useArtworkOff } from "@/app/ecoMode";
import { convertFileSrc } from "@tauri-apps/api/core";
import { LruMap } from "@/shared/lib/lruCache";
import { tracksApi } from "./api";
export type Cover = { src: string; preview: string; palette: string[] };
const CACHE_LIMIT = 300;
const cache = new LruMap<string, Cover | null>(CACHE_LIMIT);
const inFlight = new Map<string, Promise<Cover | null>>();
const version = new Map<string, number>();
const watchers = new Set<() => void>();
function srcOf(trackId: string, path: string): string {
  const url = convertFileSrc(path);
  const bump = version.get(trackId);
  return bump ? `${url}?v=${bump}` : url;
}
function load(trackId: string): Promise<Cover | null> {
  const running = inFlight.get(trackId);
  if (running) return running;
  const request = tracksApi
    .trackCover(trackId)
    .then((found) => {
      const cover = found
        ? {
            src: srcOf(trackId, found.path),
            preview: srcOf(trackId, found.preview),
            palette: found.palette,
          }
        : null;
      cache.set(trackId, cover);
      return cover;
    })
    .catch(() => {
      cache.set(trackId, null);
      return null;
    })
    .finally(() => {
      inFlight.delete(trackId);
    });
  inFlight.set(trackId, request);
  return request;
}
function useCover(trackId: string | undefined): Cover | null {
  const [cover, setCover] = useState<Cover | null>(() =>
    trackId ? (cache.get(trackId) ?? null) : null,
  );
  useEffect(() => {
    if (!trackId) {
      setCover(null);
      return;
    }
    let alive = true;
    const read = () => {
      if (cache.has(trackId)) {
        setCover(cache.get(trackId) ?? null);
        return;
      }
      void load(trackId).then((found) => {
        if (alive) setCover(found);
      });
    };
    read();
    watchers.add(read);
    return () => {
      alive = false;
      watchers.delete(read);
    };
  }, [trackId]);
  return cover;
}

export function useTrackCover(id: string | undefined): Cover | null {
  return useCover(useArtworkOff() ? undefined : id);
}

export function usePlayingCover(id: string | undefined): Cover | null {
  return useCover(id);
}

export function forgetCover(trackId: string) {
  cache.set(trackId, null);
}
export function refreshCover(trackId: string) {
  cache.delete(trackId);
  inFlight.delete(trackId);
  version.set(trackId, (version.get(trackId) ?? 0) + 1);
  for (const watcher of watchers) watcher();
}

export const coverCacheSizes = () => ({
  covers: cache.size,
  inFlight: inFlight.size,
  versions: version.size,
});

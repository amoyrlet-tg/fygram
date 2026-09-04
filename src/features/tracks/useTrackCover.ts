import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { tracksApi } from "./api";

/** The artwork of a track, plus the colours it is made of. */
export type Cover = { src: string; palette: string[] };

// once per track: rows come and go as the list scrolls
const cache = new Map<string, Cover | null>();
const inFlight = new Map<string, Promise<Cover | null>>();

// the extracted file keeps its name, so without this the webview answers from
// its own cache with the picture that was just replaced
const version = new Map<string, number>();

// so a rewritten picture reaches what is already on screen
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
      const cover = found ? { src: srcOf(trackId, found.path), palette: found.palette } : null;
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

/** The artwork embedded in the track's file, or null when it has none. */
export function useTrackCover(trackId: string | undefined): Cover | null {
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

/** Forgets a cover that turned out not to load, so the letter takes over. */
export function forgetCover(trackId: string) {
  cache.set(trackId, null);
}

/** Drops the old picture everywhere it is currently on screen. */
export function refreshCover(trackId: string) {
  cache.delete(trackId);
  inFlight.delete(trackId);
  version.set(trackId, (version.get(trackId) ?? 0) + 1);
  for (const watcher of watchers) watcher();
}

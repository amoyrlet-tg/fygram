import { useEffect, useReducer } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { tracksApi } from "./api";

/**
 * Artwork for mosaics: many tracks per request, no palettes. A sidebar asks
 * about hundreds at once, and `useTrackCover` would decode every one of them.
 */
const tiles = new Map<string, string | null>();
const watchers = new Set<() => void>();
const pending = new Set<string>();
let scheduled = false;

function flush() {
  scheduled = false;
  const ids = Array.from(pending);
  pending.clear();
  if (ids.length === 0) return;

  // claimed before the answer arrives, so a second mosaic does not re-queue
  for (const id of ids) tiles.set(id, null);

  tracksApi
    .trackCoverPaths(ids)
    .then((found) => {
      for (const [id, path] of Object.entries(found)) {
        tiles.set(id, convertFileSrc(path));
      }
      for (const watcher of watchers) watcher();
    })
    .catch(console.error);
}

function request(ids: string[]) {
  let added = false;
  for (const id of ids) {
    if (tiles.has(id) || pending.has(id)) continue;
    pending.add(id);
    added = true;
  }
  if (!added || scheduled) return;
  scheduled = true;
  queueMicrotask(flush);
}

/** The artwork of those of `trackIds` that have any, in the order given. */
export function useCoverTiles(trackIds: string[]): string[] {
  const key = trackIds.join(",");
  const [version, bump] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    const ids = key ? key.split(",") : [];
    if (ids.length === 0) return;
    let alive = true;
    const read = () => {
      if (alive) bump();
    };
    watchers.add(read);
    request(ids);
    return () => {
      alive = false;
      watchers.delete(read);
    };
  }, [key]);

  // recomputed every render: memoising would mean depending on `version`,
  // which this never reads
  void version;
  const ids = key ? key.split(",") : [];
  const seen = new Set<string>();
  const found: string[] = [];
  for (const id of ids) {
    const src = tiles.get(id);
    // one album would otherwise be four identical squares
    if (!src || seen.has(src)) continue;
    seen.add(src);
    found.push(src);
  }
  return found;
}

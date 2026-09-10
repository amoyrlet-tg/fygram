import { useEffect, useReducer } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { LruMap } from "@/shared/lib/lruCache";
import { tracksApi } from "./api";
const TILES_LIMIT = 500;
const tiles = new LruMap<string, string | null>(TILES_LIMIT);
const watchers = new Set<() => void>();
const pending = new Set<string>();
let scheduled = false;
function flush() {
  scheduled = false;
  const ids = Array.from(pending);
  pending.clear();
  if (ids.length === 0) return;
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
export function useCoverTiles(wanted: string[]): string[] {
  const key = wanted.join(",");
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
  void version;
  const ids = key ? key.split(",") : [];
  const seen = new Set<string>();
  const found: string[] = [];
  for (const id of ids) {
    const src = tiles.get(id);
    if (!src || seen.has(src)) continue;
    seen.add(src);
    found.push(src);
  }
  return found;
}

export const tileCacheSize = () => tiles.size;

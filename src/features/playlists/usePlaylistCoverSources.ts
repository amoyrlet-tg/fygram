import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { playlistsApi } from "./api";

let cache: Record<string, string[]> = {};
const watchers = new Set<() => void>();
let started = false;

function refresh() {
  playlistsApi
    .playlistCoverSources()
    .then((sources) => {
      cache = sources;
      for (const watcher of watchers) watcher();
    })
    .catch(console.error);
}

export function usePlaylistCoverSources(): Record<string, string[]> {
  const [sources, setSources] = useState(cache);

  useEffect(() => {
    const read = () => setSources(cache);
    watchers.add(read);
    if (!started) {
      started = true;
      refresh();
    } else {
      read();
    }
    const unlisten = listen("library-changed", refresh);
    return () => {
      watchers.delete(read);
      unlisten.then((f) => f());
    };
  }, []);

  return sources;
}

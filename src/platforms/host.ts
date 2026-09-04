import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

/** The machine the app is running on. */
export type Host = {
  /** `linux`, `macos`, `windows` or `android`. */
  os: string;
  desktop: boolean;
};

// cannot change while the app is open
let cached: Host | null = null;
let request: Promise<void> | null = null;
const watchers = new Set<() => void>();

function announce() {
  for (const watcher of watchers) watcher();
}

function load(): Promise<void> {
  request ??= invoke<Host>("host_info")
    .then((host) => {
      cached = host;
    })
    .catch(() => {
      // a failure should leave the desktop settings in place, not hide them
      cached = { os: "unknown", desktop: true };
    })
    .finally(announce);
  return request;
}

void load();

/** The host, or null until the first answer arrives. */
export function useHost(): Host | null {
  const [host, setHost] = useState<Host | null>(cached);

  useEffect(() => {
    if (cached) {
      setHost(cached);
      return;
    }
    const read = () => setHost(cached);
    watchers.add(read);
    void load();
    return () => {
      watchers.delete(read);
    };
  }, []);

  return host;
}

/**
 * Whether autostart, fullscreen and ducking mean anything here. Not
 * `useIsNarrow()`: a desktop window dragged narrow is still a desktop.
 */
export function useIsDesktopHost(): boolean {
  return useHost()?.desktop ?? false;
}

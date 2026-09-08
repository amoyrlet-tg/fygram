import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { coverCacheSizes } from "@/features/tracks/useTrackCover";
import { tileCacheSize } from "@/features/tracks/useCoverTiles";
import { ambientCacheSize } from "@/shared/hooks/useAmbientColor";

const SAMPLE_MS = 15_000;

interface HeapInfo {
  usedJSHeapSize?: number;
  totalJSHeapSize?: number;
  jsHeapSizeLimit?: number;
}

/** Chromium exposes this and the types do not; it is the only way to see the
 *  JS heap from inside the page. */
function heap(): HeapInfo {
  const measured = (performance as Performance & { memory?: HeapInfo }).memory;
  return measured ?? {};
}

/**
 * How many listeners are registered per event name.
 *
 * Tauri keeps them in an array per event, and a leak here is invisible
 * everywhere else: the arrays live outside our code, outside the DOM, and V8
 * never shrinks their backing store. This is what turned out to be growing.
 */
function listeners(): [string, number][] {
  try {
    const global = window as unknown as Record<string, unknown>;
    let registry = global["__internal_unstable_listeners_object_id__"];
    // the name says "id", so follow it through the global if that is what it is
    if (typeof registry === "string" || typeof registry === "number") {
      registry = global[String(registry)];
    }
    if (!registry || typeof registry !== "object") return [];
    return Object.entries(registry as Record<string, unknown>).map(([event, held]) => {
      if (Array.isArray(held)) return [event, held.length] as [string, number];
      if (held && typeof held === "object") {
        return [event, Object.keys(held as object).length] as [string, number];
      }
      return [event, held ? 1 : 0] as [string, number];
    });
  } catch {
    return [];
  }
}

/**
 * Reports what only the webview can see into the backend's memory log: the
 * OS can weigh the process, but not tell us whether the weight is the JS
 * heap, the document, our own caches, or listeners nobody unregistered.
 */
export function useMemoryLog(tracksInState: number) {
  useEffect(() => {
    const send = () => {
      const measured = heap();
      const covers = coverCacheSizes();
      void invoke("record_memory_sample", {
        sample: {
          js_heap_used: measured.usedJSHeapSize ?? null,
          js_heap_total: measured.totalJSHeapSize ?? null,
          js_heap_limit: measured.jsHeapSizeLimit ?? null,
          dom_nodes: document.getElementsByTagName("*").length,
          tracks_in_state: tracksInState,
          caches: [
            ["covers", covers.covers],
            ["cover_inflight", covers.inFlight],
            ["cover_versions", covers.versions],
            ["tiles", tileCacheSize()],
            ["ambient", ambientCacheSize()],
          ],
          listeners: listeners(),
        },
      }).catch(() => {
        // the log is a convenience; never let it break the app
      });
    };

    send();
    const id = window.setInterval(send, SAMPLE_MS);
    return () => window.clearInterval(id);
  }, [tracksInState]);
}

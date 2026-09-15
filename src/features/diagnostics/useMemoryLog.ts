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

function heap(): HeapInfo {
  const measured = (performance as Performance & { memory?: HeapInfo }).memory;
  return measured ?? {};
}

function listeners(): [string, number][] {
  try {
    const global = window as unknown as Record<string, unknown>;
    let registry = global["__internal_unstable_listeners_object_id__"];
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
      }).catch(() => {});
    };

    send();
    const id = window.setInterval(send, SAMPLE_MS);
    return () => window.clearInterval(id);
  }, [tracksInState]);
}

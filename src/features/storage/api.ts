import { invoke } from "@tauri-apps/api/core";
import type {
  CachePlan,
  CachePreview,
  CacheCleanupResult,
  MediaRootInfo,
  RelocateResult,
  StorageSlice,
} from "@/shared/api/types";

export const storageApi = {
  getMediaRoot: () => invoke<MediaRootInfo>("get_media_root"),
  storageBreakdown: () => invoke<StorageSlice[]>("storage_breakdown"),
  fileSizes: () => invoke<Record<string, number>>("storage_file_sizes"),
  setMediaRoot: (path: string, moveExisting: boolean) =>
    invoke<RelocateResult>("set_media_root", { path, moveExisting }),

  previewCacheCleanup: (plan: CachePlan) => invoke<CachePreview>("preview_cache_cleanup", { plan }),
  applyCacheCleanup: (plan: CachePlan) =>
    invoke<CacheCleanupResult>("apply_cache_cleanup", { plan }),
};

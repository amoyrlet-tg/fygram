import { invoke } from "@tauri-apps/api/core";
import type {
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
  useDownloadsMediaRoot: () => invoke<RelocateResult>("use_downloads_media_root"),
  getCacheMaxAge: () => invoke<number>("get_cache_max_age"),
  setCacheMaxAge: (days: number) => invoke<void>("set_cache_max_age", { days }),

  previewCacheCleanup: () => invoke<CachePreview>("preview_cache_cleanup"),
  applyCacheCleanup: () => invoke<CacheCleanupResult>("apply_cache_cleanup"),
};

import { invoke } from "@tauri-apps/api/core";
import type {
  CacheCleanupResult,
  CacheStats,
  DuckingConfig,
  ProfileTrack,
} from "@/shared/api/types";

export const profileApi = {
  getCacheStats: () => invoke<CacheStats>("get_cache_stats"),
  cleanupCache: (targetBytes: number) =>
    invoke<CacheCleanupResult>("cleanup_cache", { targetBytes }),
  getProfileSyncEnabled: () => invoke<boolean>("get_profile_sync_enabled"),
  setProfileSyncEnabled: (enabled: boolean) =>
    invoke<void>("set_profile_sync_enabled", { enabled }),
  setNowPlayingTrack: (trackId: string | null) =>
    invoke<void>("set_now_playing_track", { trackId }),
  getAutostartEnabled: () => invoke<boolean>("get_autostart_enabled"),
  setAutostartEnabled: (enabled: boolean) => invoke<void>("set_autostart_enabled", { enabled }),
  listProfileMusic: () => invoke<ProfileTrack[]>("list_profile_music"),
  addProfileMusic: (trackId: string) => invoke<void>("add_profile_music", { trackId }),
  toggleProfileMusic: (trackId: string) => invoke<boolean>("toggle_profile_music", { trackId }),
  removeProfileMusic: (documentId: string) => invoke<void>("remove_profile_music", { documentId }),
  reorderProfileMusic: (documentId: string, afterDocumentId: string | null) =>
    invoke<void>("reorder_profile_music", { documentId, afterDocumentId }),
  getDuckingConfig: () => invoke<DuckingConfig>("get_ducking_config"),
  setDuckingConfig: (enabled: boolean) => invoke<void>("set_ducking_config", { enabled }),
};

import { invoke } from "@tauri-apps/api/core";
import type { SyncStatus } from "@/shared/api/types";

export const syncApi = {
  getSyncStatus: () => invoke<SyncStatus>("get_sync_status"),
  syncNow: () => invoke<void>("sync_now"),
};

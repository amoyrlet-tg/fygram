import { invoke } from "@tauri-apps/api/core";
import type { BroadcastConfig } from "@/shared/api/types";

export const broadcastApi = {
  getConfig: () => invoke<BroadcastConfig>("get_broadcast_config"),
  setConfig: (enabled: boolean, url: string, token: string | null) =>
    invoke<BroadcastConfig>("set_broadcast_config", { enabled, url, token }),
  check: (url: string, token: string) => invoke<string>("check_broadcast_target", { url, token }),
  nowPlaying: (trackId: string, position: number, playing: boolean) =>
    invoke<void>("broadcast_now_playing", { trackId, position, playing }),
  stop: () => invoke<void>("broadcast_stop"),
};

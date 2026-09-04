import { invoke } from "@tauri-apps/api/core";
import type { PlaybackState } from "@/shared/api/types";

export const playerApi = {
  playTrack: (trackId: string, seq: number) => invoke<void>("play_track", { trackId, seq }),
  prefetchTrack: (trackId: string) => invoke<void>("prefetch_track", { trackId }),
  pausePlayback: () => invoke<void>("pause_playback"),
  resumePlayback: () => invoke<void>("resume_playback"),
  stopPlayback: (seq: number) => invoke<void>("stop_playback", { seq }),
  setVolume: (volume: number) => invoke<void>("set_volume", { volume }),
  seekPlayback: (seconds: number) => invoke<void>("seek_playback", { seconds }),
  getPlaybackPosition: () => invoke<PlaybackState>("get_playback_position"),
};

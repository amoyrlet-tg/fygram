import type { Track } from "@/shared/api/types";

export type RepeatMode = "off" | "all" | "one";

export interface FetchProgress {
  trackId: string;
  downloaded: number;
  total: number;
}

export interface PlayerState {
  queue: Track[];
  index: number;
  current: Track | null;
  isPlaying: boolean;
  position: number;
  volume: number;
  shuffle: boolean;
  repeat: RepeatMode;
}

export const POLL_MS = 500;
export const PROFILE_SYNC_MS = 15_000;
export const BROADCAST_MS = 3_000;
export const END_EPSILON = 0.75;
export const MIN_PLAY_MS = 1500;
export const SHUFFLE_NO_REPEAT = 10;
export const PLAY_RETRY_ATTEMPTS = 3;
export const PLAY_RETRY_DELAY_MS = 600;
export const QUIET_GAIN = 0.1;

export const FADE_BACK_MS = 450;

export const FADE_STEP_MS = 25;

export const VOLUME_STORAGE_KEY = "player-volume";
export const LAST_TRACK_STORAGE_KEY = "player-last-track";
export const SESSION_STORAGE_KEY = "player-session";
export const SESSION_SAVE_MS = 5_000;

export interface StoredSession {
  queue: string[];
  index: number;
  position: number;
  shuffle: boolean;
  repeat: RepeatMode;
}

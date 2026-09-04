export interface Channel {
  id: string;
  username: string | null;
  title: string;
  access_hash: number;
  source_type: "subscribed" | "manual";
  avatar_path: string | null;
  last_synced_at: string | null;
  last_full_synced_at: string | null;
  is_active: boolean;

  /** null means Telegram has never been asked; a sync fills it in. */
  can_edit: boolean | null;
  /** What replacing a forwarded track needs. */
  can_repost: boolean | null;
  rights_checked_at: string | null;
}

export interface Track {
  id: string;
  channel_id: string;
  tg_message_id: number;
  file_path: string;
  file_hash: string;
  title: string | null;
  artist: string | null;
  album: string | null;
  duration_sec: number | null;
  added_at: string;
  play_count: number;
  published_at: string | null;

  /** Telegram refuses to edit a forward, so the dialog replaces it instead.
   *  null means no sync has looked yet. */
  forwarded: boolean | null;
  forwarded_from: string | null;
  forwarded_at: string | null;
}

export interface Playlist {
  id: string;
  name: string;
  is_smart: boolean;
  smart_rule: string | null;
  created_at: string;
  /** The picture it was given. Null means one is built from its tracks. */
  cover_path: string | null;
}

export interface EmojiStatus {
  path: string;
  kind: "lottie" | "video" | "image";
}

export interface CurrentUser {
  id: number;
  first_name: string;
  last_name: string | null;
  username: string | null;
  avatar_path: string | null;
  emoji_status: EmojiStatus | null;
}

export type LoginOutcome = "success" | "password_required";

export interface DuckingConfig {
  enabled: boolean;
  supported: boolean;
}

export type SyncDepth = "full" | "new_only";

export interface SyncStats {
  new_tracks: number;
  skipped_duplicates: number;
  removed_tracks: number;
  updated_tracks: number;
  stopped_early: boolean;
}

export interface SyncProgress {
  channel_id: string;
  processed: number;
  total: number;
  new_tracks: number;
  latest_track: Track | null;
  done: boolean;
}

export interface SyncStatus {
  online: boolean;
  syncing: boolean;
  pending: number;
  last_synced_at: string | null;
  pending_since: string | null;
  last_error: string | null;
  ready: boolean;
  session_invalid: boolean;
}

export interface IndexingBatch {
  active: boolean;
  total: number;
  completed: number;
}

export interface BroadcastConfig {
  enabled: boolean;
  url: string;
  has_token: boolean;
}

export interface CacheStats {
  total_bytes: number;
  track_count: number;
  orphaned_bytes: number;
  orphaned_files: number;
}

export interface DownloadStats {
  downloaded: number;
  failed: number;
}

export interface DownloadProgress {
  channel_id: string;
  processed: number;
  total: number;
  downloaded: number;
  done: boolean;
}

export interface PlaybackState {
  position: number;
  finished: boolean;
  active: boolean;
}

export interface CachePlan {
  keep_playlist_ids: string[];
  keep_channel_ids: string[];
  drop_orphans: boolean;
}

export interface CachePreview {
  keep_bytes: number;
  keep_tracks: number;
  free_bytes: number;
  free_tracks: number;
  orphan_bytes: number;
  orphan_files: number;
}

export interface MediaRootInfo {
  path: string;
  is_default: boolean;
  file_count: number;
  total_bytes: number;
}

export interface RelocateResult {
  moved: number;
  failed: number;
  root: string;
}

export interface RelocateProgress {
  moved: number;
  total: number;
  done: boolean;
}

export interface CacheCleanupResult {
  freed_bytes: number;
  deleted_orphan_files: number;
  evicted_tracks: number;
}

export interface SessionState {
  authorized: boolean;
  session_invalid: boolean;
  has_local_library: boolean;
}

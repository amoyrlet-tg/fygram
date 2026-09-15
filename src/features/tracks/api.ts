import { invoke } from "@tauri-apps/api/core";
import type { DownloadStats, Lyric, Track } from "@/shared/api/types";
import type { TrackMetadataEdit, TrackRepost } from "./types";

export const tracksApi = {
  trackCoverPaths: (trackIds: string[]) =>
    invoke<Record<string, string>>("track_cover_paths", { trackIds }),
  listTracks: () => invoke<Track[]>("list_tracks"),
  downloadTrack: (trackId: string) => invoke<Track>("download_track", { trackId }),
  downloadTracks: (trackIds: string[], progressId: string) =>
    invoke<DownloadStats>("download_tracks", { trackIds, progressId }),
  searchTracks: (query: string) => invoke<Track[]>("search_tracks", { query }),
  retagTracks: () => invoke<number>("retag_tracks"),
  trackCover: (trackId: string) =>
    invoke<{ path: string; preview: string; palette: string[] } | null>("track_cover", {
      trackId,
    }),
  trackLyrics: (trackId: string) => invoke<Lyric[] | null>("track_lyrics", { trackId }),
  updateTrack: (trackId: string, fields: TrackMetadataEdit) =>
    invoke<Track>("update_track", {
      trackId,
      title: fields.title,
      artist: fields.artist,
      album: fields.album,
      coverPath: fields.coverPath,
    }),
  repostTrack: (trackId: string, fields: TrackRepost) =>
    invoke<Track>("repost_track", {
      trackId,
      title: fields.title,
      artist: fields.artist,
      album: fields.album,
      coverPath: fields.coverPath,
      caption: fields.caption,
      deleteOriginal: fields.deleteOriginal,
    }),
};

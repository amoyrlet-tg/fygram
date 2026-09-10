import { invoke } from "@tauri-apps/api/core";
import type { Track } from "@/shared/api/types";

export const tracksApi = {
  trackCoverPaths: (trackIds: string[]) =>
    invoke<Record<string, string>>("track_cover_paths", { trackIds }),
  listTracks: () => invoke<Track[]>("list_tracks"),
  searchTracks: (query: string) => invoke<Track[]>("search_tracks", { query }),
  retagTracks: () => invoke<number>("retag_tracks"),
  trackCover: (trackId: string) =>
    invoke<{ path: string; preview: string; palette: string[] } | null>("track_cover", {
      trackId,
    }),
  updateTrack: (
    trackId: string,
    fields: {
      title: string | null;
      artist: string | null;
      album: string | null;
      coverPath: string | null;
    },
  ) =>
    invoke<Track>("update_track", {
      trackId,
      title: fields.title,
      artist: fields.artist,
      album: fields.album,
      coverPath: fields.coverPath,
    }),
  repostTrack: (
    trackId: string,
    fields: {
      title: string | null;
      artist: string | null;
      album: string | null;
      coverPath: string | null;
      caption: string;
      deleteOriginal: boolean;
    },
  ) =>
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

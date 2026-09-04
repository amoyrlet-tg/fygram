import { invoke } from "@tauri-apps/api/core";
import type { DownloadStats, Playlist, Track } from "@/shared/api/types";

export const playlistsApi = {
  listPlaylists: () => invoke<Playlist[]>("list_playlists"),
  createPlaylist: (name: string) => invoke<Playlist>("create_playlist", { name }),
  deletePlaylist: (playlistId: string) => invoke<void>("delete_playlist", { playlistId }),
  renamePlaylist: (playlistId: string, name: string) =>
    invoke<Playlist>("rename_playlist", { playlistId, name }),
  downloadPlaylist: (playlistId: string) =>
    invoke<DownloadStats>("download_playlist", { playlistId }),
  listPlaylistTracks: (playlistId: string) =>
    invoke<Track[]>("list_playlist_tracks", { playlistId }),
  addTrackToPlaylist: (playlistId: string, trackId: string) =>
    invoke<void>("add_track_to_playlist", { playlistId, trackId }),
  removeTrackFromPlaylist: (playlistId: string, trackId: string) =>
    invoke<void>("remove_track_from_playlist", { playlistId, trackId }),
  reorderPlaylistTrack: (playlistId: string, trackId: string, newIndex: number) =>
    invoke<void>("reorder_playlist_track", { playlistId, trackId, newIndex }),
  setPlaylistCover: (playlistId: string, sourcePath: string) =>
    invoke<Playlist>("set_playlist_cover", { playlistId, sourcePath }),
  clearPlaylistCover: (playlistId: string) =>
    invoke<Playlist>("clear_playlist_cover", { playlistId }),
  /** The first few tracks of each playlist, to build a cover out of. */
  playlistCoverSources: () => invoke<Record<string, string[]>>("playlist_cover_sources"),
};

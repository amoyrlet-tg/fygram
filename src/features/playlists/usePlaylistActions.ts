import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import type { Playlist, Track } from "@/shared/api/types";
import type { View } from "@/app/view";
import { trackLabel } from "@/shared/lib/format";
import { useT } from "@/shared/i18n";
import { showToast } from "@/shared/ui/Toast";
import { isOffline } from "@/features/sync/connectivity";
import { playlistsApi } from "./api";

export function usePlaylistActions(opts: {
  view: View;
  setView: (v: View) => void;
  playlists: Playlist[];
  playlistTracks: Track[];
  setPlaylists: Dispatch<SetStateAction<Playlist[]>>;
  setPlaylistTracks: Dispatch<SetStateAction<Track[]>>;
  refreshPlaylists: () => void;
  refreshTracks: () => void;
  markDownloadStarted: (id: string) => void;
}) {
  const {
    view,
    setView,
    playlists,
    playlistTracks,
    setPlaylists,
    setPlaylistTracks,
    refreshPlaylists,
    refreshTracks,
    markDownloadStarted,
  } = opts;
  const t = useT();

  const handleCreatePlaylist = useCallback(
    async (name: string) => {
      try {
        const playlist = await playlistsApi.createPlaylist(name);
        refreshPlaylists();
        setView({ kind: "playlist", playlistId: playlist.id });
        if (isOffline()) {
          showToast({
            key: "playlist-queued",
            message: t("Playlist saved. It will appear in Telegram once you are back online."),
          });
        }
      } catch (err) {
        showToast({
          key: "playlist-create",
          kind: "warn",
          message: `${t("Couldn't create the playlist:")} ${err}`,
        });
      }
    },
    [refreshPlaylists, setView, t],
  );

  const handleRenamePlaylist = useCallback(
    (playlistId: string, name: string) => {
      playlistsApi
        .renamePlaylist(playlistId, name)
        .then((updated) =>
          setPlaylists((prev) => prev.map((p) => (p.id === playlistId ? updated : p))),
        )
        .catch((err) =>
          showToast({
            key: "playlist-rename",
            kind: "warn",
            message: `${t("Couldn't rename the playlist:")} ${err}`,
          }),
        );
    },
    [setPlaylists, t],
  );

  const handleDownloadPlaylist = useCallback(
    async (playlistId: string) => {
      markDownloadStarted(playlistId);
      try {
        await playlistsApi.downloadPlaylist(playlistId);
      } catch (err) {
        console.error(err);
      } finally {
        refreshTracks();
        if (view.kind === "playlist" && view.playlistId === playlistId) {
          playlistsApi.listPlaylistTracks(playlistId).then(setPlaylistTracks).catch(console.error);
        }
      }
    },
    [markDownloadStarted, refreshTracks, view, setPlaylistTracks],
  );

  const [deletePlaylistConfirm, setDeletePlaylistConfirm] = useState<{
    playlistId: string;
    playlistName: string;
    step: 1 | 2;
  } | null>(null);
  const handleDeletePlaylist = useCallback(
    (playlistId: string) => {
      const playlist = playlists.find((p) => p.id === playlistId);
      setDeletePlaylistConfirm({ playlistId, playlistName: playlist?.name ?? "", step: 1 });
    },
    [playlists],
  );
  const advanceDeletePlaylistConfirm = useCallback(() => {
    setDeletePlaylistConfirm((prev) => (prev ? { ...prev, step: 2 } : prev));
  }, []);
  const cancelDeletePlaylistConfirm = useCallback(() => setDeletePlaylistConfirm(null), []);
  const finalizeDeletePlaylist = useCallback(async () => {
    if (!deletePlaylistConfirm) return;
    const { playlistId } = deletePlaylistConfirm;
    setDeletePlaylistConfirm(null);
    await playlistsApi.deletePlaylist(playlistId);
    if (view.kind === "playlist" && view.playlistId === playlistId) {
      setView({ kind: "library" });
    }
    refreshPlaylists();
  }, [deletePlaylistConfirm, refreshPlaylists, view, setView]);

  const handleAddToPlaylist = useCallback((playlistId: string, trackId: string) => {
    playlistsApi.addTrackToPlaylist(playlistId, trackId);
  }, []);

  const [removeTrackConfirm, setRemoveTrackConfirm] = useState<{
    trackId: string;
    trackTitle: string;
  } | null>(null);
  const handleRemoveFromPlaylist = useCallback(
    (trackId: string) => {
      if (view.kind !== "playlist") return;
      const track = playlistTracks.find((t) => t.id === trackId);
      setRemoveTrackConfirm({ trackId, trackTitle: track ? trackLabel(track).title : "" });
    },
    [view, playlistTracks],
  );
  const cancelRemoveTrackConfirm = useCallback(() => setRemoveTrackConfirm(null), []);
  const finalizeRemoveFromPlaylist = useCallback(() => {
    if (!removeTrackConfirm || view.kind !== "playlist") return;
    const { trackId } = removeTrackConfirm;
    setRemoveTrackConfirm(null);
    playlistsApi
      .removeTrackFromPlaylist(view.playlistId, trackId)
      .then(() => playlistsApi.listPlaylistTracks(view.playlistId))
      .then(setPlaylistTracks);
  }, [removeTrackConfirm, view, setPlaylistTracks]);

  const handleReorderPlaylistTrack = useCallback(
    (trackId: string, newIndex: number) => {
      if (view.kind !== "playlist") return;
      const { playlistId } = view;
      setPlaylistTracks((prev) => {
        const oldIndex = prev.findIndex((tr) => tr.id === trackId);
        if (oldIndex === -1) return prev;
        const next = prev.slice();
        const [moved] = next.splice(oldIndex, 1);
        next.splice(newIndex, 0, moved);
        return next;
      });
      playlistsApi.reorderPlaylistTrack(playlistId, trackId, newIndex).catch((err) => {
        console.error(err);
        playlistsApi.listPlaylistTracks(playlistId).then(setPlaylistTracks).catch(console.error);
      });
    },
    [view, setPlaylistTracks],
  );

  return {
    handleCreatePlaylist,
    handleRenamePlaylist,
    handleDownloadPlaylist,
    deletePlaylistConfirm,
    handleDeletePlaylist,
    advanceDeletePlaylistConfirm,
    cancelDeletePlaylistConfirm,
    finalizeDeletePlaylist,
    handleAddToPlaylist,
    removeTrackConfirm,
    handleRemoveFromPlaylist,
    cancelRemoveTrackConfirm,
    finalizeRemoveFromPlaylist,
    handleReorderPlaylistTrack,
  };
}

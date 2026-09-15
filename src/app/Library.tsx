import { useCallback, useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { Playlist, Track } from "@/shared/api/types";
import { fuzzyTextMatches } from "@/shared/lib/fuzzy";
import {
  collapseDuplicateTracks,
  type TrackGroups,
} from "@/features/tracks/collapseDuplicateTracks";
import { libraryPresentation } from "./libraryPresentation";
import { VARIOUS_ARTISTS_KEY } from "@/shared/lib/artists";
import { useT } from "@/shared/i18n";
import { channelsApi } from "@/features/channels/api";
import { playlistsApi } from "@/features/playlists/api";
import { tracksApi } from "@/features/tracks/api";
import { useArtists } from "@/features/artists/useArtists";
import { useChannelSync } from "@/features/channels/useChannelSync";
import { useDeleteChannel } from "@/features/channels/useDeleteChannel";
import { useEditChannel } from "@/features/channels/useEditChannel";
import { SyncDialog } from "@/features/channels/components/SyncDialog";
import { usePlaylistActions } from "@/features/playlists/usePlaylistActions";
import { useSyncStatus } from "@/features/sync/useSyncStatus";
import { useTrackActions } from "@/features/tracks/useTrackActions";
import { PlayerProvider, usePlayerApi } from "@/features/player";
import { useCompactColumns } from "@/shared/hooks/useMediaQuery";
import { useKeyboardControls } from "@/features/player/useKeyboardControls";
import type { View } from "@/shared/lib/libraryView";
import { SettingsProvider } from "./providers/SettingsProvider";
import { WideLayout } from "@/layouts/wide/WideLayout";
import { TrackTable } from "@/features/tracks/components/TrackTable";
import { ChannelPicker } from "@/features/channels/components/ChannelPicker";
import { NewPlaylistDialog } from "@/features/playlists/components/NewPlaylistDialog";
import { useChannelRightsNotice } from "@/features/channels/useEditRights";
import { useMemoryLog } from "@/features/diagnostics/useMemoryLog";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { LoadingOverlay } from "@/shared/ui/LoadingOverlay";

import type { Channel } from "@/shared/api/types";

export function Library() {
  return (
    <SettingsProvider>
      <PlayerProvider>
        <LibraryContent />
      </PlayerProvider>
    </SettingsProvider>
  );
}

function LibraryContent() {
  const t = useT();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [allTracks, setAllTracks] = useState<Track[]>([]);
  const [playlistTracks, setPlaylistTracks] = useState<Track[]>([]);
  const [view, setView] = useState<View>({ kind: "library" });
  const [searchQuery, setSearchQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [newPlaylistOpen, setNewPlaylistOpen] = useState(false);

  const player = usePlayerApi();

  const refreshChannels = useCallback(() => {
    channelsApi.listChannels().then(setChannels).catch(console.error);
  }, []);
  const refreshPlaylists = useCallback(() => {
    playlistsApi.listPlaylists().then(setPlaylists).catch(console.error);
  }, []);
  const refreshTracks = useCallback(() => {
    tracksApi.listTracks().then(setAllTracks).catch(console.error);
  }, []);

  useEffect(() => {
    refreshChannels();
    refreshPlaylists();
    refreshTracks();
  }, [refreshChannels, refreshPlaylists, refreshTracks]);

  useEffect(() => {
    if (player.current || allTracks.length === 0) return;
    player.restoreSession(allTracks);
  }, [allTracks, player]);

  useEffect(() => {
    if (view.kind === "playlist") {
      playlistsApi.listPlaylistTracks(view.playlistId).then(setPlaylistTracks).catch(console.error);
    }
  }, [view]);

  useChannelRightsNotice();
  useMemoryLog(allTracks.length);

  useKeyboardControls({
    next: player.next,
    previous: player.previous,
    togglePlay: player.togglePlay,
    enabled: allTracks.length > 0,
  });

  useEffect(() => {
    const unlisten = listen("library-changed", () => {
      refreshChannels();
      refreshPlaylists();
      refreshTracks();
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, [refreshChannels, refreshPlaylists, refreshTracks]);

  const {
    syncProgress,
    indexingBatch,
    downloadProgress,
    markDownloadStarted,
    syncAsk,
    requestSyncChannel,
    cancelSyncAsk,
    confirmSyncAsk,
    handleDownloadChannel,
    handleCancelSync,
  } = useChannelSync({ channels, setAllTracks, refreshTracks, refreshChannels });

  const {
    deleteChannelConfirm,
    handleDeleteChannel,
    cancelDeleteChannelConfirm,
    finalizeDeleteChannel,
  } = useDeleteChannel({ channels, view, setView, refreshChannels, refreshTracks });

  const patchChannel = useCallback((channelId: string, patch: Partial<Channel>) => {
    setChannels((prev) => prev.map((c) => (c.id === channelId ? { ...c, ...patch } : c)));
  }, []);
  const { renameChannel, changeChannelPhoto } = useEditChannel({
    refreshChannels,
    patchChannel,
  });

  useSyncStatus();

  const {
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
  } = usePlaylistActions({
    view,
    setView,
    playlists,
    playlistTracks,
    setPlaylists,
    setPlaylistTracks,
    refreshPlaylists,
    refreshTracks,
    markDownloadStarted,
  });

  const { handleUpdateTrack } = useTrackActions({
    setAllTracks,
    setPlaylistTracks,
    refreshTracks,
    t,
  });

  const [artistScope, setArtistScope] = useState<string | null>(null);
  useEffect(() => {
    if (view.kind === "channel") setArtistScope(view.channelId);
    else if (view.kind !== "artist") setArtistScope(null);
  }, [view]);

  const clearArtistScope = useCallback(() => setArtistScope(null), []);

  const artistScopeChannel = artistScope ? channels.find((c) => c.id === artistScope) : undefined;
  const { artists, filterByArtist } = useArtists(allTracks, artistScope);

  const handleRenameArtist = useCallback(
    async (artistName: string, newName: string) => {
      const artistTracks = filterByArtist(allTracks, artistName);
      if (!artistTracks.length) return;
      const confirmed = window.confirm(
        `${t("Rename artist")} «${artistName}» → «${newName}»?\n${t("This will update all audio files on Telegram.")}`,
      );
      if (!confirmed) return;

      for (const track of artistTracks) {
        const updated = await handleUpdateTrack(track.id, {
          title: track.title,
          artist: newName,
          album: track.album,
          coverPath: null,
        });
        if (!updated) break;
      }
      refreshTracks();
    },
    [allTracks, filterByArtist, handleUpdateTrack, refreshTracks, t],
  );

  const viewTracks = useMemo(() => {
    if (view.kind === "library") return allTracks;
    if (view.kind === "channel") return allTracks.filter((tr) => tr.channel_id === view.channelId);
    if (view.kind === "artist") {
      const pool = artistScope
        ? allTracks.filter((tr) => tr.channel_id === artistScope)
        : allTracks;
      return filterByArtist(pool, view.artist);
    }
    return playlistTracks;
  }, [view, allTracks, playlistTracks, filterByArtist, artistScope]);

  const isSearching = searchQuery.trim().length > 0;
  const displayedTracks = useMemo(() => {
    if (!isSearching) return viewTracks;
    const query = searchQuery.toLowerCase();
    return viewTracks.filter((tr) => {
      const haystack = `${tr.title ?? ""} ${tr.artist ?? ""} ${tr.album ?? ""}`.toLowerCase();
      return fuzzyTextMatches(haystack, query);
    });
  }, [isSearching, searchQuery, viewTracks]);

  const collapseDuplicates = view.kind === "library" || view.kind === "artist";
  const { rows: collapsedTracks, sources } = useMemo<TrackGroups>(() => {
    if (!collapseDuplicates) {
      return { rows: displayedTracks, sources: {} };
    }
    return collapseDuplicateTracks(displayedTracks, channels);
  }, [collapseDuplicates, displayedTracks, channels]);

  const presentation = libraryPresentation(view, channels, playlists, isSearching, t);

  const handleAddChannel = useCallback(() => setPickerOpen(true), []);
  const handlePickerClose = useCallback(() => setPickerOpen(false), []);
  const handlePickerAdded = useCallback(() => refreshChannels(), [refreshChannels]);

  const compactColumns = useCompactColumns();
  const handlePlay = useCallback(
    (tracks: Track[], startIndex: number) => {
      const clicked = tracks[startIndex];
      if (!clicked) return;
      const fullIndex = viewTracks.findIndex((tr) => tr.id === clicked.id);
      if (fullIndex >= 0) {
        player.play(viewTracks, fullIndex);
      } else {
        player.play(tracks, startIndex);
      }
    },
    [player, viewTracks],
  );

  const handleDownloadTracks = useCallback(
    async (trackIds: string[], progressId: string) => {
      markDownloadStarted(progressId);
      await tracksApi.downloadTracks(trackIds, progressId);
      refreshTracks();
    },
    [markDownloadStarted, refreshTracks],
  );

  const viewDownloadProgress =
    presentation.downloadId === undefined ? undefined : downloadProgress[presentation.downloadId];
  const channelSync = view.kind === "channel" ? syncProgress[view.channelId] : undefined;
  const channelBusy =
    view.kind === "channel" &&
    (!!(channelSync && !channelSync.done) ||
      !!(viewDownloadProgress && !viewDownloadProgress.done));

  const indexing = useMemo(() => {
    const running = Object.values(syncProgress).find((p) => p && !p.done && !p.error);
    if (!running && !indexingBatch) return null;

    const channelFraction =
      running && running.total > 0 ? Math.min(1, running.processed / running.total) : null;

    let percent: number | null = channelFraction === null ? null : channelFraction * 100;
    if (indexingBatch && indexingBatch.total > 0) {
      const done = indexingBatch.completed + (channelFraction ?? 0);
      percent = Math.min(100, (done / indexingBatch.total) * 100);
    }

    return { percent, title: t("Indexing channels…") };
  }, [syncProgress, indexingBatch, t]);

  const trackTable = (
    <TrackTable
      title={presentation.title}
      tracks={collapsedTracks}
      trackSources={sources}
      channels={channels}
      playlists={playlists}
      channelView={presentation.channel}
      playlistView={presentation.playlist}
      onRenamePlaylist={handleRenamePlaylist}
      onDeletePlaylist={handleDeletePlaylist}
      onDownloadPlaylist={handleDownloadPlaylist}
      onSyncChannel={requestSyncChannel}
      onDownloadChannel={handleDownloadChannel}
      onRenameChannel={renameChannel}
      onRenameArtist={handleRenameArtist}
      onChangeChannelPhoto={changeChannelPhoto}
      onDeleteChannel={handleDeleteChannel}
      onCancelSync={handleCancelSync}
      channelBusy={channelBusy}
      currentTrackId={player.current?.id ?? null}
      isPlaying={player.isPlaying}
      onPlay={handlePlay}
      onTogglePlay={player.togglePlay}
      onAddToPlaylist={handleAddToPlaylist}
      onRemoveFromPlaylist={view.kind === "playlist" ? handleRemoveFromPlaylist : undefined}
      onUpdateTrack={handleUpdateTrack}
      onDownloadTracks={
        view.kind === "artist"
          ? (trackIds) => handleDownloadTracks(trackIds, `artist:${view.artist}`)
          : undefined
      }
      reorderable={view.kind === "playlist" && !isSearching}
      onReorder={view.kind === "playlist" ? handleReorderPlaylistTrack : undefined}
      compact={compactColumns}
      unavailableIds={player.unavailableIds}
      kindLabel={presentation.kindLabel}
      artistView={view.kind === "artist"}
      artistName={
        view.kind === "artist" && !isSearching && view.artist !== VARIOUS_ARTISTS_KEY
          ? view.artist
          : undefined
      }
      downloadProgress={viewDownloadProgress}
    />
  );

  const loadingGate = (
    <LoadingOverlay
      active={indexing !== null}
      percent={indexing?.percent ?? null}
      title={indexing?.title ?? ""}
    />
  );

  const modals = (
    <>
      {pickerOpen && <ChannelPicker onClose={handlePickerClose} onAdded={handlePickerAdded} />}

      {newPlaylistOpen && (
        <NewPlaylistDialog
          onCreate={(name, coverPath) => {
            setNewPlaylistOpen(false);
            void handleCreatePlaylist(name, coverPath);
          }}
          onCancel={() => setNewPlaylistOpen(false)}
        />
      )}

      {deletePlaylistConfirm?.step === 1 && (
        <ConfirmDialog
          title={t("Delete playlist?")}
          message={
            <>
              {t("Are you sure you want to delete the playlist:")} «
              {deletePlaylistConfirm.playlistName}»?
            </>
          }
          confirmLabel={t("Delete")}
          danger
          onConfirm={advanceDeletePlaylistConfirm}
          onCancel={cancelDeletePlaylistConfirm}
        />
      )}
      {deletePlaylistConfirm?.step === 2 && (
        <ConfirmDialog
          title={t("This can't be undone")}
          message={t("Delete permanently?")}
          confirmLabel={t("Delete permanently")}
          danger
          onConfirm={finalizeDeletePlaylist}
          onCancel={cancelDeletePlaylistConfirm}
        />
      )}
      {syncAsk && (
        <SyncDialog
          channelTitle={syncAsk.channelTitle}
          onConfirm={confirmSyncAsk}
          onCancel={cancelSyncAsk}
        />
      )}
      {deleteChannelConfirm && (
        <ConfirmDialog
          title={t("Delete channel?")}
          message={
            <>
              {t(
                "The channel and its tracks will be removed from the library. Tracks saved in playlists stay.",
              )}{" "}
              «{deleteChannelConfirm.channelTitle}»
            </>
          }
          confirmLabel={t("Delete")}
          danger
          onConfirm={finalizeDeleteChannel}
          onCancel={cancelDeleteChannelConfirm}
        />
      )}
      {removeTrackConfirm && (
        <ConfirmDialog
          title={t("Remove track from playlist?")}
          message={
            <>
              {t("Are you sure you want to remove this track from the playlist:")} «
              {removeTrackConfirm.trackTitle}»
            </>
          }
          confirmLabel={t("Remove from playlist")}
          danger
          onConfirm={finalizeRemoveFromPlaylist}
          onCancel={cancelRemoveTrackConfirm}
        />
      )}
    </>
  );

  return (
    <WideLayout
      channels={channels}
      playlists={playlists}
      artists={artists}
      view={view}
      onSelectView={setView}
      onAddChannel={handleAddChannel}
      onNewPlaylist={() => setNewPlaylistOpen(true)}
      syncProgress={syncProgress}
      artistScopeTitle={artistScopeChannel?.title ?? null}
      onClearArtistScope={clearArtistScope}
      trackTable={trackTable}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      modals={
        <>
          {modals}
          {loadingGate}
        </>
      }
    />
  );
}

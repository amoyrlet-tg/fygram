import { useCallback, useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { Playlist, Track } from "@/shared/api/types";
import { formatRuntime, totalDurationSeconds } from "@/shared/lib/format";
import { fuzzyTextMatches } from "@/shared/lib/fuzzy";
import { trackGroupKey } from "@/shared/lib/trackKey";
import { VARIOUS_ARTISTS_KEY } from "@/shared/lib/artists";
import { useT } from "@/shared/i18n";
import { channelsApi } from "@/features/channels/api";
import { playlistsApi } from "@/features/playlists/api";
import { tracksApi } from "@/features/tracks/api";
import { useArtists } from "@/features/artists/useArtists";
import { useChannelSync } from "@/features/channels/useChannelSync";
import { useDeleteChannel } from "@/features/channels/useDeleteChannel";
import { SyncDialog } from "@/features/channels/components/SyncDialog";
import { usePlaylistActions } from "@/features/playlists/usePlaylistActions";
import { useSyncStatus } from "@/features/sync/useSyncStatus";
import { useTrackActions } from "@/features/tracks/useTrackActions";
import { PlayerProvider, usePlayerApi } from "./providers/PlayerProvider";
import { useIsNarrow, useCompactColumns } from "@/shared/hooks/useNarrowLayout";
import type { View } from "@/app/view";
import { SettingsProvider } from "./providers/SettingsProvider";
import { WideLayout } from "@/layouts/wide/WideLayout";
import { NarrowLayout, type NarrowTab } from "@/layouts/narrow/NarrowLayout";
import { TrackTable } from "@/features/tracks/components/TrackTable";
import { ChannelPicker } from "@/features/channels/components/ChannelPicker";
import { useChannelRightsNotice } from "@/features/channels/useEditRights";
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

  const { status: syncStatus, syncNow } = useSyncStatus();

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

  const { handleUpdateTrack, mergingArtists, handleMergeArtists } = useTrackActions({
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
  const { rows: collapsedTracks, sources } = useMemo(() => {
    if (!collapseDuplicates) {
      return { rows: displayedTracks, sources: {} as Record<string, string[]> };
    }
    const first = new Map<string, Track>();
    const channelsOf = new Map<string, string[]>();
    for (const tr of displayedTracks) {
      const k = trackGroupKey(tr.artist, tr.title);
      const head = first.get(k);
      if (head) {
        const list = channelsOf.get(head.id) ?? [];
        if (!list.includes(tr.channel_id)) list.push(tr.channel_id);
        channelsOf.set(head.id, list);
      } else {
        first.set(k, tr);
        channelsOf.set(tr.id, [tr.channel_id]);
      }
    }
    return { rows: Array.from(first.values()), sources: Object.fromEntries(channelsOf) };
  }, [collapseDuplicates, displayedTracks]);

  const viewMeta = useMemo(() => {
    if (displayedTracks.length === 0) return "";
    const runtime = formatRuntime(totalDurationSeconds(displayedTracks), {
      hr: t("hr"),
      min: t("min"),
    });
    const count = `${displayedTracks.length} ${t("songs")}`;
    return runtime ? `${count} · ${runtime}` : count;
  }, [displayedTracks, t]);

  const baseViewTitle =
    view.kind === "library"
      ? t("All tracks")
      : view.kind === "channel"
        ? (channels.find((c) => c.id === view.channelId)?.title ?? t("Channel"))
        : view.kind === "artist"
          ? view.artist === VARIOUS_ARTISTS_KEY
            ? t("Various artists")
            : view.artist
          : (playlists.find((p) => p.id === view.playlistId)?.name ?? t("Playlist"));
  const viewTitle = isSearching ? t("Search results") : baseViewTitle;

  const handleAddChannel = useCallback(() => setPickerOpen(true), []);
  const handlePickerClose = useCallback(() => setPickerOpen(false), []);
  const handlePickerAdded = useCallback(() => refreshChannels(), [refreshChannels]);

  const isNarrow = useIsNarrow();
  const compactColumns = useCompactColumns();
  const [narrowTab, setNarrowTab] = useState<NarrowTab>("home");

  const handleNarrowTabChange = useCallback((tab: NarrowTab) => {
    if (tab !== "search") {
      setSearchQuery("");
    }
    setNarrowTab(tab);
  }, []);

  const handleNarrowSelectView = useCallback((v: View) => {
    setView(v);
    setNarrowTab("home");
  }, []);

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
      title={viewTitle}
      tracks={collapsedTracks}
      trackSources={sources}
      channels={channels}
      playlists={playlists}
      channelView={
        view.kind === "channel" ? channels.find((c) => c.id === view.channelId) : undefined
      }
      playlistView={
        view.kind === "playlist" ? playlists.find((p) => p.id === view.playlistId) : undefined
      }
      onRenamePlaylist={handleRenamePlaylist}
      onDeletePlaylist={handleDeletePlaylist}
      onDownloadPlaylist={handleDownloadPlaylist}
      onSyncChannel={requestSyncChannel}
      onDownloadChannel={handleDownloadChannel}
      onDeleteChannel={handleDeleteChannel}
      onCancelSync={handleCancelSync}
      channelBusy={
        view.kind === "channel" &&
        (!!(syncProgress[view.channelId] && !syncProgress[view.channelId].done) ||
          !!(downloadProgress[view.channelId] && !downloadProgress[view.channelId].done))
      }
      currentTrackId={player.current?.id ?? null}
      isPlaying={player.isPlaying}
      onPlay={handlePlay}
      onTogglePlay={player.togglePlay}
      onAddToPlaylist={handleAddToPlaylist}
      onRemoveFromPlaylist={view.kind === "playlist" ? handleRemoveFromPlaylist : undefined}
      onUpdateTrack={handleUpdateTrack}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      reorderable={view.kind === "playlist" && !isSearching}
      onReorder={view.kind === "playlist" ? handleReorderPlaylistTrack : undefined}
      compact={compactColumns}
      unavailableIds={player.unavailableIds}
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

  if (isNarrow) {
    return (
      <>
        <NarrowLayout
          tab={narrowTab}
          onTabChange={handleNarrowTabChange}
          viewTitle={viewTitle}
          searchScopeTitle={view.kind === "library" ? null : baseViewTitle}
          viewMeta={viewMeta}
          view={view}
          onSelectView={handleNarrowSelectView}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          trackContent={trackTable}
          channels={channels}
          playlists={playlists}
          artists={artists}
          onAddChannel={handleAddChannel}
          onCreatePlaylist={handleCreatePlaylist}
          onSyncNow={syncNow}
          syncStatus={syncStatus}
          syncProgress={syncProgress}
          downloadProgress={downloadProgress}
          onMergeArtists={handleMergeArtists}
          mergingArtists={mergingArtists}
        />
        {modals}
        {loadingGate}
      </>
    );
  }

  return (
    <WideLayout
      channels={channels}
      playlists={playlists}
      artists={artists}
      view={view}
      onSelectView={setView}
      onAddChannel={handleAddChannel}
      onCreatePlaylist={handleCreatePlaylist}
      syncProgress={syncProgress}
      downloadProgress={downloadProgress}
      onMergeArtists={handleMergeArtists}
      mergingArtists={mergingArtists}
      artistScopeTitle={artistScopeChannel?.title ?? null}
      onClearArtistScope={clearArtistScope}
      trackTable={trackTable}
      modals={
        <>
          {modals}
          {loadingGate}
        </>
      }
    />
  );
}

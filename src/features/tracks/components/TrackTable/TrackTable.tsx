import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { Channel, Playlist, Track } from "@/shared/api/types";
import { formatRuntime, totalDurationSeconds } from "@/shared/lib/format";
import { CoverMosaic } from "@/shared/ui/CoverMosaic";
import { usePlaylistCoverSources } from "@/features/playlists/usePlaylistCoverSources";
import { usePlaylistCover } from "@/features/playlists/usePlaylistCover";
import { useEnsureEditable } from "@/features/channels/useEditRights";
import { avatarGradientCss } from "@/shared/lib/avatarColor";
import { useScrollSpeedLimit } from "@/shared/hooks/useScrollSpeedLimit";
import { TrackEditDialog, type TrackEdit } from "../TrackEditDialog";
import { UserAvatar } from "@/shared/ui/UserAvatar";
import { useT } from "@/shared/i18n";
import {
  CloseIcon,
  DownloadIcon,
  EditIcon,
  LockIcon,
  MusicNoteIcon,
  PauseIcon,
  PlayIcon,
  RefreshIcon,
  ShuffleIcon,
  StopIcon,
  TrashIcon,
} from "@/shared/ui/icons";
import { PlainTrackRow, SortableTrackRow } from "../TrackRow";
import "./TrackTable.css";

const ROW_HEIGHT = 60;

const PIN_HEIGHT = 56;

const OVERSCAN = 10;

const NEW_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

export const TrackTable = memo(function TrackTable({
  title,
  tracks,
  channels,
  playlists,
  channelView,
  playlistView,
  onRenamePlaylist,
  onDeletePlaylist,
  onDownloadPlaylist,
  onSyncChannel,
  onRenameChannel,
  onChangeChannelPhoto,
  onDownloadChannel,
  onDeleteChannel,
  onCancelSync,
  channelBusy,
  trackSources,
  currentTrackId,
  isPlaying,
  onPlay,
  onTogglePlay,
  onAddToPlaylist,
  onRemoveFromPlaylist,
  onUpdateTrack,
  reorderable,
  onReorder,
  compact,
  unavailableIds,
  kindLabel,
}: {
  title: string;
  tracks: Track[];
  channels: Channel[];
  playlists: Playlist[];

  channelView?: Channel;
  playlistView?: Playlist;
  onRenamePlaylist?: (playlistId: string, name: string) => void;
  onDeletePlaylist?: (playlistId: string) => void;
  onDownloadPlaylist?: (playlistId: string) => void;
  onSyncChannel?: (channelId: string) => void;
  onRenameChannel?: (channelId: string, title: string) => void;
  onChangeChannelPhoto?: (channelId: string) => void;
  onDownloadChannel?: (channelId: string) => void;
  onDeleteChannel?: (channelId: string) => void;
  onCancelSync?: (channelId: string) => void;
  channelBusy?: boolean;
  trackSources?: Record<string, string[]>;
  currentTrackId: string | null;
  isPlaying: boolean;
  onPlay: (tracks: Track[], index: number) => void;
  onTogglePlay: () => void;
  onAddToPlaylist: (playlistId: string, trackId: string) => void;
  onRemoveFromPlaylist?: (trackId: string) => void;
  onUpdateTrack: (trackId: string, edit: TrackEdit & { album: string | null }) => Promise<boolean>;

  reorderable?: boolean;
  onReorder?: (trackId: string, newIndex: number) => void;

  compact?: boolean;

  unavailableIds?: Set<string>;

  kindLabel?: string;
}) {
  const t = useT();
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [editing, setEditing] = useState<Track | null>(null);
  const ensureEditable = useEnsureEditable();

  const editingTrack = editing ? (tracks.find((tr) => tr.id === editing.id) ?? editing) : null;

  const beginEdit = useCallback(
    async (track: Track) => {
      const channel = channels.find((c) => c.id === track.channel_id);
      if (await ensureEditable(channel)) setEditing(track);
    },
    [channels, ensureEditable],
  );
  const [savingId, setSavingId] = useState<string | null>(null);
  const channelTitles = useMemo(() => new Map(channels.map((c) => [c.id, c.title])), [channels]);
  const channelTitle = (id: string) => channelTitles.get(id) ?? "—";

  const scrollRef = useRef<HTMLElement>(null);
  useScrollSpeedLimit(scrollRef);
  const scrollRafRef = useRef(0);
  const handleScroll = useCallback((event: React.UIEvent<HTMLElement>) => {
    const next = event.currentTarget.scrollTop;
    if (scrollRafRef.current) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = 0;
      setScrollTop(next);
    });
  }, []);
  useEffect(() => () => cancelAnimationFrame(scrollRafRef.current), []);
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);
  const [tableTop, setTableTop] = useState(0);

  const total = tracks.length;
  const hasHero = !!channelView || !!playlistView || total > 0;
  const coverSources = usePlaylistCoverSources();
  const cover = usePlaylistCover(playlistView?.id);
  const [renameDraft, setRenameDraft] = useState<string | null>(null);
  const submitRename = () => {
    const next = renameDraft?.trim();
    if (next && playlistView && next !== playlistView.name) {
      onRenamePlaylist?.(playlistView.id, next);
    } else if (next && channelView && next !== channelView.title) {
      onRenameChannel?.(channelView.id, next);
    }
    setRenameDraft(null);
  };
  const isEmpty = total === 0;
  const mosaicIds = useMemo(() => tracks.slice(0, 8).map((tr) => tr.id), [tracks]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      setViewportHeight(el.clientHeight);

      const wrap = tableWrapRef.current;
      if (wrap) setTableTop(wrap.offsetTop);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);

    if (tableWrapRef.current) ro.observe(tableWrapRef.current);
    return () => ro.disconnect();
  }, [hasHero, isEmpty, title]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    setScrollTop(0);
  }, [title, channelView?.id, playlistView?.id]);

  const hasCurrent = useMemo(
    () => currentTrackId !== null && tracks.some((tr) => tr.id === currentTrackId),
    [tracks, currentTrackId],
  );
  const playingHere = hasCurrent && isPlaying;

  const metaLabel = useMemo(() => {
    if (total === 0) return "";
    const runtime = formatRuntime(totalDurationSeconds(tracks), { hr: t("hr"), min: t("min") });
    return runtime ? `${total} ${t("songs")} · ${runtime}` : `${total} ${t("songs")}`;
  }, [tracks, total, t]);

  const pinned = tableTop > 0 && scrollTop >= Math.max(0, tableTop - PIN_HEIGHT);
  const listScrollTop = Math.max(0, scrollTop - tableTop);
  const overscan = reorderable ? OVERSCAN * 3 : OVERSCAN;
  const startIndex = Math.max(0, Math.floor(listScrollTop / ROW_HEIGHT) - overscan);
  const endIndex = Math.min(
    total,
    Math.ceil((listScrollTop + viewportHeight) / ROW_HEIGHT) + overscan,
  );
  const visibleTracks = tracks.slice(startIndex, endIndex);
  const topSpacerHeight = startIndex * ROW_HEIGHT;
  const bottomSpacerHeight = (total - endIndex) * ROW_HEIGHT;

  const scrollToTop = useCallback(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const playAll = useCallback(() => {
    if (hasCurrent) onTogglePlay();
    else if (tracks.length > 0) onPlay(tracks, 0);
  }, [hasCurrent, onTogglePlay, onPlay, tracks]);

  const commitEdit = async (track: Track, edit: TrackEdit) => {
    setSavingId(track.id);
    try {
      const ok = await onUpdateTrack(track.id, { ...edit, album: track.album });
      if (ok) setEditing(null);
    } catch (err) {
      alert(`${t("Couldn't save the track:")}\n${err}`);
    } finally {
      setSavingId(null);
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !onReorder) return;
    const newIndex = tracks.findIndex((tr) => tr.id === over.id);
    if (newIndex === -1) return;
    onReorder(String(active.id), newIndex);
  };

  const channelFace = channelView ? (
    channelView.avatar_path ? (
      <UserAvatar
        className=""
        path={channelView.avatar_path}
        fallback={
          <span style={{ background: avatarGradientCss(channelView.id) }}>
            {title.slice(0, 1).toUpperCase()}
          </span>
        }
      />
    ) : (
      <span style={{ background: avatarGradientCss(channelView.id) }}>
        {title.slice(0, 1).toUpperCase()}
      </span>
    )
  ) : null;
  const channelArt =
    channelView && channelView.can_edit && onChangeChannelPhoto ? (
      <button
        type="button"
        className="channel-hero-art-pick"
        onClick={() => onChangeChannelPhoto(channelView.id)}
        title={t("Channel picture")}
        aria-label={t("Channel picture")}
      >
        {channelFace}
        <span className="channel-hero-art-hint">
          <EditIcon size={22} />
        </span>
      </button>
    ) : (
      channelFace
    );

  const renderRow = (track: Track, i: number) => {
    const isCurrent = track.id === currentTrackId;
    const publishedMs = track.published_at ? Date.parse(track.published_at) : NaN;
    const isNew = Number.isFinite(publishedMs) && Date.now() - publishedMs < NEW_WINDOW_MS;
    const rowProps = {
      track,
      index: i,
      isCurrent,
      isNew,
      isUnavailable: !!unavailableIds?.has(track.id),
      isPlaying,
      channelTitle,
      sourceChannels: trackSources?.[track.id],
      onPlay: () => onPlay(tracks, i),
      onTogglePlay,
      startEdit: () => void beginEdit(track),
      canEdit: channels.find((c) => c.id === track.channel_id)?.can_edit ?? null,
      onAddToPlaylist,
      onRemoveFromPlaylist,
      playlists,
      compact: !!compact,
      menuOpen: menuFor === track.id,
      toggleMenu: () => setMenuFor(menuFor === track.id ? null : track.id),
      closeMenu: () => setMenuFor(null),
    };
    return reorderable ? (
      <SortableTrackRow key={track.id} {...rowProps} />
    ) : (
      <PlainTrackRow key={track.id} {...rowProps} />
    );
  };

  return (
    <section className="track-view" ref={scrollRef} onScroll={handleScroll}>
      {hasHero && (
        <header className="channel-hero" data-tauri-drag-region>
          <div className="channel-hero-art">
            {playlistView ? (
              <>
                <button
                  type="button"
                  className="channel-hero-art-pick"
                  onClick={cover.pick}
                  disabled={cover.busy}
                  title={t("Change playlist cover")}
                  aria-label={t("Change playlist cover")}
                >
                  <CoverMosaic
                    className="channel-hero-mosaic"
                    trackIds={coverSources[playlistView.id] ?? []}
                    cover={playlistView.cover_path}
                    seed={playlistView.id}
                    label={title}
                    size={192}
                  />
                  <span className="channel-hero-art-hint">
                    <EditIcon size={22} />
                  </span>
                </button>
                {playlistView.cover_path && (
                  <button
                    type="button"
                    className="channel-hero-art-clear"
                    onClick={cover.remove}
                    disabled={cover.busy}
                    title={t("Remove playlist cover")}
                    aria-label={t("Remove playlist cover")}
                  >
                    <CloseIcon size={13} />
                  </button>
                )}
              </>
            ) : channelView ? (
              channelArt
            ) : (
              <CoverMosaic
                className="channel-hero-mosaic"
                trackIds={mosaicIds}
                seed={title}
                label={title}
                size={192}
              />
            )}
          </div>
          <div className="channel-hero-text">
            <span className="channel-hero-label">
              {kindLabel ?? (playlistView ? t("Playlist") : t("Channel"))}
            </span>
            {renameDraft === null ? (
              <h1>{title}</h1>
            ) : (
              <input
                autoFocus
                className="channel-hero-rename"
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                onBlur={submitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitRename();
                  if (e.key === "Escape") setRenameDraft(null);
                }}
              />
            )}
            {total > 0 && <span className="channel-hero-count">{metaLabel}</span>}
            {channelView?.can_edit === false && (
              <span
                className="channel-hero-readonly"
                title={t("Sync the channel to refresh the rights")}
              >
                <LockIcon size={12} />
                {t("Read-only")}
              </span>
            )}
          </div>
        </header>
      )}
      {total > 0 && (
        <div className="channel-hero-bar">
          <div className="channel-hero-actions">
            <button
              className="hero-play-btn"
              onClick={playAll}
              title={playingHere ? t("Pause") : t("Play")}
              aria-label={playingHere ? t("Pause") : t("Play")}
            >
              {playingHere ? <PauseIcon size={22} /> : <PlayIcon size={22} />}
            </button>
            <button
              className="hero-shuffle-btn"
              onClick={() => onPlay(tracks, Math.floor(Math.random() * tracks.length))}
              title={t("Shuffle")}
              aria-label={t("Shuffle")}
            >
              <ShuffleIcon size={17} />
            </button>
            {channelView &&
              (channelBusy ? (
                <button
                  className="hero-shuffle-btn"
                  onClick={() => onCancelSync?.(channelView.id)}
                  title={t("Stop sync")}
                  aria-label={t("Stop sync")}
                >
                  <StopIcon size={17} />
                </button>
              ) : (
                <>
                  <button
                    className="hero-shuffle-btn"
                    onClick={() => onSyncChannel?.(channelView.id)}
                    title={t("Sync now")}
                    aria-label={t("Sync now")}
                  >
                    <RefreshIcon size={17} />
                  </button>
                  <button
                    className="hero-shuffle-btn"
                    onClick={() => onDownloadChannel?.(channelView.id)}
                    title={t("Download all")}
                    aria-label={t("Download all")}
                  >
                    <DownloadIcon size={17} />
                  </button>
                  {channelView.can_edit && (
                    <button
                      className="hero-shuffle-btn"
                      onClick={() => setRenameDraft(channelView.title)}
                      title={t("Rename channel")}
                      aria-label={t("Rename channel")}
                    >
                      <EditIcon size={17} />
                    </button>
                  )}
                  <button
                    className="hero-shuffle-btn is-danger"
                    onClick={() => onDeleteChannel?.(channelView.id)}
                    title={t("Delete channel")}
                    aria-label={t("Delete channel")}
                  >
                    <TrashIcon size={17} />
                  </button>
                </>
              ))}
            {playlistView && (
              <>
                <button
                  className="hero-shuffle-btn"
                  onClick={() => onDownloadPlaylist?.(playlistView.id)}
                  title={t("Download playlist")}
                  aria-label={t("Download playlist")}
                >
                  <DownloadIcon size={17} />
                </button>
                <button
                  className="hero-shuffle-btn"
                  onClick={() => setRenameDraft(playlistView.name)}
                  title={t("Rename playlist")}
                  aria-label={t("Rename playlist")}
                >
                  <EditIcon size={17} />
                </button>
                <button
                  className="hero-shuffle-btn is-danger"
                  onClick={() => onDeletePlaylist?.(playlistView.id)}
                  title={t("Delete playlist")}
                  aria-label={t("Delete playlist")}
                >
                  <TrashIcon size={17} />
                </button>
              </>
            )}
          </div>
        </div>
      )}
      <header className="track-view-header" data-tauri-drag-region>
        {!hasHero && (
          <div className="track-view-heading">
            {renameDraft === null ? (
              <h1>{title}</h1>
            ) : (
              <input
                autoFocus
                className="channel-hero-rename"
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                onBlur={submitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitRename();
                  if (e.key === "Escape") setRenameDraft(null);
                }}
              />
            )}
            {total > 0 && <span className="track-view-count">{metaLabel}</span>}
          </div>
        )}
      </header>

      {!isEmpty && (
        <div className={`track-view-pin${pinned ? " is-pinned" : ""}`} aria-hidden={!pinned}>
          <button
            className="track-view-pin-play"
            onClick={playAll}
            title={playingHere ? t("Pause") : t("Play")}
            aria-label={playingHere ? t("Pause") : t("Play")}
            tabIndex={pinned ? 0 : -1}
          >
            {playingHere ? <PauseIcon size={15} /> : <PlayIcon size={15} />}
          </button>
          <button
            className="track-view-pin-lead"
            onClick={scrollToTop}
            title={t("Back to top")}
            aria-label={t("Back to top")}
            tabIndex={pinned ? 0 : -1}
          >
            <span className="track-view-pin-art">
              {playlistView ? (
                <CoverMosaic
                  className="channel-hero-mosaic"
                  trackIds={coverSources[playlistView.id] ?? []}
                  cover={playlistView.cover_path}
                  seed={playlistView.id}
                  label={title}
                  size={34}
                />
              ) : channelView?.avatar_path ? (
                <UserAvatar
                  className=""
                  path={channelView.avatar_path}
                  fallback={
                    <span style={{ background: avatarGradientCss(title) }}>
                      {title.slice(0, 1).toUpperCase()}
                    </span>
                  }
                />
              ) : (
                <span style={{ background: avatarGradientCss(title) }}>
                  {title.slice(0, 1).toUpperCase()}
                </span>
              )}
            </span>
            <span className="track-view-pin-text">
              <span className="track-view-pin-title truncate">{title}</span>
              {metaLabel && <span className="track-view-pin-meta truncate">{metaLabel}</span>}
            </span>
          </button>
        </div>
      )}

      {tracks.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state-art" aria-hidden>
            <MusicNoteIcon size={30} />
          </span>
          <p className="empty-state-title">{t("Nothing here yet.")}</p>
        </div>
      ) : (
        <div className="track-table-scroll" ref={tableWrapRef}>
          <table className={`track-table${reorderable ? " track-table-reorderable" : ""}`}>
            <colgroup>
              {reorderable && <col className="col-drag" />}
              {!compact && <col className="col-num" />}
              <col className="col-index" />
              <col />
              {!compact && <col className="col-added" />}
              <col className="col-duration" />
              <col className="col-actions" />
            </colgroup>
            <thead>
              <tr>
                {reorderable && <th className="col-drag" />}
                {!compact && <th className="col-num">#</th>}
                <th className="col-index" />
                <th>{t("Title")}</th>
                {!compact && <th className="col-added">{t("Added")}</th>}
                <th className="col-duration">{t("Duration")}</th>
                <th className="col-actions" />
              </tr>
            </thead>
            <tbody>
              {topSpacerHeight > 0 && (
                <tr aria-hidden style={{ height: topSpacerHeight }}>
                  <td
                    colSpan={4 + (compact ? 0 : 2) + (reorderable ? 1 : 0)}
                    style={{ padding: 0, border: "none" }}
                  />
                </tr>
              )}
              {reorderable ? (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={visibleTracks.map((tr) => tr.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {visibleTracks.map((track, localI) => renderRow(track, startIndex + localI))}
                  </SortableContext>
                </DndContext>
              ) : (
                visibleTracks.map((track, localI) => renderRow(track, startIndex + localI))
              )}
              {bottomSpacerHeight > 0 && (
                <tr aria-hidden style={{ height: bottomSpacerHeight }}>
                  <td
                    colSpan={4 + (compact ? 0 : 2) + (reorderable ? 1 : 0)}
                    style={{ padding: 0, border: "none" }}
                  />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editingTrack && (
        <TrackEditDialog
          track={editingTrack}
          saving={savingId === editingTrack.id}
          onSave={(edit) => void commitEdit(editingTrack, edit)}
          onCancel={() => setEditing(null)}
        />
      )}
    </section>
  );
});

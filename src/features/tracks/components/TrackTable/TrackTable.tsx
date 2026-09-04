import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
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
import { useAmbientColor } from "@/shared/hooks/useAmbientColor";
import { CoverMosaic } from "@/shared/ui/CoverMosaic";
import { usePlaylistCoverSources } from "@/features/playlists/usePlaylistCoverSources";
import { usePlaylistCover } from "@/features/playlists/usePlaylistCover";
import { useEnsureEditable } from "@/features/channels/useEditRights";
import { avatarGradientCss } from "@/shared/lib/avatarColor";
import { TrackEditDialog, type TrackEdit } from "../TrackEditDialog";
import { UserAvatar } from "@/shared/ui/UserAvatar";
import { useT } from "@/shared/i18n";
import {
  CloseIcon,
  DownloadIcon,
  EditIcon,
  LockIcon,
  PauseIcon,
  PlayIcon,
  RefreshIcon,
  ShuffleIcon,
  StopIcon,
  TrashIcon,
} from "@/shared/ui/icons";
import { SearchBox } from "../SearchBox";
import { PlainTrackRow, SortableTrackRow } from "../TrackRow";
import "./TrackTable.css";

const ROW_HEIGHT = 52;

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
  searchQuery,
  onSearchChange,
  reorderable,
  onReorder,
  compact,
  unavailableIds,
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
  onDownloadChannel?: (channelId: string) => void;
  onDeleteChannel?: (channelId: string) => void;
  onCancelSync?: (channelId: string) => void;
  /** Whether this channel is mid-sync or mid-download, so the controls swap. */
  channelBusy?: boolean;
  trackSources?: Record<string, string[]>;
  currentTrackId: string | null;
  isPlaying: boolean;
  onPlay: (tracks: Track[], index: number) => void;
  onTogglePlay: () => void;
  onAddToPlaylist: (playlistId: string, trackId: string) => void;
  onRemoveFromPlaylist?: (trackId: string) => void;
  onUpdateTrack: (trackId: string, edit: TrackEdit & { album: string | null }) => Promise<boolean>;
  searchQuery: string;
  onSearchChange: (q: string) => void;

  reorderable?: boolean;
  onReorder?: (trackId: string, newIndex: number) => void;

  compact?: boolean;

  unavailableIds?: Set<string>;
}) {
  const t = useT();
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [editing, setEditing] = useState<Track | null>(null);
  const ensureEditable = useEnsureEditable();

  // the live row, not the copy the dialog opened with: a refused edit can
  // teach the backend that the message is a forward
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
  const hasHero = !!channelView || !!playlistView;
  // no picture, no colour to take - untinted, like a channel with no avatar
  const coverSources = usePlaylistCoverSources();
  const cover = usePlaylistCover(playlistView?.id);
  const [renameDraft, setRenameDraft] = useState<string | null>(null);
  const submitRename = () => {
    const next = renameDraft?.trim();
    if (next && playlistView && next !== playlistView.name) {
      onRenamePlaylist?.(playlistView.id, next);
    }
    setRenameDraft(null);
  };
  const heroTint = useAmbientColor(channelView?.avatar_path ?? playlistView?.cover_path ?? null);
  const pinStyle = useMemo(
    () => (heroTint ? ({ "--channel-tint": `rgb(${heroTint})` } as CSSProperties) : undefined),
    [heroTint],
  );
  const isEmpty = total === 0;

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
      // telegram neither shows nor edits the album; passed through so saving
      // cannot wipe what the file's tags hold
      const ok = await onUpdateTrack(track.id, { ...edit, album: track.album });
      if (ok) setEditing(null);
    } catch (err) {
      // otherwise the promise rejects into nothing and the dialog just sits
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
        <header className="channel-hero" style={pinStyle}>
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
                    size={148}
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
            ) : channelView?.avatar_path ? (
              <UserAvatar className="" path={channelView.avatar_path} />
            ) : (
              <span>{title.slice(0, 1).toUpperCase()}</span>
            )}
          </div>
          <div className="channel-hero-text">
            <span className="channel-hero-label">
              {playlistView ? t("Playlist") : t("Channel")}
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
            {/* Said before anything is clicked: an edit here would be refused,
                and a sync is what changes that. */}
            {channelView?.can_edit === false && (
              <span
                className="channel-hero-readonly"
                title={t("Sync the channel to refresh the rights")}
              >
                <LockIcon size={12} />
                {t("Read-only")}
              </span>
            )}
            {total > 0 && (
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
            )}
          </div>
        </header>
      )}
      <header className="track-view-header">
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
        <div className="track-view-controls">
          <SearchBox value={searchQuery} onChange={onSearchChange} />
        </div>
      </header>

      {!isEmpty && (
        <div
          className={`track-view-pin${pinned ? " is-pinned" : ""}`}
          style={pinStyle}
          aria-hidden={!pinned}
        >
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
                <UserAvatar className="" path={channelView.avatar_path} />
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
          <button
            className="track-view-pin-play"
            onClick={playAll}
            title={playingHere ? t("Pause") : t("Play")}
            aria-label={playingHere ? t("Pause") : t("Play")}
            tabIndex={pinned ? 0 : -1}
          >
            {playingHere ? <PauseIcon size={15} /> : <PlayIcon size={15} />}
          </button>
        </div>
      )}

      {tracks.length === 0 ? (
        <div className="empty-state">
          <p>{t("Nothing here yet.")}</p>
        </div>
      ) : (
        <div className="track-table-scroll" ref={tableWrapRef}>
          <table className={`track-table${reorderable ? " track-table-reorderable" : ""}`}>
            <colgroup>
              {reorderable && <col className="col-drag" />}
              {!compact && <col className="col-num" />}
              <col className="col-index" />
              <col />
              <col className="col-duration" />
              <col className="col-actions" />
            </colgroup>
            <thead>
              <tr>
                {reorderable && <th className="col-drag" />}
                {!compact && <th className="col-num" />}
                <th className="col-index" />
                <th>{t("Title")}</th>
                <th className="col-duration">{t("Duration")}</th>
                <th className="col-actions" />
              </tr>
            </thead>
            <tbody>
              {topSpacerHeight > 0 && (
                <tr aria-hidden style={{ height: topSpacerHeight }}>
                  <td
                    colSpan={(compact ? 4 : 5) + (reorderable ? 1 : 0)}
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
                    colSpan={(compact ? 4 : 5) + (reorderable ? 1 : 0)}
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

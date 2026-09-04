import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Playlist, Track } from "@/shared/api/types";
import { formatDuration, trackLabel } from "@/shared/lib/format";
import { avatarGradientCss } from "@/shared/lib/avatarColor";
import { forgetCover, useTrackCover } from "../../useTrackCover";
import { useT } from "@/shared/i18n";
import "./TrackRow.css";
import {
  EditIcon,
  GripIcon,
  PauseIcon,
  ForwardIcon,
  LockIcon,
  PlayIcon,
  PlaylistIcon,
  PlusIcon,
  TrashIcon,
} from "@/shared/ui/icons";

const ROW_MENU_WIDTH = 220;
const ROW_MENU_MAX_HEIGHT = 280;
const ROW_MENU_GAP = 6;
const VIEWPORT_MARGIN = 8;

interface RowMenuPos {
  left: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
}

function AddToPlaylistButton({
  trackId,
  playlists,
  menuOpen,
  toggleMenu,
  closeMenu,
  onAddToPlaylist,
  t,
}: {
  trackId: string;
  playlists: Playlist[];
  menuOpen: boolean;
  toggleMenu: () => void;
  closeMenu: () => void;
  onAddToPlaylist: (playlistId: string, trackId: string) => void;
  t: (key: string) => string;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<RowMenuPos | null>(null);

  useEffect(() => {
    if (!menuOpen) {
      setPos(null);
      return;
    }
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;

    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const left = Math.max(
      VIEWPORT_MARGIN,
      Math.min(rect.right - ROW_MENU_WIDTH, window.innerWidth - ROW_MENU_WIDTH - VIEWPORT_MARGIN),
    );

    if (spaceBelow >= ROW_MENU_MAX_HEIGHT + VIEWPORT_MARGIN || spaceBelow >= spaceAbove) {
      setPos({
        left,
        top: rect.bottom + ROW_MENU_GAP,
        maxHeight: Math.min(ROW_MENU_MAX_HEIGHT, spaceBelow - ROW_MENU_GAP - VIEWPORT_MARGIN),
      });
    } else {
      setPos({
        left,
        bottom: window.innerHeight - rect.top + ROW_MENU_GAP,
        maxHeight: Math.min(ROW_MENU_MAX_HEIGHT, spaceAbove - ROW_MENU_GAP - VIEWPORT_MARGIN),
      });
    }
  }, [menuOpen]);

  return (
    <div className="row-menu-anchor">
      <button ref={btnRef} className="icon-btn" title={t("Add to playlist")} onClick={toggleMenu}>
        <PlusIcon size={14} />
      </button>
      {menuOpen &&
        pos &&
        createPortal(
          <>
            <div className="row-menu-backdrop" onClick={closeMenu} />
            <div
              className="row-menu"
              style={{ left: pos.left, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight }}
            >
              <div className="row-menu-title">{t("Add to playlist")}</div>
              <div className="row-menu-list">
                {playlists.length === 0 ? (
                  <div className="row-menu-empty">{t("No playlists yet")}</div>
                ) : (
                  playlists.map((p) => (
                    <button
                      key={p.id}
                      className="row-menu-item"
                      onClick={() => {
                        onAddToPlaylist(p.id, trackId);
                        closeMenu();
                      }}
                    >
                      <PlaylistIcon size={14} />
                      <span className="truncate">{p.name}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}

export interface RowProps {
  track: Track;
  index: number;
  isCurrent: boolean;
  isNew: boolean;
  isUnavailable: boolean;
  isPlaying: boolean;
  channelTitle: (id: string) => string;
  sourceChannels?: string[];
  onPlay: () => void;
  onTogglePlay: () => void;
  startEdit: () => void;
  /** False turns the pencil into a lock; null means nobody has asked yet. */
  canEdit: boolean | null;
  onAddToPlaylist: (playlistId: string, trackId: string) => void;
  onRemoveFromPlaylist?: (trackId: string) => void;
  playlists: Playlist[];
  compact: boolean;
  menuOpen: boolean;
  toggleMenu: () => void;
  closeMenu: () => void;
}

function TrackRowCells({
  track,
  index,
  isCurrent,
  isNew,
  isUnavailable,
  isPlaying,
  channelTitle,
  sourceChannels,
  onPlay,
  onTogglePlay,
  startEdit,
  canEdit,
  onAddToPlaylist,
  onRemoveFromPlaylist,
  playlists,
  compact,
  menuOpen,
  toggleMenu,
  closeMenu,
}: RowProps) {
  const t = useT();
  const { title: trackTitle, artist } = trackLabel(track);
  const sourceLabel = (() => {
    const ids = sourceChannels?.length ? sourceChannels : [track.channel_id];
    const names = ids.map(channelTitle).filter((n) => n && n !== "—");
    if (names.length === 0) return "";
    const shown = names.slice(0, 3).join(", ");
    const rest = names.length - 3;
    return rest > 0 ? `${shown} ${t("and {n} more").replace("{n}", String(rest))}` : shown;
  })();
  return (
    <>
      {!compact && <td className="col-num dim">{index + 1}</td>}
      <td className="col-index">
        <button
          className="row-play-btn"
          onClick={() => (isCurrent ? onTogglePlay() : onPlay())}
          aria-label={t("Play")}
        >
          {isCurrent && isPlaying && (
            <span className="row-eq" aria-hidden>
              <i />
              <i />
              <i />
            </span>
          )}
          <span className="row-play-icon">
            {isCurrent && isPlaying ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
          </span>
        </button>
      </td>
      <td>
        <div className="track-cell">
          <TrackThumbnail track={track} />
          <div className="track-cell-text">
            <span
              className="track-title"
              title={
                isUnavailable
                  ? t("Unavailable — the source chat or audio can't be reached")
                  : undefined
              }
            >
              {isNew && <span className="track-new-badge">NEW</span>}
              {trackTitle}
            </span>
            <span className="track-artist">
              {artist}
              {sourceLabel && <span className="track-source"> · {sourceLabel}</span>}
            </span>
          </div>
        </div>
      </td>
      <td className="col-duration dim">{formatDuration(track.duration_sec)}</td>
      <td className="col-actions">
        <button
          className={`icon-btn${canEdit === false ? " is-locked" : ""}`}
          title={
            canEdit === false
              ? t("No rights to edit in this channel")
              : track.forwarded
                ? t("Forwarded: editing means replacing the message")
                : t("Rename")
          }
          onClick={startEdit}
        >
          {canEdit === false ? (
            <LockIcon size={14} />
          ) : track.forwarded ? (
            <ForwardIcon size={14} />
          ) : (
            <EditIcon size={14} />
          )}
        </button>
        {onRemoveFromPlaylist ? (
          <button
            className="icon-btn"
            title={t("Remove from playlist")}
            onClick={() => onRemoveFromPlaylist(track.id)}
          >
            <TrashIcon size={14} />
          </button>
        ) : (
          <AddToPlaylistButton
            trackId={track.id}
            playlists={playlists}
            menuOpen={menuOpen}
            toggleMenu={toggleMenu}
            closeMenu={closeMenu}
            onAddToPlaylist={onAddToPlaylist}
            t={t}
          />
        )}
      </td>
    </>
  );
}

export function PlainTrackRow(props: RowProps) {
  return (
    <tr
      className={`${props.isCurrent ? "is-current" : ""}${props.isUnavailable ? " is-unavailable" : ""}`}
      onDoubleClick={props.onPlay}
    >
      <TrackRowCells {...props} />
    </tr>
  );
}

export function SortableTrackRow(props: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.track.id,
  });
  const t = useT();
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    position: "relative",
    zIndex: isDragging ? 1 : undefined,
  };
  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`${props.isCurrent ? "is-current" : ""}${props.isUnavailable ? " is-unavailable" : ""}${isDragging ? " is-dragging" : ""}`}
      onDoubleClick={props.onPlay}
    >
      <td className="col-drag">
        <button className="drag-handle" aria-label={t("Reorder")} {...attributes} {...listeners}>
          <GripIcon size={14} />
        </button>
      </td>
      <TrackRowCells {...props} />
    </tr>
  );
}

function TrackThumbnail({ track }: { track: Track }) {
  const initial = trackLabel(track).title.slice(0, 1).toUpperCase();
  const cover = useTrackCover(track.id);
  const [broken, setBroken] = useState(false);

  useEffect(() => setBroken(false), [track.id]);

  if (cover && !broken) {
    return (
      // the accent wash shows through wherever a non-square cover leaves a gap
      <div className="track-thumbnail" style={{ background: avatarGradientCss(track.id) }}>
        <img
          src={cover.src}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => {
            forgetCover(track.id);
            setBroken(true);
          }}
        />
      </div>
    );
  }

  return (
    <div
      className="track-thumbnail track-thumbnail-empty"
      style={{ background: avatarGradientCss(track.id) }}
    >
      <span>{initial}</span>
    </div>
  );
}

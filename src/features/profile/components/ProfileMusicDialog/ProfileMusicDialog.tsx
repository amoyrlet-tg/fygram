import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ProfileTrack, Track } from "@/shared/api/types";
import { tracksApi } from "@/features/tracks/api";
import { SearchBox } from "@/features/tracks/components/SearchBox";
import { fuzzyTextMatches } from "@/shared/lib/fuzzy";
import { avatarGradientCss } from "@/shared/lib/avatarColor";
import { useTrackCover } from "@/features/tracks/useTrackCover";
import { formatDuration } from "@/shared/lib/format";
import { useT } from "@/shared/i18n";
import { Modal } from "@/shared/ui/Modal";
import {
  CheckIcon,
  CloseIcon,
  MusicNoteIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
} from "@/shared/ui/icons";
import "./ProfileMusicDialog.css";

const MATCHES = 8;

function named(track: Track) {
  return `${track.title ?? ""} ${track.artist ?? ""}`.trim();
}

function ProfileRow({
  track,
  place,
  onRemove,
  removeLabel,
}: {
  track: ProfileTrack;
  place: number;
  onRemove: () => void;
  removeLabel: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: track.document_id,
  });
  return (
    <li
      ref={setNodeRef}
      className={`profile-music-row${isDragging ? " is-dragging" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
    >
      <span className="profile-music-place">{place}</span>
      <Face trackId={track.track_id} seed={track.track_id ?? track.document_id} />
      <span className="profile-music-names">
        <span className="truncate">{track.title}</span>
        {track.artist && <span className="profile-music-sub truncate">{track.artist}</span>}
      </span>
      {track.duration_sec ? (
        <span className="profile-music-time">{formatDuration(track.duration_sec)}</span>
      ) : null}
      <button
        type="button"
        className="profile-music-drop"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onRemove}
        title={removeLabel}
        aria-label={removeLabel}
      >
        <CloseIcon size={16} />
      </button>
    </li>
  );
}

function Face({ trackId, seed }: { trackId?: string | null; seed: string }) {
  const cover = useTrackCover(trackId ?? undefined);
  if (cover) {
    return <img className="profile-music-face" src={cover.preview} alt="" decoding="async" />;
  }
  return (
    <span
      className="profile-music-face"
      style={{ background: avatarGradientCss(seed) }}
      aria-hidden
    >
      <MusicNoteIcon size={13} />
    </span>
  );
}

export function ProfileMusicDialog({
  tracks,
  loading,
  onAdd,
  onRemove,
  onMove,
  onRefresh,
  nowPlayingSync,
  onNowPlayingSync,
  onClose,
}: {
  tracks: ProfileTrack[];
  loading: boolean;
  onAdd: (track: Track) => void;
  onRemove: (documentId: string) => void;
  onMove: (documentId: string, toIndex: number) => void;
  onRefresh: () => Promise<void>;
  nowPlayingSync: boolean;
  onNowPlayingSync: (enabled: boolean) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [library, setLibrary] = useState<Track[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    tracksApi.listTracks().then(setLibrary).catch(console.error);
  }, []);

  const inProfile = useMemo(
    () => new Set(tracks.map((track) => track.track_id).filter(Boolean) as string[]),
    [tracks],
  );

  const searching = query.trim().length > 0;
  const matches = useMemo(() => {
    if (!searching) return [];
    const q = query.trim().toLowerCase();
    return library
      .filter((track) => fuzzyTextMatches(named(track).toLowerCase(), q))
      .slice(0, MATCHES);
  }, [library, query, searching]);

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    try {
      await action();
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal title={t("Profile music")} onClose={onClose} className="profile-music-dialog" wide>
      <div className="profile-music-find">
        <SearchBox
          className="profile-music-search"
          value={query}
          onChange={setQuery}
          placeholder={t("Search tracks…")}
          iconSize={16}
        />
        {searching && (
          <ul className="profile-music-results">
            {matches.length === 0 && <li className="profile-music-none">{t("No matches.")}</li>}
            {matches.map((track) => {
              const already = inProfile.has(track.id);
              return (
                <li key={track.id} className="profile-music-row is-result">
                  <Face trackId={track.id} seed={track.id} />
                  <span className="profile-music-names">
                    <span className="truncate">{track.title ?? t("Untitled")}</span>
                    {track.artist && (
                      <span className="profile-music-sub truncate">{track.artist}</span>
                    )}
                  </span>
                  <button
                    type="button"
                    className={`profile-music-pick${already ? " is-on" : ""}`}
                    disabled={already}
                    onClick={() => {
                      onAdd(track);
                      setQuery("");
                    }}
                    title={already ? t("Already in the profile") : t("Add to the profile")}
                    aria-label={already ? t("Already in the profile") : t("Add to the profile")}
                  >
                    {already ? <CheckIcon size={14} /> : <PlusIcon size={16} />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="profile-music-legend">
        {t("In the profile")}
        {tracks.length > 0 && <em>{tracks.length}</em>}
        <button
          type="button"
          className="profile-music-sync"
          disabled={busy === "refresh"}
          onClick={() => void run("refresh", onRefresh)}
          title={t("Read from Telegram again")}
        >
          <RefreshIcon size={13} />
          {t("Sync")}
        </button>
      </div>

      {loading && tracks.length === 0 && (
        <p className="profile-music-none">{t("Asking Telegram what is there…")}</p>
      )}
      {!loading && tracks.length === 0 && (
        <p className="profile-music-none">
          <SearchIcon size={15} />
          {t("Nothing in the profile yet.")}
        </p>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={({ active, over }) => {
          if (!over || active.id === over.id) return;
          const to = tracks.findIndex((entry) => entry.document_id === over.id);
          if (to >= 0) onMove(String(active.id), to);
        }}
      >
        <SortableContext
          items={tracks.map((track) => track.document_id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="profile-music-list">
            {tracks.map((track, index) => (
              <ProfileRow
                key={track.document_id}
                track={track}
                place={index + 1}
                onRemove={() => onRemove(track.document_id)}
                removeLabel={t("Remove from the profile")}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      <button
        type="button"
        className={`profile-music-auto${nowPlayingSync ? " is-on" : ""}`}
        onClick={() => onNowPlayingSync(!nowPlayingSync)}
      >
        <span className="profile-music-auto-text">
          <span className="profile-music-auto-title">{t("Sync with profile")}</span>
          <span className="profile-music-auto-note">
            {t("What is playing goes into the profile by itself.")}
          </span>
        </span>
        <span className="profile-music-auto-switch" aria-hidden />
      </button>
    </Modal>
  );
}

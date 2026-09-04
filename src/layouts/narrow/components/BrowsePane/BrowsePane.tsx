import { useMemo, useState } from "react";
import { fuzzyTextMatches } from "@/shared/lib/fuzzy";
import { VARIOUS_ARTISTS_KEY } from "@/shared/lib/artists";
import { useT } from "@/shared/i18n";
import { MusicNoteIcon, PlusIcon, RefreshIcon } from "@/shared/ui/icons";

import type { NarrowLayoutProps } from "../../NarrowLayout";
import { initials } from "@/shared/lib/initials";
import { UserAvatar } from "@/shared/ui/UserAvatar";
import { SearchBox } from "@/features/tracks/components/SearchBox";
import { CoverMosaic } from "@/shared/ui/CoverMosaic";
import { usePlaylistCoverSources } from "@/features/playlists/usePlaylistCoverSources";
import { SyncIndicator } from "@/features/sync/components/SyncIndicator";
import "./BrowsePane.css";

export function BrowsePane(props: NarrowLayoutProps) {
  const t = useT();
  const coverSources = usePlaylistCoverSources();
  const {
    channels,
    playlists,
    artists,
    view,
    onSelectView,
    onAddChannel,
    onCreatePlaylist,
    onSyncNow,
    syncStatus,
    syncProgress,
    downloadProgress,
    onMergeArtists,
    mergingArtists,
  } = props;
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [artistQuery, setArtistQuery] = useState("");

  const filteredArtists = useMemo(() => {
    const q = artistQuery.trim().toLowerCase();
    if (!q) return artists;
    return artists.filter((a) => fuzzyTextMatches(a.name.toLowerCase(), q));
  }, [artists, artistQuery]);

  const submitNewPlaylist = () => {
    const name = newName.trim();
    if (name) onCreatePlaylist(name);
    setNewName("");
    setCreating(false);
  };

  return (
    <div className="mobile-browse">
      <button
        className={`mobile-browse-row mobile-browse-all ${view.kind === "library" ? "is-active" : ""}`}
        onClick={() => onSelectView({ kind: "library" })}
      >
        <span className="mobile-browse-icon">
          <MusicNoteIcon size={18} />
        </span>
        <span className="mobile-browse-title">{t("All tracks")}</span>
      </button>

      <section className="mobile-browse-section">
        <div className="mobile-browse-header">
          <span>{t("Channels")}</span>
          <button className="icon-btn" onClick={onAddChannel} title={t("Add channel")}>
            <PlusIcon size={17} />
          </button>
        </div>
        {channels.length === 0 && <div className="empty-hint">{t("No channels yet.")}</div>}
        {channels.map((c) => {
          const progress = syncProgress[c.id];
          const syncing = progress && !progress.done;
          const dl = downloadProgress[c.id];
          const downloading = dl && !dl.done;
          const isActive = view.kind === "channel" && view.channelId === c.id;
          return (
            <div key={c.id} className={`mobile-browse-row ${isActive ? "is-active" : ""}`}>
              <button
                className="mobile-browse-main"
                onClick={() => onSelectView({ kind: "channel", channelId: c.id })}
              >
                {c.avatar_path ? (
                  <UserAvatar className="mobile-browse-avatar" path={c.avatar_path} />
                ) : (
                  <span className="mobile-browse-avatar mobile-browse-avatar-fallback">
                    {initials(c.title)}
                  </span>
                )}
                <span className="mobile-browse-title truncate">{c.title}</span>
              </button>
              {(syncing || downloading) && (
                <span className="mobile-browse-count">
                  {syncing ? t("Syncing…") : t("Downloading…")}
                </span>
              )}
            </div>
          );
        })}
      </section>

      <section className="mobile-browse-section">
        <div className="mobile-browse-header">
          <span>{t("Playlists")}</span>
          <span className="mobile-browse-header-actions">
            <SyncIndicator status={syncStatus} onSyncNow={onSyncNow} compact />
            <button
              className="icon-btn"
              onClick={() => setCreating(true)}
              title={t("New playlist")}
            >
              <PlusIcon size={17} />
            </button>
          </span>
        </div>
        {creating && (
          <input
            autoFocus
            className="playlist-new-input"
            placeholder={t("New playlist name…")}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onBlur={submitNewPlaylist}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitNewPlaylist();
              if (e.key === "Escape") {
                setCreating(false);
                setNewName("");
              }
            }}
          />
        )}
        {playlists.length === 0 && !creating && (
          <div className="empty-hint">{t("No playlists yet.")}</div>
        )}
        {playlists.map((p) => {
          const isActive = view.kind === "playlist" && view.playlistId === p.id;
          const dl = downloadProgress[p.id];
          const downloading = dl && !dl.done;
          return (
            <div key={p.id} className={`mobile-browse-row ${isActive ? "is-active" : ""}`}>
              {/* Selecting, and nothing else - everything a playlist can have
                  done to it lives on its own page. */}
              <button
                className="mobile-browse-main"
                onClick={() => onSelectView({ kind: "playlist", playlistId: p.id })}
              >
                <span className="mobile-browse-icon">
                  <CoverMosaic
                    className="mobile-browse-art"
                    trackIds={coverSources[p.id] ?? []}
                    cover={p.cover_path}
                    seed={p.id}
                    label={p.name}
                    size={48}
                  />
                </span>
                <span className="mobile-browse-title truncate">{p.name}</span>
                {downloading && <span className="mobile-browse-count">{t("Downloading…")}</span>}
              </button>
            </div>
          );
        })}
      </section>

      <section className="mobile-browse-section">
        <div className="mobile-browse-header">
          <span>{t("Artists")}</span>
          <button
            className="icon-btn"
            title={t("Merge similarly-spelled artist names (case, typos) into one")}
            onClick={onMergeArtists}
            disabled={mergingArtists}
          >
            <RefreshIcon size={15} className={mergingArtists ? "spin" : ""} />
          </button>
        </div>
        {artists.length > 0 && (
          <SearchBox
            className="artist-search-box mobile-artist-search"
            placeholder={t("Search artists…")}
            value={artistQuery}
            onChange={setArtistQuery}
          />
        )}
        {artists.length === 0 && <div className="empty-hint">{t("No artists yet.")}</div>}
        {artists.length > 0 && filteredArtists.length === 0 && (
          <div className="empty-hint">{t("No matches.")}</div>
        )}
        {filteredArtists.map((a) => {
          const isActive = view.kind === "artist" && view.artist === a.name;
          return (
            <button
              key={a.name}
              className={`mobile-browse-row mobile-browse-main ${isActive ? "is-active" : ""}`}
              onClick={() => onSelectView({ kind: "artist", artist: a.name })}
            >
              <span className="mobile-browse-icon">
                <MusicNoteIcon size={17} />
              </span>
              <span className="mobile-browse-title truncate">
                {a.name === VARIOUS_ARTISTS_KEY ? t("Various artists") : a.name}
              </span>
              <span className="mobile-browse-count">{a.count}</span>
            </button>
          );
        })}
      </section>
    </div>
  );
}

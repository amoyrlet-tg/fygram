import { memo, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { Channel, DownloadProgress, Playlist, SyncProgress } from "@/shared/api/types";
import { View } from "@/app/view";
import { UserAvatar } from "@/shared/ui/UserAvatar";
import { ProfileMenu } from "@/features/profile/components/ProfileMenu";
import { SearchBox } from "@/features/tracks/components/SearchBox";
import { CoverMosaic } from "@/shared/ui/CoverMosaic";
import { usePlaylistCoverSources } from "@/features/playlists/usePlaylistCoverSources";
import { fuzzyTextMatches } from "@/shared/lib/fuzzy";
import { VARIOUS_ARTISTS_KEY } from "@/shared/lib/artists";
import type { ArtistSummary } from "@/features/artists/useArtists";
import { initials } from "@/shared/lib/initials";
import { useAmbientColor } from "@/shared/hooks/useAmbientColor";
import { useT } from "@/shared/i18n";
import {
  ChevronDownIcon,
  CloseIcon,
  MusicNoteIcon,
  PlusIcon,
  RefreshIcon,
} from "@/shared/ui/icons";
import "./Sidebar.css";

export interface SidebarProps {
  channels: Channel[];
  playlists: Playlist[];
  artists: ArtistSummary[];
  view: View;
  onSelectView: (v: View) => void;
  onAddChannel: () => void;
  onCreatePlaylist: (name: string) => void;
  /* Shown, not driven: syncing and downloading are started from a channel's or
     a playlist's own page, but the sidebar still reports how they are going. */
  syncProgress: Record<string, SyncProgress & { done?: boolean; error?: string }>;
  downloadProgress: Record<string, DownloadProgress & { done?: boolean }>;
  onMergeArtists: () => void;
  artistScopeTitle?: string | null;
  onClearArtistScope: () => void;
  mergingArtists: boolean;
}

export const Sidebar = memo(function Sidebar({
  channels,
  playlists,
  artists,
  view,
  onSelectView,
  onAddChannel,
  onCreatePlaylist,
  syncProgress,
  downloadProgress,
  onMergeArtists,
  artistScopeTitle,
  onClearArtistScope,
  mergingArtists,
}: SidebarProps) {
  const t = useT();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const submittedRef = useRef(false);
  const coverSources = usePlaylistCoverSources();
  const [artistQuery, setArtistQuery] = useState("");
  const filteredArtists = useMemo(() => {
    const q = artistQuery.trim().toLowerCase();
    if (!q) return artists;
    return artists.filter((a) => fuzzyTextMatches(a.name.toLowerCase(), q));
  }, [artists, artistQuery]);

  const startCreating = () => {
    submittedRef.current = false;
    setCreating(true);
  };

  const submitNewPlaylist = () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    const name = newName.trim();
    if (name) onCreatePlaylist(name);
    setNewName("");
    setCreating(false);
  };

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-name">fygram</span>
        <ProfileMenu />
      </div>

      <nav className="nav-section">
        <button
          className={`nav-item ${view.kind === "library" ? "is-active" : ""}`}
          onClick={() => onSelectView({ kind: "library" })}
        >
          <MusicNoteIcon size={16} />
          {t("All tracks")}
        </button>
      </nav>

      <SidebarSection
        title={t("Channels")}
        count={channels.length}
        storageKey="channels"
        action={
          <button className="icon-btn" onClick={onAddChannel} title={t("Add channels")}>
            <PlusIcon size={15} />
          </button>
        }
      >
        <ul className="sidebar-list">
          {channels.length === 0 && <li className="empty-hint">{t("No channels yet.")}</li>}
          {channels.map((c) => (
            <SidebarChannelItem
              key={c.id}
              channel={c}
              isActive={view.kind === "channel" && view.channelId === c.id}
              syncProgress={syncProgress[c.id]}
              downloadProgress={downloadProgress[c.id]}
              onSelectView={onSelectView}
              t={t}
            />
          ))}
        </ul>
      </SidebarSection>

      <SidebarSection
        title={t("Playlists")}
        count={playlists.length}
        storageKey="playlists"
        action={
          <button className="icon-btn" onClick={startCreating} title={t("New playlist")}>
            <PlusIcon size={15} />
          </button>
        }
      >
        {creating && (
          <input
            autoFocus
            className="playlist-new-input"
            placeholder={t("Playlist name…")}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onBlur={submitNewPlaylist}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitNewPlaylist();
              if (e.key === "Escape") {
                submittedRef.current = true;
                setCreating(false);
                setNewName("");
              }
            }}
          />
        )}
        <ul className="sidebar-list">
          {playlists.length === 0 && !creating && (
            <li className="empty-hint">{t("No playlists yet.")}</li>
          )}
          {playlists.map((p) => {
            const dlProgress = downloadProgress[p.id];
            const downloading = dlProgress && !dlProgress.done;
            return (
              <li
                key={p.id}
                className={`sidebar-list-item ${
                  view.kind === "playlist" && view.playlistId === p.id ? "is-active" : ""
                }`}
              >
                {/* Selecting, and nothing else: renaming a playlist, changing
                    its picture, downloading it and deleting it all live on the
                    playlist's own page now. */}
                <button
                  className="sidebar-list-main"
                  onClick={() => onSelectView({ kind: "playlist", playlistId: p.id })}
                >
                  <CoverMosaic
                    className="sidebar-list-art"
                    trackIds={coverSources[p.id] ?? []}
                    cover={p.cover_path}
                    seed={p.id}
                    label={p.name}
                    size={20}
                  />
                  <span className="truncate">{p.name}</span>
                </button>
                {downloading && (
                  <>
                    <div className="sync-bar">
                      <div
                        className="sync-bar-fill"
                        style={{
                          width: dlProgress.total
                            ? `${Math.min(100, (dlProgress.processed / dlProgress.total) * 100)}%`
                            : "8%",
                        }}
                      />
                    </div>
                    <div className="sync-status">
                      {t("Downloading…")} {dlProgress.processed} / {dlProgress.total} · +
                      {dlProgress.downloaded}
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </SidebarSection>

      <SidebarSection
        title={t("Artists")}
        count={artists.length}
        storageKey="artists"
        action={
          <button
            className="icon-btn"
            title={t("Merge similarly-spelled artist names (case, typos) into one")}
            onClick={onMergeArtists}
            disabled={mergingArtists}
          >
            <RefreshIcon size={13} className={mergingArtists ? "spin" : ""} />
          </button>
        }
      >
        {artistScopeTitle && (
          <button
            className="artist-scope-chip"
            onClick={onClearArtistScope}
            title={t("Show artists from every channel")}
          >
            <span className="truncate">{artistScopeTitle}</span>
            <CloseIcon size={11} />
          </button>
        )}
        {artists.length > 0 && (
          <SearchBox
            className="artist-search-box"
            placeholder={t("Search artists…")}
            value={artistQuery}
            onChange={setArtistQuery}
          />
        )}
        <ul className="sidebar-list">
          {artists.length === 0 && <li className="empty-hint">{t("No artists yet.")}</li>}
          {artists.length > 0 && filteredArtists.length === 0 && (
            <li className="empty-hint">{t("No matches.")}</li>
          )}
          {filteredArtists.map((a) => (
            <li
              key={a.name}
              className={`sidebar-list-item ${
                view.kind === "artist" && view.artist === a.name ? "is-active" : ""
              }`}
            >
              <button
                className="sidebar-list-main"
                onClick={() => onSelectView({ kind: "artist", artist: a.name })}
              >
                <MusicNoteIcon size={14} />
                <span className="truncate">
                  {a.name === VARIOUS_ARTISTS_KEY ? t("Various artists") : a.name}
                </span>
                <span className="sidebar-list-count">{a.count}</span>
              </button>
            </li>
          ))}
        </ul>
      </SidebarSection>
    </aside>
  );
});

function SidebarSection({
  title,
  count,
  storageKey,
  action,
  children,
}: {
  title: string;
  count?: number;
  storageKey: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const t = useT();
  const [open, setOpen] = useState(
    () => localStorage.getItem(`sidebar_section_${storageKey}`) === "1",
  );

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(`sidebar_section_${storageKey}`, next ? "1" : "0");
      } catch {
        // a collapsed section that does not survive a restart is not a failure
      }
      return next;
    });
  };

  return (
    <div className={`sidebar-section ${open ? "is-open" : "is-closed"}`}>
      <div className="sidebar-section-header">
        <button
          className="sidebar-section-toggle"
          onClick={toggle}
          aria-expanded={open}
          title={open ? t("Collapse") : t("Expand")}
        >
          <ChevronDownIcon size={12} className="sidebar-section-chevron" />
          <span>{title}</span>
          {count !== undefined && count > 0 && (
            <span className="sidebar-section-count">{count}</span>
          )}
        </button>
        {action}
      </div>
      <div className="sidebar-section-body">
        <div className="sidebar-section-body-inner">{children}</div>
      </div>
    </div>
  );
}

function SidebarChannelItem({
  channel: c,
  isActive,
  syncProgress: progress,
  downloadProgress: dlProgress,
  onSelectView,
  t,
}: {
  channel: Channel;
  isActive: boolean;
  syncProgress?: SyncProgress & { done?: boolean; error?: string };
  downloadProgress?: DownloadProgress & { done?: boolean };
  onSelectView: (v: View) => void;
  t: (key: string) => string;
}) {
  const syncing = progress && !progress.done;
  const syncError = progress?.error;
  const downloading = dlProgress && !dlProgress.done;

  const tint = useAmbientColor(c.avatar_path ?? null);

  return (
    <li
      className={`sidebar-list-item sidebar-channel-item ${isActive ? "is-active" : ""}`}
      style={tint ? ({ "--channel-tint": `rgb(${tint})` } as CSSProperties) : undefined}
    >
      <button
        className="sidebar-list-main"
        onClick={() => onSelectView({ kind: "channel", channelId: c.id })}
      >
        {c.avatar_path ? (
          <UserAvatar className="channel-avatar" path={c.avatar_path} />
        ) : (
          <span className="channel-avatar channel-avatar-fallback">{initials(c.title)}</span>
        )}
        <span className="truncate">{c.title}</span>
      </button>
      {syncing && (
        <>
          <div className="sync-bar">
            <div
              className="sync-bar-fill"
              style={{
                width: progress.total
                  ? `${Math.min(100, (progress.processed / progress.total) * 100)}%`
                  : "8%",
              }}
            />
          </div>
          <div className="sync-status">
            {progress.total
              ? t("{done} / {total} · {left} left · +{new}")
                  .replace("{done}", String(progress.processed))
                  .replace("{total}", String(progress.total))
                  .replace("{left}", String(Math.max(0, progress.total - progress.processed)))
                  .replace("{new}", String(progress.new_tracks))
              : t("Checked {done} · +{new}")
                  .replace("{done}", String(progress.processed))
                  .replace("{new}", String(progress.new_tracks))}
          </div>
        </>
      )}
      {syncError && (
        <div className="sync-status sync-status-error" title={syncError}>
          {t("Sync failed:")} {syncError}
        </div>
      )}
      {downloading && (
        <>
          <div className="sync-bar">
            <div
              className="sync-bar-fill"
              style={{
                width: dlProgress.total
                  ? `${Math.min(100, (dlProgress.processed / dlProgress.total) * 100)}%`
                  : "8%",
              }}
            />
          </div>
          <div className="sync-status">
            {t("Downloading…")} {dlProgress.processed} / {dlProgress.total} · +
            {dlProgress.downloaded}
          </div>
        </>
      )}
    </li>
  );
}

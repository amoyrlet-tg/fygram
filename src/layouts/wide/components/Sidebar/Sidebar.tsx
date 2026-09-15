import { memo, useCallback, useMemo, useState, type ReactNode } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { Channel, Playlist, SyncProgress } from "@/shared/api/types";
import { View } from "@/shared/lib/libraryView";
import { UserAvatar } from "@/shared/ui/UserAvatar";
import { ProfileMenu } from "@/features/profile/components/ProfileMenu";
import { SearchBox } from "@/features/tracks/components/SearchBox";
import { CoverMosaic } from "@/features/tracks/components/CoverMosaic";
import { usePlaylistCoverSources } from "@/features/playlists/usePlaylistCoverSources";
import { fuzzyTextMatches } from "@/shared/lib/fuzzy";
import { VARIOUS_ARTISTS_KEY } from "@/shared/lib/artists";
import type { ArtistSummary } from "@/features/artists/useArtists";
import { initials } from "@/shared/lib/initials";
import { LibraryIcon } from "./SidebarIcons";
import { useT } from "@/shared/i18n";
import { ChevronDownIcon, CloseIcon, PlusIcon } from "@/shared/ui/icons";
import "./Sidebar.css";

const BOT_URL = "https://t.me/wwloadbot";

export interface SidebarProps {
  channels: Channel[];
  playlists: Playlist[];
  artists: ArtistSummary[];
  view: View;
  onSelectView: (v: View) => void;
  onAddChannel: () => void;
  onNewPlaylist: () => void;
  syncProgress: Record<string, SyncProgress & { done?: boolean; error?: string }>;
  artistScopeTitle?: string | null;
  onClearArtistScope: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

function useSection(storageKey: string) {
  const [open, setOpenState] = useState(
    () => localStorage.getItem(`sidebar_section_${storageKey}`) === "1",
  );
  const setOpen = useCallback(
    (next: boolean) => {
      setOpenState(next);
      try {
        localStorage.setItem(`sidebar_section_${storageKey}`, next ? "1" : "0");
      } catch {}
    },
    [storageKey],
  );
  return { open, setOpen };
}

export const Sidebar = memo(function Sidebar({
  channels,
  playlists,
  artists,
  view,
  onSelectView,
  onAddChannel,
  onNewPlaylist,
  syncProgress,
  artistScopeTitle,
  onClearArtistScope,
  searchQuery,
  onSearchChange,
}: SidebarProps) {
  const t = useT();
  const channelsSection = useSection("channels");
  const playlistsSection = useSection("playlists");
  const artistsSection = useSection("artists");
  const coverSources = usePlaylistCoverSources();
  const [artistQuery, setArtistQuery] = useState("");
  const filteredArtists = useMemo(() => {
    const q = artistQuery.trim().toLowerCase();
    if (!q) return artists;
    return artists.filter((a) => fuzzyTextMatches(a.name.toLowerCase(), q));
  }, [artists, artistQuery]);

  const startCreating = () => {
    playlistsSection.setOpen(true);
    onNewPlaylist();
  };

  const startAddingChannel = () => {
    channelsSection.setOpen(true);
    onAddChannel();
  };

  return (
    <aside className="sidebar">
      <div className="brand">
        <ProfileMenu />
      </div>
      <div className="sidebar-tools">
        <p className="brand-hint">
          <LibraryIcon kind="download" />
          <span>
            {t("Download music in the")}{" "}
            <a
              className="brand-hint-link"
              href={BOT_URL}
              onClick={(e) => {
                e.preventDefault();
                void openUrl(BOT_URL);
              }}
            >
              @wwloadbot
            </a>
          </span>
        </p>

        <SearchBox
          className="sidebar-search-box"
          placeholder={t("Search music")}
          value={searchQuery}
          onChange={onSearchChange}
        />

        <nav className="nav-section">
          <button
            className={`nav-item ${view.kind === "library" ? "is-active" : ""}`}
            onClick={() => onSelectView({ kind: "library" })}
            aria-current={view.kind === "library" ? "page" : undefined}
          >
            <span className="sidebar-leading">
              <LibraryIcon kind="library" />
            </span>
            {t("ALL MUSIC")}
          </button>
        </nav>
      </div>
      <div className="sidebar-library">
        <SidebarSection
          title={t("Channels")}
          count={channels.length}
          open={channelsSection.open}
          onToggle={() => channelsSection.setOpen(!channelsSection.open)}
          action={
            <button className="icon-btn" onClick={startAddingChannel} title={t("Add channels")}>
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
                onSelectView={onSelectView}
                t={t}
              />
            ))}
          </ul>
        </SidebarSection>

        <SidebarSection
          title={t("Playlists")}
          count={playlists.length}
          open={playlistsSection.open}
          onToggle={() => playlistsSection.setOpen(!playlistsSection.open)}
          action={
            <button className="icon-btn" onClick={startCreating} title={t("New playlist")}>
              <PlusIcon size={15} />
            </button>
          }
        >
          <ul className="sidebar-list">
            {playlists.length === 0 && <li className="empty-hint">{t("No playlists yet.")}</li>}
            {playlists.map((p) => (
              <li
                key={p.id}
                className={`sidebar-list-item ${
                  view.kind === "playlist" && view.playlistId === p.id ? "is-active" : ""
                }`}
              >
                <button
                  className="sidebar-list-main"
                  title={p.name}
                  aria-current={
                    view.kind === "playlist" && view.playlistId === p.id ? "page" : undefined
                  }
                  onClick={() => onSelectView({ kind: "playlist", playlistId: p.id })}
                >
                  <CoverMosaic
                    className="sidebar-list-art"
                    trackIds={coverSources[p.id] ?? []}
                    cover={p.cover_path}
                    seed={p.id}
                    label={p.name}
                    size={32}
                  />
                  <span className="truncate">{p.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </SidebarSection>

        <SidebarSection
          title={t("Artists")}
          count={artists.length}
          open={artistsSection.open}
          onToggle={() => artistsSection.setOpen(!artistsSection.open)}
          titleNote={artistScopeTitle ?? undefined}
          action={
            artistScopeTitle ? (
              <button
                className="icon-btn"
                onClick={onClearArtistScope}
                title={t("Show artists from every channel")}
                aria-label={t("Show artists from every channel")}
              >
                <CloseIcon size={13} />
              </button>
            ) : undefined
          }
        >
          {artists.length > 0 && (
            <SearchBox
              className="sidebar-artist-search"
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
                  title={a.name === VARIOUS_ARTISTS_KEY ? t("Various artists") : a.name}
                  aria-current={
                    view.kind === "artist" && view.artist === a.name ? "page" : undefined
                  }
                  onClick={() => onSelectView({ kind: "artist", artist: a.name })}
                >
                  <span className="sidebar-list-art sidebar-list-letter" aria-hidden>
                    {initials(a.name === VARIOUS_ARTISTS_KEY ? t("Various artists") : a.name)}
                  </span>
                  <span className="truncate">
                    {a.name === VARIOUS_ARTISTS_KEY ? t("Various artists") : a.name}
                  </span>
                  <span className="sidebar-list-count">{a.count}</span>
                </button>
              </li>
            ))}
          </ul>
        </SidebarSection>
      </div>
    </aside>
  );
});

function SidebarSection({
  title,
  titleNote,
  count,
  open,
  onToggle,
  action,
  children,
}: {
  title: string;
  titleNote?: string;
  count?: number;
  open: boolean;
  onToggle: () => void;
  action?: ReactNode;
  children: ReactNode;
}) {
  const t = useT();

  return (
    <div className={`sidebar-section ${open ? "is-open" : "is-closed"}`}>
      <div className="sidebar-section-header">
        <button
          className="sidebar-section-toggle"
          onClick={onToggle}
          aria-expanded={open}
          title={open ? t("Collapse") : t("Expand")}
        >
          <span className="sidebar-section-name">{title}</span>
          {titleNote && (
            <span className="sidebar-section-scope truncate" title={titleNote}>
              {titleNote}
            </span>
          )}
          {count !== undefined && <span className="sidebar-section-count">{count}</span>}
          <ChevronDownIcon size={14} className="sidebar-section-chevron" />
        </button>
        {action}
      </div>
      <div className="sidebar-section-body" hidden={!open}>
        <div className="sidebar-section-body-inner">{children}</div>
      </div>
    </div>
  );
}

function SidebarChannelItem({
  channel: c,
  isActive,
  syncProgress: progress,
  onSelectView,
  t,
}: {
  channel: Channel;
  isActive: boolean;
  syncProgress?: SyncProgress & { done?: boolean; error?: string };
  onSelectView: (v: View) => void;
  t: (key: string) => string;
}) {
  const syncing = progress && !progress.done;
  const syncError = progress?.error;

  return (
    <li className={`sidebar-list-item sidebar-channel-item ${isActive ? "is-active" : ""}`}>
      <button
        className="sidebar-list-main"
        title={c.title}
        aria-current={isActive ? "page" : undefined}
        onClick={() => onSelectView({ kind: "channel", channelId: c.id })}
      >
        {c.avatar_path ? (
          <UserAvatar
            className="channel-avatar"
            path={c.avatar_path}
            fallback={
              <span className="channel-avatar channel-avatar-fallback">{initials(c.title)}</span>
            }
          />
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
    </li>
  );
}

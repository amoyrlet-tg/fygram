import { memo, useState, type ReactNode } from "react";
import type {
  Channel,
  DownloadProgress,
  Playlist,
  SyncProgress,
  SyncStatus,
} from "@/shared/api/types";
import type { ArtistSummary } from "@/features/artists/useArtists";
import { usePlayerApi } from "@/app/providers/PlayerProvider";
import { useT } from "@/shared/i18n";
import { View } from "@/app/view";
import { ProfileMenu } from "@/features/profile/components/ProfileMenu";
import { LibraryIcon, MusicNoteIcon, SearchIcon } from "@/shared/ui/icons";
import { TopBar } from "../components/TopBar";
import { BrowsePane } from "../components/BrowsePane";
import { SearchPane } from "../components/SearchPane";
import { ExpandedPlayer, MiniPlayer } from "../components/Player";
import "./NarrowLayout.css";

export type NarrowTab = "home" | "search" | "library";

export interface NarrowLayoutProps {
  tab: NarrowTab;
  onTabChange: (tab: NarrowTab) => void;
  viewTitle: string;

  searchScopeTitle: string | null;
  viewMeta: string;
  view: View;
  onSelectView: (v: View) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;

  trackContent: ReactNode;

  channels: Channel[];
  playlists: Playlist[];
  artists: ArtistSummary[];
  onAddChannel: () => void;
  onCreatePlaylist: (name: string) => void;
  onSyncNow: () => void;
  syncStatus: SyncStatus | null;
  syncProgress: Record<string, SyncProgress & { done?: boolean }>;
  downloadProgress: Record<string, DownloadProgress & { done?: boolean }>;
  onMergeArtists: () => void;
  mergingArtists: boolean;
}

export const NarrowLayout = memo(function NarrowLayout(props: NarrowLayoutProps) {
  const t = useT();
  const { tab, onTabChange, viewTitle, searchScopeTitle, viewMeta, view } = props;
  const player = usePlayerApi();
  const [playerExpanded, setPlayerExpanded] = useState(false);

  // both bring their own header, so the top bar would repeat the title
  const overlayTopbar = tab === "home" && (view.kind === "channel" || view.kind === "playlist");
  const showTopbar = !overlayTopbar && tab !== "search";

  return (
    <div className="mobile-shell">
      {overlayTopbar ? (
        <div className="mobile-hero-actions">
          <ProfileMenu className="mobile-hero-profile-chip" />
        </div>
      ) : showTopbar ? (
        <TopBar
          title={tab === "library" ? t("Library") : viewTitle}
          subtitle={tab === "home" && view.kind !== "channel" ? viewMeta : ""}
        />
      ) : null}

      <main className={`mobile-main${overlayTopbar ? " mobile-main-under-overlay" : ""}`}>
        {tab === "library" ? (
          <BrowsePane {...props} />
        ) : tab === "search" ? (
          <SearchPane
            searchQuery={props.searchQuery}
            onSearchChange={props.onSearchChange}
            searchScopeTitle={searchScopeTitle}
            trackContent={props.trackContent}
          />
        ) : (
          props.trackContent
        )}
      </main>

      <div className="mobile-bottom">
        {player.current && <MiniPlayer onExpand={() => setPlayerExpanded(true)} />}
        <nav className="mobile-nav">
          <NavButton
            label={t("Home")}
            active={tab === "home"}
            onClick={() => onTabChange("home")}
            icon={<MusicNoteIcon size={22} />}
          />
          <NavButton
            label={t("Search")}
            active={tab === "search"}
            onClick={() => onTabChange("search")}
            icon={<SearchIcon size={22} />}
          />
          <NavButton
            label={t("Library")}
            active={tab === "library"}
            onClick={() => onTabChange("library")}
            icon={<LibraryIcon size={22} />}
          />
        </nav>
      </div>

      {playerExpanded && player.current && (
        <ExpandedPlayer onClose={() => setPlayerExpanded(false)} />
      )}
    </div>
  );
});

function NavButton({
  label,
  active,
  onClick,
  icon,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
}) {
  return (
    <button className={`mobile-nav-btn ${active ? "is-active" : ""}`} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

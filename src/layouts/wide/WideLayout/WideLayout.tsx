import { useEffect, useState, type ReactNode } from "react";
import { usePlayerApi } from "@/app/providers/PlayerProvider";
import { PlayerBar } from "@/features/player/components/PlayerBar";
import { NowPlaying } from "@/features/player/components/NowPlaying";
import { Sidebar, type SidebarProps } from "../components/Sidebar";
import "./WideLayout.css";

export type WideLayoutProps = SidebarProps & {
  trackTable: ReactNode;
  modals: ReactNode;
  searchQuery: string;
  onSearchChange: (query: string) => void;
};

export function WideLayout({
  trackTable,
  modals,
  searchQuery,
  onSearchChange,
  ...sidebar
}: WideLayoutProps) {
  const player = usePlayerApi();
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);
  const current = player.current;

  useEffect(() => {
    if (!current) setNowPlayingOpen(false);
  }, [current]);

  return (
    <div className="app-shell" data-tauri-drag-region>
      <div className="app-body">
        <Sidebar {...sidebar} searchQuery={searchQuery} onSearchChange={onSearchChange} />

        <main className="app-main">{trackTable}</main>

        {nowPlayingOpen && current && (
          <NowPlaying track={current} onClose={() => setNowPlayingOpen(false)} />
        )}
      </div>

      <PlayerBar onOpenNowPlaying={() => setNowPlayingOpen((open) => !open)} />

      {modals}
    </div>
  );
}

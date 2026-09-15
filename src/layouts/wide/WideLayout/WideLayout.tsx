import { useEffect, useState, type ReactNode } from "react";
import { usePlayerApi } from "@/features/player";
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
  const [nowPlayingClosing, setNowPlayingClosing] = useState(false);
  const current = player.current;

  useEffect(() => {
    if (!current) setNowPlayingOpen(false);
  }, [current]);

  const closeNowPlaying = () => {
    setNowPlayingClosing(true);
    window.setTimeout(() => {
      setNowPlayingOpen(false);
      setNowPlayingClosing(false);
    }, 220);
  };

  return (
    <div className="app-shell" data-tauri-drag-region>
      <div className="app-body">
        <Sidebar {...sidebar} searchQuery={searchQuery} onSearchChange={onSearchChange} />

        <main className="app-main">{trackTable}</main>
      </div>

      <PlayerBar
        onOpenNowPlaying={() => {
          if (nowPlayingOpen) {
            closeNowPlaying();
          } else {
            setNowPlayingClosing(false);
            setNowPlayingOpen(true);
          }
        }}
        nowPlayingOpen={nowPlayingOpen || nowPlayingClosing}
      />

      {(nowPlayingOpen || nowPlayingClosing) && current && (
        <NowPlaying track={current} onClose={closeNowPlaying} closing={nowPlayingClosing} />
      )}

      {modals}
    </div>
  );
}

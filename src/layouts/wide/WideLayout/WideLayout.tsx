import { useEffect, useState, type ReactNode } from "react";
import { usePlayerApi } from "@/app/providers/PlayerProvider";
import { PlayerBar } from "@/features/player/components/PlayerBar";
import { NowPlaying } from "@/features/player/components/NowPlaying";
import { Sidebar, type SidebarProps } from "../components/Sidebar";
import "./WideLayout.css";

export type WideLayoutProps = SidebarProps & {
  trackTable: ReactNode;
  modals: ReactNode;
};

export function WideLayout({ trackTable, modals, ...sidebar }: WideLayoutProps) {
  const player = usePlayerApi();
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);
  const current = player.current;

  // nothing to show a page about once playback stops
  useEffect(() => {
    if (!current) setNowPlayingOpen(false);
  }, [current]);

  return (
    <div className="app-shell">
      <div className="app-body">
        <Sidebar {...sidebar} />

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

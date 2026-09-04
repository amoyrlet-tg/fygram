import { trackLabel } from "@/shared/lib/format";
import { avatarGradientCss } from "@/shared/lib/avatarColor";
import { usePlayerWithProgress } from "@/app/providers/PlayerProvider";
import { useTrackCover } from "@/features/tracks/useTrackCover";
import { NextIcon, PauseIcon, PlayIcon } from "@/shared/ui/icons";
import { useT } from "@/shared/i18n";
import "@/features/player/player-chrome.css";
import "./MiniPlayer.css";

export function MiniPlayer({ onExpand }: { onExpand: () => void }) {
  const player = usePlayerWithProgress();
  const t = useT();
  const { current, isPlaying, position } = player;
  // before the early return: hooks cannot be called conditionally
  const cover = useTrackCover(current?.id);
  if (!current) return null;
  const label = trackLabel(current);
  const duration = current.duration_sec ?? 0;
  const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;

  return (
    <div className="mobile-miniplayer">
      <div className="mobile-miniplayer-progress" style={{ width: `${pct}%` }} />
      <button className="mobile-miniplayer-main" onClick={onExpand}>
        <div className="player-art" style={{ background: avatarGradientCss(current.id) }}>
          {cover ? (
            <img src={cover.src} alt="" decoding="async" />
          ) : (
            <span>{label.title.slice(0, 1).toUpperCase()}</span>
          )}
        </div>
        <div className="player-track-text">
          <span className="player-track-title truncate">{label.title}</span>
          <span className="player-track-artist truncate">{label.artist}</span>
        </div>
      </button>
      <div className="mobile-miniplayer-controls">
        <button
          className="transport-play-btn"
          onClick={player.togglePlay}
          aria-label={isPlaying ? t("Pause") : t("Play")}
        >
          {isPlaying ? <PauseIcon size={20} /> : <PlayIcon size={20} />}
        </button>
        <button className="icon-btn" onClick={player.next} aria-label={t("Next")}>
          <NextIcon size={20} />
        </button>
      </div>
    </div>
  );
}

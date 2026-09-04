import { formatDuration, trackLabel } from "@/shared/lib/format";
import { avatarGradientCss } from "@/shared/lib/avatarColor";
import { usePlayerWithProgress } from "@/app/providers/PlayerProvider";
import { useTrackCover } from "@/features/tracks/useTrackCover";
import { Slider } from "@/shared/ui/Slider";
import { useT } from "@/shared/i18n";
import {
  ChevronDownIcon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PrevIcon,
  RepeatIcon,
  RepeatOneIcon,
  ShuffleIcon,
  VolumeIcon,
} from "@/shared/ui/icons";
import "@/features/player/player-chrome.css";
import "./ExpandedPlayer.css";

const sliderToVolume = (s: number) => (s / 100) * (s / 100);
const volumeToSlider = (v: number) => Math.sqrt(v) * 100;

export function ExpandedPlayer({ onClose }: { onClose: () => void }) {
  const player = usePlayerWithProgress();
  const t = useT();
  const { current, isPlaying, position, volume, shuffle, repeat, fetchProgress, playbackError } =
    player;
  // before the early return: hooks cannot be called conditionally
  const cover = useTrackCover(current?.id);
  if (!current) return null;
  const label = trackLabel(current);
  const duration = current.duration_sec ?? 0;
  const loading = fetchProgress && fetchProgress.trackId === current.id ? fetchProgress : null;
  const loadingPercent =
    loading && loading.total > 0 ? Math.round((loading.downloaded / loading.total) * 100) : null;

  return (
    <div className="mobile-player">
      <header className="mobile-player-head">
        <button className="mobile-topbar-btn" onClick={onClose} aria-label={t("Close")}>
          <ChevronDownIcon size={24} />
        </button>
        <span className="mobile-player-head-label">{t("Now playing")}</span>
        <span style={{ width: 40 }} />
      </header>

      <div className="mobile-player-art" style={{ background: avatarGradientCss(current.id) }}>
        {cover ? (
          <img src={cover.src} alt="" decoding="async" />
        ) : (
          <span>{label.title.slice(0, 1).toUpperCase()}</span>
        )}
      </div>

      <div className="mobile-player-meta">
        <h2 className="truncate">{label.title}</h2>
        {playbackError ? (
          <p className="player-error truncate">
            {t("Couldn't play")} «{playbackError}»
          </p>
        ) : loading ? (
          <p className="player-loading truncate">
            {t("Loading")}
            {loadingPercent !== null ? ` ${loadingPercent}%` : "…"}
          </p>
        ) : (
          <p className="truncate">{label.artist}</p>
        )}
      </div>

      <div className="mobile-player-progress">
        <Slider
          value={Math.min(position, duration || 0)}
          max={duration || 0}
          onCommit={(v) => player.seek(v)}
          disabled={duration <= 0}
          leftContent={<span className="time">{formatDuration(position)}</span>}
          rightContent={<span className="time">{formatDuration(duration)}</span>}
          ariaLabel={t("Duration")}
        />
      </div>

      <div className="mobile-player-transport">
        <button
          className={`icon-btn ${shuffle ? "is-on" : ""}`}
          onClick={player.toggleShuffle}
          title={t("Shuffle")}
        >
          <ShuffleIcon size={20} />
        </button>
        <button className="icon-btn" onClick={player.previous} title={t("Previous")}>
          <PrevIcon size={26} />
        </button>
        <button
          className="mobile-player-play"
          onClick={player.togglePlay}
          title={t(isPlaying ? "Pause" : "Play")}
        >
          {isPlaying ? <PauseIcon size={30} /> : <PlayIcon size={30} />}
        </button>
        <button className="icon-btn" onClick={player.next} title={t("Next")}>
          <NextIcon size={26} />
        </button>
        <button
          className={`icon-btn ${repeat !== "off" ? "is-on" : ""}`}
          onClick={player.cycleRepeat}
          title={t("Repeat")}
        >
          {repeat === "one" ? <RepeatOneIcon size={20} /> : <RepeatIcon size={20} />}
        </button>
      </div>

      <div className="mobile-player-volume">
        <Slider
          value={volumeToSlider(volume)}
          max={100}
          onChange={(v) => player.setVolume(sliderToVolume(v))}
          leftContent={<VolumeIcon size={16} muted />}
          rightContent={<VolumeIcon size={16} />}
          ariaLabel={t("Volume")}
        />
      </div>
    </div>
  );
}

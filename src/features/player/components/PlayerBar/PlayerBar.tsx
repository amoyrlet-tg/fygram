import { formatDuration, trackLabel } from "@/shared/lib/format";
import { Slider } from "@/shared/ui/Slider";
import { usePlayerWithProgress } from "@/app/providers/PlayerProvider";
import { useT } from "@/shared/i18n";
import { avatarGradientCss } from "@/shared/lib/avatarColor";
import { useTrackCover } from "@/features/tracks/useTrackCover";
import "../../player-chrome.css";
import "./PlayerBar.css";
import {
  NextIcon,
  PauseIcon,
  PlayIcon,
  PrevIcon,
  RepeatIcon,
  RepeatOneIcon,
  ShuffleIcon,
  VolumeIcon,
} from "@/shared/ui/icons";

const sliderToVolume = (s: number) => (s / 100) * (s / 100);
const volumeToSlider = (v: number) => Math.sqrt(v) * 100;

export function PlayerBar({ onOpenNowPlaying }: { onOpenNowPlaying?: () => void }) {
  const player = usePlayerWithProgress();
  const t = useT();
  const { current, isPlaying, position, volume, shuffle, repeat, fetchProgress, playbackError } =
    player;
  const cover = useTrackCover(current?.id);
  const duration = current?.duration_sec ?? 0;
  const label = current ? trackLabel(current) : null;

  const loading =
    fetchProgress && current && fetchProgress.trackId === current.id ? fetchProgress : null;
  const loadingPercent =
    loading && loading.total > 0 ? Math.round((loading.downloaded / loading.total) * 100) : null;

  return (
    <footer className="player-bar">
      <div className="player-track-info">
        {current ? (
          <>
            <button
              type="button"
              className="player-art"
              style={{ background: avatarGradientCss(current.id) }}
              onClick={onOpenNowPlaying}
              title={t("Now playing")}
            >
              {cover ? (
                <img src={cover.src} alt="" decoding="async" />
              ) : (
                <span>{label!.title.slice(0, 1).toUpperCase()}</span>
              )}
            </button>
            <div className="player-track-text">
              <span className="player-track-title truncate">{label!.title}</span>
              {playbackError ? (
                <span className="player-track-artist truncate player-error">
                  {t("Couldn't play")} «{playbackError}»
                </span>
              ) : loading ? (
                <span className="player-track-artist truncate player-loading">
                  {t("Loading")}
                  {loadingPercent !== null ? ` ${loadingPercent}%` : "…"}
                </span>
              ) : (
                <span className="player-track-artist truncate">{label!.artist}</span>
              )}
            </div>
          </>
        ) : (
          <span className="muted truncate">{t("Nothing playing")}</span>
        )}
      </div>

      <div className="player-center">
        <div className="player-transport">
          <button
            className={`icon-btn ${shuffle ? "is-on" : ""}`}
            onClick={player.toggleShuffle}
            title={t("Shuffle")}
          >
            <ShuffleIcon size={15} />
          </button>
          <button
            className="icon-btn"
            onClick={player.previous}
            title={t("Previous")}
            disabled={!current}
          >
            <PrevIcon size={17} />
          </button>
          <button
            className="transport-play-btn"
            onClick={player.togglePlay}
            disabled={!current}
            title={t(isPlaying ? "Pause" : "Play")}
          >
            {isPlaying ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
          </button>
          <button className="icon-btn" onClick={player.next} title={t("Next")} disabled={!current}>
            <NextIcon size={17} />
          </button>
          <button
            className={`icon-btn ${repeat !== "off" ? "is-on" : ""}`}
            onClick={player.cycleRepeat}
            title={t("Repeat")}
          >
            {repeat === "one" ? <RepeatOneIcon size={15} /> : <RepeatIcon size={15} />}
          </button>
        </div>
        <div className="player-progress">
          <span className="time">{formatDuration(position)}</span>
          <Slider
            value={Math.min(position, duration || 0)}
            max={duration || 0}
            onCommit={(v) => player.seek(v)}
            disabled={!current || duration <= 0}
            ariaLabel={t("Duration")}
          />
          <span className="time">{formatDuration(duration)}</span>
        </div>
      </div>

      <div className="player-volume">
        <VolumeIcon size={16} muted />
        <Slider
          value={volumeToSlider(volume)}
          max={100}
          onChange={(v) => player.setVolume(sliderToVolume(v))}
          ariaLabel={t("Volume")}
        />
        <VolumeIcon size={16} />
      </div>
    </footer>
  );
}

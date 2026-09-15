import { useEffect } from "react";
import type { Track } from "@/shared/api/types";
import { trackLabel } from "@/shared/lib/format";
import { avatarGradientCss, avatarPaletteCss } from "@/shared/lib/avatarColor";
import { usePlayingCover } from "@/features/tracks/useTrackCover";
import { useT } from "@/shared/i18n";
import { usePlayerWithProgress } from "@/features/player";
import { useTrackLyrics } from "@/features/player/useTrackLyrics";
import { TrackLyrics } from "../TrackLyrics";
import { Crossfade } from "./Crossfade";
import { AuroraField } from "./AuroraField";
import { CloseIcon } from "@/shared/ui/icons";
import "./NowPlaying.css";

function ambientBackground(palette: string[] | null): string {
  const pools = palette?.length ? palette : ["#606060"];

  const wash = (colour: string, amount: number) =>
    `color-mix(in srgb, ${colour} ${amount}%, var(--bg))`;

  const [first, second = pools[0], third = pools[0]] = pools;

  return [
    `radial-gradient(90% 70% at 12% 4%, ${wash(first, 68)} 0%, transparent 66%)`,
    `radial-gradient(85% 65% at 88% 10%, ${wash(second, 58)} 0%, transparent 62%)`,
    `radial-gradient(120% 90% at 50% 108%, ${wash(third, 44)} 0%, transparent 72%)`,
    `linear-gradient(180deg, ${wash(first, 34)} 0%, var(--bg) 74%)`,
  ].join(", ");
}

export function NowPlaying({
  track,
  onClose,
  closing = false,
}: {
  track: Track;
  onClose: () => void;
  closing?: boolean;
}) {
  const t = useT();
  const cover = usePlayingCover(track.id);
  const { position, seek } = usePlayerWithProgress();
  const lyrics = useTrackLyrics(track.id);
  const label = trackLabel(track);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const palette = cover?.palette?.length ? cover.palette : avatarPaletteCss(track.id);
  const renderedBackground = ambientBackground(palette);
  return (
    <section
      className={`now-playing${closing ? " is-closing" : ""}${cover ? "" : " no-cover"}`}
      onClick={onClose}
    >
      <div className="now-playing-bg" onClick={onClose} aria-hidden="true">
        <Crossfade id={renderedBackground} className="now-playing-bg">
          {() => (
            <div className="now-playing-bg-paint" style={{ background: renderedBackground }} />
          )}
        </Crossfade>
        <AuroraField palette={palette} />
      </div>

      <header
        className="now-playing-top"
        data-tauri-drag-region
        onClick={(e) => e.stopPropagation()}
      >
        <span className="now-playing-album truncate">{track.album ?? label.title}</span>
        <button type="button" className="now-playing-close" onClick={onClose} title={t("Close")}>
          <CloseIcon size={16} />
        </button>
      </header>

      <div
        className="now-playing-stage"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="now-playing-main" onClick={(e) => e.stopPropagation()}>
          <div className="now-playing-art-frame">
            <Crossfade
              id={`${track.id}:${cover?.src ?? "empty"}`}
              className="now-playing-art-layer"
            >
              {() =>
                cover ? (
                  <img
                    className="now-playing-art"
                    src={cover.src}
                    alt=""
                    decoding="async"
                    style={{ background: avatarGradientCss(track.id) }}
                  />
                ) : (
                  <div
                    className="now-playing-art now-playing-art-empty"
                    style={{ background: avatarGradientCss(track.id) }}
                  >
                    <span>{label.title.slice(0, 1).toUpperCase()}</span>
                  </div>
                )
              }
            </Crossfade>
          </div>

          <div className="now-playing-text" key={track.id}>
            <h1 className="now-playing-title truncate">{label.title}</h1>
            <p className="now-playing-artist truncate">{label.artist}</p>
          </div>
        </div>
        <TrackLyrics lyrics={lyrics} position={position} onSeek={seek} />
      </div>
    </section>
  );
}

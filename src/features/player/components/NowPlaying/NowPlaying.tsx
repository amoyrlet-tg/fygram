import { useEffect } from "react";
import type { Track } from "@/shared/api/types";
import { trackLabel } from "@/shared/lib/format";
import { avatarGradientCss } from "@/shared/lib/avatarColor";
import { useTrackCover } from "@/features/tracks/useTrackCover";
import { useT } from "@/shared/i18n";
import { Crossfade } from "./Crossfade";
import { CloseIcon } from "@/shared/ui/icons";
import "./NowPlaying.css";

/**
 * The page behind the artwork, in the cover's own colours. Radial pools rather
 * than one gradient: a single vertical band reads as a flat wash.
 */
function ambientBackground(palette: string[] | null): string {
  const pools = palette?.length
    ? palette
    : [
        "color-mix(in srgb, var(--accent-base) 88%, white)",
        "var(--accent-base)",
        "color-mix(in srgb, var(--accent-base) 78%, black)",
      ];

  // pulled towards the app background so text stays readable over it
  const wash = (colour: string, amount: number) =>
    `color-mix(in srgb, ${colour} ${amount}%, var(--bg))`;

  const [first, second = pools[0], third = pools[0]] = pools;

  // a cover can be pure white or pure black, and either at full strength
  // swallows the text in one theme
  return [
    `radial-gradient(90% 70% at 12% 4%, ${wash(first, 52)} 0%, transparent 66%)`,
    `radial-gradient(85% 65% at 88% 10%, ${wash(second, 42)} 0%, transparent 62%)`,
    `radial-gradient(120% 90% at 50% 108%, ${wash(third, 30)} 0%, transparent 72%)`,
    `linear-gradient(180deg, ${wash(first, 24)} 0%, var(--bg) 74%)`,
  ].join(", ");
}

export function NowPlaying({ track, onClose }: { track: Track; onClose: () => void }) {
  const t = useT();
  const cover = useTrackCover(track.id);
  const label = trackLabel(track);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const background = ambientBackground(cover?.palette ?? null);

  return (
    <section className="now-playing">
      <Crossfade id={background} className="now-playing-bg">
        {() => <div className="now-playing-bg-paint" style={{ background }} />}
      </Crossfade>

      <header className="now-playing-top">
        <span className="now-playing-album truncate">{track.album ?? label.title}</span>
        <button type="button" className="now-playing-close" onClick={onClose} title={t("Close")}>
          <CloseIcon size={16} />
        </button>
      </header>

      <div className="now-playing-stage">
        <div className="now-playing-art-frame">
          <Crossfade id={cover?.src ?? track.id} className="now-playing-art-layer">
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
    </section>
  );
}

import { useEffect, useRef } from "react";
import type { Lyric } from "@/shared/api/types";
import { useT } from "@/shared/i18n";
import "./TrackLyrics.css";

export function TrackLyrics({
  lyrics,
  position,
  onSeek,
}: {
  lyrics: Lyric[] | null | undefined;
  position: number;
  onSeek: (seconds: number) => void;
}) {
  const t = useT();
  const activeIndex = lyrics
    ? lyrics.reduce(
        (active, line, index) => (line.time !== null && line.time <= position ? index : active),
        -1,
      )
    : -1;
  const active = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (activeIndex >= 0) {
      active.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [activeIndex]);

  return (
    <aside className="track-lyrics" aria-label={t("Lyrics")}>
      {lyrics === undefined ? (
        <p className="track-lyrics-status">{t("Loading lyrics…")}</p>
      ) : lyrics === null ? null : (
        <div className="track-lyrics-lines">
          {lyrics.map((line, index) => {
            const isActive = index === activeIndex;
            const isNext = index === activeIndex + 1;
            return (
              <button
                type="button"
                key={`${line.time}-${index}`}
                ref={isActive ? active : undefined}
                className={`track-lyric${isActive ? " is-playing" : ""}${isNext ? " is-next" : ""}`}
                onClick={() => line.time !== null && onSeek(line.time)}
                disabled={line.time === null}
              >
                {line.lyric}
              </button>
            );
          })}
        </div>
      )}
    </aside>
  );
}

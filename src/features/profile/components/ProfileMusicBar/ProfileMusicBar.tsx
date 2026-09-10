import { useEffect, useRef, useState } from "react";
import type { ProfileTrack } from "@/shared/api/types";
import { useT } from "@/shared/i18n";
import { MusicNoteIcon } from "@/shared/ui/icons";
import "./ProfileMusicBar.css";

const PIXELS_PER_SECOND = 34;
const REPEAT_GAP = 28;
const OVERFLOW_SLACK = 4;

export function ProfileMusicBar({
  tracks,
  loading,
  onOpen,
}: {
  tracks: ProfileTrack[];
  loading: boolean;
  onOpen: () => void;
}) {
  const t = useT();
  const box = useRef<HTMLSpanElement>(null);
  const lane = useRef<HTMLSpanElement>(null);
  const [travel, setTravel] = useState(0);

  const shape = tracks.map((track) => `${track.title} ${track.artist ?? ""}`).join("");

  useEffect(() => {
    const outer = box.current;
    const inner = lane.current;
    if (!outer || !inner) return;
    const measure = () => {
      const room = outer.clientWidth;
      const copy = inner.scrollWidth;
      if (room === 0 || copy === 0) return;
      setTravel(copy - room > OVERFLOW_SLACK ? copy + REPEAT_GAP : 0);
    };
    measure();
    const watcher = new ResizeObserver(measure);
    watcher.observe(outer);
    watcher.observe(inner);
    return () => watcher.disconnect();
  }, [shape]);

  const names = tracks.map((track) => (
    <span className="profile-music-item" key={track.document_id}>
      <MusicNoteIcon size={12} />
      <span className="profile-music-title">{track.title}</span>
      {track.artist && <span className="profile-music-artist">{track.artist}</span>}
    </span>
  ));

  return (
    <button type="button" className="profile-music-bar" onClick={onOpen} title={t("Profile music")}>
      {tracks.length === 0 ? (
        <span className="profile-music-empty">
          <MusicNoteIcon size={13} />
          {loading ? t("Loading…") : t("Add music to the profile")}
        </span>
      ) : (
        <span className={`profile-music-window${travel ? " is-travelling" : ""}`} ref={box}>
          <span
            className={`profile-music-run${travel ? " is-travelling" : ""}`}
            style={
              travel
                ? ({
                    "--travel": `${travel}px`,
                    "--repeat-gap": `${REPEAT_GAP}px`,
                    animationDuration: `${travel / PIXELS_PER_SECOND}s`,
                  } as React.CSSProperties)
                : undefined
            }
          >
            <span className="profile-music-lane" ref={lane}>
              {names}
            </span>
            {travel > 0 && (
              <span className="profile-music-lane" aria-hidden="true">
                {names}
              </span>
            )}
          </span>
        </span>
      )}
    </button>
  );
}

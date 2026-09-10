import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Playlist, Track } from "@/shared/api/types";
import { playlistsApi } from "@/features/playlists/api";
import { usePlaylistOrder } from "@/features/playlists/usePlaylistOrder";
import { profileApi } from "@/features/profile/api";
import { useT } from "@/shared/i18n";
import { showToast } from "@/shared/ui/Toast";
import { MusicNoteIcon, PlaylistIcon, PlusIcon } from "@/shared/ui/icons";
import "./PlayerAddMenu.css";

const GAP = 10;
const WORTH_SORTING = 3;

export function PlayerAddMenu({ track }: { track: Track | null }) {
  const t = useT();
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<{ left: number; bottom: number } | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const ordered = usePlaylistOrder(playlists);

  useEffect(() => {
    if (!open) return;
    playlistsApi.listPlaylists().then(setPlaylists).catch(console.error);
    const box = button.current?.getBoundingClientRect();
    if (box) {
      setAt({ left: box.left - 96, bottom: window.innerHeight - box.top + GAP });
    }
  }, [open]);

  if (!track) {
    return (
      <button type="button" className="player-add" disabled aria-label={t("Add")}>
        <PlusIcon size={16} />
      </button>
    );
  }

  const say = (ok: boolean, message: string) =>
    showToast({ key: "player-add", kind: ok ? "ok" : "warn", message });

  const toProfile = () => {
    setOpen(false);
    profileApi
      .toggleProfileMusic(track.id)
      .then((inProfile) =>
        say(true, inProfile ? t("Added to the profile.") : t("Taken out of the profile.")),
      )
      .catch((err) => say(false, `${t("Couldn't add to the profile:")} ${err}`));
  };

  const toPlaylist = (playlist: Playlist) => {
    setOpen(false);
    playlistsApi
      .addTrackToPlaylist(playlist.id, track.id)
      .then(() => say(true, `${t("Added to")} ${playlist.name}`))
      .catch((err) => say(false, String(err)));
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        className={`player-add${open ? " is-open" : ""}`}
        onClick={() => setOpen((was) => !was)}
        title={t("Add")}
        aria-label={t("Add")}
      >
        <PlusIcon size={16} />
      </button>
      {open &&
        at &&
        createPortal(
          <>
            <div className="player-add-backdrop" onClick={() => setOpen(false)} />
            <div className="player-add-menu" style={{ left: at.left, bottom: at.bottom }}>
              <button className="player-add-item is-profile" onClick={toProfile}>
                <MusicNoteIcon size={14} />
                <span className="truncate">{t("Add to the profile")}</span>
              </button>
              <div className="player-add-title">{t("Add to playlist")}</div>
              <div className="player-add-list">
                {ordered.length === 0 && (
                  <div className="player-add-empty">{t("No playlists yet")}</div>
                )}
                {ordered.map((playlist, index) => (
                  <button
                    key={playlist.id}
                    className="player-add-item"
                    onClick={() => toPlaylist(playlist)}
                  >
                    <PlaylistIcon size={14} />
                    <span className="truncate">{playlist.name}</span>
                    {index === 0 && ordered.length >= WORTH_SORTING && (
                      <em className="player-add-hint">{t("recent")}</em>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}

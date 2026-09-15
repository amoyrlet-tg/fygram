import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { ProfileTrack, Track } from "@/shared/api/types";
import { showToast } from "@/shared/ui/Toast";
import { profileApi } from "./api";
import { usePlayerApi } from "@/features/player";
import { useSettings } from "@/app/providers/SettingsProvider";
import { useT } from "@/shared/i18n";
import { profileMusicView } from "./profileMusicView";

const POLL_MS = 25_000;

function complain(err: unknown) {
  console.error(err);
  showToast({ key: "profile-music", kind: "warn", message: String(err) });
}

export function useProfileMusic() {
  const { current, isPlaying } = usePlayerApi();
  const { profileSyncEnabled } = useSettings();
  const t = useT();
  const [tracks, setTracks] = useState<ProfileTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const request = useRef(0);

  const refresh = useCallback(async () => {
    const version = ++request.current;
    try {
      const next = await profileApi.listProfileMusic();
      if (version === request.current) setTracks(next);
    } catch (err) {
      if (version === request.current) complain(err);
    } finally {
      if (version === request.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const stops = [
      listen("account-changed", () => void refresh()),
      listen("profile-music-changed", () => void refresh()),
    ];
    return () => {
      ++request.current;
      for (const stop of stops) void stop.then((off) => off());
    };
  }, [refresh]);

  useEffect(() => {
    void refresh();
  }, [profileSyncEnabled, refresh]);

  useEffect(() => {
    const ask = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const id = window.setInterval(ask, POLL_MS);
    window.addEventListener("focus", ask);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", ask);
    };
  }, [refresh]);

  const add = useCallback(
    (track: Track) => {
      ++request.current;
      setTracks((prev) => [
        {
          document_id: `pending:${track.id}`,
          title: track.title ?? "",
          artist: track.artist,
          duration_sec: track.duration_sec,
          track_id: track.id,
        },
        ...prev.filter((entry) => entry.track_id !== track.id),
      ]);
      profileApi.addProfileMusic(track.id).catch(complain).finally(refresh);
    },
    [refresh],
  );

  const remove = useCallback(
    (documentId: string) => {
      if (documentId.startsWith("pending:")) return;
      ++request.current;
      setTracks((prev) => prev.filter((track) => track.document_id !== documentId));
      profileApi.removeProfileMusic(documentId).catch(complain).finally(refresh);
    },
    [refresh],
  );

  const move = useCallback(
    (documentId: string, toIndex: number) => {
      if (documentId.startsWith("pending:")) return;
      ++request.current;
      let after: string | null = null;
      setTracks((prev) => {
        const from = prev.findIndex((track) => track.document_id === documentId);
        if (from < 0) return prev;
        const next = [...prev];
        const [moved] = next.splice(from, 1);
        next.splice(toIndex, 0, moved);
        after = toIndex > 0 ? next[toIndex - 1].document_id : null;
        return next;
      });
      profileApi.reorderProfileMusic(documentId, after).catch(complain).finally(refresh);
    },
    [refresh],
  );

  return {
    tracks: profileMusicView(tracks, current, isPlaying, profileSyncEnabled, t("Untitled")),
    loading: profileSyncEnabled ? false : loading,
    refresh,
    add,
    remove,
    move,
  };
}

import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { ProfileTrack, Track } from "@/shared/api/types";
import { showToast } from "@/shared/ui/Toast";
import { profileApi } from "./api";

const POLL_MS = 25_000;

function complain(err: unknown) {
  console.error(err);
  showToast({ key: "profile-music", kind: "warn", message: String(err) });
}

export function useProfileMusic() {
  const [tracks, setTracks] = useState<ProfileTrack[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setTracks(await profileApi.listProfileMusic());
    } catch (err) {
      complain(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    profileApi
      .listProfileMusic()
      .then(setTracks)
      .catch(complain)
      .finally(() => setLoading(false));
    const stops = [
      listen("account-changed", () => void refresh()),
      listen("profile-music-changed", () => void refresh()),
    ];
    return () => {
      for (const stop of stops) void stop.then((off) => off());
    };
  }, [refresh]);

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
      setTracks((prev) => prev.filter((track) => track.document_id !== documentId));
      profileApi.removeProfileMusic(documentId).catch(complain).finally(refresh);
    },
    [refresh],
  );

  const move = useCallback(
    (documentId: string, toIndex: number) => {
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

  return { tracks, loading, refresh, add, remove, move };
}

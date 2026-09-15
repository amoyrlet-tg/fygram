import { useEffect, useState } from "react";
import type { Lyric } from "@/shared/api/types";
import { tracksApi } from "@/features/tracks/api";

export function useTrackLyrics(trackId: string) {
  const [lyrics, setLyrics] = useState<Lyric[] | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    setLyrics(undefined);
    tracksApi
      .trackLyrics(trackId)
      .then((result) => {
        if (alive) setLyrics(result);
      })
      .catch(() => {
        if (alive) setLyrics(null);
      });
    return () => {
      alive = false;
    };
  }, [trackId]);

  return lyrics;
}

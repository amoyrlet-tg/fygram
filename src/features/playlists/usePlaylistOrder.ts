import { useEffect, useMemo, useState } from "react";
import type { Playlist } from "@/shared/api/types";
import { playlistsApi } from "./api";

const HOURS = 72;

export function usePlaylistOrder(playlists: Playlist[]) {
  const [adds, setAdds] = useState<Record<string, number>>({});

  useEffect(() => {
    playlistsApi.recentAdds(HOURS).then(setAdds).catch(console.error);
  }, [playlists]);

  return useMemo(() => {
    const busiest = [...playlists];
    busiest.sort((a, b) => (adds[b.id] ?? 0) - (adds[a.id] ?? 0));
    return busiest;
  }, [playlists, adds]);
}

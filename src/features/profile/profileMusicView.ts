import type { ProfileTrack, Track } from "@/shared/api/types";

export function profileMusicView(
  remote: ProfileTrack[],
  current: Track | null,
  isPlaying: boolean,
  syncEnabled: boolean,
  untitled: string,
): ProfileTrack[] {
  if (!syncEnabled) return remote;
  if (!current || !isPlaying) return [];

  // The player is authoritative for the local now-playing preview. Keep Telegram's
  // exact string ID only after it arrives; numeric document IDs can lose precision.
  const confirmed = remote.find((track) => track.track_id === current.id);
  return [
    {
      document_id: confirmed?.document_id ?? `pending:${current.id}`,
      track_id: current.id,
      title: current.title ?? untitled,
      artist: current.artist,
      duration_sec: current.duration_sec,
    },
  ];
}

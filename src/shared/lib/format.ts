import type { Track } from "@/shared/api/types";

export function formatDuration(totalSeconds: number | null | undefined): string {
  if (!totalSeconds || totalSeconds <= 0 || !Number.isFinite(totalSeconds)) return "--:--";
  const seconds = Math.floor(totalSeconds);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatRuntime(totalSeconds: number, units: { hr: string; min: string }): string {
  const mins = Math.round((totalSeconds || 0) / 60);
  if (mins <= 0) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h} ${units.hr} ${m} ${units.min}` : `${m} ${units.min}`;
}

export function totalDurationSeconds(tracks: Track[]): number {
  return tracks.reduce((sum, t) => sum + (t.duration_sec ?? 0), 0);
}

export function trackLabel(track: Track): { title: string; artist: string } {
  return {
    title: track.title?.trim() || track.file_path.split("/").pop() || "Untitled",
    artist: track.artist?.trim() || "Unknown artist",
  };
}

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

export function formatDateShort(value: string | null | undefined, locale: string): string {
  if (!value) return "";
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return "";
  const date = new Date(ms);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: sameYear ? undefined : "numeric",
  }).format(date);
}

export type SizeParts = { value: number; unit: "MB" | "GB" | "TB" };

const STEP = 1024;

function roundTo(value: number, unit: SizeParts["unit"]): number {
  return unit === "MB" ? Math.round(value) : Math.round(value * 10) / 10;
}

export function sizeParts(bytes: number): SizeParts {
  let value = Math.max(bytes, 0) / (STEP * STEP);
  for (const unit of ["MB", "GB"] as const) {
    const rounded = roundTo(value, unit);
    if (rounded < STEP) return { value: rounded, unit };
    value /= STEP;
  }
  return { value: roundTo(value, "TB"), unit: "TB" };
}

export function formatSize(bytes: number, t: (key: string) => string): string {
  const { value, unit } = sizeParts(bytes);
  return `${value} ${t(unit)}`;
}

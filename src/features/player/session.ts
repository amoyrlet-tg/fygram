import {
  LAST_TRACK_STORAGE_KEY,
  SESSION_STORAGE_KEY,
  VOLUME_STORAGE_KEY,
  type StoredSession,
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseStoredSession(value: unknown): StoredSession | null {
  if (!isRecord(value)) return null;
  const queue = Array.isArray(value.queue)
    ? value.queue.filter((id): id is string => typeof id === "string")
    : [];
  if (queue.length === 0) return null;

  const index =
    typeof value.index === "number" && value.index >= 0 && value.index < queue.length
      ? value.index
      : 0;
  const position =
    typeof value.position === "number" && Number.isFinite(value.position)
      ? Math.max(0, value.position)
      : 0;
  return {
    queue,
    index,
    position,
    shuffle: value.shuffle === true,
    repeat: value.repeat === "all" || value.repeat === "one" ? value.repeat : "off",
  };
}

export function loadSavedSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (raw) {
      const parsed = parseStoredSession(JSON.parse(raw));
      if (parsed) return parsed;
    }
    const legacy = localStorage.getItem(LAST_TRACK_STORAGE_KEY);
    if (legacy) {
      return { queue: [legacy], index: 0, position: 0, shuffle: false, repeat: "off" };
    }
  } catch {}
  return null;
}

export function loadSavedVolume(): number {
  try {
    const raw = localStorage.getItem(VOLUME_STORAGE_KEY);
    if (raw === null) return 0.8;
    const volume = Number(raw);
    if (!Number.isFinite(volume)) return 0.8;
    return Math.min(1, Math.max(0, volume));
  } catch {
    return 0.8;
  }
}

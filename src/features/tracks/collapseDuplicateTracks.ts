import type { Channel, Track } from "@/shared/api/types";
import { trackIdentity } from "@/shared/lib/trackKey";

export interface TrackGroups {
  rows: Track[];
  sources: Record<string, string[]>;
}

export function collapseDuplicateTracks(tracks: Track[], channels: Channel[]): TrackGroups {
  const groups = new Map<string, [Track, ...Track[]]>();
  for (const track of tracks) {
    const key = trackIdentity(track);
    const group = groups.get(key);
    if (group) group.push(track);
    else groups.set(key, [track]);
  }

  const writable = new Set(
    channels.filter((channel) => channel.can_edit === true).map((channel) => channel.id),
  );
  const rows: Track[] = [];
  const sources: Record<string, string[]> = {};
  for (const group of groups.values()) {
    const head = group.find((track) => writable.has(track.channel_id)) ?? group[0];
    rows.push(head);
    sources[head.id] = [...new Set(group.map((track) => track.channel_id))];
  }
  return { rows, sources };
}

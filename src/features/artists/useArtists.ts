import { useCallback, useMemo } from "react";
import type { Track } from "@/shared/api/types";
import {
  mergeTransliteratedVariants,
  splitArtistNames,
  titleMentionsArtist,
  VARIOUS_ARTISTS_KEY,
} from "@/shared/lib/artists";

export interface ArtistSummary {
  name: string;
  count: number;
}

const ARTIST_TRUST_THRESHOLD = 2;

export interface ArtistTrust {
  sourceTracks: Track[];
  infoByKey: Map<string, { display: string; total: number }>;
  rootOf: Map<string, string>;
}

export function useArtists(allTracks: Track[], scopeChannelId: string | null) {
  const artistTrust: ArtistTrust = useMemo(() => {
    const sourceTracks = scopeChannelId
      ? allTracks.filter((t) => t.channel_id === scopeChannelId)
      : allTracks;

    const variantsByKey = new Map<string, Map<string, number>>();
    for (const t of sourceTracks) {
      const raw = t.artist?.trim();
      if (!raw) continue;
      for (const part of splitArtistNames(raw)) {
        const key = part.toLowerCase();
        const variants = variantsByKey.get(key) ?? new Map<string, number>();
        variants.set(part, (variants.get(part) ?? 0) + 1);
        variantsByKey.set(key, variants);
      }
    }

    const { merged: mergedVariantsByKey, rootOf } = mergeTransliteratedVariants(variantsByKey);

    const infoByKey = new Map<string, { display: string; total: number }>();
    for (const [key, variants] of mergedVariantsByKey) {
      let display = "";
      let best = -1;
      let total = 0;
      for (const [name, count] of variants) {
        total += count;
        if (count > best) {
          best = count;
          display = name;
        }
      }
      infoByKey.set(key, { display, total });
    }

    return { sourceTracks, infoByKey, rootOf };
  }, [allTracks, scopeChannelId]);

  const isTrustedArtist = useCallback(
    (name: string) => {
      const key = name.toLowerCase();
      const root = artistTrust.rootOf.get(key) ?? key;
      return (artistTrust.infoByKey.get(root)?.total ?? 0) >= ARTIST_TRUST_THRESHOLD;
    },
    [artistTrust],
  );

  const trustedKeys = useMemo(() => {
    const keys: string[] = [];
    for (const [root, info] of artistTrust.infoByKey) {
      if (info.total >= ARTIST_TRUST_THRESHOLD) keys.push(root);
    }
    return keys;
  }, [artistTrust]);

  const rootsForTrack = useCallback(
    (t: Track): string[] => {
      const roots = new Set<string>();
      const raw = t.artist?.trim();
      if (raw) {
        for (const p of splitArtistNames(raw)) {
          if (!isTrustedArtist(p)) continue;
          const key = p.toLowerCase();
          roots.add(artistTrust.rootOf.get(key) ?? key);
        }
      }
      if (t.title) {
        for (const root of trustedKeys) {
          if (!roots.has(root) && titleMentionsArtist(t.title, root)) {
            roots.add(root);
          }
        }
      }
      return Array.from(roots);
    },
    [artistTrust, isTrustedArtist, trustedKeys],
  );

  const tracksByArtist = useMemo(() => {
    const { sourceTracks, infoByKey } = artistTrust;
    const displayFor = (root: string) => infoByKey.get(root)?.display ?? root;
    const byArtist = new Map<string, Track[]>();
    const push = (name: string, track: Track) => {
      const list = byArtist.get(name);
      if (list) list.push(track);
      else byArtist.set(name, [track]);
    };
    for (const t of sourceTracks) {
      const roots = rootsForTrack(t);
      if (roots.length > 0) {
        for (const root of roots) push(displayFor(root), t);
      } else {
        push(VARIOUS_ARTISTS_KEY, t);
      }
    }
    return byArtist;
  }, [artistTrust, rootsForTrack]);

  const artists = useMemo(
    () =>
      Array.from(tracksByArtist, ([name, list]) => ({ name, count: list.length })).sort((a, b) => {
        if (a.name === VARIOUS_ARTISTS_KEY) return 1;
        if (b.name === VARIOUS_ARTISTS_KEY) return -1;
        return b.count - a.count || a.name.localeCompare(b.name);
      }),
    [tracksByArtist],
  );

  const filterByArtist = useCallback(
    (tracks: Track[], artist: string) => {
      if (artist === VARIOUS_ARTISTS_KEY) {
        return tracks.filter((t) => rootsForTrack(t).length === 0);
      }

      const targetKey = artist.toLowerCase();
      const targetRoot = artistTrust.rootOf.get(targetKey) ?? targetKey;
      return tracks.filter((t) => rootsForTrack(t).includes(targetRoot));
    },
    [artistTrust, rootsForTrack],
  );

  return { artists, tracksByArtist, filterByArtist };
}

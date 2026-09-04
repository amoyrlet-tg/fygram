import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { listen } from "@tauri-apps/api/event";
import type {
  Channel,
  DownloadProgress,
  IndexingBatch,
  SyncDepth,
  SyncProgress,
  SyncStats,
  Track,
} from "@/shared/api/types";
import { useT } from "@/shared/i18n";
import { showToast } from "@/shared/ui/Toast";
import { channelsApi } from "./api";

const SYNC_ERROR_LINGER_MS = 15_000;
const SYNC_SILENCE_TIMEOUT_MS = 90_000;

export function useChannelSync(opts: {
  channels: Channel[];
  setAllTracks: Dispatch<SetStateAction<Track[]>>;
  refreshTracks: () => void;
  refreshChannels: () => void;
}) {
  const { channels, setAllTracks, refreshTracks, refreshChannels } = opts;
  const t = useT();

  const [syncAsk, setSyncAsk] = useState<{ channelId: string; channelTitle: string } | null>(null);

  const [syncProgress, setSyncProgress] = useState<
    Record<string, SyncProgress & { done?: boolean; error?: string }>
  >({});
  const [downloadProgress, setDownloadProgress] = useState<
    Record<string, DownloadProgress & { done?: boolean }>
  >({});
  const [indexingBatch, setIndexingBatch] = useState<IndexingBatch | null>(null);

  useEffect(() => {
    const unlisten = listen<IndexingBatch>("indexing-batch", (event) => {
      setIndexingBatch(event.payload.active ? event.payload : null);
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  const pendingSyncTracksRef = useRef<Track[]>([]);
  const flushSyncTracks = useCallback(() => {
    const batch = pendingSyncTracksRef.current;
    if (batch.length === 0) return;
    pendingSyncTracksRef.current = [];
    setAllTracks((prev) => {
      const known = new Set(prev.map((t) => t.id));
      const fresh = batch.filter((t) => !known.has(t.id)).reverse();
      return fresh.length > 0 ? [...fresh, ...prev] : prev;
    });
  }, [setAllTracks]);

  useEffect(() => {
    const unlisten = listen<SyncProgress>("sync-progress", (event) => {
      const { channel_id, done } = event.payload;
      lastSyncEventRef.current[channel_id] = Date.now();
      setSyncProgress((prev) => ({ ...prev, [channel_id]: event.payload }));

      const track = event.payload.latest_track;
      if (track && !pendingSyncTracksRef.current.some((t) => t.id === track.id)) {
        pendingSyncTracksRef.current.push(track);
      }

      if (done) {
        flushSyncTracks();
        window.setTimeout(() => {
          setSyncProgress((prev) => {
            if (prev[channel_id]?.error) return prev;
            const next = { ...prev };
            delete next[channel_id];
            return next;
          });
        }, 1500);
      }
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, [flushSyncTracks]);

  useEffect(() => {
    const unlisten = listen<DownloadProgress>("download-progress", (event) => {
      const { channel_id, done } = event.payload;
      setDownloadProgress((prev) => ({ ...prev, [channel_id]: event.payload }));
      if (done) {
        window.setTimeout(() => {
          setDownloadProgress((prev) => {
            const next = { ...prev };
            delete next[channel_id];
            return next;
          });
        }, 1500);
      }
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  const lastSyncEventRef = useRef<Record<string, number>>({});
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now();
      setSyncProgress((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const [channelId, progress] of Object.entries(prev)) {
          if (progress.done || progress.error) continue;
          const seen = lastSyncEventRef.current[channelId] ?? 0;
          if (now - seen > SYNC_SILENCE_TIMEOUT_MS) {
            delete next[channelId];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 15_000);
    return () => window.clearInterval(id);
  }, []);

  const markDownloadStarted = useCallback((id: string) => {
    setDownloadProgress((prev) => ({
      ...prev,
      [id]: { channel_id: id, processed: 0, total: 0, downloaded: 0, done: false },
    }));
  }, []);

  const handleSyncChannel = useCallback(
    async (channelId: string, depth: SyncDepth) => {
      lastSyncEventRef.current[channelId] = Date.now();
      setSyncProgress((prev) => ({
        ...prev,
        [channelId]: {
          channel_id: channelId,
          processed: 0,
          total: 0,
          new_tracks: 0,
          latest_track: null,
          done: false,
        },
      }));
      try {
        const stats = await channelsApi.syncChannel(channelId, depth);
        showToast({
          key: `channel-sync-${channelId}`,
          kind: "info",
          message: syncSummary(stats, depth, t),
          duration: 6000,
        });
      } catch (err) {
        console.error(err);
        setSyncProgress((prev) => ({
          ...prev,
          [channelId]: {
            ...(prev[channelId] ?? {
              channel_id: channelId,
              processed: 0,
              total: 0,
              new_tracks: 0,
              latest_track: null,
            }),
            done: true,
            error: String(err),
          },
        }));
        window.setTimeout(() => {
          setSyncProgress((prev) => {
            if (!prev[channelId]?.error) return prev;
            const next = { ...prev };
            delete next[channelId];
            return next;
          });
        }, SYNC_ERROR_LINGER_MS);
      } finally {
        refreshTracks();
        refreshChannels();
      }
    },
    [refreshTracks, refreshChannels, t],
  );

  const requestSyncChannel = useCallback(
    (channelId: string) => {
      const channel = channels.find((c) => c.id === channelId);
      setSyncAsk({ channelId, channelTitle: channel?.title ?? "" });
    },
    [channels],
  );
  const cancelSyncAsk = useCallback(() => setSyncAsk(null), []);
  const confirmSyncAsk = useCallback(
    (depth: SyncDepth) => {
      const pending = syncAsk;
      setSyncAsk(null);
      if (pending) void handleSyncChannel(pending.channelId, depth);
    },
    [syncAsk, handleSyncChannel],
  );

  const handleDownloadChannel = useCallback(
    async (channelId: string) => {
      markDownloadStarted(channelId);
      try {
        await channelsApi.downloadChannel(channelId);
      } catch (err) {
        console.error(err);
      }
    },
    [markDownloadStarted],
  );

  const handleCancelSync = useCallback((channelId: string) => {
    channelsApi.cancelSync(channelId);
  }, []);

  return {
    syncProgress,
    indexingBatch,
    downloadProgress,
    markDownloadStarted,
    syncAsk,
    requestSyncChannel,
    cancelSyncAsk,
    confirmSyncAsk,
    handleSyncChannel,
    handleDownloadChannel,
    handleCancelSync,
  };
}

function syncSummary(stats: SyncStats, depth: SyncDepth, t: (key: string) => string): string {
  const parts = [`${t("added:")} ${stats.new_tracks}`];
  if (depth === "full") {
    parts.push(`${t("changed:")} ${stats.updated_tracks}`);
    if (stats.removed_tracks > 0) {
      parts.push(`${t("removed:")} ${stats.removed_tracks}`);
    }
  } else if (stats.stopped_early) {
    parts.push(t("stopped at what was already here"));
  }
  return parts.join(" · ");
}

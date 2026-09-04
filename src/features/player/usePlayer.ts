import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { Track } from "@/shared/api/types";
import { trackLabel } from "@/shared/lib/format";
import { playerApi } from "./api";
import { profileApi } from "@/features/profile/api";
import { broadcastApi } from "@/features/broadcast/api";

import {
  END_EPSILON,
  LAST_TRACK_STORAGE_KEY,
  MIN_PLAY_MS,
  PLAY_RETRY_ATTEMPTS,
  PLAY_RETRY_DELAY_MS,
  POLL_MS,
  PROFILE_SYNC_MS,
  FADE_BACK_MS,
  FADE_STEP_MS,
  QUIET_GAIN,
  BROADCAST_MS,
  SESSION_SAVE_MS,
  SESSION_STORAGE_KEY,
  SHUFFLE_NO_REPEAT,
  VOLUME_STORAGE_KEY,
  type FetchProgress,
  type RepeatMode,
  type StoredSession,
} from "./types";
import { useUnavailableTracks } from "./useUnavailableTracks";
import { isOffline } from "@/features/sync/connectivity";

export type { FetchProgress, PlayerState, RepeatMode } from "./types";

function loadSavedSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredSession> | null;
      const queue = Array.isArray(parsed?.queue)
        ? parsed.queue.filter((id): id is string => typeof id === "string")
        : [];
      if (queue.length > 0) {
        const index =
          typeof parsed?.index === "number" && parsed.index >= 0 && parsed.index < queue.length
            ? parsed.index
            : 0;
        const position =
          typeof parsed?.position === "number" && Number.isFinite(parsed.position)
            ? Math.max(0, parsed.position)
            : 0;
        return {
          queue,
          index,
          position,
          shuffle: parsed?.shuffle === true,
          repeat: parsed?.repeat === "all" || parsed?.repeat === "one" ? parsed.repeat : "off",
        };
      }
    }

    const legacy = localStorage.getItem(LAST_TRACK_STORAGE_KEY);
    if (legacy) {
      return { queue: [legacy], index: 0, position: 0, shuffle: false, repeat: "off" };
    }
  } catch {
    // localStorage is unavailable in a private window; the saved session is a
    // convenience, not something to fail startup over
  }
  return null;
}

function loadSavedVolume(): number {
  try {
    const raw = localStorage.getItem(VOLUME_STORAGE_KEY);
    if (raw === null) return 0.8;
    const v = Number(raw);
    if (!Number.isFinite(v)) return 0.8;
    return Math.min(1, Math.max(0, v));
  } catch {
    return 0.8;
  }
}

export function usePlayer() {
  const [queue, setQueue] = useState<Track[]>([]);
  const [index, setIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [volume, setVolumeState] = useState(loadSavedVolume);
  const [shuffle, setShuffle] = useState(() => loadSavedSession()?.shuffle ?? false);
  const [repeat, setRepeat] = useState<RepeatMode>(() => loadSavedSession()?.repeat ?? "off");
  const [fetchProgress, setFetchProgress] = useState<FetchProgress | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  const { unavailableIds, markUnavailable, markAvailable } = useUnavailableTracks();

  const stateRef = useRef({ queue, index, repeat, isPlaying, shuffle, position, volume });
  stateRef.current = { queue, index, repeat, isPlaying, shuffle, position, volume };

  const current = index >= 0 && index < queue.length ? queue[index] : null;

  const playSeqRef = useRef(Date.now());

  const historyRef = useRef<Track[]>([]);
  const historyPosRef = useRef(-1);
  const startedAtRef = useRef(0);
  const progressedRef = useRef(false);
  const failStreakRef = useRef(0);
  const duckedRef = useRef(false);
  const gainRef = useRef(1);
  const fadeTimerRef = useRef(0);

  const applyGain = useCallback((gain: number) => {
    gainRef.current = gain;
    void playerApi.setVolume(stateRef.current.volume * gain);
  }, []);

  const fadeGainTo = useCallback(
    (target: number, ms: number) => {
      window.clearInterval(fadeTimerRef.current);
      fadeTimerRef.current = 0;
      if (ms <= 0) {
        applyGain(target);
        return;
      }
      const from = gainRef.current;
      const startedAt = performance.now();
      fadeTimerRef.current = window.setInterval(() => {
        const t = Math.min(1, (performance.now() - startedAt) / ms);
        if (t >= 1) {
          window.clearInterval(fadeTimerRef.current);
          fadeTimerRef.current = 0;
          applyGain(target);
          return;
        }
        applyGain(from + (target - from) * (1 - (1 - t) ** 3));
      }, FADE_STEP_MS);
    },
    [applyGain],
  );

  useEffect(() => () => window.clearInterval(fadeTimerRef.current), []);
  const beatRef = useRef<(at?: number) => void>(() => {});

  const stopPlayback = useCallback(() => {
    playSeqRef.current += 1;
    import("@tauri-apps/api/core").then(({ invoke }) => {
      invoke("stop_playback", { seq: playSeqRef.current }).catch(console.error);
    });
  }, []);

  const playWithRetry = useCallback(async (trackId: string, seq: number): Promise<boolean> => {
    const attempts = navigator.onLine ? PLAY_RETRY_ATTEMPTS : 1;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        await playerApi.playTrack(trackId, seq);
        return true;
      } catch (err) {
        if (seq !== playSeqRef.current) return false;
        if (attempt === attempts) {
          console.error(`playTrack(${trackId}) failed after ${attempt} attempts:`, err);
          return false;
        }
        await new Promise((resolve) => setTimeout(resolve, PLAY_RETRY_DELAY_MS * attempt));
      }
    }
    return false;
  }, []);

  useEffect(() => {
    stopPlayback();
    void playerApi.setVolume(loadSavedVolume());
  }, [stopPlayback]);

  const startAt = useCallback(
    (
      tracks: Track[],
      startIndex: number,
      opts?: { fromHistory?: boolean; startSeconds?: number },
    ) => {
      let track = tracks[startIndex];
      if (!track) return;

      const startSeconds = opts?.startSeconds ?? 0;

      const isDownloaded = (tr: Track) => !!tr.file_path;
      const offline = isOffline() || !navigator.onLine;
      if (offline && !isDownloaded(track)) {
        const n = tracks.length;
        let redirected = -1;
        for (let i = startIndex + 1; i < n && redirected === -1; i++) {
          if (isDownloaded(tracks[i])) redirected = i;
        }
        for (let i = 0; i < startIndex && redirected === -1; i++) {
          if (isDownloaded(tracks[i])) redirected = i;
        }
        if (redirected === -1) {
          setPlaybackError(trackLabel(track).title);
          setIsPlaying(false);
          stopPlayback();
          return;
        }
        setPlaybackError(trackLabel(track).title);
        startIndex = redirected;
        track = tracks[startIndex];
      }

      setQueue(tracks);
      setIndex(startIndex);
      setPosition(startSeconds);
      setIsPlaying(true);
      startedAtRef.current = Date.now();
      progressedRef.current = false;
      setFetchProgress(null);

      playSeqRef.current += 1;
      const seq = playSeqRef.current;

      void playWithRetry(track.id, seq).then((ok) => {
        if (seq !== playSeqRef.current) return;
        if (ok) {
          failStreakRef.current = 0;
          setPlaybackError(null);
          markAvailable(track.id);
          if (startSeconds > 0) playerApi.seekPlayback(startSeconds);
          if (!stateRef.current.isPlaying) {
            playerApi.pausePlayback();
          }
          return;
        }

        if (navigator.onLine) markUnavailable(track.id);
        failStreakRef.current += 1;
        setPlaybackError(trackLabel(track).title);

        const n = tracks.length;
        if (n === 0 || failStreakRef.current > n) {
          setIsPlaying(false);
          stopPlayback();
          return;
        }

        const findDownloaded = (from: number, to: number) => {
          for (let i = from; i < to; i++) if (isDownloaded(tracks[i])) return i;
          return -1;
        };
        const { repeat: r } = stateRef.current;
        let nextIndex = findDownloaded(startIndex + 1, n);
        if (nextIndex === -1 && r === "all") nextIndex = findDownloaded(0, startIndex);
        if (nextIndex === -1) {
          nextIndex = startIndex + 1;
          if (nextIndex >= n) {
            if (r === "all") nextIndex = 0;
            else {
              setIsPlaying(false);
              stopPlayback();
              return;
            }
          }
        }
        startAt(tracks, nextIndex);
      });

      const next = tracks[startIndex + 1];
      if (next && navigator.onLine) void playerApi.prefetchTrack(next.id);

      if (!opts?.fromHistory) {
        historyRef.current = historyRef.current.slice(0, historyPosRef.current + 1);
        historyRef.current.push(track);
        historyPosRef.current = historyRef.current.length - 1;
      }
    },
    [playWithRetry, markUnavailable, markAvailable, stopPlayback],
  );

  const playFromHistory = useCallback(
    (track: Track) => {
      const { queue: q } = stateRef.current;
      const idx = q.findIndex((t) => t.id === track.id);
      if (idx >= 0) {
        startAt(q, idx, { fromHistory: true });
      } else {
        startAt([track], 0, { fromHistory: true });
      }
    },
    [startAt],
  );

  const advance = useCallback(
    (direction: 1 | -1) => {
      const { queue: q, index: i, repeat: r, shuffle: shuffleOn } = stateRef.current;
      if (q.length === 0) return;

      if (r === "one" && direction === 1) {
        startAt(q, i);
        beatRef.current(0);
        return;
      }

      if (shuffleOn) {
        if (direction === -1 && historyPosRef.current > 0) {
          historyPosRef.current -= 1;
          playFromHistory(historyRef.current[historyPosRef.current]);
          return;
        }
        if (direction === 1 && historyPosRef.current < historyRef.current.length - 1) {
          historyPosRef.current += 1;
          playFromHistory(historyRef.current[historyPosRef.current]);
          return;
        }
        if (direction === 1 && q.length > 1) {
          const recentIds = new Set(historyRef.current.slice(-SHUFFLE_NO_REPEAT).map((t) => t.id));
          const playable =
            isOffline() || !navigator.onLine ? (t: Track) => !!t.file_path : () => true;
          let candidates = q.filter((t) => t.id !== q[i].id && !recentIds.has(t.id) && playable(t));
          if (candidates.length === 0) {
            candidates = q.filter((t) => t.id !== q[i].id && playable(t));
          }
          if (candidates.length === 0) {
            candidates = q.filter((t) => t.id !== q[i].id);
          }
          const track = candidates[Math.floor(Math.random() * candidates.length)];
          startAt(
            q,
            q.findIndex((t) => t.id === track.id),
          );
          return;
        }
        if (direction === -1) {
          startAt(q, i);
          return;
        }
      }

      let next = i + direction;
      if (next < 0) next = r === "all" ? q.length - 1 : 0;
      if (next >= q.length) {
        if (r === "all") next = 0;
        else {
          setIsPlaying(false);
          stopPlayback();
          return;
        }
      }
      startAt(q, next);
    },
    [startAt, playFromHistory, stopPlayback],
  );

  useEffect(() => {
    const unlisten = listen<{ track_id: string; downloaded: number; total: number }>(
      "track-fetch-progress",
      (event) => {
        if (!current || event.payload.track_id !== current.id) return;
        const { track_id, downloaded, total } = event.payload;
        if (total > 0 && downloaded >= total) {
          setFetchProgress(null);
          return;
        }
        setFetchProgress({ trackId: track_id, downloaded, total });
      },
    );
    return () => {
      unlisten.then((f) => f());
    };
  }, [current]);

  useEffect(() => {
    if (!isPlaying || !current) return;
    const id = window.setInterval(async () => {
      const { position: pos, finished } = await playerApi.getPlaybackPosition();
      setPosition(pos);
      if (pos > END_EPSILON) progressedRef.current = true;

      if (Date.now() - startedAtRef.current < MIN_PLAY_MS) return;

      const drained = finished && progressedRef.current;
      if (drained) {
        advance(1);
      }
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [isPlaying, current, advance]);

  useEffect(() => {
    const trackId = current && isPlaying ? current.id : null;
    void profileApi.setNowPlayingTrack(trackId);
    if (!trackId) return;
    const id = window.setInterval(() => {
      void profileApi.setNowPlayingTrack(trackId);
    }, PROFILE_SYNC_MS);
    return () => window.clearInterval(id);
  }, [current, isPlaying]);

  const positionRef = useRef(0);
  positionRef.current = position;
  const lastBroadcastRef = useRef<string | null>(null);

  useEffect(() => {
    if (!current) {
      beatRef.current = () => {};
      return;
    }

    const switched = lastBroadcastRef.current !== current.id;
    lastBroadcastRef.current = current.id;

    const beat = (at?: number) => {
      void broadcastApi
        .nowPlaying(current.id, at ?? positionRef.current, isPlaying)
        .catch(() => {});
    };

    beatRef.current = beat;
    beat(switched ? 0 : undefined);
    if (!isPlaying) return;

    const id = window.setInterval(() => beat(), BROADCAST_MS);
    return () => window.clearInterval(id);
  }, [current, isPlaying]);

  useEffect(() => {
    if (current) return;
    void broadcastApi.stop().catch(() => {});
  }, [current]);

  useEffect(() => () => void broadcastApi.stop().catch(() => {}), []);

  const saveSession = useCallback(() => {
    const { queue: q, index: i, position: pos, shuffle: sh, repeat: rep } = stateRef.current;
    if (q.length === 0) return;
    try {
      const session: StoredSession = {
        queue: q.map((t) => t.id),
        index: i,
        position: pos,
        shuffle: sh,
        repeat: rep,
      };
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } catch {
      // localStorage is unavailable in a private window; the saved session is a
      // convenience, not something to fail startup over
    }
  }, []);

  useEffect(() => saveSession(), [saveSession, queue, index, shuffle, repeat]);

  useEffect(() => {
    if (!isPlaying) {
      saveSession();
      return;
    }
    const id = window.setInterval(saveSession, SESSION_SAVE_MS);
    return () => {
      window.clearInterval(id);
      saveSession();
    };
  }, [isPlaying, saveSession]);

  useEffect(() => {
    window.addEventListener("beforeunload", saveSession);
    return () => window.removeEventListener("beforeunload", saveSession);
  }, [saveSession]);

  const restoreSession = useCallback((library: Track[]) => {
    const saved = loadSavedSession();
    if (!saved || library.length === 0) return;

    const byId = new Map(library.map((t) => [t.id, t]));
    const tracks: Track[] = [];
    let restoredIndex = -1;
    saved.queue.forEach((id, i) => {
      const track = byId.get(id);
      if (!track) return;
      if (i === saved.index) restoredIndex = tracks.length;
      tracks.push(track);
    });
    if (tracks.length === 0) return;

    const droppedCurrent = restoredIndex === -1;
    if (droppedCurrent) restoredIndex = 0;

    setQueue(tracks);
    setIndex(restoredIndex);
    setPosition(droppedCurrent ? 0 : saved.position);
    setIsPlaying(false);
    historyRef.current = [tracks[restoredIndex]];
    historyPosRef.current = 0;
  }, []);

  const play = useCallback(
    (tracks: Track[], startIndex: number) => {
      failStreakRef.current = 0;
      setPlaybackError(null);
      startAt(tracks, startIndex);
    },
    [startAt],
  );

  const pause = useCallback(() => {
    playerApi.pausePlayback();
    setIsPlaying(false);
  }, []);

  const resume = useCallback(() => {
    setIsPlaying(true);
    void playerApi.resumePlayback();

    void playerApi
      .getPlaybackPosition()
      .then((state) => {
        if (state.active) return;
        const { queue: q, index: i, position: pos } = stateRef.current;
        if (q[i]) startAt(q, i, { fromHistory: true, startSeconds: pos });
      })
      .catch(() => {});
  }, [startAt]);

  const togglePlay = useCallback(() => {
    if (!current) return;
    if (isPlaying) pause();
    else resume();
  }, [current, isPlaying, pause, resume]);

  useEffect(() => {
    const unlisten = listen<{ active: boolean }>("foreign-audio", (event) => {
      const { active } = event.payload;
      if (active === duckedRef.current) return;
      duckedRef.current = active;
      fadeGainTo(active ? QUIET_GAIN : 1, active ? 0 : FADE_BACK_MS);
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, [fadeGainTo]);

  const next = useCallback(() => {
    failStreakRef.current = 0;
    setPlaybackError(null);
    advance(1);
  }, [advance]);

  const previous = useCallback(() => {
    if (position > 3) {
      playerApi.seekPlayback(0);
      setPosition(0);
      beatRef.current(0);
      return;
    }
    failStreakRef.current = 0;
    setPlaybackError(null);
    advance(-1);
  }, [advance, position]);

  // The card Android draws in the notification shade. Its buttons arrive here
  // rather than in Rust because the queue lives here - see src/android.rs.
  useEffect(() => {
    const unlisten = listen<string>("media-transport", (event) => {
      if (event.payload === "next") next();
      else if (event.payload === "previous") previous();
      else togglePlay();
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, [togglePlay, next, previous]);

  const seek = useCallback((seconds: number) => {
    playerApi.seekPlayback(seconds);
    setPosition(seconds);
    beatRef.current(seconds);
  }, []);

  const setVolume = useCallback((v: number) => {
    setVolumeState(v);
    playerApi.setVolume(v * gainRef.current);
    try {
      localStorage.setItem(VOLUME_STORAGE_KEY, String(v));
    } catch {
      // localStorage is unavailable in a private window; the saved session is a
      // convenience, not something to fail startup over
    }
  }, []);

  const toggleShuffle = useCallback(() => setShuffle((s) => !s), []);
  const cycleRepeat = useCallback(() => {
    setRepeat((r) => (r === "off" ? "all" : r === "all" ? "one" : "off"));
  }, []);

  const enqueueNext = useCallback((track: Track) => {
    setQueue((q) => {
      const insertAt = stateRef.current.index + 1;
      const copy = [...q];
      copy.splice(insertAt, 0, track);
      return copy;
    });
  }, []);

  return {
    queue,
    index,
    current,
    restoreSession,
    isPlaying,
    position,
    volume,
    shuffle,
    repeat,
    fetchProgress,
    playbackError,
    unavailableIds,
    markAvailable,
    play,
    togglePlay,
    next,
    previous,
    seek,
    setVolume,
    toggleShuffle,
    cycleRepeat,
    enqueueNext,
  };
}

export type PlayerApi = ReturnType<typeof usePlayer>;

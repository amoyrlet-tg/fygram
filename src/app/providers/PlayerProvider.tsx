import { createContext, useContext, useMemo, type ReactNode } from "react";
import { usePlayer, type PlayerApi } from "@/features/player/usePlayer";

/**
 * Split in two on purpose: `position` ticks four times a second, and only the
 * three components drawing a progress bar should re-render with it.
 */
export type PlayerProgress = Pick<PlayerApi, "position" | "fetchProgress">;
export type PlayerControls = Omit<PlayerApi, "position" | "fetchProgress">;

const ControlsContext = createContext<PlayerControls | null>(null);
const ProgressContext = createContext<PlayerProgress | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const {
    position,
    fetchProgress,
    queue,
    index,
    current,
    restoreSession,
    isPlaying,
    volume,
    shuffle,
    repeat,
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
  } = usePlayer();

  const controls = useMemo<PlayerControls>(
    () => ({
      queue,
      index,
      current,
      restoreSession,
      isPlaying,
      volume,
      shuffle,
      repeat,
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
    }),
    [
      queue,
      index,
      current,
      restoreSession,
      isPlaying,
      volume,
      shuffle,
      repeat,
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
    ],
  );

  const progress = useMemo<PlayerProgress>(
    () => ({ position, fetchProgress }),
    [position, fetchProgress],
  );

  return (
    <ControlsContext.Provider value={controls}>
      <ProgressContext.Provider value={progress}>{children}</ProgressContext.Provider>
    </ControlsContext.Provider>
  );
}

/** Everything about the player except how far into the track it is. */
export function usePlayerApi(): PlayerControls {
  const value = useContext(ControlsContext);
  if (!value) throw new Error("usePlayerApi must be used inside <PlayerProvider>");
  return value;
}

/** How far into the track it is. Re-renders on every tick - use it sparingly. */
export function usePlayerProgress(): PlayerProgress {
  const value = useContext(ProgressContext);
  if (!value) throw new Error("usePlayerProgress must be used inside <PlayerProvider>");
  return value;
}

/** For the three components that actually draw a progress bar. */
export function usePlayerWithProgress(): PlayerApi {
  const controls = usePlayerApi();
  const progress = usePlayerProgress();
  return { ...controls, ...progress };
}

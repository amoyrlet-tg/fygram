import { createContext, useContext, useMemo, type ReactNode } from "react";
import { usePlayer, type PlayerApi } from "@/features/player/usePlayer";

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

export function usePlayerApi(): PlayerControls {
  const value = useContext(ControlsContext);
  if (!value) throw new Error("usePlayerApi must be used inside <PlayerProvider>");
  return value;
}

export function usePlayerProgress(): PlayerProgress {
  const value = useContext(ProgressContext);
  if (!value) throw new Error("usePlayerProgress must be used inside <PlayerProvider>");
  return value;
}

export function usePlayerWithProgress(): PlayerApi {
  const controls = usePlayerApi();
  const progress = usePlayerProgress();
  return { ...controls, ...progress };
}

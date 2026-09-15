import { useMemo, type ReactNode } from "react";
import { usePlayer } from "./usePlayer";
import {
  ControlsContext,
  ProgressContext,
  type PlayerControls,
  type PlayerProgress,
} from "./context";

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

import { createContext, useContext } from "react";
import type { PlayerApi } from "./usePlayer";

export type PlayerProgress = Pick<PlayerApi, "position" | "fetchProgress">;
export type PlayerControls = Omit<PlayerApi, "position" | "fetchProgress">;

export const ControlsContext = createContext<PlayerControls | null>(null);
export const ProgressContext = createContext<PlayerProgress | null>(null);

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

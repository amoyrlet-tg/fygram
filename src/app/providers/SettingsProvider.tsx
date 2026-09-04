import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { CurrentUser, DuckingConfig } from "@/shared/api/types";
import { useProfile } from "@/features/profile/useProfile";
import { useTheme, type Theme } from "@/app/useTheme";

/**
 * Everything the profile menu shows. Produced exactly once: `useTheme` writes to
 * the document and `useProfile` polls, so a second copy would fight the first.
 */
export interface Settings {
  currentUser: CurrentUser | null;

  theme: Theme;
  setTheme: (theme: Theme) => void;
  accent: string | null;
  setAccent: (accent: string | null) => void;

  profileSyncEnabled: boolean;
  toggleProfileSync: (enabled: boolean) => void;
  autostartEnabled: boolean;
  toggleAutostart: (enabled: boolean) => void;
  fullscreenEnabled: boolean;
  toggleFullscreen: (enabled: boolean) => void;
  ducking: DuckingConfig;
  toggleDucking: (enabled: boolean) => void;
}

const SettingsContext = createContext<Settings | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const profile = useProfile();
  const { theme, accent, handleSetTheme, handleSetAccent } = useTheme();

  const value = useMemo<Settings>(
    () => ({
      currentUser: profile.currentUser,
      theme,
      setTheme: handleSetTheme,
      accent,
      setAccent: handleSetAccent,
      profileSyncEnabled: profile.profileSyncEnabled,
      toggleProfileSync: profile.handleToggleProfileSync,
      autostartEnabled: profile.autostartEnabled,
      toggleAutostart: profile.handleToggleAutostart,
      fullscreenEnabled: profile.fullscreenEnabled,
      toggleFullscreen: profile.handleToggleFullscreen,
      ducking: profile.ducking,
      toggleDucking: profile.handleToggleDucking,
    }),
    [profile, theme, accent, handleSetTheme, handleSetAccent],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): Settings {
  const value = useContext(SettingsContext);
  if (!value) throw new Error("useSettings must be used inside <SettingsProvider>");
  return value;
}

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { CurrentUser, DuckingConfig } from "@/shared/api/types";
import { useProfile } from "@/features/profile/useProfile";
import { useTheme, type Theme } from "@/app/useTheme";
import { setEcoEnabled, setEcoKeepsArt, useEco, useEcoKeepsArt } from "@/app/ecoMode";

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
  ducking: DuckingConfig;
  toggleDucking: (enabled: boolean) => void;
  ecoMode: boolean;
  toggleEcoMode: (enabled: boolean) => void;
  ecoKeepsArt: boolean;
  toggleEcoKeepsArt: (enabled: boolean) => void;
}

const SettingsContext = createContext<Settings | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const profile = useProfile();
  const colour = profile.currentUser?.profile_colour;
  const palette = colour ? (colour.dark_bg.length ? colour.dark_bg : colour.bg) : [];
  const profileAccent = palette.length ? palette[palette.length - 1] : null;
  const { theme, accent, handleSetTheme, handleSetAccent } = useTheme(profileAccent);
  const ecoMode = useEco();
  const ecoKeepsArt = useEcoKeepsArt();

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
      ducking: profile.ducking,
      toggleDucking: profile.handleToggleDucking,
      ecoMode,
      toggleEcoMode: setEcoEnabled,
      ecoKeepsArt,
      toggleEcoKeepsArt: setEcoKeepsArt,
    }),
    [profile, theme, accent, handleSetTheme, handleSetAccent, ecoMode, ecoKeepsArt],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): Settings {
  const value = useContext(SettingsContext);
  if (!value) throw new Error("useSettings must be used inside <SettingsProvider>");
  return value;
}

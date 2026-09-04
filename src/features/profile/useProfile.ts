import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { CurrentUser, DuckingConfig } from "@/shared/api/types";
import { authApi } from "@/features/auth/api";
import { profileApi } from "./api";

const USER_REFRESH_MS = 120_000;

export function useProfile() {
  const [profileSyncEnabled, setProfileSyncEnabled] = useState(false);
  const [autostartEnabled, setAutostartEnabled] = useState(false);
  const [fullscreenEnabled, setFullscreenEnabled] = useState(false);
  const [ducking, setDucking] = useState<DuckingConfig>({
    enabled: false,
    supported: false,
  });
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    profileApi.getProfileSyncEnabled().then(setProfileSyncEnabled).catch(console.error);
    profileApi.getAutostartEnabled().then(setAutostartEnabled).catch(console.error);
    profileApi.getFullscreenEnabled().then(setFullscreenEnabled).catch(console.error);
    profileApi.getDuckingConfig().then(setDucking).catch(console.error);
  }, []);

  const refreshCurrentUser = useCallback(() => {
    authApi.getCurrentUser().then(setCurrentUser).catch(console.error);
  }, []);

  useEffect(() => {
    refreshCurrentUser();
    const id = window.setInterval(refreshCurrentUser, USER_REFRESH_MS);
    const unlisten = listen("library-changed", refreshCurrentUser);
    return () => {
      window.clearInterval(id);
      unlisten.then((f) => f());
    };
  }, [refreshCurrentUser]);

  const handleToggleProfileSync = useCallback((enabled: boolean) => {
    setProfileSyncEnabled(enabled);
    profileApi.setProfileSyncEnabled(enabled).catch((err) => {
      console.error(err);
      setProfileSyncEnabled(!enabled);
    });
  }, []);

  const handleToggleAutostart = useCallback((enabled: boolean) => {
    setAutostartEnabled(enabled);
    profileApi.setAutostartEnabled(enabled).catch((err) => {
      console.error(err);
      setAutostartEnabled(!enabled);
    });
  }, []);

  const handleToggleFullscreen = useCallback((enabled: boolean) => {
    setFullscreenEnabled(enabled);
    profileApi.setFullscreenEnabled(enabled).catch((err) => {
      console.error(err);
      setFullscreenEnabled(!enabled);
    });
  }, []);

  const handleToggleDucking = useCallback((enabled: boolean) => {
    setDucking((prev) => ({ ...prev, enabled }));
    profileApi.setDuckingConfig(enabled).catch((err) => {
      console.error(err);
      setDucking((prev) => ({ ...prev, enabled: !enabled }));
    });
  }, []);

  return {
    profileSyncEnabled,
    ducking,
    handleToggleDucking,
    autostartEnabled,
    fullscreenEnabled,
    currentUser,
    handleToggleProfileSync,
    handleToggleAutostart,
    handleToggleFullscreen,
  };
}

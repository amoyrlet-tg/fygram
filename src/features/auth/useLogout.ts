import { useCallback, useState } from "react";
import { authApi } from "./api";

export function useLogout() {
  const [logoutConfirmStep, setLogoutConfirmStep] = useState<0 | 1 | 2>(0);
  const handleLogout = useCallback(() => setLogoutConfirmStep(1), []);
  const advanceLogoutConfirm = useCallback(() => setLogoutConfirmStep(2), []);
  const cancelLogoutConfirm = useCallback(() => setLogoutConfirmStep(0), []);
  const finalizeLogout = useCallback(() => {
    setLogoutConfirmStep(0);
    authApi.logout().catch(console.error);
  }, []);

  return {
    logoutConfirmStep,
    handleLogout,
    advanceLogoutConfirm,
    cancelLogoutConfirm,
    finalizeLogout,
  };
}

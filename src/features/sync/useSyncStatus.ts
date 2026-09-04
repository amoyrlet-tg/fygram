import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { SyncStatus } from "@/shared/api/types";
import { useT } from "@/shared/i18n";
import { dismissToast, showToast } from "@/shared/ui/Toast";
import { rememberSessionInvalid } from "@/features/auth/sessionStatus";
import { rememberOnline } from "./connectivity";
import { syncApi } from "./api";

const CONNECTION_TOAST = "sync-connection";
const ERROR_TOAST = "sync-error";
const SESSION_TOAST = "sync-session";

export function useSyncStatus() {
  const t = useT();
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const wasOnline = useRef<boolean | null>(null);
  const wasSessionInvalid = useRef(false);
  const lastError = useRef<string | null>(null);

  const apply = useCallback(
    (next: SyncStatus) => {
      setStatus(next);
      if (!next.ready) return;
      rememberOnline(next.online);

      const previous = wasOnline.current;
      wasOnline.current = next.online;

      rememberSessionInvalid(next.session_invalid);
      if (next.session_invalid !== wasSessionInvalid.current) {
        if (next.session_invalid) {
          dismissToast(CONNECTION_TOAST);
          showToast({
            key: SESSION_TOAST,
            kind: "warn",
            duration: 8000,
            message: t(
              "Telegram signed this device out. Your music stays and keeps playing — log in again to sync.",
            ),
          });
        } else {
          dismissToast(SESSION_TOAST);
        }
        wasSessionInvalid.current = next.session_invalid;
      }

      if (next.session_invalid) {
        lastError.current = next.last_error;
        return;
      }

      if (!next.online && previous !== false) {
        if (previous === true || next.pending > 0) {
          showToast({
            key: CONNECTION_TOAST,
            kind: "warn",
            message: t("You are offline. Changes are saved and will go out on their own."),
          });
        }
      } else if (next.online && previous === false) {
        showToast({
          key: CONNECTION_TOAST,
          kind: "ok",
          message:
            next.pending > 0
              ? t("Back online — sending {n} pending change(s).").replace(
                  "{n}",
                  String(next.pending),
                )
              : t("You are back online."),
        });
      } else if (next.online && next.pending === 0 && !next.syncing) {
        dismissToast(CONNECTION_TOAST);
      }

      if (next.last_error && next.last_error !== lastError.current) {
        showToast({
          key: ERROR_TOAST,
          kind: "warn",
          duration: 8000,
          message: t("Sync problem: {error}").replace("{error}", next.last_error),
        });
      } else if (!next.last_error && lastError.current) {
        dismissToast(ERROR_TOAST);
      }
      lastError.current = next.last_error;
    },
    [t],
  );

  useEffect(() => {
    syncApi.getSyncStatus().then(apply).catch(console.error);
    const unlisten = listen<SyncStatus>("sync-status", (event) => apply(event.payload));
    return () => {
      unlisten.then((f) => f());
    };
  }, [apply]);

  const syncNow = useCallback(() => {
    syncApi.syncNow().catch((err) => {
      showToast({ key: ERROR_TOAST, kind: "warn", message: String(err) });
    });
  }, []);

  return { status, syncNow };
}

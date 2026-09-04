import { useCallback, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import type { Channel } from "@/shared/api/types";
import { showToast } from "@/shared/ui/Toast";
import { useT } from "@/shared/i18n";
import { channelsApi } from "./api";

interface RightsChanged {
  channel_id: string;
  title: string;
  can_edit: boolean;
  after_refusal: boolean;
}

const TOAST_KEY = "channel-rights";

const NOTICE_MS = 7000;

/** A refusal has to say how to get the right back, or the edit button simply
 *  stops working one day with no reason given. */
export function useChannelRightsNotice() {
  const t = useT();

  useEffect(() => {
    const unlisten = listen<RightsChanged>("channel-rights-changed", ({ payload }) => {
      const named = (key: string) => t(key).replace("{channel}", payload.title);
      showToast({
        key: TOAST_KEY,
        kind: payload.can_edit ? "ok" : "warn",
        duration: NOTICE_MS,
        message: payload.can_edit
          ? named("You can edit {channel} again.")
          : payload.after_refusal
            ? named("Telegram refused the edit: no rights in {channel} anymore.")
            : named("No rights to edit {channel} anymore."),
      });
    });
    return () => {
      void unlisten.then((off) => off());
    };
  }, [t]);
}

/** A stored no is re-checked on the spot: being made an admin five minutes ago
 *  is the usual reason for clicking a locked pencil. */
export function useEnsureEditable() {
  const t = useT();

  return useCallback(
    async (channel: Channel | undefined): Promise<boolean> => {
      // unknown is not a refusal: the backend checks before it spends anything
      if (!channel || channel.can_edit !== false) return true;

      const named = (key: string) => t(key).replace("{channel}", channel.title);
      showToast({
        key: TOAST_KEY,
        kind: "info",
        duration: 0,
        message: named("Checking the rights in {channel}…"),
      });

      try {
        const allowed = await channelsApi.refreshChannelRights(channel.id);
        showToast({
          key: TOAST_KEY,
          kind: allowed ? "ok" : "warn",
          duration: NOTICE_MS,
          message: allowed
            ? named("You can edit {channel} again.")
            : named("Still no rights to edit {channel}. Sync the channel once they change."),
        });
        return allowed;
      } catch (err) {
        showToast({
          key: TOAST_KEY,
          kind: "warn",
          duration: NOTICE_MS,
          message: `${named("Couldn't check the rights in {channel}:")} ${err}`,
        });
        return false;
      }
    },
    [t],
  );
}

import { useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { Channel } from "@/shared/api/types";
import { useT } from "@/shared/i18n";
import { showToast } from "@/shared/ui/Toast";
import { channelsApi } from "./api";

const TOAST_KEY = "channel-edit";

export function useEditChannel(opts: {
  refreshChannels: () => void;
  patchChannel: (channelId: string, patch: Partial<Channel>) => void;
}) {
  const { refreshChannels, patchChannel } = opts;
  const t = useT();

  const renameChannel = useCallback(
    async (channelId: string, title: string) => {
      patchChannel(channelId, { title });
      try {
        await channelsApi.renameChannel(channelId, title);
      } catch (err) {
        showToast({
          key: TOAST_KEY,
          kind: "warn",
          message: `${t("Couldn't rename the channel:")} ${err}`,
        });
      } finally {
        refreshChannels();
      }
    },
    [patchChannel, refreshChannels, t],
  );

  const changeChannelPhoto = useCallback(
    async (channelId: string) => {
      const picked = await open({
        multiple: false,
        title: t("Channel picture"),
        filters: [{ name: t("Images"), extensions: ["jpg", "jpeg", "png", "webp"] }],
      });
      if (typeof picked !== "string") return;
      patchChannel(channelId, { avatar_path: picked });
      try {
        await channelsApi.setChannelPhoto(channelId, picked);
        showToast({ key: TOAST_KEY, kind: "ok", message: t("Channel picture updated.") });
      } catch (err) {
        showToast({
          key: TOAST_KEY,
          kind: "warn",
          message: `${t("Couldn't change the picture:")} ${err}`,
        });
      } finally {
        refreshChannels();
      }
    },
    [patchChannel, refreshChannels, t],
  );

  return { renameChannel, changeChannelPhoto };
}

import { useCallback, useState } from "react";
import type { Channel } from "@/shared/api/types";
import type { View } from "@/app/view";
import { useT } from "@/shared/i18n";
import { showToast } from "@/shared/ui/Toast";
import { channelsApi } from "./api";

export function useDeleteChannel(opts: {
  channels: Channel[];
  view: View;
  setView: (v: View) => void;
  refreshChannels: () => void;
  refreshTracks: () => void;
}) {
  const { channels, view, setView, refreshChannels, refreshTracks } = opts;
  const t = useT();

  const [deleteChannelConfirm, setDeleteChannelConfirm] = useState<{
    channelId: string;
    channelTitle: string;
  } | null>(null);

  const handleDeleteChannel = useCallback(
    (channelId: string) => {
      const channel = channels.find((c) => c.id === channelId);
      setDeleteChannelConfirm({ channelId, channelTitle: channel?.title ?? "" });
    },
    [channels],
  );
  const cancelDeleteChannelConfirm = useCallback(() => setDeleteChannelConfirm(null), []);
  const finalizeDeleteChannel = useCallback(async () => {
    if (!deleteChannelConfirm) return;
    const { channelId } = deleteChannelConfirm;
    setDeleteChannelConfirm(null);
    try {
      await channelsApi.deleteChannel(channelId);
    } catch (err) {
      showToast({
        key: "channel-delete",
        kind: "warn",
        message: `${t("Couldn't delete the channel:")} ${err}`,
      });
      return;
    }
    if (view.kind === "channel" && view.channelId === channelId) {
      setView({ kind: "library" });
    }
    refreshChannels();
    refreshTracks();
  }, [deleteChannelConfirm, view, setView, refreshChannels, refreshTracks, t]);

  return {
    deleteChannelConfirm,
    handleDeleteChannel,
    cancelDeleteChannelConfirm,
    finalizeDeleteChannel,
  };
}

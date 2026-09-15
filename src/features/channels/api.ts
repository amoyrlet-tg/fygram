import { invoke } from "@tauri-apps/api/core";
import type { Channel, DownloadStats, SyncDepth, SyncStats } from "@/shared/api/types";

export const channelsApi = {
  listChannels: () => invoke<Channel[]>("list_channels"),
  addChannelByLink: (link: string) => invoke<Channel>("add_channel_by_link", { link }),
  syncChannel: (channelId: string, depth: SyncDepth) =>
    invoke<SyncStats>("sync_channel", { channelId, depth }),
  cancelSync: (channelId: string) => invoke<void>("cancel_sync", { channelId }),
  refreshChannelRights: (channelId: string) =>
    invoke<boolean>("refresh_channel_rights", { channelId }),
  downloadChannel: (channelId: string) => invoke<DownloadStats>("download_channel", { channelId }),
  renameChannel: (channelId: string, title: string) =>
    invoke<void>("rename_channel", { channelId, title }),
  setChannelPhoto: (channelId: string, path: string) =>
    invoke<void>("set_channel_photo", { channelId, path }),
  deleteChannel: (channelId: string) => invoke<void>("delete_channel", { channelId }),
};

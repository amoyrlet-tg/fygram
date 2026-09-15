import type { Channel, Playlist } from "@/shared/api/types";
import type { View } from "@/shared/lib/libraryView";
import { VARIOUS_ARTISTS_KEY } from "@/shared/lib/artists";

const KIND_LABELS = {
  library: "Library",
  channel: "Channel",
  playlist: "Playlist",
  artist: "Artist",
} satisfies Record<View["kind"], string>;

interface LibraryPresentation {
  title: string;
  kindLabel: string;
  channel: Channel | undefined;
  playlist: Playlist | undefined;
  downloadId: string | undefined;
}

export function libraryPresentation(
  view: View,
  channels: Channel[],
  playlists: Playlist[],
  isSearching: boolean,
  t: (key: string) => string,
): LibraryPresentation {
  const channel =
    view.kind === "channel" ? channels.find((entry) => entry.id === view.channelId) : undefined;
  const playlist =
    view.kind === "playlist" ? playlists.find((entry) => entry.id === view.playlistId) : undefined;
  let title: string;
  let downloadId: string | undefined;
  switch (view.kind) {
    case "library":
      title = t("ALL MUSIC");
      break;
    case "channel":
      title = channel?.title ?? t("Channel");
      downloadId = view.channelId;
      break;
    case "playlist":
      title = playlist?.name ?? t("Playlist");
      downloadId = view.playlistId;
      break;
    case "artist":
      title = view.artist === VARIOUS_ARTISTS_KEY ? t("Various artists") : view.artist;
      downloadId = `artist:${view.artist}`;
      break;
  }
  return {
    title: isSearching ? t("Search results") : title,
    kindLabel: isSearching ? t("Search") : t(KIND_LABELS[view.kind]),
    channel,
    playlist,
    downloadId,
  };
}

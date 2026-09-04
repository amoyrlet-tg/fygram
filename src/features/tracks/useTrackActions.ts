import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import type { Track } from "@/shared/api/types";
import { showToast } from "@/shared/ui/Toast";
import { tracksApi } from "./api";
import { refreshCover } from "./useTrackCover";

export function useTrackActions(opts: {
  setAllTracks: Dispatch<SetStateAction<Track[]>>;
  setPlaylistTracks: Dispatch<SetStateAction<Track[]>>;
  refreshTracks: () => void;
  t: (key: string) => string;
}) {
  const { setAllTracks, setPlaylistTracks, refreshTracks, t } = opts;

  const handleUpdateTrack = useCallback(
    async (
      trackId: string,
      fields: {
        title: string | null;
        artist: string | null;
        album: string | null;
        coverPath: string | null;
        /** Set when the message is a forward - see TrackEditDialog. */
        repost?: { caption: string; deleteOriginal: boolean };
      },
    ): Promise<boolean> => {
      try {
        const updated = fields.repost
          ? await tracksApi.repostTrack(trackId, { ...fields, ...fields.repost })
          : await tracksApi.updateTrack(trackId, fields);
        // the picture lives inside the file; drop the extracted copy
        if (fields.coverPath) refreshCover(trackId);
        setAllTracks((prev) => prev.map((tr) => (tr.id === trackId ? updated : tr)));
        setPlaylistTracks((prev) => prev.map((tr) => (tr.id === trackId ? updated : tr)));
        return true;
      } catch (err) {
        // the backend's message already says what to do about it
        showToast({
          key: "track-edit-failed",
          kind: "warn",
          duration: 7000,
          message: `${t(
            fields.repost
              ? "Couldn't replace the message on Telegram:"
              : "Couldn't rename the track on Telegram:",
          )} ${err}`,
        });
        return false;
      }
    },
    [setAllTracks, setPlaylistTracks, t],
  );

  const [mergingArtists, setMergingArtists] = useState(false);
  const handleMergeArtists = useCallback(() => {
    setMergingArtists(true);
    tracksApi
      .retagTracks()
      .then(() => refreshTracks())
      .catch((err) => alert(`${t("Couldn't merge the artists:")}\n${err}`))
      .finally(() => setMergingArtists(false));
  }, [refreshTracks, t]);

  return {
    handleUpdateTrack,
    mergingArtists,
    handleMergeArtists,
  };
}

import { useCallback, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useT } from "@/shared/i18n";
import { showToast } from "@/shared/ui/Toast";
import { playlistsApi } from "./api";

/**
 * Choosing and removing a playlist's picture. Self-contained: the backend
 * announces the change with `library-changed`.
 */
export function usePlaylistCover(playlistId: string | undefined) {
  const t = useT();
  const [busy, setBusy] = useState(false);

  const run = useCallback(async (work: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await work();
    } catch (err) {
      showToast({ key: "playlist-cover", kind: "warn", message: String(err) });
    } finally {
      setBusy(false);
    }
  }, []);

  const pick = useCallback(() => {
    if (!playlistId) return;
    void run(async () => {
      const picked = await open({
        multiple: false,
        // the same formats the cover writer can decode - see TrackEditDialog
        filters: [{ name: t("Images"), extensions: ["jpg", "jpeg", "png", "webp", "gif"] }],
      });
      if (typeof picked !== "string") return;
      await playlistsApi.setPlaylistCover(playlistId, picked);
    });
  }, [playlistId, run, t]);

  const remove = useCallback(() => {
    if (!playlistId) return;
    void run(() => playlistsApi.clearPlaylistCover(playlistId));
  }, [playlistId, run]);

  return { pick, remove, busy };
}

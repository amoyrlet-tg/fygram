import { useCallback, useEffect, useRef, useState } from "react";
import type { CachePreview, MediaRootInfo } from "@/shared/api/types";
import { storageApi } from "@/features/storage/api";
import { formatSize } from "@/shared/lib/format";
import { useT } from "@/shared/i18n";
import { showToast } from "@/shared/ui/Toast";
import { StorageHero } from "./StorageHero";
import { CacheAgeSlider } from "./CacheAgeSlider";
import "./CacheCleanup.css";

export function CacheCleanup() {
  const t = useT();
  const [root, setRoot] = useState<MediaRootInfo | null>(null);
  const [preview, setPreview] = useState<CachePreview | null>(null);
  const [busy, setBusy] = useState<"cleaning" | "saving-age" | null>(null);
  const [maxAge, setMaxAge] = useState<number>(30);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);
  const refresh = useCallback(async () => {
    setPreview(null);
    const [info, next, age] = await Promise.all([
      storageApi.getMediaRoot(),
      storageApi.previewCacheCleanup(),
      storageApi.getCacheMaxAge(),
    ]);
    setRoot(info);
    setPreview(next);
    setMaxAge(age);
  }, []);
  useEffect(() => {
    void refresh().catch((err) => setError(String(err)));
  }, [refresh]);

  const cleaning = busy === "cleaning";
  const freeable = preview ? preview.free_bytes + preview.orphan_bytes : 0;

  const clear = async () => {
    if (running.current || freeable === 0) return;
    running.current = true;
    setBusy("cleaning");
    setError(null);
    setPreview(null);
    try {
      const result = await storageApi.applyCacheCleanup();
      showToast({
        key: "cache-clean",
        kind: "ok",
        message: t("Freed {size}.").replace("{size}", formatSize(result.freed_bytes, t)),
      });
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      running.current = false;
      setBusy(null);
    }
  };

  const changeMaxAge = async (days: number) => {
    if (days === maxAge) return;
    setMaxAge(days);
    setBusy("saving-age");
    setError(null);
    try {
      await storageApi.setCacheMaxAge(days);
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  };

  const label = () => {
    if (cleaning) return t("Clearing…");
    if (!preview) return t("Clear cache");
    if (freeable === 0) return t("Nothing to clear");
    return `${t("Clear cache")} · ${formatSize(freeable, t)}`;
  };

  return (
    <div className="settings-body storage-page">
      <StorageHero root={root} cleaning={cleaning} />
      <button
        type="button"
        className={`btn btn-primary storage-clear${cleaning ? " is-working" : ""}`}
        onClick={() => void clear()}
        disabled={!!busy || freeable === 0}
      >
        {label()}
      </button>
      <CacheAgeSlider
        value={maxAge}
        disabled={!!busy}
        onChange={(days) => void changeMaxAge(days)}
      />
      {error && (
        <div className="auth-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

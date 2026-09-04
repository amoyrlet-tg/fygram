import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { open } from "@tauri-apps/plugin-dialog";
import duckclean from "@/assets/duckclean.tgs";
import type { CachePlan, CachePreview, Channel, MediaRootInfo, Playlist } from "@/shared/api/types";
import { channelsApi } from "@/features/channels/api";
import { playlistsApi } from "@/features/playlists/api";
import { storageApi } from "@/features/storage/api";
import { useT } from "@/shared/i18n";
import { useModalClose } from "@/shared/hooks/useModalClose";
import { useIsDesktopHost } from "@/platforms/host";
import { Lottie } from "@/shared/ui/Lottie";
import { CheckIcon, PlaylistIcon } from "@/shared/ui/icons";
import { UserAvatar } from "@/shared/ui/UserAvatar";
import { initials } from "@/shared/lib/initials";
import { showToast } from "@/shared/ui/Toast";
import "./CacheCleanup.css";

function formatBytes(t: (key: string) => string, bytes: number): string {
  if (bytes <= 0) return `0 ${t("MB")}`;
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(0)} ${t("MB")}`;
  return `${(mb / 1024).toFixed(2)} ${t("GB")}`;
}

type Busy = null | "cleaning" | "moving";

export function CacheCleanup({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { closing, requestClose } = useModalClose(onClose);
  const isDesktop = useIsDesktopHost();

  const [root, setRoot] = useState<MediaRootInfo | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [keepPlaylists, setKeepPlaylists] = useState<Set<string>>(new Set());
  const [keepChannels, setKeepChannels] = useState<Set<string>>(new Set());
  const [dropOrphans, setDropOrphans] = useState(true);
  const [preview, setPreview] = useState<CachePreview | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);

  const plan = useMemo<CachePlan>(
    () => ({
      keep_playlist_ids: [...keepPlaylists],
      keep_channel_ids: [...keepChannels],
      drop_orphans: dropOrphans,
    }),
    [keepPlaylists, keepChannels, dropOrphans],
  );

  const refresh = useCallback(() => {
    storageApi
      .getMediaRoot()
      .then(setRoot)
      .catch((err) => setError(String(err)));
  }, []);

  useEffect(() => {
    refresh();
    playlistsApi.listPlaylists().then(setPlaylists).catch(console.error);
    channelsApi.listChannels().then(setChannels).catch(console.error);
  }, [refresh]);

  useEffect(() => {
    if (busy) return;
    let cancelled = false;
    const id = window.setTimeout(() => {
      storageApi
        .previewCacheCleanup(plan)
        .then((next) => !cancelled && setPreview(next))
        .catch((err) => !cancelled && setError(String(err)));
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [plan, busy]);

  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  const chooseFolder = async () => {
    const picked = await open({
      directory: true,
      multiple: false,
      title: t("Where to keep music"),
    });
    if (typeof picked !== "string") return;
    setBusy("moving");
    setError(null);
    try {
      const res = await storageApi.setMediaRoot(picked, true);
      showToast({
        key: "storage-move",
        kind: "ok",
        message: t("Moved {n} file(s) to the new folder.").replace("{n}", String(res.moved)),
      });
      refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  };

  const runCleanup = async () => {
    setBusy("cleaning");
    setError(null);
    try {
      const res = await storageApi.applyCacheCleanup(plan);
      showToast({
        key: "cache-clean",
        kind: "ok",
        message: t("Freed {size}.").replace("{size}", formatBytes(t, res.freed_bytes)),
      });
      refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  };

  const nothingToDo =
    !preview || preview.free_bytes + (dropOrphans ? preview.orphan_bytes : 0) === 0;

  return createPortal(
    <div className={`modal-backdrop${closing ? " is-closing" : ""}`} onClick={requestClose}>
      <div
        className={`modal storage-modal${closing ? " is-closing" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{t("Storage")}</h2>
          <button className="icon-btn" onClick={requestClose} aria-label={t("Close")}>
            ×
          </button>
        </div>

        <div className="modal-body">
          {busy ? (
            <div className="storage-working">
              <Lottie animationData={duckclean} size={140} />
              <span>{busy === "cleaning" ? t("Clearing…") : t("Moving files…")}</span>
            </div>
          ) : (
            <>
              <section className="storage-section">
                <div className="storage-section-title">{t("Where music is kept")}</div>
                <div className="storage-path" title={root?.path}>
                  {root?.path ?? "…"}
                </div>
                <div className="muted">
                  {root
                    ? `${root.file_count} ${t("files")} · ${formatBytes(t, root.total_bytes)}`
                    : t("Loading cache size…")}
                </div>
                {/* Android has no directory picker, and no second place to put
                    a library either - the app's own storage is all there is. */}
                {isDesktop && (
                  <div className="storage-actions">
                    <button className="btn" onClick={chooseFolder}>
                      {t("Choose folder…")}
                    </button>
                  </div>
                )}
              </section>

              <section className="storage-section">
                <div className="storage-section-title">{t("Keep the audio for")}</div>
                <div className="storage-keep-grid">
                  <KeepColumn
                    label={t("Playlists")}
                    empty={t("No playlists yet.")}
                    allLabel={t("All")}
                    noneLabel={t("None")}
                    items={playlists.map((p) => ({
                      id: p.id,
                      name: p.name,
                      art: <PlaylistIcon size={14} />,
                    }))}
                    selected={keepPlaylists}
                    onToggle={(id) => setKeepPlaylists((prev) => toggle(prev, id))}
                    onAll={() => setKeepPlaylists(new Set(playlists.map((p) => p.id)))}
                    onNone={() => setKeepPlaylists(new Set())}
                  />
                  <KeepColumn
                    label={t("Channels")}
                    empty={t("No channels yet.")}
                    allLabel={t("All")}
                    noneLabel={t("None")}
                    items={channels.map((c) => ({
                      id: c.id,
                      name: c.title,
                      art: c.avatar_path ? (
                        <UserAvatar className="keep-row-avatar" path={c.avatar_path} />
                      ) : (
                        <span className="keep-row-avatar keep-row-avatar-fallback">
                          {initials(c.title)}
                        </span>
                      ),
                    }))}
                    selected={keepChannels}
                    onToggle={(id) => setKeepChannels((prev) => toggle(prev, id))}
                    onAll={() => setKeepChannels(new Set(channels.map((c) => c.id)))}
                    onNone={() => setKeepChannels(new Set())}
                  />
                </div>

                <button
                  type="button"
                  className={`keep-row storage-orphans${dropOrphans ? " is-on" : ""}`}
                  onClick={() => setDropOrphans((v) => !v)}
                >
                  <span className="keep-row-name">
                    {t("Also delete files that belong to no track")}
                  </span>
                  <span className="keep-row-check">{dropOrphans && <CheckIcon size={13} />}</span>
                </button>
              </section>

              {preview && (
                <div className="storage-preview">
                  <div className="storage-preview-headline">
                    <strong>{formatBytes(t, preview.free_bytes)}</strong> {t("will be freed")} ·{" "}
                    {preview.free_tracks} {t("songs")}
                  </div>
                  <div className="muted">
                    {t("Staying")}: {formatBytes(t, preview.keep_bytes)} · {preview.keep_tracks}{" "}
                    {t("songs")}
                  </div>
                  {dropOrphans && preview.orphan_files > 0 && (
                    <div className="muted">
                      {t("Leftover files")}: {preview.orphan_files} ·{" "}
                      {formatBytes(t, preview.orphan_bytes)}
                    </div>
                  )}
                </div>
              )}

              <p className="muted">
                {t(
                  "Songs stay in your playlists — only the audio goes, and it downloads again the next time you play it.",
                )}
              </p>
            </>
          )}

          {error && <div className="auth-error">{error}</div>}
        </div>

        <div className="modal-footer">
          <button className="btn btn-primary" disabled={!!busy || nothingToDo} onClick={runCleanup}>
            {busy === "cleaning" ? t("Clearing…") : t("Clear")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function KeepColumn({
  label,
  empty,
  allLabel,
  noneLabel,
  items,
  selected,
  onToggle,
  onAll,
  onNone,
}: {
  label: string;
  empty: string;
  allLabel: string;
  noneLabel: string;
  items: { id: string; name: string; art: React.ReactNode }[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onAll: () => void;
  onNone: () => void;
}) {
  return (
    <div className="storage-keep-column">
      <div className="storage-keep-head">
        <span className="storage-keep-label">
          {label}
          {selected.size > 0 && <em className="storage-keep-count">{selected.size}</em>}
        </span>
        {items.length > 0 && (
          <span className="storage-keep-bulk">
            <button type="button" onClick={onAll}>
              {allLabel}
            </button>
            <button type="button" onClick={onNone}>
              {noneLabel}
            </button>
          </span>
        )}
      </div>
      <div className="storage-keep-list">
        {items.length === 0 && <div className="empty-hint">{empty}</div>}
        {items.map((item) => {
          const on = selected.has(item.id);
          return (
            <button
              key={item.id}
              type="button"
              className={`keep-row${on ? " is-on" : ""}`}
              onClick={() => onToggle(item.id)}
              aria-pressed={on}
            >
              <span className="keep-row-art">{item.art}</span>
              <span className="keep-row-name truncate">{item.name}</span>
              <span className="keep-row-check">{on && <CheckIcon size={13} />}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

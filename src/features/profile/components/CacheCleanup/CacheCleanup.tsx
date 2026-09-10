import { useCallback, useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import duckclean from "@/assets/duckclean.tgs";
import type {
  CachePlan,
  CachePreview,
  Channel,
  MediaRootInfo,
  Playlist,
  Track,
} from "@/shared/api/types";
import { channelsApi } from "@/features/channels/api";
import { playlistsApi } from "@/features/playlists/api";
import { storageApi } from "@/features/storage/api";
import { tracksApi } from "@/features/tracks/api";
import { useArtists } from "@/features/artists/useArtists";
import { VARIOUS_ARTISTS_KEY } from "@/shared/lib/artists";
import { avatarGradientCss } from "@/shared/lib/avatarColor";
import { formatSize } from "@/shared/lib/format";
import { fuzzyTextMatches } from "@/shared/lib/fuzzy";
import { SearchBox } from "@/features/tracks/components/SearchBox";
import { useT } from "@/shared/i18n";
import { Lottie } from "@/shared/ui/Lottie";
import { CheckIcon, PlaylistIcon } from "@/shared/ui/icons";
import { UserAvatar } from "@/shared/ui/UserAvatar";
import { initials } from "@/shared/lib/initials";
import { showToast } from "@/shared/ui/Toast";
import { StorageHero } from "./StorageHero";
import "./CacheCleanup.css";

type Busy = null | "cleaning" | "moving";

export function CacheCleanup() {
  const t = useT();

  const [root, setRoot] = useState<MediaRootInfo | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlistTracks, setPlaylistTracks] = useState<Record<string, Track[]>>({});
  const [sizes, setSizes] = useState<Record<string, number>>({});
  const [keepPlaylists, setKeepPlaylists] = useState<Set<string>>(new Set());
  const [keepChannels, setKeepChannels] = useState<Set<string>>(new Set());
  const [keepArtists, setKeepArtists] = useState<Set<string>>(new Set());
  const [dropOrphans, setDropOrphans] = useState(true);
  const [preview, setPreview] = useState<CachePreview | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);

  const { artists, tracksByArtist } = useArtists(tracks, null);
  const keepTrackIds = useMemo(() => {
    if (keepArtists.size === 0) return [];
    const ids = new Set<string>();
    for (const artist of keepArtists) {
      for (const track of tracksByArtist.get(artist) ?? []) ids.add(track.id);
    }
    return [...ids];
  }, [keepArtists, tracksByArtist]);

  const plan = useMemo<CachePlan>(
    () => ({
      keep_playlist_ids: [...keepPlaylists],
      keep_channel_ids: [...keepChannels],
      keep_track_ids: keepTrackIds,
      drop_orphans: dropOrphans,
    }),
    [keepPlaylists, keepChannels, keepTrackIds, dropOrphans],
  );

  const refresh = useCallback(() => {
    storageApi
      .getMediaRoot()
      .then(setRoot)
      .catch((err) => setError(String(err)));
    storageApi.fileSizes().then(setSizes).catch(console.error);
  }, []);

  useEffect(() => {
    refresh();
    channelsApi.listChannels().then(setChannels).catch(console.error);
    tracksApi.listTracks().then(setTracks).catch(console.error);
    playlistsApi
      .listPlaylists()
      .then(async (list) => {
        setPlaylists(list);
        const pairs = await Promise.all(
          list.map(
            async (p) => [p.id, await playlistsApi.listPlaylistTracks(p.id)] as [string, Track[]],
          ),
        );
        setPlaylistTracks(Object.fromEntries(pairs));
      })
      .catch(console.error);
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
  const withAll = (set: Set<string>, ids: string[]) => new Set([...set, ...ids]);
  const without = (set: Set<string>, ids: string[]) => {
    const next = new Set(set);
    for (const id of ids) next.delete(id);
    return next;
  };

  const weigh = useCallback(
    (list: Track[]) => {
      let bytes = 0;
      const seen = new Set<string>();
      for (const track of list) {
        if (!track.file_path || seen.has(track.file_path)) continue;
        seen.add(track.file_path);
        bytes += sizes[track.file_path] ?? 0;
      }
      return bytes;
    },
    [sizes],
  );

  const downloaded = useCallback(
    (list: Track[]) =>
      list.some((track) => !!track.file_path && sizes[track.file_path] !== undefined),
    [sizes],
  );

  const tracksByChannel = useMemo(() => {
    const map = new Map<string, Track[]>();
    for (const track of tracks) {
      const list = map.get(track.channel_id);
      if (list) list.push(track);
      else map.set(track.channel_id, [track]);
    }
    return map;
  }, [tracks]);

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
        message: t("Freed {size}.").replace("{size}", formatSize(res.freed_bytes, t)),
      });
      refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  };

  const playlistItems = useMemo<KeepItem[]>(
    () =>
      playlists
        .map((p) => ({
          id: p.id,
          name: p.name,
          bytes: weigh(playlistTracks[p.id] ?? []),
          art: <PlaylistIcon size={14} />,
        }))
        .sort((a, b) => b.bytes - a.bytes),
    [playlists, playlistTracks, weigh],
  );

  const channelItems = useMemo<KeepItem[]>(
    () =>
      channels
        .map((c) => ({
          id: c.id,
          name: c.title,
          bytes: weigh(tracksByChannel.get(c.id) ?? []),
          art: c.avatar_path ? (
            <UserAvatar
              className="keep-row-avatar"
              path={c.avatar_path}
              fallback={
                <span className="keep-row-avatar keep-row-avatar-fallback">
                  {initials(c.title)}
                </span>
              }
            />
          ) : (
            <span className="keep-row-avatar keep-row-avatar-fallback">{initials(c.title)}</span>
          ),
        }))
        .sort((a, b) => b.bytes - a.bytes),
    [channels, tracksByChannel, weigh],
  );

  const artistItems = useMemo<KeepItem[]>(
    () =>
      artists
        .filter((a) => a.name !== VARIOUS_ARTISTS_KEY)
        .filter((a) => downloaded(tracksByArtist.get(a.name) ?? []))
        .map((a) => ({
          id: a.name,
          name: a.name,
          bytes: weigh(tracksByArtist.get(a.name) ?? []),
          art: (
            <span
              className="keep-row-avatar keep-row-avatar-fallback keep-row-letter"
              style={{ background: avatarGradientCss(a.name) }}
            >
              {initials(a.name)}
            </span>
          ),
        }))
        .sort((a, b) => b.bytes - a.bytes),
    [artists, tracksByArtist, weigh, downloaded],
  );

  const freeing = preview ? preview.free_bytes + (dropOrphans ? preview.orphan_bytes : 0) : 0;
  const nothingToDo = !preview || freeing === 0;

  return (
    <div className="settings-body storage-page">
      {busy ? (
        <div className="storage-working">
          <Lottie animationData={duckclean} size={140} />
          <span>{busy === "cleaning" ? t("Clearing…") : t("Moving files…")}</span>
        </div>
      ) : (
        <>
          <StorageHero root={root} />

          <div className="storage-path-row">
            <span className="storage-path-text truncate" title={root?.path}>
              {root?.path ?? "…"}
            </span>
            <button type="button" className="storage-path-action" onClick={chooseFolder}>
              {t("Choose folder…")}
            </button>
          </div>

          <section className="storage-section">
            <div className="storage-section-title">{t("Keep the audio for")}</div>
            <div className="storage-keep-stack">
              <KeepColumn
                label={t("Playlists")}
                empty={t("No playlists yet.")}
                searchPlaceholder={t("Search playlists…")}
                items={playlistItems}
                selected={keepPlaylists}
                format={(bytes) => formatSize(bytes, t)}
                onToggle={(id) => setKeepPlaylists((prev) => toggle(prev, id))}
                onAll={(ids) => setKeepPlaylists((prev) => withAll(prev, ids))}
                onNone={(ids) => setKeepPlaylists((prev) => without(prev, ids))}
              />
              <KeepColumn
                label={t("Channels")}
                empty={t("No channels yet.")}
                searchPlaceholder={t("Search channels…")}
                items={channelItems}
                selected={keepChannels}
                format={(bytes) => formatSize(bytes, t)}
                onToggle={(id) => setKeepChannels((prev) => toggle(prev, id))}
                onAll={(ids) => setKeepChannels((prev) => withAll(prev, ids))}
                onNone={(ids) => setKeepChannels((prev) => without(prev, ids))}
              />
              <KeepColumn
                label={t("Artists")}
                empty={t("No artists yet.")}
                searchPlaceholder={t("Search artists…")}
                items={artistItems}
                selected={keepArtists}
                format={(bytes) => formatSize(bytes, t)}
                onToggle={(name) => setKeepArtists((prev) => toggle(prev, name))}
                onAll={(ids) => setKeepArtists((prev) => withAll(prev, ids))}
                onNone={(ids) => setKeepArtists((prev) => without(prev, ids))}
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
            <div className="storage-balance">
              <div className="storage-balance-bar">
                <span
                  className="storage-balance-part is-keep"
                  style={{ flexGrow: Math.max(preview.keep_bytes, 1) }}
                />
                <span
                  className="storage-balance-part is-free"
                  style={{ flexGrow: Math.max(freeing, 1) }}
                />
              </div>
              <div className="storage-balance-legend">
                <span className="storage-balance-side">
                  <i className="storage-balance-dot is-keep" />
                  {t("Keeping")} {formatSize(preview.keep_bytes, t)}
                </span>
                <span className="storage-balance-side">
                  <i className="storage-balance-dot is-free" />
                  {t("Freeing")} {formatSize(freeing, t)}
                </span>
              </div>
            </div>
          )}

          <p className="storage-note">
            {t(
              "Songs stay in your playlists — only the audio goes, and it downloads again the next time you play it.",
            )}
          </p>
        </>
      )}

      {error && <div className="auth-error">{error}</div>}

      <button
        className="btn btn-primary storage-clear"
        disabled={!!busy || nothingToDo}
        onClick={runCleanup}
      >
        {busy === "cleaning" ? t("Clearing…") : t("Clear")}
        {preview && !nothingToDo && (
          <span className="storage-clear-size">{formatSize(freeing, t)}</span>
        )}
      </button>
    </div>
  );
}

interface KeepItem {
  id: string;
  name: string;
  art: React.ReactNode;
  bytes: number;
}

function KeepColumn({
  label,
  empty,
  searchPlaceholder,
  items,
  selected,
  format,
  onToggle,
  onAll,
  onNone,
}: {
  label: string;
  empty: string;
  searchPlaceholder: string;
  items: KeepItem[];
  selected: Set<string>;
  format: (bytes: number) => string;
  onToggle: (id: string) => void;
  onAll: (ids: string[]) => void;
  onNone: (ids: string[]) => void;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const searchable = items.length > 4;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => fuzzyTextMatches(item.name.toLowerCase(), q));
  }, [items, query]);
  const shownIds = shown.map((item) => item.id);

  return (
    <div className="storage-keep-column">
      <div className="storage-keep-head">
        <span className="storage-keep-label">
          {label}
          {selected.size > 0 && <em className="storage-keep-count">{selected.size}</em>}
        </span>
        {items.length > 0 && (
          <span className="storage-keep-bulk">
            <button type="button" onClick={() => onAll(shownIds)}>
              {t("All")}
            </button>
            <button type="button" onClick={() => onNone(shownIds)}>
              {t("None")}
            </button>
          </span>
        )}
      </div>

      {searchable && (
        <SearchBox
          className="keep-search"
          value={query}
          onChange={setQuery}
          placeholder={searchPlaceholder}
          iconSize={15}
        />
      )}

      <div className="storage-keep-list">
        {items.length === 0 && <div className="empty-hint">{empty}</div>}
        {items.length > 0 && shown.length === 0 && (
          <div className="empty-hint">{t("No matches.")}</div>
        )}
        {shown.map((item) => {
          const on = selected.has(item.id);
          return (
            <button
              key={item.id}
              type="button"
              className={`keep-row${on ? " is-on" : ""}`}
              onClick={() => onToggle(item.id)}
              aria-pressed={on}
              title={item.name}
            >
              <span className="keep-row-art">{item.art}</span>
              <span className="keep-row-name truncate">{item.name}</span>
              {item.bytes > 0 && <span className="keep-row-size">{format(item.bytes)}</span>}
              <span className="keep-row-check">{on && <CheckIcon size={13} />}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

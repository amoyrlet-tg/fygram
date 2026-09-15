import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/shared/i18n";
import {
  PlayIcon,
  PauseIcon,
  ShuffleIcon,
  RefreshIcon,
  StopIcon,
  DownloadIcon,
  EditIcon,
  TrashIcon,
} from "@/shared/ui/icons";

const MENU_WIDTH = 210;
const MENU_GAP = 6;
const MENU_ITEM_H = 40;
const MENU_PADDING = 10;
const VIEWPORT_MARGIN = 8;

export interface HeaderSubject {
  sync?: { busy: boolean; run: () => void };
  download?: () => void;
  rename?: { label: string; run: () => void };
  remove?: { label: string; run: () => void };
}

type MenuItem = { label: string; icon: ReactNode; danger?: boolean; run: () => void };

export function HeaderActions({
  playing,
  disabled,
  downloading,
  onPlay,
  onShuffle,
  subject,
}: {
  playing: boolean;
  disabled: boolean;
  downloading: boolean;
  onPlay: () => void;
  onShuffle: () => void;
  subject: HeaderSubject;
}) {
  const t = useT();
  const moreRef = useRef<HTMLButtonElement>(null);
  const [menuAt, setMenuAt] = useState<{ left: number; top: number } | null>(null);

  const items: MenuItem[] = [];
  if (subject.rename) {
    items.push({
      label: subject.rename.label,
      icon: <EditIcon size={18} />,
      run: subject.rename.run,
    });
  }
  if (subject.remove) {
    items.push({
      label: subject.remove.label,
      icon: <TrashIcon size={18} />,
      danger: true,
      run: subject.remove.run,
    });
  }

  useEffect(() => {
    if (!menuAt) return;
    const dismiss = () => setMenuAt(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuAt(null);
      moreRef.current?.focus();
    };
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", dismiss, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuAt]);

  const toggleMenu = () => {
    const rect = menuAt ? null : moreRef.current?.getBoundingClientRect();
    if (!rect) {
      setMenuAt(null);
      return;
    }
    const height = items.length * MENU_ITEM_H + MENU_PADDING;
    const below = rect.bottom + MENU_GAP;
    setMenuAt({
      left: Math.max(
        VIEWPORT_MARGIN,
        Math.min(rect.left, window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN),
      ),
      top:
        below + height <= window.innerHeight - VIEWPORT_MARGIN
          ? below
          : Math.max(VIEWPORT_MARGIN, rect.top - MENU_GAP - height),
    });
  };

  const syncLabel = t(subject.sync?.busy ? "Stop sync" : "Sync now");
  const downloadLabel = t(downloading ? "Downloading…" : "Download all");

  return (
    <div className="channel-hero-actions">
      <button
        className="hero-play-btn"
        disabled={disabled}
        onClick={onPlay}
        title={t(playing ? "Pause" : "Play")}
        aria-label={t(playing ? "Pause" : "Play")}
      >
        {playing ? <PauseIcon size={22} /> : <PlayIcon size={22} />}
      </button>
      <button
        className="hero-shuffle-btn"
        disabled={disabled}
        onClick={onShuffle}
        title={t("Shuffle")}
        aria-label={t("Shuffle")}
      >
        <ShuffleIcon size={19} />
      </button>
      {subject.sync && (
        <button
          className="hero-shuffle-btn hero-labeled"
          onClick={subject.sync.run}
          title={syncLabel}
          aria-label={syncLabel}
        >
          {subject.sync.busy ? <StopIcon size={18} /> : <RefreshIcon size={18} />}
          <span>{syncLabel}</span>
        </button>
      )}
      {subject.download && (
        <button
          className="hero-shuffle-btn hero-labeled"
          disabled={disabled || downloading}
          onClick={subject.download}
          title={downloadLabel}
          aria-label={downloadLabel}
        >
          <DownloadIcon size={18} />
          <span>{downloadLabel}</span>
        </button>
      )}
      {items.length > 0 && (
        <button
          ref={moreRef}
          className="hero-shuffle-btn"
          aria-haspopup="menu"
          aria-expanded={!!menuAt}
          onClick={toggleMenu}
          title={t("More actions")}
          aria-label={t("More actions")}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="5" cy="12" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="19" cy="12" r="2" />
          </svg>
        </button>
      )}
      {menuAt &&
        createPortal(
          <>
            <div className="hero-more-backdrop" onClick={() => setMenuAt(null)} />
            <div
              className="hero-more-items"
              role="menu"
              style={{ left: menuAt.left, top: menuAt.top }}
            >
              {items.map((item) => (
                <button
                  key={item.label}
                  role="menuitem"
                  className={item.danger ? "is-danger" : undefined}
                  onClick={() => {
                    setMenuAt(null);
                    item.run();
                  }}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}

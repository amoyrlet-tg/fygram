import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/shared/i18n";
import { useSettings } from "@/app/providers/SettingsProvider";
import { requestRelogin, useSessionInvalid } from "@/features/auth/sessionStatus";
import { useLogout } from "@/features/auth/useLogout";
import { CacheCleanup } from "@/features/profile/components/CacheCleanup";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { LanguageSwitcher } from "@/shared/ui/LanguageSwitcher";
import { AccentSwatches, ThemeCards } from "@/features/profile/components/ThemePicker";
import { ProfileCover } from "@/features/profile/components/ProfileCover";
import { ProfileMusicBar } from "@/features/profile/components/ProfileMusicBar";
import { ProfileMusicDialog } from "@/features/profile/components/ProfileMusicDialog";
import { useProfileMusic } from "@/features/profile/useProfileMusic";
import { AudioOutput } from "@/features/player/components/AudioOutput";
import { TgIcon } from "@/shared/ui/TgIcon";
import { ArrowLeftIcon } from "@/shared/ui/icons";
import "./ProfileMenu.css";

type Page = "root" | "storage";

const PAGE_SLIDE_MS = 260;
const DIALOG_MARGIN = 64;

export function ProfileMenu() {
  const {
    currentUser,
    theme,
    setTheme,
    accent,
    setAccent,
    profileSyncEnabled,
    toggleProfileSync,
    autostartEnabled,
    toggleAutostart,
    ducking,
    toggleDucking,
    ecoMode,
    toggleEcoMode,
    ecoKeepsArt,
    toggleEcoKeepsArt,
  } = useSettings();
  const t = useT();
  const sessionInvalid = useSessionInvalid();

  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<Page>("root");
  const [sliding, setSliding] = useState(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const paneRefs = useRef<Record<Page, HTMLDivElement | null>>({ root: null, storage: null });
  const slideFrom = useRef<Page>("root");
  const [syncAsk, setSyncAsk] = useState(false);
  const {
    logoutConfirmStep,
    handleLogout,
    advanceLogoutConfirm,
    cancelLogoutConfirm,
    finalizeLogout,
  } = useLogout();
  const [closing, setClosing] = useState(false);
  const [entering, setEntering] = useState(false);
  const headRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!entering) return;
    const done = window.setTimeout(() => setEntering(false), 240);
    return () => window.clearTimeout(done);
  }, [entering]);

  const finishClose = () => {
    setOpen(false);
    setClosing(false);
    setPage("root");
    setSliding(false);
  };

  const goTo = (next: Page) => {
    if (next === page || sliding) return;
    const viewport = viewportRef.current;
    if (!viewport) {
      setPage(next);
      return;
    }
    viewport.style.flex = "none";
    viewport.style.height = `${viewport.offsetHeight}px`;
    slideFrom.current = page;
    setSliding(true);
    requestAnimationFrame(() => setPage(next));
  };

  useLayoutEffect(() => {
    if (!sliding || page === slideFrom.current) return;
    const viewport = viewportRef.current;
    const content = paneRefs.current[page]?.firstElementChild;
    if (!viewport || !(content instanceof HTMLElement)) return;
    const room = window.innerHeight - DIALOG_MARGIN - (headRef.current?.offsetHeight ?? 0);
    viewport.style.height = `${Math.min(content.scrollHeight, room)}px`;
  }, [sliding, page]);

  const settle = () => {
    setSliding(false);
    const viewport = viewportRef.current;
    if (viewport) {
      viewport.style.height = "";
      viewport.style.flex = "";
    }
  };

  useEffect(() => {
    if (!sliding) return;
    const id = window.setTimeout(settle, PAGE_SLIDE_MS + 120);
    return () => window.clearTimeout(id);
  }, [sliding]);

  const requestClose = () => {
    if (!open || closing) return;
    if (ecoMode) finishClose();
    else setClosing(true);
  };

  const music = useProfileMusic();
  const [musicOpen, setMusicOpen] = useState(false);

  return (
    <>
      <ProfileCover
        user={currentUser}
        dark={theme === "dark"}
        alert={sessionInvalid}
        action={
          <button
            className="profile-cover-settings-btn"
            onClick={() => {
              setClosing(false);
              setEntering(true);
              setOpen(true);
            }}
            aria-label={t("Settings")}
            title={t("Settings")}
          >
            <TgIcon name="settings" size={18} />
          </button>
        }
        music={
          <ProfileMusicBar
            tracks={music.tracks}
            loading={music.loading}
            onOpen={() => setMusicOpen(true)}
          />
        }
      />

      {musicOpen && (
        <ProfileMusicDialog
          tracks={music.tracks}
          loading={music.loading}
          onAdd={music.add}
          onRemove={music.remove}
          onMove={music.move}
          onRefresh={music.refresh}
          nowPlayingSync={profileSyncEnabled}
          onNowPlayingSync={(next) => {
            if (next) setSyncAsk(true);
            else toggleProfileSync(false);
          }}
          onClose={() => setMusicOpen(false)}
        />
      )}

      {open &&
        createPortal(
          <>
            <div
              className={`settings-backdrop${closing ? " is-closing" : ""}${entering ? " is-entering" : ""}`}
              onClick={requestClose}
            />
            <div
              className={`settings-dialog${closing ? " is-closing" : ""}${entering ? " is-entering" : ""}`}
              role="dialog"
              aria-modal="true"
              aria-label={t("Settings")}
              onAnimationEnd={() => {
                if (closing) finishClose();
              }}
            >
              <header className="settings-head" ref={headRef}>
                {page !== "root" && (
                  <button
                    className="settings-back"
                    onClick={() => goTo("root")}
                    aria-label={t("Back")}
                    title={t("Back")}
                  >
                    <ArrowLeftIcon size={19} />
                  </button>
                )}
                <h2 className="settings-title">{page === "root" ? t("Settings") : t("Storage")}</h2>
                <button className="settings-close" onClick={requestClose} aria-label={t("Close")}>
                  <TgIcon name="close" size={20} />
                </button>
              </header>

              <div className="settings-pages" ref={viewportRef}>
                <div
                  className={`settings-track${sliding ? " is-sliding" : ""}${
                    sliding && page === "storage" ? " is-second" : ""
                  }`}
                  onTransitionEnd={(e) => {
                    if (e.propertyName === "transform" && e.target === e.currentTarget) settle();
                  }}
                >
                  {(page === "root" || sliding) && (
                    <div
                      className="settings-pane"
                      ref={(el) => {
                        paneRefs.current.root = el;
                      }}
                      aria-hidden={page !== "root"}
                    >
                      <div className="settings-body">
                        {sessionInvalid && (
                          <div className="settings-alert">
                            <div className="settings-alert-text">
                              <strong>{t("Telegram session expired")}</strong>
                              <span>
                                {t(
                                  "Downloaded music keeps playing. Log in again to sync and add new tracks.",
                                )}
                              </span>
                            </div>
                            <button
                              className="btn btn-primary settings-alert-btn"
                              onClick={() => {
                                requestClose();
                                requestRelogin();
                              }}
                            >
                              {t("Log in again")}
                            </button>
                          </div>
                        )}

                        <div className="settings-list">
                          <div className="settings-group">
                            <div className="settings-row is-stacked settings-appearance">
                              <span className="settings-heading">{t("Themes")}</span>
                              <ThemeCards theme={theme} onSetTheme={setTheme} />
                              <AccentSwatches accent={accent} onSetAccent={setAccent} />
                            </div>
                            <div className="settings-row settings-language">
                              <span className="settings-row-title">Language</span>
                              <LanguageSwitcher />
                            </div>
                          </div>

                          <div className="settings-group">
                            <ToggleRow
                              icon={<TgIcon name="music" size={22} />}
                              title={t("Sync with profile")}
                              checked={profileSyncEnabled}
                              onChange={(next) => {
                                if (next) setSyncAsk(true);
                                else toggleProfileSync(false);
                              }}
                            />
                            <ToggleRow
                              icon={<TgIcon name="volume" size={22} />}
                              title={t("Turn down while Telegram is playing")}
                              note={
                                ducking.supported
                                  ? undefined
                                  : t("This system cannot tell which app is making sound")
                              }
                              checked={ducking.enabled}
                              disabled={!ducking.supported}
                              onChange={toggleDucking}
                            />
                            <AudioOutput />
                          </div>

                          <div className="settings-group">
                            <ToggleRow
                              icon={<TgIcon name="newWindow" size={22} />}
                              title={t("Launch at startup")}
                              checked={autostartEnabled}
                              onChange={toggleAutostart}
                            />
                          </div>

                          <div className="settings-group">
                            <SettingsRow
                              icon={<TgIcon name="storage" size={22} />}
                              title={t("Free up space…")}
                              onClick={() => goTo("storage")}
                            />
                            <ToggleRow
                              icon={<TgIcon name="eco" size={22} />}
                              title={t("Eco mode")}
                              note={t("No blur, no animation — uses far less memory")}
                              checked={ecoMode}
                              onChange={toggleEcoMode}
                            />
                            {ecoMode && (
                              <ToggleRow
                                nested
                                icon={<TgIcon name="artwork" size={20} />}
                                title={t("Keep the artwork")}
                                note={t(
                                  "Covers are the costly half — initials stand in without them",
                                )}
                                checked={ecoKeepsArt}
                                onChange={toggleEcoKeepsArt}
                              />
                            )}
                            <SettingsRow
                              icon={<TgIcon name="leave" size={22} />}
                              title={t("Log out…")}
                              danger
                              onClick={() => {
                                requestClose();
                                handleLogout();
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  {(page === "storage" || sliding) && (
                    <div
                      className="settings-pane"
                      ref={(el) => {
                        paneRefs.current.storage = el;
                      }}
                      aria-hidden={page !== "storage"}
                    >
                      <CacheCleanup />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>,
          document.body,
        )}

      {syncAsk && (
        <ConfirmDialog
          title={t("Show what is playing in your profile?")}
          message={t(
            "Every track you have added to your profile will be removed. Only the one playing stays.",
          )}
          confirmLabel={t("Turn on")}
          onConfirm={() => {
            setSyncAsk(false);
            toggleProfileSync(true);
          }}
          onCancel={() => setSyncAsk(false)}
        />
      )}

      {logoutConfirmStep === 1 && (
        <ConfirmDialog
          title={t("Log out?")}
          message={t(
            "This deletes the Telegram session and every local file - library, downloaded audio, cached avatar.",
          )}
          confirmLabel={t("Log out")}
          danger
          onConfirm={advanceLogoutConfirm}
          onCancel={cancelLogoutConfirm}
        />
      )}
      {logoutConfirmStep === 2 && (
        <ConfirmDialog
          title={t("This can't be undone")}
          message={t("Delete everything and log out?")}
          confirmLabel={t("Log out and delete everything")}
          danger
          onConfirm={finalizeLogout}
          onCancel={cancelLogoutConfirm}
        />
      )}
    </>
  );
}

function SettingsRow({
  icon,
  title,
  onClick,
  danger,
}: {
  icon: ReactNode;
  title: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button className={`settings-row settings-link${danger ? " is-danger" : ""}`} onClick={onClick}>
      <span className="settings-row-icon">{icon}</span>
      <span className="settings-row-text">
        <span className="settings-row-title">{title}</span>
      </span>
      <TgIcon name="submenuArrow" size={16} className="settings-row-chevron" />
    </button>
  );
}

function ToggleRow({
  icon,
  title,
  note,
  checked,
  onChange,
  disabled,
  nested,
}: {
  icon?: ReactNode;
  title: string;
  note?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  nested?: boolean;
}) {
  return (
    <label className={`settings-row${disabled ? " is-disabled" : ""}${nested ? " is-nested" : ""}`}>
      <span className="settings-row-icon">{icon}</span>
      <span className="settings-row-text">
        <span className="settings-row-title">{title}</span>
        {note && <span className="settings-row-note">{note}</span>}
      </span>
      <span className="toggle">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="toggle-track" />
      </span>
    </label>
  );
}

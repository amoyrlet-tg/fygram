import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { openUrl } from "@tauri-apps/plugin-opener";
import { UserAvatar } from "@/shared/ui/UserAvatar";
import { initials } from "@/shared/lib/initials";
import { avatarGradientCss } from "@/shared/lib/avatarColor";
import { useT } from "@/shared/i18n";
import { useSettings } from "@/app/providers/SettingsProvider";
import { requestRelogin, useSessionInvalid } from "@/features/auth/sessionStatus";
import { useLogout } from "@/features/auth/useLogout";
import { BroadcastSettings } from "@/features/broadcast/components/BroadcastSettings";
import { CacheCleanup } from "@/features/profile/components/CacheCleanup";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { useIsNarrow } from "@/shared/hooks/useNarrowLayout";
import { useIsDesktopHost } from "@/platforms/host";
import { LanguageSwitcher } from "@/shared/ui/LanguageSwitcher";
import { ThemePicker } from "@/features/profile/components/ThemePicker";
import { EmojiStatus } from "@/features/profile/components/EmojiStatus";
import { BroadcastIcon, CheckIcon, ChevronDownIcon, CopyIcon } from "@/shared/ui/icons";
import "./ProfileMenu.css";

const NAME_MAX_CHARS = 7;

const MENU_WIDTH = 460;
const EDGE_MARGIN = 16;
const GAP = 10;
const MIN_SPACE_BELOW = 260;

interface MenuPos {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  originX: "left" | "right";
  originY: "top" | "bottom";
}

export function ProfileMenu({ className }: { className?: string }) {
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
    fullscreenEnabled,
    toggleFullscreen,
    ducking,
    toggleDucking,
  } = useSettings();
  const t = useT();
  const isNarrow = useIsNarrow();
  // a desktop notion, not a width one - see src/platforms/README.md
  const isDesktop = useIsDesktopHost();
  const sessionInvalid = useSessionInvalid();
  const displayName = currentUser
    ? currentUser.first_name.trim().length > NAME_MAX_CHARS
      ? `${currentUser.first_name.trim().slice(0, NAME_MAX_CHARS)}…`
      : currentUser.first_name.trim()
    : "";
  const fullName = currentUser
    ? `${currentUser.first_name}${currentUser.last_name ? " " + currentUser.last_name : ""}`.trim()
    : "";
  const userSeed = currentUser ? String(currentUser.id) : "user";
  const [copied, setCopied] = useState(false);

  const [open, setOpen] = useState(false);
  const [cacheCleanupOpen, setCacheCleanupOpen] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const {
    logoutConfirmStep,
    handleLogout,
    advanceLogoutConfirm,
    cancelLogoutConfirm,
    finalizeLogout,
  } = useLogout();
  const [closing, setClosing] = useState(false);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const chipRef = useRef<HTMLButtonElement>(null);

  const openMenu = () => {
    const rect = chipRef.current?.getBoundingClientRect();
    if (isNarrow) {
      setPos({ top: 0, left: 0, right: 0, originX: "right", originY: "top" });
    } else if (rect) {
      const spaceRight = window.innerWidth - rect.left;
      const originX: "left" | "right" = spaceRight >= MENU_WIDTH + EDGE_MARGIN ? "left" : "right";
      const rawLeft = originX === "left" ? rect.left : rect.right - MENU_WIDTH;
      const left = Math.max(
        EDGE_MARGIN,
        Math.min(rawLeft, window.innerWidth - MENU_WIDTH - EDGE_MARGIN),
      );
      const spaceBelow = window.innerHeight - rect.bottom;
      const opensUp = spaceBelow < MIN_SPACE_BELOW && rect.top > spaceBelow;
      setPos(
        opensUp
          ? { bottom: window.innerHeight - rect.top + GAP, left, originX, originY: "bottom" }
          : { top: rect.bottom + GAP, left, originX, originY: "top" },
      );
    }
    setClosing(false);
    setOpen(true);
  };

  const requestClose = () => {
    if (!open || closing) return;
    setClosing(true);
  };

  const toggleMenu = () => {
    if (open) requestClose();
    else openMenu();
  };

  const copyUserId = async () => {
    if (!currentUser) return;
    try {
      await navigator.clipboard.writeText(String(currentUser.id));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error(err);
    }
  };

  const avatar = currentUser?.avatar_path ? (
    <UserAvatar className="profile-avatar profile-avatar-img" path={currentUser.avatar_path} />
  ) : (
    <span className="profile-avatar" style={{ background: avatarGradientCss(userSeed) }}>
      {initials(fullName)}
    </span>
  );

  return (
    <>
      <button
        ref={chipRef}
        className={`profile-chip ${open ? "is-open" : ""}${sessionInvalid ? " has-alert" : ""}${className ? ` ${className}` : ""}`}
        onClick={toggleMenu}
        aria-label={sessionInvalid ? t("Telegram session expired") : t("Settings")}
      >
        {avatar}
        <ChevronDownIcon size={13} className="profile-chip-chevron" />
      </button>
      {open &&
        pos &&
        createPortal(
          <>
            <div
              className={`profile-menu-backdrop${closing ? " is-closing" : ""}`}
              onClick={requestClose}
            />
            <div
              className={`profile-menu${isNarrow ? " profile-menu-full" : ""}${closing ? " is-closing" : ""}`}
              style={{
                top: pos.top,
                bottom: pos.bottom,
                left: pos.left,
                right: pos.right,
                maxHeight: isNarrow
                  ? `calc(var(--app-height) - ${EDGE_MARGIN}px)`
                  : `calc(var(--app-height) - ${EDGE_MARGIN * 2}px)`,
                transformOrigin: `${pos.originY} ${pos.originX}`,
              }}
              onAnimationEnd={() => {
                if (closing) {
                  setOpen(false);
                  setClosing(false);
                }
              }}
            >
              {sessionInvalid && (
                <div className="profile-session-alert">
                  <div className="profile-session-alert-text">
                    <strong>{t("Telegram session expired")}</strong>
                    <span>
                      {t(
                        "Downloaded music keeps playing. Log in again to sync and add new tracks.",
                      )}
                    </span>
                  </div>
                  <button
                    className="btn btn-primary profile-session-alert-btn"
                    onClick={() => {
                      requestClose();
                      requestRelogin();
                    }}
                  >
                    {t("Log in again")}
                  </button>
                </div>
              )}
              <div className="profile-menu-columns">
                <div className="profile-menu-col">
                  <div className="profile-menu-head">
                    {avatar}
                    <div className="profile-info">
                      <span className="profile-name-row">
                        <span className="profile-fullname truncate">{displayName}</span>
                        {currentUser?.emoji_status && (
                          <EmojiStatus status={currentUser.emoji_status} size={19} />
                        )}
                      </span>
                      <div className="profile-id-row">
                        <span className="profile-id">{currentUser ? currentUser.id : ""}</span>
                        <button
                          className={`icon-btn ${copied ? "is-on" : ""}`}
                          title={t(copied ? "Copied" : "Copy user ID")}
                          onClick={copyUserId}
                          disabled={!currentUser}
                        >
                          {copied ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
                        </button>
                      </div>
                    </div>
                  </div>
                  <ThemePicker
                    theme={theme}
                    accent={accent}
                    onSetTheme={setTheme}
                    onSetAccent={setAccent}
                  />
                </div>
                <div className="profile-menu-col-divider" />
                <div className="profile-menu-col">
                  <div className="profile-setting-row">
                    <span>{t("Language")}</span>
                    <LanguageSwitcher />
                  </div>
                  <div className="profile-setting-row">
                    <span>{t("Sync with profile")}</span>
                    <label
                      className="toggle"
                      title={t("Show your currently playing track in your Telegram profile.")}
                    >
                      <input
                        type="checkbox"
                        checked={profileSyncEnabled}
                        onChange={(e) => toggleProfileSync(e.target.checked)}
                      />
                      <span className="toggle-track" />
                    </label>
                  </div>
                  {isDesktop && (
                    <div className="profile-setting-row">
                      <span>{t("Launch at startup")}</span>
                      <label
                        className="toggle"
                        title={t("Automatically start the app when you log into your OS.")}
                      >
                        <input
                          type="checkbox"
                          checked={autostartEnabled}
                          onChange={(e) => toggleAutostart(e.target.checked)}
                        />
                        <span className="toggle-track" />
                      </label>
                    </div>
                  )}
                  {isDesktop && (
                    <div className="profile-setting-row">
                      <span>{t("Always open in fullscreen")}</span>
                      <label
                        className="toggle"
                        title={t("Press F11 anytime to toggle fullscreen.")}
                      >
                        <input
                          type="checkbox"
                          checked={fullscreenEnabled}
                          onChange={(e) => toggleFullscreen(e.target.checked)}
                        />
                        <span className="toggle-track" />
                      </label>
                    </div>
                  )}
                  {isDesktop && (
                    <div className="profile-setting-row">
                      <span>{t("Turn down while Telegram is playing")}</span>
                      <label
                        className="toggle"
                        title={
                          ducking.supported
                            ? t(
                                "Drops the music to the background while anything plays in Telegram, and brings it back afterwards. It never stops.",
                              )
                            : t("This system can't tell which app is making sound.")
                        }
                      >
                        <input
                          type="checkbox"
                          checked={ducking.enabled}
                          disabled={!ducking.supported}
                          onChange={(e) => toggleDucking(e.target.checked)}
                        />
                        <span className="toggle-track" />
                      </label>
                    </div>
                  )}
                  <div className="profile-menu-divider" />
                  <div className="profile-bot-hint">
                    {t("Download music in the")}{" "}
                    <a
                      className="profile-bot-link"
                      href="https://t.me/wwloadbot"
                      onClick={(e) => {
                        e.preventDefault();
                        void openUrl("https://t.me/wwloadbot");
                      }}
                    >
                      @wwloadbot
                    </a>
                  </div>
                  <div className="profile-menu-divider" />
                  {isDesktop && (
                    <button
                      className="btn btn-ghost cache-cleanup-trigger"
                      onClick={() => {
                        requestClose();
                        setBroadcastOpen(true);
                      }}
                    >
                      <BroadcastIcon size={14} />
                      {t("Broadcast now playing…")}
                    </button>
                  )}
                  <button
                    className="btn btn-ghost cache-cleanup-trigger"
                    onClick={() => {
                      requestClose();
                      setCacheCleanupOpen(true);
                    }}
                  >
                    {t("Free up space…")}
                  </button>
                  <button
                    className="btn btn-ghost danger-ghost cache-cleanup-trigger"
                    onClick={() => {
                      requestClose();
                      handleLogout();
                    }}
                  >
                    {t("Log out…")}
                  </button>
                </div>
              </div>
            </div>
          </>,
          document.body,
        )}

      {broadcastOpen && <BroadcastSettings onClose={() => setBroadcastOpen(false)} />}
      {cacheCleanupOpen && <CacheCleanup onClose={() => setCacheCleanupOpen(false)} />}

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

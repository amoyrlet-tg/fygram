import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { CurrentUser } from "@/shared/api/types";
import { UserAvatar } from "@/shared/ui/UserAvatar";
import { EmojiStatus } from "@/features/profile/components/EmojiStatus";
import { initials } from "@/shared/lib/initials";
import { avatarGradientCss } from "@/shared/lib/avatarColor";
import { visibleName } from "@/shared/lib/visibleName";
import { useT } from "@/shared/i18n";
import { PATTERN_STRENGTH, ringPoints, type AvatarBox } from "./patternPoints";
import { usePatternTile } from "./patternTile";
import { patternColour } from "./collectibleColours";
import "./ProfileCover.css";

export interface ProfileCoverProps {
  user: CurrentUser | null;
  dark: boolean;
  action?: ReactNode;
  music?: ReactNode;
  alert?: boolean;
}

export function ProfileCover({ user, dark, action, alert, music }: ProfileCoverProps) {
  const t = useT();
  const colour = user?.profile_colour ?? null;
  const palette = colour ? (dark && colour.dark_bg.length ? colour.dark_bg : colour.bg) : [];
  const tile = usePatternTile(colour?.background_emoji);
  const ink = colour?.pattern ? patternColour(colour.pattern, palette[0], dark) : null;

  const card = useRef<HTMLDivElement>(null);
  const face = useRef<HTMLSpanElement>(null);
  const [cover, setCover] = useState<{ width: number; height: number; avatar: AvatarBox } | null>(
    null,
  );
  useEffect(() => {
    const outer = card.current;
    const inner = face.current;
    if (!outer || !inner) return;
    const measure = () => {
      const box = outer.getBoundingClientRect();
      const photo = inner.getBoundingClientRect();
      setCover({
        width: box.width,
        height: box.height,
        avatar: {
          x: photo.left - box.left,
          y: photo.top - box.top,
          width: photo.width,
          height: photo.height,
        },
      });
    };
    const watcher = new ResizeObserver(measure);
    watcher.observe(outer);
    watcher.observe(inner);
    return () => watcher.disconnect();
  }, []);

  const name = visibleName(user, t("invisible name"));
  const username = user?.username && !name.substituted ? user.username : null;

  const style: CSSProperties = palette.length
    ? {
        background: `radial-gradient(circle closest-side at 50% 50%, ${
          palette[palette.length - 1]
        } 0%, ${palette[0]} 100%)`,
      }
    : {};

  const initialsAvatar = (
    <span
      className="profile-cover-photo profile-cover-photo-fallback"
      style={{ background: avatarGradientCss(user ? String(user.id) : "user") }}
    >
      {initials(user?.first_name || name.text)}
    </span>
  );
  const avatar = user?.avatar_path ? (
    <UserAvatar className="profile-cover-photo" path={user.avatar_path} fallback={initialsAvatar} />
  ) : (
    initialsAvatar
  );

  return (
    <div
      ref={card}
      className={`profile-cover${palette.length ? " has-colour" : ""}${alert ? " has-alert" : ""}`}
      style={style}
    >
      {tile && cover && (
        <span className="profile-cover-pattern" aria-hidden="true">
          {ringPoints(cover.avatar).map((point, index) => (
            <span
              key={index}
              className="profile-cover-pattern-dot"
              style={{
                left: point.x,
                top: point.y,
                width: point.size,
                height: point.size,
                opacity: point.alpha * PATTERN_STRENGTH,
                ...(ink ? { background: ink, mixBlendMode: "normal" as const } : null),
                maskImage: `url("${tile}")`,
                WebkitMaskImage: `url("${tile}")`,
              }}
            />
          ))}
        </span>
      )}

      <span
        className="profile-cover-body"
        style={colour?.text ? { color: colour.text } : undefined}
      >
        <span className="profile-cover-face" ref={face}>
          {avatar}
        </span>
        <span className="profile-cover-name-row">
          <span className="profile-cover-name truncate">{name.text}</span>
          {user?.emoji_status ? (
            <EmojiStatus status={user.emoji_status} size={19} />
          ) : user?.premium ? (
            <PremiumStar size={17} />
          ) : null}
        </span>
        {username && <span className="profile-cover-username truncate">@{username}</span>}
        {music && <span className="profile-cover-music">{music}</span>}
      </span>

      {action && <div className="profile-cover-action">{action}</div>}
    </div>
  );
}

function PremiumStar({ size }: { size: number }) {
  return (
    <svg
      className="profile-cover-star"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M12 2.6c.4 0 .8.24 1 .6l2.5 5.06 5.6.82c.4.06.74.34.86.73.12.38.02.8-.27 1.08l-4.05 3.94.96 5.57c.07.4-.1.8-.42 1.04a1.1 1.1 0 0 1-1.16.08L12 18.9l-5.02 2.62c-.36.19-.8.16-1.13-.08a1.09 1.09 0 0 1-.43-1.04l.96-5.57-4.05-3.94a1.09 1.09 0 0 1-.27-1.08c.12-.39.46-.67.86-.73l5.6-.82L11 3.2c.18-.36.55-.6 1-.6Z"
      />
    </svg>
  );
}

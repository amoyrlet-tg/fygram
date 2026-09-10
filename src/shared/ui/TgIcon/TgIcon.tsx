import { TG_ICONS, type TgIconName } from "./icons";
import "./TgIcon.css";

export function TgIcon({
  name,
  size = 24,
  className,
}: {
  name: TgIconName;
  size?: number;
  className?: string;
}) {
  const url = `url(${TG_ICONS[name]})`;
  return (
    <span
      className={`tg-icon${className ? ` ${className}` : ""}`}
      style={{ width: size, height: size, maskImage: url, WebkitMaskImage: url }}
      aria-hidden
    />
  );
}

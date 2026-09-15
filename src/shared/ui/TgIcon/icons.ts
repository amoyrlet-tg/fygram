import closeIcon from "@/assets/tg-icons/close.png";
import artworkIcon from "@/assets/tg-icons/artwork.png";
import ecoIcon from "@/assets/tg-icons/eco.png";
import languageIcon from "@/assets/tg-icons/language.png";
import leaveIcon from "@/assets/tg-icons/leave.png";
import musicIcon from "@/assets/tg-icons/music.png";
import newWindowIcon from "@/assets/tg-icons/new-window.png";
import settingsIcon from "@/assets/tg-icons/settings.png";
import storageIcon from "@/assets/tg-icons/storage.png";
import submenuArrowIcon from "@/assets/tg-icons/submenu-arrow.png";
import volumeIcon from "@/assets/tg-icons/volume.png";

export const TG_ICONS = {
  close: closeIcon,
  artwork: artworkIcon,
  eco: ecoIcon,
  language: languageIcon,
  leave: leaveIcon,
  music: musicIcon,
  newWindow: newWindowIcon,
  settings: settingsIcon,
  storage: storageIcon,
  submenuArrow: submenuArrowIcon,
  volume: volumeIcon,
} as const;

export type TgIconName = keyof typeof TG_ICONS;

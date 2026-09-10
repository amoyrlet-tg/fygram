import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LANGUAGES, useLangStore } from "@/shared/i18n";
import { useAnchoredMenu } from "@/shared/hooks/useAnchoredMenu";
import { CheckIcon } from "@/shared/ui/icons";
import "./LanguageSwitcher.css";

import flagRu from "./flags/ru.png";
import flagGb from "./flags/gb.png";
import flagUa from "./flags/ua.png";
import flagBy from "./flags/by.png";
import flagKz from "./flags/kz.png";

export const FLAGS: Record<string, string> = {
  ru: flagRu,
  gb: flagGb,
  ua: flagUa,
  by: flagBy,
  kz: flagKz,
};

export function LanguageSwitcher({
  className,
  withLabel = false,
}: {
  className?: string;
  withLabel?: boolean;
}) {
  const { lang, setLang } = useLangStore();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuPos = useAnchoredMenu(open, triggerRef);
  const current = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0];

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      const inRoot = rootRef.current?.contains(target);
      const inMenu = (target as HTMLElement).closest?.(".lang-dropdown");
      if (!inRoot && !inMenu) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div className={`lang-switch${className ? ` ${className}` : ""}`} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`lang-switch-trigger${open ? " is-open" : ""}${withLabel ? " has-label" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-label="Language"
      >
        <img src={FLAGS[current.country]} alt="" className="lang-flag" />
        {withLabel && <span className="lang-switch-name">{current.native}</span>}
      </button>
      {open &&
        menuPos &&
        createPortal(
          <div
            className="lang-dropdown"
            style={{
              left: menuPos.left,
              top: menuPos.top,
              bottom: menuPos.bottom,
              minWidth: menuPos.minWidth,
              maxHeight: menuPos.maxHeight,
            }}
          >
            {LANGUAGES.map((l) => (
              <button
                type="button"
                key={l.code}
                className={`lang-option${l.code === lang ? " active" : ""}`}
                onClick={() => {
                  setLang(l.code);
                  setOpen(false);
                }}
              >
                <img src={FLAGS[l.country]} alt="" className="lang-flag" />
                <span className="lang-option-native truncate">{l.native}</span>
                {l.code === lang && <CheckIcon size={12} className="lang-option-check" />}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}

import { useEffect } from "react";

const TYPES_INTO = new Set(["INPUT", "TEXTAREA", "SELECT"]);
const HANDLES_KEYS = new Set(["BUTTON", "A", "SUMMARY"]);

function elementOf(target: EventTarget | null): HTMLElement | null {
  return target instanceof HTMLElement ? target : null;
}

function busy(el: HTMLElement | null): boolean {
  if (!el) return false;
  return TYPES_INTO.has(el.tagName) || el.isContentEditable;
}

export function useKeyboardControls({
  next,
  previous,
  togglePlay,
  enabled,
}: {
  next: () => void;
  previous: () => void;
  togglePlay: () => void;
  enabled: boolean;
}) {
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;

      const target = elementOf(event.target);
      if (busy(target) || busy(elementOf(document.activeElement))) return;

      switch (event.code) {
        case "Space": {
          const active = elementOf(document.activeElement);
          if (active && HANDLES_KEYS.has(active.tagName)) return;
          event.preventDefault();
          togglePlay();
          return;
        }
        case "KeyD":
        case "ArrowRight":
          event.preventDefault();
          next();
          return;
        case "KeyA":
        case "ArrowLeft":
          event.preventDefault();
          previous();
          return;
        default:
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [next, previous, togglePlay, enabled]);
}

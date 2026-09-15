import { useEffect, useState, type RefObject } from "react";

const MARGIN = 8;
const GAP = 6;

export interface MenuPosition {
  left: number;
  minWidth: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
}

export function useAnchoredMenu(
  open: boolean,
  anchor: RefObject<HTMLElement | null>,
  maxHeight = 260,
): MenuPosition | null {
  const [position, setPosition] = useState<MenuPosition | null>(null);

  useEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }

    const place = () => {
      const rect = anchor.current?.getBoundingClientRect();
      if (!rect) return;

      const below = window.innerHeight - rect.bottom;
      const above = rect.top;
      const minWidth = Math.max(rect.width, 172);
      const left = Math.max(MARGIN, Math.min(rect.left, window.innerWidth - minWidth - MARGIN));

      setPosition(
        below >= above
          ? {
              left,
              minWidth,
              top: rect.bottom + GAP,
              maxHeight: Math.min(maxHeight, below - GAP - MARGIN),
            }
          : {
              left,
              minWidth,
              bottom: window.innerHeight - rect.top + GAP,
              maxHeight: Math.min(maxHeight, above - GAP - MARGIN),
            },
      );
    };

    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, anchor, maxHeight]);

  return position;
}

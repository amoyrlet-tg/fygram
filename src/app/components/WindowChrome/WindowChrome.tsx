import { useCallback, useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useT } from "@/shared/i18n";
import "./WindowChrome.css";

const EDGES = [
  { direction: "North", className: "n" },
  { direction: "South", className: "s" },
  { direction: "East", className: "e" },
  { direction: "West", className: "w" },
  { direction: "NorthWest", className: "nw" },
  { direction: "NorthEast", className: "ne" },
  { direction: "SouthWest", className: "sw" },
  { direction: "SouthEast", className: "se" },
] as const;

export function WindowChrome() {
  const t = useT();
  const [maximized, setMaximized] = useState(true);

  useEffect(() => {
    const window = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    void window.isMaximized().then(setMaximized);
    void window
      .onResized(() => {
        void window.isMaximized().then(setMaximized);
      })
      .then((stop) => {
        unlisten = stop;
      });
    return () => unlisten?.();
  }, []);

  const startResize = useCallback((direction: (typeof EDGES)[number]["direction"]) => {
    void getCurrentWindow().startResizeDragging(direction);
  }, []);

  return (
    <>
      <div className="window-controls">
        <button
          className="window-btn"
          onClick={() => void getCurrentWindow().minimize()}
          aria-label={t("Minimise")}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M0 5h10" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
        <button
          className="window-btn"
          onClick={() => void getCurrentWindow().toggleMaximize()}
          aria-label={maximized ? t("Restore") : t("Maximise")}
        >
          {maximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path
                d="M2.6 2.6V0.9h6.5v6.5H7.4M0.9 2.6h6.5v6.5H0.9z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.1"
              />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <rect
                x="0.9"
                y="0.9"
                width="8.2"
                height="8.2"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.1"
              />
            </svg>
          )}
        </button>
        <button
          className="window-btn window-btn-close"
          onClick={() => void getCurrentWindow().close()}
          aria-label={t("Close")}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M0.6 0.6l8.8 8.8M9.4 0.6L0.6 9.4" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
      </div>
      {EDGES.map((edge) => (
        <div
          key={edge.className}
          className={`window-resize window-resize-${edge.className}`}
          onMouseDown={(event) => {
            if (event.button === 0) startResize(edge.direction);
          }}
        />
      ))}
    </>
  );
}

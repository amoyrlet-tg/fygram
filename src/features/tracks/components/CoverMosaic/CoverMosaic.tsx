import { convertFileSrc } from "@tauri-apps/api/core";
import { avatarGradientCss } from "@/shared/lib/avatarColor";
import { useCoverTiles } from "../../useCoverTiles";
import "./CoverMosaic.css";
import { MusicNoteIcon } from "@/shared/ui/icons";

const TILES = 4;

export function CoverMosaic({
  trackIds,
  cover,
  seed,
  label,
  size,
  className,
  header = false,
}: {
  trackIds: string[];
  cover?: string | null;
  seed: string;
  label: string;
  size: number;
  className?: string;
  header?: boolean;
}) {
  const found = useCoverTiles(cover ? [] : trackIds);

  const tiles = found.slice(0, TILES);

  const style = {
    width: size,
    height: size,
    background: header ? "var(--bg-elevated-2)" : avatarGradientCss(seed),
  };
  const classes = `cover-mosaic${className ? ` ${className}` : ""}`;

  if (cover) {
    return (
      <div className={classes} style={style}>
        <img src={convertFileSrc(cover)} alt="" decoding="async" />
      </div>
    );
  }

  if (tiles.length >= TILES || (header && tiles.length > 1)) {
    return (
      <div
        className={`${classes} is-mosaic${header ? ` header-mosaic tiles-${tiles.length}` : ""}`}
        style={style}
      >
        {tiles.map((src) => (
          <img key={src} src={src} alt="" decoding="async" />
        ))}
      </div>
    );
  }

  if (tiles.length > 0) {
    return (
      <div className={classes} style={style}>
        <img src={tiles[0]} alt="" decoding="async" />
      </div>
    );
  }

  return (
    <div className={classes} style={style}>
      {header ? (
        <MusicNoteIcon size={48} />
      ) : (
        <span style={{ fontSize: Math.round(size * 0.42) }}>{label.slice(0, 1).toUpperCase()}</span>
      )}
    </div>
  );
}

import { convertFileSrc } from "@tauri-apps/api/core";
import { avatarGradientCss } from "@/shared/lib/avatarColor";
import { useCoverTiles } from "@/features/tracks/useCoverTiles";
import "./CoverMosaic.css";

const TILES = 4;

export function CoverMosaic({
  trackIds,
  cover,
  seed,
  label,
  size,
  className,
}: {
  trackIds: string[];
  cover?: string | null;
  seed: string;
  label: string;
  size: number;
  className?: string;
}) {
  const found = useCoverTiles(cover ? [] : trackIds);

  const tiles = found.slice(0, TILES);

  const style = { width: size, height: size, background: avatarGradientCss(seed) };
  const classes = `cover-mosaic${className ? ` ${className}` : ""}`;

  if (cover) {
    return (
      <div className={classes} style={style}>
        <img src={convertFileSrc(cover)} alt="" decoding="async" />
      </div>
    );
  }

  if (tiles.length >= TILES) {
    return (
      <div className={`${classes} is-mosaic`} style={style}>
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
      <span style={{ fontSize: Math.round(size * 0.42) }}>{label.slice(0, 1).toUpperCase()}</span>
    </div>
  );
}

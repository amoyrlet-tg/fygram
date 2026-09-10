export interface PatternPoint {
  x: number;
  y: number;
  size: number;
  alpha: number;
}

export interface AvatarBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

const SCALE = 0.8;
const P8 = 8 * SCALE;
const P12 = 12 * SCALE;
const P16 = 16 * SCALE;
const P24 = 24 * SCALE;
const P48 = 48 * SCALE;
const P96 = 96 * SCALE;
const COS_120 = Math.cos((Math.PI * 120) / 180);
const COS_160 = Math.cos((Math.PI * 160) / 180);

export function ringPoints(avatar: AvatarBox): PatternPoint[] {
  const { x, y, width: w, height: h } = avatar;
  if (w <= 0 || h <= 0) return [];
  const cx = x + w / 2;
  const cy = y + h / 2;
  const r48Cos120 = (P48 + w / 2) * COS_120;
  const r16Cos160 = (P16 + h / 2) * COS_160;

  return [
    { x: cx, y: y - P24, size: 20, alpha: 0.42 },
    { x: cx, y: y + h + P24, size: 20, alpha: 0.32 },
    { x: x - P16, y: cy - h / 4 - P8, size: 23, alpha: 0.4 },
    { x: x + w + P16, y: cy - h / 4 - P8, size: 18, alpha: 0.4 },
    { x: x - P16, y: cy + h / 4 + P8, size: 24, alpha: 0.4 },
    { x: x + w + P16 - 4, y: cy + h / 4 + P8, size: 24, alpha: 0.4 },

    { x: x - P48, y: cy, size: 19, alpha: 0.6 },
    { x: x + w + P48, y: cy, size: 19, alpha: 0.64 },
    { x: cx + r48Cos120, y: y - P48 + P12, size: 17, alpha: 0.7 },
    { x: cx - r48Cos120, y: y - P48 + P12, size: 17, alpha: 0.9 },
    { x: cx + r48Cos120, y: y + h + P48 - P12, size: 20, alpha: 0.75 },
    { x: cx - r48Cos120, y: y + h + P48 - P12, size: 20, alpha: 0.85 },

    { x: x - P48 - P8, y: cy + r16Cos160, size: 20, alpha: 0.45 },
    { x: x + w + P48 + P8, y: cy + r16Cos160, size: 19, alpha: 0.45 },
    { x: x - P48 - P8, y: cy - r16Cos160, size: 21, alpha: 0.45 },
    { x: x + w + P48 + P8, y: cy - r16Cos160, size: 18, alpha: 0.45 },

    { x: x - P96, y: cy, size: 19, alpha: 0.75 },
    { x: x + w + P96, y: cy, size: 19, alpha: 0.8 },
  ];
}

export const PATTERN_STRENGTH = 0.5;

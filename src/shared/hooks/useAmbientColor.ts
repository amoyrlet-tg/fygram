import { useEffect, useState } from "react";
import { readImageAsDataUrl } from "@/shared/api/system";

const ambientColorCache = new Map<string, string | null>();

function boostVividness(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;

  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      default:
        h = (rn - gn) / d + 4;
    }
    h /= 6;
  }

  const boostedS = Math.min(1, s + 0.15);
  const boostedL = Math.min(0.6, Math.max(0.46, l * 1.15));

  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  if (boostedS === 0) {
    const v = Math.round(boostedL * 255);
    return [v, v, v];
  }
  const q = boostedL < 0.5 ? boostedL * (1 + boostedS) : boostedL + boostedS - boostedL * boostedS;
  const p = 2 * boostedL - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

function saturationOf(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === 0) return 0;
  return (max - min) / max;
}

function dominantColor(data: Uint8ClampedArray): [number, number, number] | null {
  const buckets = new Map<number, { weight: number; r: number; g: number; b: number; n: number }>();

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const max = Math.max(r, g, b);
    if (max < 60 || (r > 240 && g > 240 && b > 240)) continue;

    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const slot = buckets.get(key) ?? { weight: 0, r: 0, g: 0, b: 0, n: 0 };
    const lightness = (max + Math.min(r, g, b)) / 510;
    slot.weight +=
      (saturationOf(r, g, b) + 0.1) * Math.max(0.05, 1 - Math.abs(lightness - 0.5) * 1.6);
    slot.r += r;
    slot.g += g;
    slot.b += b;
    slot.n += 1;
    buckets.set(key, slot);
  }

  let best: { weight: number; r: number; g: number; b: number; n: number } | null = null;
  for (const slot of buckets.values()) {
    if (!best || slot.weight > best.weight) best = slot;
  }
  if (!best) return null;
  return [best.r / best.n, best.g / best.n, best.b / best.n];
}

function extractAmbientColor(src: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const size = 48;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        const dominant = dominantColor(data);
        if (!dominant) {
          resolve(null);
          return;
        }
        const [br, bg, bb] = boostVividness(...dominant);
        resolve(`${br}, ${bg}, ${bb}`);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export function useAmbientColor(path: string | null): string | null {
  const [color, setColor] = useState<string | null>(null);

  useEffect(() => {
    if (!path) {
      setColor(null);
      return;
    }
    const cached = ambientColorCache.get(path);
    if (cached !== undefined) {
      setColor(cached);
      return;
    }
    let cancelled = false;
    readImageAsDataUrl(path)
      .then((dataUrl) => extractAmbientColor(dataUrl))
      .catch(() => null)
      .then((result) => {
        ambientColorCache.set(path, result ?? null);
        if (!cancelled) setColor(result ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return color;
}

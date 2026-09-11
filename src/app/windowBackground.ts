import { getCurrentWindow } from "@tauri-apps/api/window";

function readBodyBackground(): [number, number, number] | null {
  const painted = getComputedStyle(document.body).backgroundColor;
  const parts = painted.match(/\d+(\.\d+)?/g);
  if (!parts || parts.length < 3) return null;
  const [r, g, b] = parts.map((n) => Math.round(Number(n)));
  return [r, g, b];
}

export function syncWindowBackground() {
  requestAnimationFrame(() => {
    const colour = readBodyBackground();
    if (!colour) return;
    void getCurrentWindow().setBackgroundColor(colour).catch(console.error);
  });
}

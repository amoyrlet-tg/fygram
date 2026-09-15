import { getCurrentWindow } from "@tauri-apps/api/window";

function readBodyBackground(): [number, number, number] | null {
  const painted = getComputedStyle(document.body).backgroundColor;
  // Let the browser resolve CSS Color 4 (including color(srgb ...) from color-mix).
  // Those channels are 0..1, not the 0..255 channels of legacy rgb().
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.fillStyle = painted;
  context.fillRect(0, 0, 1, 1);
  const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
}

export function syncWindowBackground() {
  requestAnimationFrame(() => {
    const colour = readBodyBackground();
    if (!colour) return;
    void getCurrentWindow().setBackgroundColor(colour).catch(console.error);
  });
}

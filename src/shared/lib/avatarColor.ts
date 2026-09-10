const STEPS = 4;

function hash(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function avatarGradientCss(seed: string): string {
  const step = hash(seed) % STEPS;
  const lift = 20 + step * 5;
  const deepen = 14 + step * 4;
  const top = `color-mix(in srgb, var(--accent-base) ${100 - lift}%, white)`;
  const bottom = `color-mix(in srgb, var(--accent-base) ${100 - deepen}%, black)`;
  return `linear-gradient(180deg, ${top}, ${bottom})`;
}

export function avatarGlowCss(alphaPercent: number): string {
  return `color-mix(in srgb, var(--accent-base) ${alphaPercent}%, transparent)`;
}

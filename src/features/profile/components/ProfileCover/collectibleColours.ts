const DARKEN_IN_DARK = 140 / 255;
const DARKEN_IN_LIGHT = 160 / 255;

function channels(colour: string): [number, number, number] {
  const hex = colour.replace("#", "");
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
}

function blend(a: string, b: string, ratio: number): string {
  const from = channels(a);
  const to = channels(b);
  return `#${from
    .map((value, i) => Math.round(value * (1 - ratio) + to[i] * ratio))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}

function contrast(a: string, b: string): number {
  const luminance = (colour: string) => {
    const [r, g, b2] = channels(colour).map((value) => {
      const part = value / 255;
      return part <= 0.03928 ? part / 12.92 : Math.pow((part + 0.055) / 1.055, 2.4);
    });
    return r * 0.2126 + g * 0.7152 + b2 * 0.0722;
  };
  const one = luminance(a);
  const two = luminance(b);
  return (Math.max(one, two) + 0.05) / (Math.min(one, two) + 0.05);
}

export function patternColour(raw: string, edge: string | undefined, dark: boolean): string {
  const darkened = blend(raw, "#000000", dark ? DARKEN_IN_DARK : DARKEN_IN_LIGHT);
  if (!edge) return darkened;
  return contrast(darkened, edge) > contrast(raw, edge) ? darkened : raw;
}

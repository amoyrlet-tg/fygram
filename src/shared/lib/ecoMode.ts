import { useSyncExternalStore } from "react";

const ECO_KEY = "ecoMode";
const ART_KEY = "ecoKeepArt";

let enabled = read(ECO_KEY, false);
let keepArt = read(ART_KEY, false);
const watchers = new Set<() => void>();

function read(key: string, fallback: boolean): boolean {
  try {
    const saved = localStorage.getItem(key);
    return saved === null ? fallback : saved === "1";
  } catch {
    return fallback;
  }
}

function save(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {}
}

function paint() {
  const root = document.documentElement;
  root.toggleAttribute("data-eco", enabled);
  root.toggleAttribute("data-no-art", enabled && !keepArt);
}

paint();

function announce() {
  paint();
  for (const notify of watchers) notify();
}

function subscribe(notify: () => void) {
  watchers.add(notify);
  return () => watchers.delete(notify);
}

export function ecoEnabled(): boolean {
  return enabled;
}

export function ecoKeepsArt(): boolean {
  return keepArt;
}

export function artworkOff(): boolean {
  return enabled && !keepArt;
}

export function setEcoEnabled(next: boolean) {
  if (next === enabled) return;
  enabled = next;
  save(ECO_KEY, next);
  announce();
}

export function setEcoKeepsArt(next: boolean) {
  if (next === keepArt) return;
  keepArt = next;
  save(ART_KEY, next);
  announce();
}

export function useEco(): boolean {
  return useSyncExternalStore(subscribe, ecoEnabled, ecoEnabled);
}

export function useEcoKeepsArt(): boolean {
  return useSyncExternalStore(subscribe, ecoKeepsArt, ecoKeepsArt);
}

export function useArtworkOff(): boolean {
  return useSyncExternalStore(subscribe, artworkOff, artworkOff);
}

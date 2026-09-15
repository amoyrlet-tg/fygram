import { useEffect, useState } from "react";

let invalid = false;
const listeners = new Set<() => void>();

export function rememberSessionInvalid(value: boolean) {
  if (invalid === value) return;
  invalid = value;
  listeners.forEach((cb) => cb());
}

export function isSessionInvalid(): boolean {
  return invalid;
}

export function useSessionInvalid(): boolean {
  const [, force] = useState(0);
  useEffect(() => {
    const cb = () => force((x) => x + 1);
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  }, []);
  return invalid;
}

let reloginRequested: (() => void) | null = null;

export function onReloginRequested(handler: () => void): () => void {
  reloginRequested = handler;
  return () => {
    if (reloginRequested === handler) reloginRequested = null;
  };
}

export function requestRelogin() {
  reloginRequested?.();
}

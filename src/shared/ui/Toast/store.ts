import { useEffect, useState } from "react";

export type ToastKind = "info" | "warn" | "ok";

export interface Toast {
  id: number;
  key: string;
  message: string;
  kind: ToastKind;
  duration: number;
}

const DEFAULT_DURATION_MS = 3000;

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((cb) => cb());
}

export function showToast(opts: {
  key: string;
  message: string;
  kind?: ToastKind;
  duration?: number;
}) {
  const toast: Toast = {
    id: nextId++,
    key: opts.key,
    message: opts.message,
    kind: opts.kind ?? "info",
    duration: opts.duration ?? DEFAULT_DURATION_MS,
  };
  toasts = [...toasts.filter((t) => t.key !== toast.key), toast];
  emit();

  if (toast.duration > 0) {
    window.setTimeout(() => {
      if (toasts.some((t) => t.id === toast.id)) dismissToast(toast.key);
    }, toast.duration);
  }
}

export function dismissToast(key: string) {
  const next = toasts.filter((t) => t.key !== key);
  if (next.length === toasts.length) return;
  toasts = next;
  emit();
}

export function useToasts(): Toast[] {
  const [, force] = useState(0);
  useEffect(() => {
    const cb = () => force((x) => x + 1);
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  }, []);
  return toasts;
}

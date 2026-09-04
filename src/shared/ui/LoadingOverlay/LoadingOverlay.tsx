import { useEffect, useRef, useState } from "react";
import duck from "@/assets/loadduck.tgs";
import { Lottie } from "@/shared/ui/Lottie";
import "./LoadingOverlay.css";

const MIN_VISIBLE_MS = 900;
const EXIT_MS = 420;

export interface LoadingOverlayProps {
  active: boolean;
  percent: number | null;
  title: string;
  detail?: string;
}

export function LoadingOverlay({ active, percent, title, detail }: LoadingOverlayProps) {
  const { mounted, shown } = useHoldOpen(active);
  const value = useEasedPercent(percent, active);

  const last = useRef({ percent, title, detail });
  useEffect(() => {
    if (active) last.current = { percent, title, detail };
  }, [active, percent, title, detail]);
  const shape = active ? { percent, title, detail } : last.current;

  if (!mounted) return null;

  const indeterminate = shape.percent === null;

  return (
    <div className={`loading-overlay ${shown ? "is-shown" : ""}`}>
      <div className="loading-overlay-card">
        <Lottie animationData={duck} size={168} className="loading-overlay-duck" />

        {!indeterminate && <div className="loading-overlay-percent">{Math.round(value)}%</div>}

        <div className="loading-overlay-title">{shape.title}</div>

        <div
          className={`loading-overlay-bar ${indeterminate ? "is-indeterminate" : ""}`}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={indeterminate ? undefined : Math.round(value)}
          aria-label={shape.title}
        >
          <div
            className="loading-overlay-bar-fill"
            style={indeterminate ? undefined : { width: `${value}%` }}
          />
        </div>

        {shape.detail && <div className="loading-overlay-detail">{shape.detail}</div>}
      </div>
    </div>
  );
}

function useHoldOpen(active: boolean) {
  const [mounted, setMounted] = useState(active);
  const [shown, setShown] = useState(false);
  const shownAt = useRef(0);

  useEffect(() => {
    if (active) {
      setMounted(true);
      if (!shownAt.current) shownAt.current = Date.now();
      const raf = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(raf);
    }

    if (!mounted) return;

    const held = Math.max(0, MIN_VISIBLE_MS - (Date.now() - shownAt.current));
    const fade = window.setTimeout(() => setShown(false), held);
    const unmount = window.setTimeout(() => {
      shownAt.current = 0;
      setMounted(false);
    }, held + EXIT_MS);
    return () => {
      window.clearTimeout(fade);
      window.clearTimeout(unmount);
    };
  }, [active, mounted]);

  return { mounted, shown };
}

function useEasedPercent(target: number | null, active: boolean) {
  const [value, setValue] = useState(0);
  const current = useRef(0);
  const ceiling = useRef(0);
  const wasActive = useRef(active);

  useEffect(() => {
    if (active && !wasActive.current) {
      current.current = 0;
      ceiling.current = 0;
      setValue(0);
    }
    wasActive.current = active;
  }, [active]);

  useEffect(() => {
    if (target === null) return;
    ceiling.current = Math.max(ceiling.current, target);
    const goal = ceiling.current;

    let raf = 0;
    const step = () => {
      const delta = goal - current.current;
      if (Math.abs(delta) < 0.1) {
        current.current = goal;
        setValue(goal);
        return;
      }
      current.current += delta * 0.14;
      setValue(current.current);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  return value;
}

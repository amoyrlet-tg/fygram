import { useEffect, type RefObject } from "react";

const MAX_PER_SECOND = 3000;
const LINE = 16;
const FOLLOW = 0.34;
const SETTLED = 0.5;
const FOREIGN = 1;

export function useScrollSpeedLimit(
  ref: RefObject<HTMLElement | null>,
  maxPerSecond = MAX_PER_SECOND,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let target = el.scrollTop;
    let written = el.scrollTop;
    let frame = 0;
    let last = 0;

    const stop = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };

    const step = (now: number) => {
      const seconds = Math.min((now - last) / 1000, 0.05);
      last = now;
      const distance = target - el.scrollTop;
      if (Math.abs(distance) < SETTLED) {
        el.scrollTop = target;
        written = el.scrollTop;
        frame = 0;
        return;
      }
      const ceiling = maxPerSecond * seconds;
      el.scrollTop += Math.sign(distance) * Math.min(Math.abs(distance) * FOLLOW, ceiling);
      written = el.scrollTop;
      frame = requestAnimationFrame(step);
    };

    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.shiftKey) return;
      const furthest = el.scrollHeight - el.clientHeight;
      if (furthest <= 0) return;
      event.preventDefault();
      const unit = event.deltaMode === 1 ? LINE : event.deltaMode === 2 ? el.clientHeight : 1;
      const from = frame ? target : el.scrollTop;
      target = Math.max(0, Math.min(furthest, from + event.deltaY * unit));
      if (!frame) {
        last = performance.now();
        written = el.scrollTop;
        frame = requestAnimationFrame(step);
      }
    };

    const onScroll = () => {
      if (!frame) {
        target = el.scrollTop;
        written = el.scrollTop;
        return;
      }
      if (Math.abs(el.scrollTop - written) > FOREIGN) {
        stop();
        target = el.scrollTop;
        written = el.scrollTop;
      }
    };

    const onPointerDown = () => stop();

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("pointerdown", onPointerDown, { passive: true });
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("pointerdown", onPointerDown);
      stop();
    };
  }, [ref, maxPerSecond]);
}

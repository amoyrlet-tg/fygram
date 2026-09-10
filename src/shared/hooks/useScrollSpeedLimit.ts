import { useEffect, type RefObject } from "react";

const MAX_PER_SECOND = 3000;
const LINE = 16;

export function useScrollSpeedLimit(
  ref: RefObject<HTMLElement | null>,
  maxPerSecond = MAX_PER_SECOND,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let target = el.scrollTop;
    let frame = 0;
    let last = 0;

    const step = (now: number) => {
      const seconds = Math.min((now - last) / 1000, 0.05);
      last = now;
      const distance = target - el.scrollTop;
      if (Math.abs(distance) < 0.5) {
        el.scrollTop = target;
        frame = 0;
        return;
      }
      const ceiling = maxPerSecond * seconds;
      const move = Math.sign(distance) * Math.min(Math.abs(distance) * 0.24, ceiling);
      el.scrollTop += move;
      frame = requestAnimationFrame(step);
    };

    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.shiftKey) return;
      const furthest = el.scrollHeight - el.clientHeight;
      if (furthest <= 0) return;
      event.preventDefault();
      const delta = event.deltaY * (event.deltaMode === 1 ? LINE : 1);
      target = Math.max(0, Math.min(furthest, target + delta));
      if (!frame) {
        last = performance.now();
        frame = requestAnimationFrame(step);
      }
    };

    const onScroll = () => {
      if (!frame) target = el.scrollTop;
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [ref, maxPerSecond]);
}

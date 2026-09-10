import { useInView, useMotionValue, useSpring } from "motion/react";
import { useCallback, useEffect, useRef } from "react";

export function CountUp({
  to,
  from = 0,
  direction = "up",
  delay = 0,
  duration = 2,
  className = "",
  startWhen = true,
  separator = "",
  onStart,
  onEnd,
}: {
  to: number;
  from?: number;
  direction?: "up" | "down";
  delay?: number;
  duration?: number;
  className?: string;
  startWhen?: boolean;
  separator?: string;
  onStart?: () => void;
  onEnd?: () => void;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const motionValue = useMotionValue(direction === "down" ? to : from);

  const damping = 20 + 40 * (1 / duration);
  const stiffness = 100 * (1 / duration);
  const springValue = useSpring(motionValue, { damping, stiffness });
  const isInView = useInView(ref, { once: true, margin: "0px" });

  const decimalsOf = (value: number) => {
    const text = value.toString();
    if (!text.includes(".")) return 0;
    const decimals = text.split(".")[1];
    return parseInt(decimals, 10) === 0 ? 0 : decimals.length;
  };
  const maxDecimals = Math.max(decimalsOf(from), decimalsOf(to));

  const format = useCallback(
    (latest: number) => {
      const written = Intl.NumberFormat("en-US", {
        useGrouping: !!separator,
        minimumFractionDigits: maxDecimals,
        maximumFractionDigits: maxDecimals,
      }).format(latest);
      return separator ? written.replace(/,/g, separator) : written;
    },
    [maxDecimals, separator],
  );

  useEffect(() => {
    if (ref.current) ref.current.textContent = format(direction === "down" ? to : from);
  }, [from, to, direction, format]);

  useEffect(() => {
    if (!isInView || !startWhen) return;
    onStart?.();
    const startId = window.setTimeout(() => {
      motionValue.set(direction === "down" ? from : to);
    }, delay * 1000);
    const endId = window.setTimeout(() => onEnd?.(), delay * 1000 + duration * 1000);
    return () => {
      window.clearTimeout(startId);
      window.clearTimeout(endId);
    };
  }, [isInView, startWhen, motionValue, direction, from, to, delay, onStart, onEnd, duration]);

  useEffect(() => {
    return springValue.on("change", (latest: number) => {
      if (ref.current) ref.current.textContent = format(latest);
    });
  }, [springValue, format]);

  return <span className={className} ref={ref} />;
}

import { useEffect, useRef } from "react";
import lottie, { type AnimationItem } from "lottie-web/build/player/lottie_light_canvas";

export interface LottieProps {
  animationData: unknown;
  size: number;
  className?: string;
}

export function Lottie({ animationData, size, className }: LottieProps) {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<AnimationItem | null>(null);

  useEffect(() => {
    const container = host.current;
    if (!container) return;

    const animation = lottie.loadAnimation({
      container,
      renderer: "canvas",
      loop: true,
      autoplay: true,
      animationData,
      rendererSettings: {
        dpr: window.devicePixelRatio || 1,
        clearCanvas: true,
        preserveAspectRatio: "xMidYMid meet",
      },
    });
    player.current = animation;

    return () => {
      animation.destroy();
      player.current = null;
    };
  }, [animationData]);

  return (
    <div
      ref={host}
      className={className}
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}

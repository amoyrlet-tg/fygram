import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import lottie from "lottie-web/build/player/lottie_light_canvas";
import type { EmojiStatus } from "@/shared/api/types";

const TILE_PX = 96;

export function usePatternTile(emoji: EmojiStatus | null | undefined): string | null {
  const path = emoji?.path ?? null;
  const kind = emoji?.kind ?? null;
  const [tile, setTile] = useState<string | null>(null);

  useEffect(() => {
    if (!path || !kind) {
      setTile(null);
      return;
    }
    const src = convertFileSrc(path);
    if (kind === "image") {
      setTile(src);
      return;
    }

    let cancelled = false;
    let dispose = () => {};

    if (kind === "lottie") {
      fetch(src)
        .then((response) => response.json())
        .then((animationData) => {
          if (cancelled) return;
          const host = document.createElement("div");
          host.style.cssText = `position:fixed;left:-9999px;top:0;width:${TILE_PX}px;height:${TILE_PX}px`;
          document.body.appendChild(host);
          const animation = lottie.loadAnimation({
            container: host,
            renderer: "canvas",
            loop: false,
            autoplay: false,
            animationData,
            rendererSettings: {
              dpr: 1,
              clearCanvas: true,
              preserveAspectRatio: "xMidYMid meet",
            },
          });
          dispose = () => {
            animation.destroy();
            host.remove();
          };
          animation.addEventListener("DOMLoaded", () => {
            animation.goToAndStop(0, true);
            const canvas = host.querySelector("canvas");
            if (canvas && !cancelled) setTile(canvas.toDataURL());
            dispose();
            dispose = () => {};
          });
        })
        .catch(() => {});
    } else {
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.src = src;
      const grab = () => {
        if (cancelled) return;
        const canvas = document.createElement("canvas");
        canvas.width = TILE_PX;
        canvas.height = TILE_PX;
        const context = canvas.getContext("2d");
        if (!context) return;
        context.drawImage(video, 0, 0, TILE_PX, TILE_PX);
        setTile(canvas.toDataURL());
      };
      video.addEventListener("loadeddata", grab);
      dispose = () => {
        video.removeEventListener("loadeddata", grab);
        video.src = "";
      };
    }

    return () => {
      cancelled = true;
      dispose();
    };
  }, [path, kind]);

  return tile;
}

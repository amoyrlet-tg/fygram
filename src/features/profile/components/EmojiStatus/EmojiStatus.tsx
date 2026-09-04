import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Lottie } from "@/shared/ui/Lottie";
import type { EmojiStatus as EmojiStatusFile } from "@/shared/api/types";
import "./EmojiStatus.css";

export function EmojiStatus({ status, size = 18 }: { status: EmojiStatusFile; size?: number }) {
  const src = convertFileSrc(status.path);
  const [animation, setAnimation] = useState<unknown>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (status.kind !== "lottie") return;
    let cancelled = false;
    setAnimation(null);
    fetch(src)
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled) setAnimation(data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [src, status.kind]);

  if (failed) return null;

  const box = { width: size, height: size };

  if (status.kind === "lottie") {
    return (
      <span className="emoji-status" style={box}>
        {animation ? <Lottie animationData={animation} size={size} /> : null}
      </span>
    );
  }

  if (status.kind === "video") {
    return (
      <span className="emoji-status" style={box}>
        <video src={src} autoPlay loop muted playsInline onError={() => setFailed(true)} />
      </span>
    );
  }

  return (
    <span className="emoji-status" style={box}>
      <img src={src} alt="" onError={() => setFailed(true)} />
    </span>
  );
}

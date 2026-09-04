import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";

export function UserAvatar({ path, className }: { path: string; className: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [path]);
  if (failed) return null;

  const src = convertFileSrc(path);
  if (path.endsWith(".mp4")) {
    return (
      <video
        className={className}
        src={src}
        autoPlay
        loop
        muted
        playsInline
        onError={() => setFailed(true)}
      />
    );
  }
  return <img className={className} src={src} alt="" onError={() => setFailed(true)} />;
}

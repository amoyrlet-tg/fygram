import { useEffect, useState, type ReactNode } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";

export function UserAvatar({
  path,
  className,
  fallback,
}: {
  path: string;
  className: string;
  fallback?: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [path]);

  if (failed) return <>{fallback ?? null}</>;
  return (
    <img className={className} src={convertFileSrc(path)} alt="" onError={() => setFailed(true)} />
  );
}

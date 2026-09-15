import { useEffect, useState } from "react";
import duck from "@/assets/duckclean.tgs";
import type { MediaRootInfo } from "@/shared/api/types";
import { formatSize } from "@/shared/lib/format";
import { useT } from "@/shared/i18n";
import { Lottie } from "@/shared/ui/Lottie";

const DUCK_SIZE = 88;
const DUCK_LEAVE_MS = 360;

export function StorageHero({
  root,
  cleaning = false,
}: {
  root: MediaRootInfo | null;
  cleaning?: boolean;
}) {
  const t = useT();
  const [mounted, setMounted] = useState(cleaning);

  useEffect(() => {
    if (cleaning) {
      setMounted(true);
      return;
    }
    const id = window.setTimeout(() => setMounted(false), DUCK_LEAVE_MS);
    return () => window.clearTimeout(id);
  }, [cleaning]);

  return (
    <section className="storage-overview" aria-busy={!root || cleaning}>
      {mounted && (
        <div className={`storage-duck${cleaning ? "" : " is-leaving"}`}>
          <Lottie animationData={duck} size={DUCK_SIZE} className="storage-duck-art" />
        </div>
      )}
      <div className="storage-overview-copy">
        <span>{t("Music cache")}</span>
        <strong key={root ? root.total_bytes : "loading"}>
          {root ? formatSize(root.total_bytes, t) : t("Loading cache size…")}
        </strong>
        {root && (
          <span>
            {root.file_count.toLocaleString()} {t("files")}
          </span>
        )}
      </div>
    </section>
  );
}

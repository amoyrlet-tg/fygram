import type { MediaRootInfo } from "@/shared/api/types";
import { formatSize, sizeParts } from "@/shared/lib/format";
import { useT } from "@/shared/i18n";
import { CountUp } from "@/shared/ui/CountUp";
import "./StorageHero.css";

function diskShare(bytes: number, disk: number): string {
  const percent = (bytes / disk) * 100;
  if (percent < 1) return "<1%";
  return `${percent < 10 ? percent.toFixed(1) : percent.toFixed(0)}%`;
}

export function StorageHero({ root }: { root: MediaRootInfo | null }) {
  const t = useT();
  const written = (bytes: number) => formatSize(bytes, t);

  const total = root?.total_bytes ?? 0;
  const disk = root?.disk_bytes ?? 0;
  const free = Math.min(root?.free_bytes ?? 0, disk);
  const other = Math.max(disk - free - total, 0);
  const headline = sizeParts(total);

  return (
    <section className="storage-hero">
      <div className="storage-total">
        <CountUp className="storage-total-value" to={headline.value} duration={0.9} />
        <span className="storage-total-unit">{t(headline.unit)}</span>
      </div>

      <p className="storage-hero-meta">
        {root
          ? `${root.file_count} ${t("files")}` +
            (disk > 0 ? ` · ${diskShare(total, disk)} ${t("of this disk")}` : "")
          : t("Loading cache size…")}
      </p>

      {disk > 0 && (
        <div className="storage-disk">
          <div className="storage-disk-bar">
            <span
              className="storage-disk-part is-app"
              style={{ width: `${(total / disk) * 100}%` }}
            />
            <span
              className="storage-disk-part is-other"
              style={{ width: `${(other / disk) * 100}%` }}
            />
          </div>
          <ul className="storage-disk-legend">
            <li>
              <i className="storage-disk-dot is-app" />
              fygram <b>{written(total)}</b>
            </li>
            <li>
              <i className="storage-disk-dot is-other" />
              {t("Other")} <b>{written(other)}</b>
            </li>
            <li>
              <i className="storage-disk-dot is-free" />
              {t("Free")} <b>{written(free)}</b>
            </li>
          </ul>
        </div>
      )}
    </section>
  );
}

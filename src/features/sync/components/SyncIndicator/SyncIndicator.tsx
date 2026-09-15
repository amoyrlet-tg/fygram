import { useEffect, useState } from "react";
import type { SyncStatus } from "@/shared/api/types";
import { useT } from "@/shared/i18n";
import { CheckIcon, CloudIcon, CloudOffIcon, RefreshIcon } from "@/shared/ui/icons";
import "./SyncIndicator.css";

export interface SyncIndicatorProps {
  status: SyncStatus | null;
  onSyncNow: () => void;
  compact?: boolean;
}

function minutesAgo(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

export function SyncIndicator({ status, onSyncNow, compact }: SyncIndicatorProps) {
  const t = useT();
  const [, tick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => tick((x) => x + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const ready = status?.ready ?? false;
  const offline = ready && !status?.online;
  const pending = status?.pending ?? 0;
  const syncing = status?.syncing ?? false;

  let tone = "idle";
  let icon = <CheckIcon size={13} />;
  let label = t("Synced");

  if (!ready) {
    tone = "idle";
    icon = <CloudIcon size={13} />;
    label = t("Checking connection…");
  } else if (offline) {
    tone = "offline";
    icon = <CloudOffIcon size={13} />;
    label = pending > 0 ? t("Offline · {n} waiting").replace("{n}", String(pending)) : t("Offline");
  } else if (syncing) {
    tone = "busy";
    icon = <RefreshIcon size={13} className="spin" />;
    label = t("Syncing…");
  } else if (pending > 0) {
    tone = "busy";
    icon = <CloudIcon size={13} />;
    label = t("{n} waiting to sync").replace("{n}", String(pending));
  } else if (status?.last_synced_at) {
    const mins = minutesAgo(status.last_synced_at);
    label = mins < 1 ? t("Synced just now") : t("Synced {n} min ago").replace("{n}", String(mins));
  }

  const title = offline
    ? t("No connection. Your changes are saved and will go out once it is back.")
    : status?.last_error
      ? t("Sync problem: {error}").replace("{error}", status.last_error)
      : t("Sync everything with Telegram now");

  return (
    <button
      type="button"
      className={`sync-indicator sync-indicator-${tone} ${compact ? "is-compact" : ""}`}
      onClick={onSyncNow}
      title={title}
    >
      <span className="sync-indicator-icon">{icon}</span>
      <span className="sync-indicator-label truncate">{label}</span>
    </button>
  );
}

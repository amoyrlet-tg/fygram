import { useState } from "react";
import { createPortal } from "react-dom";
import type { SyncDepth } from "@/shared/api/types";
import { useT } from "@/shared/i18n";
import { useModalClose } from "@/shared/hooks/useModalClose";
import { CloseIcon } from "@/shared/ui/icons";
import "./SyncDialog.css";

let lastDepth: SyncDepth = "new_only";

function Choice({
  active,
  title,
  hint,
  note,
  onSelect,
}: {
  active: boolean;
  title: string;
  hint: string;
  note?: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`sync-choice${active ? " is-active" : ""}`}
      onClick={onSelect}
      aria-pressed={active}
    >
      <span className="sync-choice-mark" aria-hidden />
      <span className="sync-choice-text">
        <span className="sync-choice-title">{title}</span>
        <span className="sync-choice-hint">{hint}</span>
        {note && <span className="sync-choice-note">{note}</span>}
      </span>
    </button>
  );
}

export function SyncDialog({
  channelTitle,
  onConfirm,
  onCancel,
}: {
  channelTitle: string;
  onConfirm: (depth: SyncDepth) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const { closing, requestClose } = useModalClose(onCancel);
  const [depth, setDepth] = useState<SyncDepth>(lastDepth);

  const confirm = () => {
    lastDepth = depth;
    onConfirm(depth);
  };

  return createPortal(
    <div className={`modal-backdrop${closing ? " is-closing" : ""}`} onClick={requestClose}>
      <div
        className={`modal sync-dialog${closing ? " is-closing" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{t("Sync channel")}</h2>
          <button className="icon-btn" onClick={requestClose} aria-label={t("Close")}>
            <CloseIcon size={16} />
          </button>
        </div>

        <div className="modal-body sync-dialog-body">
          <p className="sync-dialog-channel truncate">{channelTitle}</p>

          <div className="sync-dialog-group">
            <span className="sync-dialog-legend">{t("What to check")}</span>
            <Choice
              active={depth === "new_only"}
              title={t("Only what's new")}
              hint={t("Walks down until it reaches tracks already in the library, then stops.")}
              onSelect={() => setDepth("new_only")}
            />
            <Choice
              active={depth === "full"}
              title={t("Everything")}
              hint={t("Re-reads the whole history: catches audio swapped under an old post.")}
              note={t("Also removes tracks the channel no longer has. Takes longer.")}
              onSelect={() => setDepth("full")}
            />
          </div>

          <p className="sync-dialog-note">
            {t(
              "Either way this only refreshes the list — files are fetched by the download button.",
            )}
          </p>
        </div>

        <div className="modal-footer sync-dialog-footer">
          <button className="btn btn-ghost" onClick={requestClose}>
            {t("Cancel")}
          </button>
          <button className="btn btn-primary" onClick={confirm}>
            {t("Sync now")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

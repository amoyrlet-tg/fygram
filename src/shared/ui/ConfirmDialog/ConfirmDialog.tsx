import { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/shared/i18n";
import { useModalClose } from "@/shared/hooks/useModalClose";
import { CloseIcon } from "@/shared/ui/icons";
import "./ConfirmDialog.css";

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  title: ReactNode;
  message: ReactNode;
  confirmLabel: ReactNode;

  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const { closing, requestClose } = useModalClose(onCancel);
  return createPortal(
    <div className={`modal-backdrop${closing ? " is-closing" : ""}`} onClick={requestClose}>
      <div
        className={`modal confirm-dialog${closing ? " is-closing" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={requestClose} aria-label={t("Close")}>
            <CloseIcon size={16} />
          </button>
        </div>
        <div className="modal-body confirm-dialog-body">{message}</div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={requestClose}>
            {t("Cancel")}
          </button>
          <button className={`btn ${danger ? "btn-danger" : "btn-primary"}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

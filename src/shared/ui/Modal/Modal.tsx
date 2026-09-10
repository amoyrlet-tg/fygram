import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/shared/i18n";
import { useModalClose } from "@/shared/hooks/useModalClose";
import { CloseIcon } from "@/shared/ui/icons";
import "./Modal.css";

export function Modal({
  title,
  onClose,
  children,
  footer,
  className = "",
  bodyClassName = "",
  wide,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
  wide?: boolean;
}) {
  const t = useT();
  const { closing, requestClose } = useModalClose(onClose);

  return createPortal(
    <div className={`modal-backdrop${closing ? " is-closing" : ""}`} onClick={requestClose}>
      <div
        className={`modal${wide ? " is-wide" : ""}${closing ? " is-closing" : ""} ${className}`}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close" onClick={requestClose} aria-label={t("Close")}>
            <CloseIcon size={18} />
          </button>
        </div>
        <div className={`modal-body ${bodyClassName}`}>{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

import { FormEvent, useState } from "react";
import { createPortal } from "react-dom";
import { channelsApi } from "../../api";
import { useT } from "@/shared/i18n";
import { useModalClose } from "@/shared/hooks/useModalClose";
import { PlusIcon } from "@/shared/ui/icons";
import "./ChannelPicker.css";

export function ChannelPicker({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const t = useT();
  const { closing, requestClose } = useModalClose(onClose);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState("");

  const addByLink = async (e: FormEvent) => {
    e.preventDefault();
    if (!link.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await channelsApi.addChannelByLink(link.trim());
      onAdded();
      requestClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className={`modal-backdrop${closing ? " is-closing" : ""}`} onClick={requestClose}>
      <div className={`modal${closing ? " is-closing" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{t("Add channels & groups")}</h2>
          <button className="icon-btn" onClick={requestClose} aria-label={t("Close")}>
            ×
          </button>
        </div>

        <form className="channel-picker-manual" onSubmit={addByLink}>
          <input
            placeholder={t("Paste a t.me link or @username…")}
            value={link}
            onChange={(e) => setLink(e.target.value)}
            autoFocus
          />
          <button className="btn btn-primary" type="submit" disabled={busy || !link.trim()}>
            <PlusIcon size={16} />
            {busy ? t("Adding…") : t("Add")}
          </button>
        </form>

        {error && (
          <div className="modal-body">
            <div className="auth-error">{error}</div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

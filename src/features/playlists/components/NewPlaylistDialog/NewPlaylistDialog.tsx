import { useState } from "react";
import { createPortal } from "react-dom";
import { convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useT } from "@/shared/i18n";
import { useModalClose } from "@/shared/hooks/useModalClose";
import { CloseIcon, EditIcon, PlaylistIcon } from "@/shared/ui/icons";
import "./NewPlaylistDialog.css";

export function NewPlaylistDialog({
  onCreate,
  onCancel,
}: {
  onCreate: (name: string, coverPath: string | null) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const { closing, requestClose } = useModalClose(onCancel);
  const [name, setName] = useState("");
  const [coverPath, setCoverPath] = useState<string | null>(null);

  const pickCover = async () => {
    const picked = await open({
      multiple: false,
      filters: [{ name: t("Images"), extensions: ["jpg", "jpeg", "png", "webp", "gif"] }],
    });
    if (typeof picked === "string") setCoverPath(picked);
  };

  const trimmed = name.trim();
  const submit = () => {
    if (!trimmed) return;
    onCreate(trimmed, coverPath);
  };

  return createPortal(
    <div className={`modal-backdrop${closing ? " is-closing" : ""}`} onClick={requestClose}>
      <div
        className={`modal new-playlist${closing ? " is-closing" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{t("New playlist")}</h2>
          <button className="icon-btn" onClick={requestClose} aria-label={t("Close")}>
            <CloseIcon size={16} />
          </button>
        </div>

        <div className="modal-body new-playlist-body">
          <button
            type="button"
            className="new-playlist-art"
            onClick={() => void pickCover()}
            title={t("Set playlist cover…")}
            aria-label={t("Set playlist cover…")}
          >
            {coverPath ? (
              <img src={convertFileSrc(coverPath)} alt="" decoding="async" />
            ) : (
              <PlaylistIcon size={38} />
            )}
            <span className="new-playlist-art-hint">
              <EditIcon size={20} />
            </span>
          </button>

          <label className="field new-playlist-name">
            {t("Name")}
            <input
              autoFocus
              value={name}
              placeholder={t("Playlist name…")}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
            />
          </label>
        </div>

        <div className="modal-footer new-playlist-footer">
          <button className="btn btn-ghost" onClick={requestClose}>
            {t("Cancel")}
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={!trimmed}>
            {t("Create")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

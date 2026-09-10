import { useState } from "react";
import { createPortal } from "react-dom";
import { open } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { Track } from "@/shared/api/types";
import { trackLabel } from "@/shared/lib/format";
import { avatarGradientCss } from "@/shared/lib/avatarColor";
import { useTrackCover } from "../../useTrackCover";
import { useT } from "@/shared/i18n";
import { useModalClose } from "@/shared/hooks/useModalClose";
import { CloseIcon, EditIcon } from "@/shared/ui/icons";
import "./TrackEditDialog.css";

export type TrackEdit = {
  title: string | null;
  artist: string | null;
  coverPath: string | null;
  repost?: { caption: string; deleteOriginal: boolean };
};

function originalDateLine(track: Track): string {
  const iso = track.forwarded_at ?? track.published_at;
  if (!iso) return "";
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return "";

  const stamp = when.toLocaleString("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return track.forwarded_from
    ? `Original file was published by ${track.forwarded_from} on ${stamp} UTC`
    : `Original file was published on ${stamp} UTC`;
}

export function TrackEditDialog({
  track,
  saving,
  onSave,
  onCancel,
}: {
  track: Track;
  saving: boolean;
  onSave: (edit: TrackEdit) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const { closing, requestClose } = useModalClose(onCancel);
  const cover = useTrackCover(track.id);
  const label = trackLabel(track);

  const [title, setTitle] = useState(track.title ?? label.title);
  const [artist, setArtist] = useState(track.artist ?? label.artist);
  const [coverPath, setCoverPath] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);

  const isForward = track.forwarded === true;
  const defaultCaption = originalDateLine(track);
  const [caption, setCaption] = useState(defaultCaption);
  const [deleteOriginal, setDeleteOriginal] = useState(true);

  const [proposed, setProposed] = useState(defaultCaption);
  if (proposed !== defaultCaption) {
    setProposed(defaultCaption);
    if (caption === proposed) setCaption(defaultCaption);
  }

  const toggleDelete = (next: boolean) => {
    setDeleteOriginal(next);
    setCaption((current) => {
      if (next) return current === "" ? defaultCaption : current;
      return current === defaultCaption ? "" : current;
    });
  };

  const pickCover = async () => {
    try {
      const picked = await open({
        multiple: false,
        filters: [{ name: t("Images"), extensions: ["jpg", "jpeg", "png", "webp", "gif"] }],
      });
      if (typeof picked === "string") {
        setCoverPath(picked);
        setPickError(null);
      }
    } catch (err) {
      setPickError(String(err));
    }
  };

  const submit = () => {
    if (saving) return;
    onSave({
      title: title.trim() || null,
      artist: artist.trim() || null,
      coverPath,
      repost: isForward ? { caption: caption.trim(), deleteOriginal } : undefined,
    });
  };

  const coverName = coverPath?.split(/[/\\]/).pop();

  return createPortal(
    <div className={`modal-backdrop${closing ? " is-closing" : ""}`} onClick={requestClose}>
      <div
        className={`modal track-edit${closing ? " is-closing" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{isForward ? t("Replace the message") : t("Edit track")}</h2>
          <button className="icon-btn" onClick={requestClose} aria-label={t("Close")}>
            <CloseIcon size={16} />
          </button>
        </div>

        <div className="modal-body track-edit-body">
          <div className="track-edit-cover-row">
            {coverPath ? (
              <img className="track-edit-cover" src={convertFileSrc(coverPath)} alt="" />
            ) : cover ? (
              <img className="track-edit-cover" src={cover.src} alt="" />
            ) : (
              <div
                className="track-edit-cover track-edit-cover-empty"
                style={{ background: avatarGradientCss(track.id) }}
              >
                <span>{label.title.slice(0, 1).toUpperCase()}</span>
              </div>
            )}

            <div className="track-edit-cover-side">
              <button type="button" className="btn btn-ghost" onClick={pickCover}>
                <EditIcon size={13} />
                {t("Choose a cover")}
              </button>
              <span className={`track-edit-hint truncate${pickError ? " is-error" : ""}`}>
                {pickError
                  ? pickError
                  : coverName
                    ? `${t("Picked")}: ${coverName}`
                    : t("The picture is written into the file itself.")}
              </span>
            </div>
          </div>

          <label className="field track-edit-field">
            <span>{t("Title")}</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </label>

          <label className="field track-edit-field">
            <span>{t("Artist")}</span>
            <input value={artist} onChange={(e) => setArtist(e.target.value)} />
          </label>

          {isForward ? (
            <>
              <p className="track-edit-note is-warn">
                {t(
                  "Telegram does not edit forwarded messages. The track can be posted again as a new message instead.",
                )}
              </p>

              <label className="field track-edit-field">
                <span>{t("Caption for the new message")}</span>
                <input
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder={t("Leave empty for no caption")}
                />
              </label>

              <label className="track-edit-check">
                <input
                  type="checkbox"
                  checked={deleteOriginal}
                  onChange={(e) => toggleDelete(e.target.checked)}
                />
                <span>{t("Delete the original message")}</span>
              </label>
            </>
          ) : null}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={requestClose} disabled={saving}>
            {t("Cancel")}
          </button>
          <button
            className={`btn ${isForward && deleteOriginal ? "btn-danger" : "btn-primary"}`}
            onClick={submit}
            disabled={saving}
          >
            {saving
              ? t("Saving to Telegram…")
              : isForward
                ? deleteOriginal
                  ? t("Replace the message")
                  : t("Post a new message")
                : t("Apply")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

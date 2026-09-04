import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { createPortal } from "react-dom";
import type { BroadcastConfig } from "@/shared/api/types";
import { broadcastApi } from "../../api";
import { useT } from "@/shared/i18n";
import { useModalClose } from "@/shared/hooks/useModalClose";
import "./BroadcastSettings.css";

export function BroadcastSettings({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { closing, requestClose } = useModalClose(onClose);
  const [config, setConfig] = useState<BroadcastConfig | null>(null);
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    broadcastApi
      .getConfig()
      .then((loaded) => {
        setConfig(loaded);
        setUrl(loaded.url);
        setEnabled(loaded.enabled);
      })
      .catch((err) => setError(String(err)));
  }, []);

  const save = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const saved = await broadcastApi.setConfig(enabled, url, token === "" ? null : token);
      setConfig(saved);
      setToken("");
      setResult(t("Saved."));
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await broadcastApi.check(url, token));
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
          <h2>{t("Broadcast now playing")}</h2>
          <button className="icon-btn" onClick={requestClose} aria-label={t("Close")}>
            ×
          </button>
        </div>

        <div className="modal-body">
          <p className="muted">
            {t(
              "Sends what you're playing to a server you run, so a site can show it live and let visitors listen along. Off by default, and nothing is sent until you switch it on.",
            )}
          </p>

          <label className="broadcast-field">
            <span>{t("Server URL")}</span>
            <input
              type="url"
              placeholder="http://localhost:8787"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              spellCheck={false}
            />
          </label>

          <label className="broadcast-field">
            <span>{t("Token")}</span>
            <input
              type="password"
              placeholder={
                config?.has_token
                  ? t("stored — leave blank to keep it")
                  : t("the server's BIO_TOKEN")
              }
              value={token}
              onChange={(e) => setToken(e.target.value)}
              spellCheck={false}
            />
          </label>

          <div className="broadcast-toggle-row">
            <span>{t("Broadcast while playing")}</span>
            <label className="toggle">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              <span className="toggle-track" />
            </label>
          </div>

          <button
            className="btn btn-ghost broadcast-doc-btn"
            onClick={() => invoke("open_docs_window", { page: "broadcast" }).catch(console.error)}
          >
            {t("Read the documentation")}
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M14 4h6v6" />
              <path d="M20 4 11 13" />
              <path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
            </svg>
          </button>

          {error && <div className="auth-error">{error}</div>}
          {result && <div className="empty-hint">{result}</div>}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" disabled={busy || !url} onClick={test}>
            {t("Test connection")}
          </button>
          <button className="btn btn-primary" disabled={busy} onClick={save}>
            {busy ? t("Saving…") : t("Save")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useT } from "@/shared/i18n";
import { AI_SERVER_PROMPT } from "./aiPrompt";
import "./DocsWindow.css";

export function DocsWindow() {
  const t = useT();
  const [copied, setCopied] = useState(false);

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(AI_SERVER_PROMPT);
    } catch {
      const scratch = document.createElement("textarea");
      scratch.value = AI_SERVER_PROMPT;
      document.body.appendChild(scratch);
      scratch.select();
      document.execCommand("copy");
      scratch.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void getCurrentWindow().close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="docs-window">
      <article className="docs">
        <header className="docs-hero">
          <img className="docs-logo" src="/icon.png" alt="" />
          <h1>{t("broadcasting “now playing”")}</h1>
          <p className="docs-lead">
            {t(
              "fygram can push the track you are listening to at a server you run, so a site can show it live and let visitors listen along",
            )}
          </p>
          <button className="btn btn-primary docs-copy" onClick={copyPrompt}>
            {copied ? t("copied") : t("copy prompt for ai")}
            {copied ? (
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <polyline points="4 12 10 18 20 6" />
              </svg>
            ) : (
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <rect x="9" y="9" width="12" height="12" rx="2.5" />
                <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
              </svg>
            )}
          </button>
          <p className="docs-copy-hint">
            {t("everything a model needs to write the receiving server, in english")}
          </p>
        </header>

        <h2>{t("what your server has to implement")}</h2>
        <p>
          {t("five endpoints. everything except health takes")}{" "}
          <code>Authorization: Bearer {"{token}"}</code>.
        </p>
        <div className="docs-table-wrap">
          <table className="docs-table">
            <thead>
              <tr>
                <th>{t("method")}</th>
                <th>{t("path")}</th>
                <th>{t("why")}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <span className="docs-verb docs-verb-get">GET</span>
                </td>
                <td>
                  <code>/api/health</code>
                </td>
                <td>{t("is anything there at all")}</td>
              </tr>
              <tr>
                <td>
                  <span className="docs-verb docs-verb-post">POST</span>
                </td>
                <td>
                  <code>/api/music</code>
                </td>
                <td>{t("the playhead, every ~3s")}</td>
              </tr>
              <tr>
                <td>
                  <span className="docs-verb docs-verb-post">POST</span>
                </td>
                <td>
                  <code>/api/music/stop</code>
                </td>
                <td>{t("playback ended")}</td>
              </tr>
              <tr>
                <td>
                  <span className="docs-verb docs-verb-get">GET</span>
                </td>
                <td>
                  <code>/api/audio/pending</code>
                </td>
                <td>{t("which files you still want")}</td>
              </tr>
              <tr>
                <td>
                  <span className="docs-verb docs-verb-put">PUT</span>
                </td>
                <td>
                  <code>{"/api/audio/{channel_id}/{message_id}"}</code>
                </td>
                <td>{t("the audio itself, once per track")}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h3>{t("1. the playhead")}</h3>
        <pre className="docs-code">{`POST {url}/api/music
Authorization: Bearer {token}
Content-Type: application/json

{
  "channel_id": -1001234567890,
  "message_id": 42,
  "title":      "Song",
  "artist":     "Someone",
  "duration":   215.0,
  "position":   12.5,
  "playing":    true
}`}</pre>
        <p>
          {t(
            "duration and position are seconds. artist is empty when the file carries no artist tag. playing is false while paused, and a server keeping its own copy of the playhead should stop advancing it when it sees that.",
          )}
        </p>
        <p>
          {t(
            "a track change is reported the moment it happens, at position 0, without waiting for the next tick: someone joining right then starts at the top of the song rather than several seconds in",
          )}
        </p>

        <h3>{t("2. the audio file, once, and only if asked")}</h3>
        <pre className="docs-code">{`GET {url}/api/audio/pending
Authorization: Bearer {token}

[{ "channel_id": -1001234567890, "message_id": 42, "requested_at": 1784717437024 }]`}</pre>
        <p>{t("everything listed there, and nothing else, is uploaded once:")}</p>
        <pre className="docs-code">{`PUT {url}/api/audio/{channel_id}/{message_id}
Authorization: Bearer {token}

<raw bytes of the audio file>`}</pre>
        <p>
          {t(
            "a track that isn't downloaded locally yet is skipped and stays in your pending list, so it goes out on a later beat. serving that audio back with HTTP Range support is what lets a website seek through it.",
          )}
        </p>

        <h3>{t("3. stop, on pause, track end and quit")}</h3>
        <pre className="docs-code docs-last">{`POST {url}/api/music/stop
Authorization: Bearer {token}`}</pre>
      </article>
    </div>
  );
}

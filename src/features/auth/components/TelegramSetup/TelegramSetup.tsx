import { FormEvent, useEffect, useMemo, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { authApi } from "../../api";
import { useT } from "@/shared/i18n";
import { AuthShell } from "../AuthShell";
import { CheckIcon, ChevronDownIcon } from "@/shared/ui/icons";
import "./TelegramSetup.css";

const PORTAL = "https://my.telegram.org/apps";

type Check = { ok: boolean; hint: string | null };

/** Digits only, and long enough to be a real app id rather than a typo. */
function checkApiId(raw: string, t: (k: string) => string): Check {
  const value = raw.trim();
  if (!value) return { ok: false, hint: null };
  if (value.startsWith("+")) {
    return {
      ok: false,
      hint: t("That is a phone number. api_id is a different number, shown on the site."),
    };
  }
  if (!/^\d+$/.test(value)) {
    return { ok: false, hint: t("api_id is digits only.") };
  }
  if (value.length < 4) return { ok: false, hint: t("Too short — api_id has at least 4 digits.") };
  return { ok: true, hint: null };
}

/** Exactly 32 hex characters, which is what the portal prints. */
function checkApiHash(raw: string, t: (k: string) => string): Check {
  const value = raw.trim();
  if (!value) return { ok: false, hint: null };
  if (!/^[0-9a-fA-F]*$/.test(value)) {
    return { ok: false, hint: t("api_hash only has digits and the letters a to f.") };
  }
  if (value.length !== 32) {
    return {
      ok: false,
      hint: `${t("api_hash is exactly 32 characters.")} ${t("You have")} ${value.length}.`,
    };
  }
  return { ok: true, hint: null };
}

export function TelegramSetup({ onDone }: { onDone: () => void }) {
  const t = useT();
  const [apiId, setApiId] = useState("");
  const [apiHash, setApiHash] = useState("");
  const [touched, setTouched] = useState({ id: false, hash: false });
  const [slide, setSlide] = useState(0);

  // already stored: no need to fetch them from my.telegram.org again
  useEffect(() => {
    let alive = true;
    authApi
      .getTelegramCredentials()
      .then((saved) => {
        if (!alive || !saved) return;
        setApiId(String(saved.api_id));
        setApiHash(saved.api_hash);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const steps = useMemo(
    () => [
      t(
        "Open my.telegram.org and enter your phone in international format. The code comes to Telegram itself, not by SMS.",
      ),
      t("On the page that opens, click “API development tools”."),
      t("Fill in App title and Short name — anything at all, fygram will do."),
      t("The page then shows App api_id and App api_hash. Copy them here."),
    ],
    [t],
  );

  const idCheck = useMemo(() => checkApiId(apiId, t), [apiId, t]);
  const hashCheck = useMemo(() => checkApiHash(apiHash, t), [apiHash, t]);
  const ready = idCheck.ok && hashCheck.ok;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched({ id: true, hash: true });
    if (!ready) return;

    setBusy(true);
    setError(null);
    try {
      await authApi.saveTelegramCredentials(Number.parseInt(apiId.trim(), 10), apiHash.trim());
      onDone();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  const fieldClass = (check: Check, shown: boolean, value: string) =>
    `field setup-field${shown && check.hint ? " is-bad" : ""}${check.ok && value ? " is-good" : ""}`;

  return (
    <AuthShell
      title={t("Connect your telegram")}
      subtitle={t(
        "fygram talks to telegram directly, with no server in between, so it needs two keys of your own. they take a minute to get.",
      )}
    >
      <div className="setup-slides">
        <div className="setup-track" style={{ transform: `translateX(-${slide * 100}%)` }}>
          {steps.map((text, i) => (
            <div className="setup-slide" key={i} aria-hidden={i !== slide}>
              <span className="setup-step-num">{i + 1}</span>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="setup-nav">
        <button
          type="button"
          className="setup-arrow"
          onClick={() => setSlide((i) => Math.max(0, i - 1))}
          disabled={slide === 0}
          aria-label={t("Previous")}
        >
          <ChevronDownIcon size={14} />
        </button>
        <div className="setup-dots">
          {steps.map((_, i) => (
            <button
              type="button"
              key={i}
              className={`setup-dot${i === slide ? " is-active" : ""}`}
              onClick={() => setSlide(i)}
              aria-label={`${i + 1}`}
            />
          ))}
        </div>
        <button
          type="button"
          className="setup-arrow is-next"
          onClick={() => setSlide((i) => Math.min(steps.length - 1, i + 1))}
          disabled={slide === steps.length - 1}
          aria-label={t("Next")}
        >
          <ChevronDownIcon size={14} />
        </button>
      </div>

      <button type="button" className="setup-portal" onClick={() => void openUrl(PORTAL)}>
        {t("Open my.telegram.org/apps")}
      </button>

      <form className="auth-form setup-form" onSubmit={submit}>
        <label className={fieldClass(idCheck, touched.id, apiId)}>
          <span className="setup-label">
            api_id
            {idCheck.ok && <CheckIcon size={12} className="setup-ok" />}
          </span>
          <input
            inputMode="numeric"
            // some keyboards want a pattern too before showing a number pad
            pattern="[0-9]*"
            spellCheck={false}
            autoComplete="off"
            enterKeyHint="next"
            placeholder="1234567"
            value={apiId}
            onChange={(e) => setApiId(e.target.value.replace(/\D+/g, ""))}
            onBlur={() => setTouched((s) => ({ ...s, id: true }))}
            autoFocus
          />
          <span className="setup-note">
            {touched.id && idCheck.hint
              ? idCheck.hint
              : t("A number of 5 to 8 digits, not your phone number.")}
          </span>
        </label>

        <label className={fieldClass(hashCheck, touched.hash, apiHash)}>
          <span className="setup-label">
            api_hash
            {hashCheck.ok && <CheckIcon size={12} className="setup-ok" />}
          </span>
          <input
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            enterKeyHint="go"
            maxLength={32}
            className="setup-mono"
            placeholder="0123456789abcdef0123456789abcdef"
            value={apiHash}
            onChange={(e) => setApiHash(e.target.value.replace(/\s+/g, ""))}
            onBlur={() => setTouched((s) => ({ ...s, hash: true }))}
          />
          <span className="setup-note">
            {touched.hash && hashCheck.hint
              ? hashCheck.hint
              : t("32 characters, digits and letters a to f.")}
          </span>
        </label>

        {error && <div className="auth-error">{error}</div>}

        <button className="btn btn-primary" type="submit" disabled={busy || !ready}>
          {busy ? t("Connecting…") : t("Continue")}
        </button>
      </form>

      <p className="auth-hint">
        {t("The keys identify the app, not your account. They stay on this machine.")}
      </p>
    </AuthShell>
  );
}

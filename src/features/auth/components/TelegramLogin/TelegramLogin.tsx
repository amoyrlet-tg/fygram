import { FormEvent, useState } from "react";
import { authApi } from "../../api";
import { useT } from "@/shared/i18n";
import { AuthShell } from "../AuthShell";
import { EyeIcon, EyeOffIcon } from "@/shared/ui/icons";
import "./TelegramLogin.css";

type Step = "phone" | "code" | "password";

export function TelegramLogin({
  onDone,
  onChangeCredentials,
}: {
  onDone: () => void;

  onChangeCredentials: () => void;
}) {
  const t = useT();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const backToPhone = () => {
    setCode("");
    setPassword("");
    setError(null);
    setStep("phone");
  };

  const submitPhone = async (e: FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await authApi.telegramRequestLoginCode(phone.trim());
      setStep("code");
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const outcome = await authApi.telegramSubmitCode(code.trim());
      if (outcome === "password_required") {
        setStep("password");
      } else {
        onDone();
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  const submitPassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setBusy(true);
    setError(null);
    try {
      await authApi.telegramSubmitPassword(password);
      onDone();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title={t("Log in to Telegram")}>
      {step === "phone" && (
        <form className="auth-form" onSubmit={submitPhone}>
          <label className="field">
            <span>{t("Phone number")}</span>
            <input
              inputMode="tel"
              autoComplete="tel"
              enterKeyHint="send"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="+888 1536 1654"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoFocus
            />
          </label>
          {error && <div className="auth-error">{error}</div>}
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? t("Sending…") : t("Send code")}
          </button>
          <button
            type="button"
            className="auth-link auth-change-creds"
            onClick={onChangeCredentials}
          >
            {t("Wrong API ID or hash? Re-enter them")}
          </button>
        </form>
      )}

      {step === "code" && (
        <form className="auth-form" onSubmit={submitCode}>
          <label className="field">
            <span>{t("Login code")}</span>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              enterKeyHint="go"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              maxLength={8}
              placeholder="12345"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoFocus
            />
          </label>
          {error && <div className="auth-error">{error}</div>}
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? t("Verifying…") : t("Verify")}
          </button>
          <button
            type="button"
            className="auth-link auth-back"
            onClick={backToPhone}
            disabled={busy}
          >
            {t("Back to the phone number")}
          </button>
        </form>
      )}

      {step === "password" && (
        <form className="auth-form" onSubmit={submitPassword}>
          <label className="field">
            <span>{t("Two-factor password")}</span>
            <div className="password-field">
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                enterKeyHint="go"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder={t("Your cloud password")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
              <button
                type="button"
                className="password-reveal"
                aria-label={t(showPassword ? "Hide password" : "Show password")}
                title={t(showPassword ? "Hide password" : "Show password")}
                onClick={() => setShowPassword((s) => !s)}
              >
                {showPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
              </button>
            </div>
          </label>
          {error && <div className="auth-error">{error}</div>}
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? t("Checking…") : t("Confirm")}
          </button>
          <button
            type="button"
            className="auth-link auth-back"
            onClick={backToPhone}
            disabled={busy}
          >
            {t("Start over")}
          </button>
        </form>
      )}
    </AuthShell>
  );
}

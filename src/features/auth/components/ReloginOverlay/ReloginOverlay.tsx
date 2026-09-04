import { useT } from "@/shared/i18n";
import { TelegramLogin } from "../TelegramLogin";
import "./ReloginOverlay.css";

export function ReloginOverlay({
  onDone,
  onChangeCredentials,
  onDismiss,
}: {
  onDone: () => void;
  onChangeCredentials: () => void;
  onDismiss: () => void;
}) {
  const t = useT();

  return (
    <div className="relogin-overlay" role="dialog" aria-modal="true">
      <TelegramLogin onDone={onDone} onChangeCredentials={onChangeCredentials} />
      <div className="relogin-footer">
        <p className="relogin-note">
          {t(
            "Log in with the same account — signing in as someone else replaces the local library.",
          )}
        </p>
        <button className="btn btn-ghost relogin-dismiss" onClick={onDismiss}>
          {t("Later — keep listening")}
        </button>
      </div>
    </div>
  );
}

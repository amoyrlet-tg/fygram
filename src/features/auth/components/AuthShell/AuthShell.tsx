import { ReactNode, useCallback, useState } from "react";
import { useT } from "@/shared/i18n";
import { LanguageSwitcher } from "@/shared/ui/LanguageSwitcher";
import { MoonIcon, SunIcon } from "@/shared/ui/icons";
import "./AuthShell.css";

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const t = useT();
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    document.documentElement.dataset.theme === "light" ? "light" : "dark",
  );
  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      localStorage.setItem("theme", next);
      return next;
    });
  }, []);

  return (
    <div className="auth-screen">
      <header className="auth-topbar">
        <div className="auth-brand">
          <span className="brand-name">fygram</span>
        </div>
      </header>

      <div className="auth-body">
        <div className="auth-card">
          <h1 className="auth-title">{title}</h1>
          {subtitle && <p className="auth-subtitle">{subtitle}</p>}
          {children}
        </div>

        <div className="auth-prefs">
          <LanguageSwitcher withLabel />
          <button
            type="button"
            className="auth-pref-btn"
            title={t(theme === "dark" ? "Switch to light theme" : "Switch to dark theme")}
            onClick={toggleTheme}
          >
            {theme === "dark" ? <SunIcon size={13} /> : <MoonIcon size={13} />}
            <span>{t(theme === "dark" ? "Light theme" : "Dark theme")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

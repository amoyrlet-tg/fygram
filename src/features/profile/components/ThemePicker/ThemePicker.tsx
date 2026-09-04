import type { Theme } from "@/app/useTheme";
import { useT } from "@/shared/i18n";
import "./ThemePicker.css";

const ACCENTS: { id: string; value: string | null; swatch: string; labelKey: string }[] = [
  { id: "classic", value: null, swatch: "#2aabee", labelKey: "Classic" },
  { id: "blue", value: "#4a9eff", swatch: "#4a9eff", labelKey: "Blue" },
  { id: "teal", value: "#2dd4bf", swatch: "#2dd4bf", labelKey: "Teal" },
  { id: "purple", value: "#a78bfa", swatch: "#a78bfa", labelKey: "Purple" },
  { id: "pink", value: "#f472b6", swatch: "#f472b6", labelKey: "Pink" },
  { id: "orange", value: "#f5a524", swatch: "#f5a524", labelKey: "Orange" },
  { id: "red", value: "#ef4444", swatch: "#ef4444", labelKey: "Red" },
  { id: "gray", value: "#9e9e9e", swatch: "#9e9e9e", labelKey: "Gray" },
  { id: "white", value: "#ffffff", swatch: "#ffffff", labelKey: "White" },
];

export function ThemePicker({
  theme,
  accent,
  onSetTheme,
  onSetAccent,
}: {
  theme: Theme;
  accent: string | null;
  onSetTheme: (theme: Theme) => void;
  onSetAccent: (accent: string | null) => void;
}) {
  const t = useT();
  const isPresetActive = (value: string | null) =>
    value === null ? accent === null : accent?.toLowerCase() === value.toLowerCase();
  const isCustomActive =
    accent !== null &&
    !ACCENTS.some((a) => a.value && a.value.toLowerCase() === accent.toLowerCase());

  return (
    <div className="theme-picker-section">
      <span className="profile-section-label">{t("Appearance")}</span>

      <div className="theme-cards">
        <button
          type="button"
          className={`theme-card${theme === "light" ? " is-active" : ""}`}
          onClick={() => onSetTheme("light")}
        >
          <span className="theme-card-preview theme-card-preview-light">
            <span className="tcp-bar" style={{ width: "62%" }} />
            <span className="tcp-bar" style={{ width: "40%" }} />
            <span className="tcp-ring" />
          </span>
          <span className="theme-card-label">{t("Light")}</span>
        </button>
        <button
          type="button"
          className={`theme-card${theme === "dark" ? " is-active" : ""}`}
          onClick={() => onSetTheme("dark")}
        >
          <span className="theme-card-preview theme-card-preview-dark">
            <span className="tcp-bar" style={{ width: "62%" }} />
            <span className="tcp-bar" style={{ width: "40%" }} />
            <span className="tcp-ring" />
          </span>
          <span className="theme-card-label">{t("Dark")}</span>
        </button>
      </div>

      <div className="accent-swatches">
        {ACCENTS.map((a) => (
          <button
            key={a.id}
            type="button"
            className={`accent-swatch${isPresetActive(a.value) ? " is-active" : ""}`}
            style={{ background: a.swatch }}
            aria-label={t(a.labelKey)}
            onClick={() => onSetAccent(a.value)}
          />
        ))}
        <label
          className={`accent-swatch accent-swatch-custom${isCustomActive ? " is-active" : ""}`}
          aria-label={t("Custom color")}
        >
          <input
            type="color"
            value={accent && isCustomActive ? accent : "#2aabee"}
            onChange={(e) => onSetAccent(e.target.value)}
          />
        </label>
      </div>
    </div>
  );
}

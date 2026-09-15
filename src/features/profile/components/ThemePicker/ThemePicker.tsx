import type { Theme } from "@/app/useTheme";
import { useT } from "@/shared/i18n";
import "./ThemePicker.css";

const ACCENTS: { id: string; value: string | null; swatch: string; labelKey: string }[] = [
  { id: "classic", value: null, swatch: "#2aabee", labelKey: "Classic" },
  { id: "purple", value: "#a78bfa", swatch: "#a78bfa", labelKey: "Purple" },
  { id: "lime", value: "#b5cc6a", swatch: "#b5cc6a", labelKey: "Lime" },
  { id: "teal", value: "#4fd6c4", swatch: "#4fd6c4", labelKey: "Teal" },
  { id: "periwinkle", value: "#a9b8f5", swatch: "#a9b8f5", labelKey: "Periwinkle" },
  { id: "pink", value: "#f7a8dc", swatch: "#f7a8dc", labelKey: "Pink" },
  { id: "orange", value: "#f5b169", swatch: "#f5b169", labelKey: "Orange" },
  { id: "salmon", value: "#f79a9a", swatch: "#f79a9a", labelKey: "Salmon" },
  { id: "peach", value: "#f5b59a", swatch: "#f5b59a", labelKey: "Peach" },
];

export function ThemeCards({
  theme,
  onSetTheme,
}: {
  theme: Theme;
  onSetTheme: (theme: Theme) => void;
}) {
  const t = useT();

  return (
    <div className="theme-cards">
      {(["light", "dark"] as const).map((which) => (
        <button
          key={which}
          type="button"
          className={`theme-card${theme === which ? " is-active" : ""}`}
          onClick={() => onSetTheme(which)}
        >
          <span className={`theme-card-preview theme-card-preview-${which}`}>
            <span className="tcp-row">
              <i className="tcp-art" />
              <i className="tcp-line" />
            </span>
            <span className="tcp-row is-playing">
              <i className="tcp-art" />
              <i className="tcp-line is-short" />
            </span>
            <span className="tcp-row">
              <i className="tcp-art" />
              <i className="tcp-line" />
            </span>
            <span className="tcp-player">
              <i className="tcp-art" />
              <span className="tcp-player-mid">
                <span className="tcp-transport">
                  <i className="tcp-step" />
                  <i className="tcp-play" />
                  <i className="tcp-step" />
                </span>
                <span className="tcp-progress">
                  <i className="tcp-time" />
                  <i className="tcp-seek">
                    <i className="tcp-seek-fill" />
                  </i>
                  <i className="tcp-time" />
                </span>
              </span>
              <i className="tcp-volume" />
            </span>
          </span>
          <span className="theme-card-label">{t(which === "light" ? "Day" : "Night")}</span>
        </button>
      ))}
    </div>
  );
}

export function AccentSwatches({
  accent,
  onSetAccent,
}: {
  accent: string | null;
  onSetAccent: (accent: string | null) => void;
}) {
  const t = useT();
  const isPresetActive = (value: string | null) =>
    value === null ? accent === null : accent?.toLowerCase() === value.toLowerCase();
  const isCustomActive =
    accent !== null &&
    !ACCENTS.some((a) => a.value && a.value.toLowerCase() === accent.toLowerCase());

  return (
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
  );
}

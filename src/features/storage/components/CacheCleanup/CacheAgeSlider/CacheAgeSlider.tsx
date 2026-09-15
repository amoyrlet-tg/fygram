import type { CSSProperties } from "react";
import { useT } from "@/shared/i18n";

const STOPS = [
  { days: 7, mark: "7d", label: "7 days" },
  { days: 30, mark: "30d", label: "30 days" },
  { days: 90, mark: "90d", label: "90 days" },
  { days: 0, mark: "Never", label: "Never remove by age" },
] as const;

export interface CacheAgeSliderProps {
  value: number;
  disabled?: boolean;
  onChange: (days: number) => void;
}

export function CacheAgeSlider({ value, disabled = false, onChange }: CacheAgeSliderProps) {
  const t = useT();
  const found = STOPS.findIndex((stop) => stop.days === value);
  const index = found === -1 ? 1 : found;
  const label = t(STOPS[index].label);
  const last = STOPS.length - 1;
  const pct = (index / last) * 100;

  return (
    <section className={`cache-age${disabled ? " is-disabled" : ""}`}>
      <header className="cache-age-head">
        <span className="cache-age-title">{t("Cache age")}</span>
        <span className="cache-age-value">{label}</span>
      </header>
      <p className="cache-age-note">{t("Older files are removed on their own")}</p>
      <div className="cache-age-control" style={{ "--pct": `${pct}%` } as CSSProperties}>
        <div className="cache-age-track" aria-hidden="true">
          <span className="cache-age-fill" />
          {STOPS.map((stop, i) => (
            <span
              key={stop.days}
              className={`cache-age-tick${i <= index ? " is-filled" : ""}`}
              style={{ left: `${(i / last) * 100}%` }}
            />
          ))}
          <span className="cache-age-knob" />
        </div>
        <input
          className="cache-age-input"
          type="range"
          min={0}
          max={last}
          step={1}
          value={index}
          disabled={disabled}
          aria-label={t("Cache age")}
          aria-valuetext={label}
          onChange={(event) => {
            const stop = STOPS[Number(event.target.value)];
            if (stop) onChange(stop.days);
          }}
        />
      </div>
      <div className="cache-age-scale">
        {STOPS.map((stop, i) => (
          <button
            key={stop.days}
            type="button"
            className={`cache-age-mark${i === index ? " is-active" : ""}`}
            disabled={disabled}
            aria-label={t(stop.label)}
            onClick={() => onChange(stop.days)}
          >
            {t(stop.mark)}
          </button>
        ))}
      </div>
    </section>
  );
}

import { useEffect, useMemo, useState } from "react";
import type { StorageSlice } from "@/shared/api/types";
import { UserAvatar } from "@/shared/ui/UserAvatar";
import { initials } from "@/shared/lib/initials";
import { avatarGradientCss } from "@/shared/lib/avatarColor";
import { useT } from "@/shared/i18n";
import { CountUp } from "@/shared/ui/CountUp";

const WEDGE = ["#2b81e8", "#f5a524", "#43c97f", "#f472b6", "#a78bfa", "#4fd6c4", "#f79a9a"];
const LEFTOVER = "#7e8894";

const SIZE = 190;
const THICKNESS = 46;
const RADIUS = (SIZE - THICKNESS) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const MIN_SHARE = 0.012;
const LABEL_SHARE = 0.07;
const INNER_LIGHT = 22;
const DRAW_MS = 900;
const HOVER_GROW = 6;

export function StorageDonut({
  slices,
  total,
  totalValue,
  totalUnit,
  format,
}: {
  slices: StorageSlice[];
  total: number;
  totalValue: number;
  totalUnit: string;
  format: (bytes: number) => string;
}) {
  const t = useT();
  const [hovered, setHovered] = useState<string | null>(null);
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const wedges = useMemo(() => {
    if (total <= 0) return [];
    let offset = 0;
    return slices.map((slice, index) => {
      const share = slice.bytes / total;
      const wedge = {
        slice,
        share,
        offset,
        colour: slice.id === "" ? LEFTOVER : WEDGE[index % WEDGE.length],
      };
      offset += share;
      return wedge;
    });
  }, [slices, total]);

  const name = (slice: StorageSlice) => slice.title || t("Leftover files");
  const shown = hovered ? wedges.find((w) => w.slice.id === hovered) : null;

  return (
    <div className="donut">
      <svg className="donut-chart" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img">
        <defs>
          {wedges.map(({ slice, colour }) => (
            <radialGradient
              key={`grad-${slice.id || "leftover"}`}
              id={`donut-${slice.id || "leftover"}`}
              gradientUnits="userSpaceOnUse"
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={SIZE / 2}
            >
              <stop
                offset={(RADIUS - THICKNESS / 2) / (SIZE / 2)}
                stopColor={`color-mix(in srgb, #fff ${INNER_LIGHT}%, ${colour})`}
              />
              <stop offset="1" stopColor={colour} />
            </radialGradient>
          ))}
        </defs>
        {wedges.map(({ slice, share, offset }) => {
          const gap = share > MIN_SHARE ? 2 : 0;
          const length = Math.max(0, share * CIRCUMFERENCE - gap);
          const lit = hovered === slice.id;
          return (
            <circle
              key={slice.id || "leftover"}
              className={`donut-wedge${hovered && !lit ? " is-dimmed" : ""}`}
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              stroke={`url(#donut-${slice.id || "leftover"})`}
              strokeWidth={lit ? THICKNESS + HOVER_GROW : THICKNESS}
              fill="none"
              strokeDasharray={`${drawn ? length : 0} ${CIRCUMFERENCE}`}
              strokeDashoffset={-offset * CIRCUMFERENCE}
              style={{ transitionDelay: `${offset * DRAW_MS}ms` }}
              transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
              onMouseEnter={() => setHovered(slice.id)}
              onMouseLeave={() => setHovered(null)}
            >
              <title>{`${name(slice)} · ${Math.round(share * 100)}%`}</title>
            </circle>
          );
        })}

        {wedges
          .filter(({ share }) => share >= LABEL_SHARE)
          .map(({ slice, share, offset }) => {
            const angle = (offset + share / 2) * 2 * Math.PI - Math.PI / 2;
            return (
              <text
                key={`label-${slice.id || "leftover"}`}
                className="donut-wedge-label"
                x={SIZE / 2 + RADIUS * Math.cos(angle)}
                y={SIZE / 2 + RADIUS * Math.sin(angle)}
                textAnchor="middle"
                dominantBaseline="central"
              >
                {Math.round(share * 100)}%
              </text>
            );
          })}
      </svg>

      <div className="donut-middle">
        <span className={`donut-middle-whole${shown ? " is-faded" : ""}`}>
          <CountUp className="donut-middle-total" to={totalValue} duration={0.9} />
          <span className="donut-middle-unit">{totalUnit}</span>
        </span>
        <span className={`donut-middle-share${shown ? "" : " is-faded"}`}>
          {Math.round((shown?.share ?? 0) * 100)}%
        </span>
      </div>

      <p className="donut-caption">{shown ? name(shown.slice) : ""}</p>

      <ul className="donut-legend">
        {wedges.map(({ slice, share, colour }) => (
          <li
            key={slice.id || "leftover"}
            className={`donut-legend-row${hovered === slice.id ? " is-hovered" : ""}`}
            onMouseEnter={() => setHovered(slice.id)}
            onMouseLeave={() => setHovered(null)}
            title={name(slice)}
          >
            <span className="donut-legend-art" style={{ background: colour }}>
              {slice.avatar_path ? (
                <UserAvatar
                  className="donut-legend-avatar"
                  path={slice.avatar_path}
                  fallback={<span className="donut-legend-letter">{initials(name(slice))}</span>}
                />
              ) : slice.id ? (
                <span
                  className="donut-legend-letter"
                  style={{ background: avatarGradientCss(slice.id) }}
                >
                  {initials(name(slice))}
                </span>
              ) : null}
            </span>
            <span className="donut-legend-name truncate">{name(slice)}</span>
            <span className="donut-legend-percent">{Math.round(share * 100)}%</span>
            <span className="donut-legend-size">{format(slice.bytes)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

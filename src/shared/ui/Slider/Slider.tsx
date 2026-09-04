import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import "./Slider.css";

export interface SliderProps {
  value: number;
  max: number;

  onChange?: (value: number) => void;

  onCommit?: (value: number) => void;
  disabled?: boolean;
  className?: string;
  leftContent?: ReactNode;
  rightContent?: ReactNode;
  ariaLabel?: string;
}

export function Slider({
  value,
  max,
  onChange,
  onCommit,
  disabled = false,
  className = "",
  leftContent,
  rightContent,
  ariaLabel,
}: SliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [dragValue, setDragValue] = useState<number | null>(null);

  const shown = dragValue ?? value;
  const pct = max > 0 ? Math.min(100, Math.max(0, (shown / max) * 100)) : 0;

  const valueFromX = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return shown;
    const { left, width } = el.getBoundingClientRect();
    if (width <= 0) return shown;
    const ratio = Math.min(1, Math.max(0, (clientX - left) / width));
    return ratio * max;
  };

  const handleDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    draggingRef.current = true;
    const v = valueFromX(e.clientX);
    setDragValue(v);
    onChange?.(v);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleMove = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled || !draggingRef.current) return;
    const v = valueFromX(e.clientX);
    setDragValue(v);
    onChange?.(v);
  };

  const endDrag = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const v = dragValue;
    setDragValue(null);
    if (v !== null) onCommit?.(v);
  };

  useEffect(() => () => void (draggingRef.current = false), []);

  return (
    <div className={`slider ${disabled ? "is-disabled" : ""} ${className}`}>
      {leftContent !== undefined && <div className="slider-side">{leftContent}</div>}
      <div
        ref={trackRef}
        className="slider-zone"
        role="slider"
        aria-label={ariaLabel}
        aria-valuenow={Math.round(shown)}
        aria-valuemax={Math.round(max)}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
      >
        <div className="slider-track">
          <div className="slider-fill" style={{ width: `${pct}%` }} />
          <div className="slider-knob" style={{ left: `${pct}%` }} />
        </div>
      </div>
      {rightContent !== undefined && <div className="slider-side">{rightContent}</div>}
    </div>
  );
}

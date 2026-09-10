import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AudioOutputs } from "@/shared/api/types";
import { playerApi } from "@/features/player/api";
import { useT } from "@/shared/i18n";
import { useAnchoredMenu } from "@/shared/hooks/useAnchoredMenu";
import { showToast } from "@/shared/ui/Toast";
import { CheckIcon, SpeakerBoxIcon } from "@/shared/ui/icons";
import "./AudioOutput.css";

export function AudioOutput() {
  const t = useT();
  const [outputs, setOutputs] = useState<AudioOutputs | null>(null);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuPos = useAnchoredMenu(open, triggerRef, 220);

  const load = useCallback(() => {
    playerApi
      .listAudioOutputs()
      .then(setOutputs)
      .catch(() => setOutputs({ devices: [], selected: null }));
  }, []);

  useEffect(() => load(), [load]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      const inRow = rootRef.current?.contains(target);
      const inMenu = (target as HTMLElement).closest?.(".audio-output-menu");
      if (!inRow && !inMenu) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const pick = (device: string | null) => {
    setOpen(false);
    setOutputs((prev) => (prev ? { ...prev, selected: device } : prev));
    playerApi.setAudioOutput(device).catch((err) => {
      showToast({ key: "audio-output", kind: "warn", message: String(err) });
      load();
    });
  };

  const selected = outputs?.selected ?? null;
  const label = selected ?? t("System default");

  return (
    <div className="settings-row audio-output" ref={rootRef}>
      <span className="settings-row-icon">
        <SpeakerBoxIcon size={21} />
      </span>
      <span className="settings-row-text">
        <span className="settings-row-title">{t("Audio output")}</span>
        <span className="settings-row-note truncate">{label}</span>
      </span>
      <button
        ref={triggerRef}
        type="button"
        className="audio-output-trigger"
        onClick={() => {
          if (!open) load();
          setOpen((was) => !was);
        }}
        aria-expanded={open}
      >
        {t("Change")}
      </button>

      {open &&
        menuPos &&
        createPortal(
          <div
            className="audio-output-menu"
            style={{
              left: menuPos.left,
              top: menuPos.top,
              bottom: menuPos.bottom,
              minWidth: menuPos.minWidth,
              maxHeight: menuPos.maxHeight,
            }}
          >
            <button
              type="button"
              className={`audio-output-option${selected === null ? " is-active" : ""}`}
              onClick={() => pick(null)}
            >
              <span className="truncate">{t("System default")}</span>
              {selected === null && <CheckIcon size={13} />}
            </button>
            {outputs?.devices.map((device) => (
              <button
                key={device}
                type="button"
                className={`audio-output-option${selected === device ? " is-active" : ""}`}
                onClick={() => pick(device)}
                title={device}
              >
                <span className="truncate">{device}</span>
                {selected === device && <CheckIcon size={13} />}
              </button>
            ))}
            {outputs && outputs.devices.length === 0 && (
              <div className="audio-output-empty">{t("No audio devices found.")}</div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}

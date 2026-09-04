import { useEffect, useMemo, useState } from "react";
import { useLangStore } from "@/shared/i18n";
import { getTimeOfDay } from "@/shared/lib/timeOfDay";
import { KAOMOJI, GREETINGS, CONTINUE_HINT } from "./content";
import "./WelcomeScreen.css";

const HINT_DELAY_MS = 1000;
const EXIT_MS = 300;

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function WelcomeScreen({
  onContinue,
  onCloseStart,
}: {
  onContinue: () => void;
  onCloseStart?: () => void;
}) {
  const { lang } = useLangStore();
  const [hintVisible, setHintVisible] = useState(false);
  const [closing, setClosing] = useState(false);

  const kaomoji = useMemo(() => pickRandom(KAOMOJI), []);
  const greeting = useMemo(() => pickRandom(GREETINGS[lang][getTimeOfDay()]), [lang]);

  useEffect(() => {
    const id = window.setTimeout(() => setHintVisible(true), HINT_DELAY_MS);
    return () => window.clearTimeout(id);
  }, []);

  const handleContinue = () => {
    if (closing) return;
    setClosing(true);
    onCloseStart?.();
    window.setTimeout(onContinue, EXIT_MS);
  };

  return (
    <div
      className={`welcome-screen${closing ? " is-closing" : ""}`}
      onClick={handleContinue}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") handleContinue();
      }}
    >
      <div className="welcome-center">
        <div className="welcome-greeting-row">
          <span className="welcome-kaomoji" aria-hidden="true">
            {kaomoji}
          </span>
          <span className="welcome-greeting-text">{greeting}</span>
        </div>
        <div className={`welcome-hint${hintVisible ? " is-visible" : ""}`}>
          {CONTINUE_HINT[lang]}
        </div>
      </div>
    </div>
  );
}

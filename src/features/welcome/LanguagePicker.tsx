import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { LANGUAGES, useLangStore, type Lang } from "@/shared/i18n";
import { LANGUAGE_FLAGS } from "@/shared/ui/LanguageSwitcher";
import "./LanguagePicker.css";

export function LanguagePicker({ onDone }: { onDone: () => void }) {
  const { setLang } = useLangStore();
  const [suggested, setSuggested] = useState<Lang | null>(null);

  useEffect(() => {
    invoke<string>("detect_language")
      .then((code) => {
        if (LANGUAGES.some((l) => l.code === code)) setSuggested(code as Lang);
      })
      .catch(console.error);
  }, []);

  const choose = (code: (typeof LANGUAGES)[number]["code"]) => {
    setLang(code);
    onDone();
  };

  return (
    <div className="language-picker-screen">
      <div className="language-picker-caption">Language · Мова · Тіл</div>
      <div className="language-picker-grid">
        {LANGUAGES.map((l) => (
          <button
            key={l.code}
            type="button"
            className={`language-picker-option${l.code === suggested ? " is-suggested" : ""}`}
            onClick={() => choose(l.code)}
          >
            <img className="language-picker-flag" src={LANGUAGE_FLAGS[l.country]} alt="" />
            <span>{l.native}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

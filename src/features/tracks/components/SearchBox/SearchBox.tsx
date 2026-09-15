import { useRef, useState } from "react";
import { useT } from "@/shared/i18n";
import { CloseIcon, SearchIcon } from "@/shared/ui/icons";
import "./SearchBox.css";

export function SearchBox({
  value,
  onChange,
  placeholder,
  autoFocus,
  className,
  iconSize = 18,
}: {
  value: string;
  onChange: (q: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  iconSize?: number;
}) {
  const t = useT();
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className={`searchbar${focused ? " is-focused" : ""}${className ? ` ${className}` : ""}`}>
      <span className="searchbar-icon" aria-hidden>
        <SearchIcon size={iconSize} />
      </span>
      <input
        ref={inputRef}
        value={value}
        placeholder={placeholder ?? t("What do you want to play?")}
        spellCheck={false}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            inputRef.current?.blur();
          }
          if (e.key === "Escape") {
            onChange("");
            inputRef.current?.blur();
          }
        }}
      />
      {value !== "" && (
        <button
          className="searchbar-clear"
          aria-label={t("Clear search field")}
          title={t("Clear search field")}

          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onChange("");
            inputRef.current?.focus();
          }}
        >
          <CloseIcon size={15} />
        </button>
      )}
    </div>
  );
}

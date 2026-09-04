import type { ReactNode } from "react";
import { useT } from "@/shared/i18n";
import { SearchBox } from "@/features/tracks/components/SearchBox";
import "./SearchPane.css";

export function SearchPane({
  searchQuery,
  onSearchChange,
  searchScopeTitle,
  trackContent,
}: {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  searchScopeTitle: string | null;
  trackContent: ReactNode;
}) {
  const t = useT();
  return (
    <div className="mobile-search-screen">
      <header className="mobile-search-head">
        <div className="mobile-search-head-row">
          <h1 className="mobile-search-title">{t("Search")}</h1>
        </div>
        <SearchBox
          className="searchbar-mobile searchbar-mobile-search"
          iconSize={18}
          autoFocus
          placeholder={
            searchScopeTitle
              ? `${t("Search in")} «${searchScopeTitle}»`
              : t("What do you want to play?")
          }
          value={searchQuery}
          onChange={onSearchChange}
        />
      </header>
      <div className="mobile-search-body">{trackContent}</div>
    </div>
  );
}

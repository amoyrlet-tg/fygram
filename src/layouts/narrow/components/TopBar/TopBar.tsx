import { ProfileMenu } from "@/features/profile/components/ProfileMenu";
import "./TopBar.css";

export function TopBar({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="mobile-topbar">
      <div className="mobile-topbar-titles">
        <h1 className="mobile-topbar-title truncate">{title}</h1>
        {subtitle && <span className="mobile-topbar-sub truncate">{subtitle}</span>}
      </div>
      <ProfileMenu className="mobile-topbar-profile-chip" />
    </header>
  );
}

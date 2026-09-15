type Kind = "library" | "channels" | "playlists" | "artists" | "download";

// Same rounded outline treatment as the project's thin icons.
export function LibraryIcon({ kind }: { kind: Kind }) {
  const paths: Record<Kind, string> = {
    library: "M4 4v16M8 4v16M13 5l5-1 3 15-5 1Z",
    channels: "M4 10v5h5l10 4V6L9 10ZM8 15l2 5h3l-2-4",
    playlists: "M3 5h12M3 10h9M3 15h6M17 18V8l4 1M17 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0",
    artists: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-2a8 8 0 0 1 16 0v2",
    download: "M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4",
  };
  const size = kind === "download" ? 16 : 18;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[kind]} />
    </svg>
  );
}

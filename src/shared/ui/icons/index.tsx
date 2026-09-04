type IconProps = { size?: number; className?: string };

const base = (size = 18) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export const PlayIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <polygon points="6 3 20 12 6 21 6 3" fill="currentColor" stroke="none" />
  </svg>
);

export const PauseIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <rect x="6" y="4" width="4" height="16" fill="currentColor" stroke="none" />
    <rect x="14" y="4" width="4" height="16" fill="currentColor" stroke="none" />
  </svg>
);

export const StopIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <rect x="5" y="5" width="14" height="14" rx="1.5" fill="currentColor" stroke="none" />
  </svg>
);

export const PrevIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <polygon points="19 20 9 12 19 4 19 20" fill="currentColor" stroke="none" />
    <rect x="5" y="4" width="2.5" height="16" fill="currentColor" stroke="none" />
  </svg>
);

export const NextIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <polygon points="5 4 15 12 5 20 5 4" fill="currentColor" stroke="none" />
    <rect x="16.5" y="4" width="2.5" height="16" fill="currentColor" stroke="none" />
  </svg>
);

export const ShuffleIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M3 6h3.5c1.5 0 2.4.6 3.2 1.7L15 18c.8 1.1 1.7 1.7 3.2 1.7H21" />
    <path d="M3 18h3.5c1.5 0 2.4-.6 3.2-1.7l.6-.85" />
    <path d="M13.5 7.7c.8-1.1 1.7-1.7 3.2-1.7H21" />
    <polyline points="18 3 21 6 18 9" />
    <polyline points="18 15 21 18 18 21" />
  </svg>
);

const repeatBase = (size = 18) => ({
  width: size,
  height: size,
  viewBox: "0 0 16 16",
  fill: "currentColor" as const,
  stroke: "none" as const,
});

const REPEAT_PATH =
  "M0 4.75A3.75 3.75 0 0 1 3.75 1h.75v1.5h-.75A2.25 2.25 0 0 0 1.5 4.75v5A2.25 2.25 0 0 0 3.75 12H5v1.5H3.75A3.75 3.75 0 0 1 0 9.75zM12.25 2.5a2.25 2.25 0 0 1 2.25 2.25v5A2.25 2.25 0 0 1 12.25 12H9.81l1.018-1.018a.75.75 0 0 0-1.06-1.06L6.939 12.75l2.829 2.828a.75.75 0 1 0 1.06-1.06L9.811 13.5h2.439A3.75 3.75 0 0 0 16 9.75v-5A3.75 3.75 0 0 0 12.25 1h-.75v1.5z";

export const RepeatIcon = ({ size, className }: IconProps) => (
  <svg {...repeatBase(size)} className={className}>
    <path d="M0 4.75A3.75 3.75 0 0 1 3.75 1h8.5A3.75 3.75 0 0 1 16 4.75v5a3.75 3.75 0 0 1-3.75 3.75H9.81l1.018 1.018a.75.75 0 1 1-1.06 1.06l-2.829-2.828 2.829-2.828a.75.75 0 1 1 1.06 1.06L9.811 12h2.439a2.25 2.25 0 0 0 2.25-2.25v-5a2.25 2.25 0 0 0-2.25-2.25h-8.5A2.25 2.25 0 0 0 1.5 4.75v5A2.25 2.25 0 0 0 3.75 12H5v1.5H3.75A3.75 3.75 0 0 1 0 9.75z" />
  </svg>
);

export const RepeatOneIcon = ({ size, className }: IconProps) => (
  <svg {...repeatBase(size)} className={className}>
    <path d={REPEAT_PATH} />
    <path d="m8 1.85.77.694H6.095V1.488q1.046-.077 1.507-.385.474-.308.583-.913h1.32V8H8z" />
    <path d="M8.77 2.544 8 1.85v.693z" />
  </svg>
);

export const SearchIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <circle cx="11" cy="11" r="7" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

export const PlusIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

export const RefreshIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
);

export const CloudIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M18 18H7a4.5 4.5 0 1 1 .9-8.9A6 6 0 0 1 19.5 10a4 4 0 0 1-1.5 8Z" />
  </svg>
);

export const CloudOffIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M18.5 17.9A4 4 0 0 0 18 10h-.7a6 6 0 0 0-5-4.9" />
    <path d="M7.6 9.1A4.5 4.5 0 0 0 7 18h9" />
    <line x1="2" y1="2" x2="22" y2="22" />
  </svg>
);

export const DownloadIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

export const MusicNoteIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
);

export const ChannelIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M22 2 11 13" />
    <path d="M22 2 15 22l-4-9-9-4 20-7z" />
  </svg>
);

export const PlaylistIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <line x1="4" y1="6" x2="16" y2="6" />
    <line x1="4" y1="12" x2="16" y2="12" />
    <line x1="4" y1="18" x2="10" y2="18" />
    <polygon points="16 15 21 18 16 21 16 15" fill="currentColor" stroke="none" />
  </svg>
);

export const ImageIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path d="M21 15l-5-5L5 21" />
  </svg>
);

export const TrashIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

export const EditIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);

export const ForwardIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <polyline points="15 17 20 12 15 7" />
    <path d="M4 18v-2a4 4 0 0 1 4-4h12" />
  </svg>
);

export const LockIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

export const CopyIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

export const CheckIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export const CloseIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export const SunIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
  </svg>
);

export const MoonIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
  </svg>
);

export const VolumeIcon = ({ size, className, muted }: IconProps & { muted?: boolean }) => (
  <svg {...base(size)} className={className}>
    <polygon points="4 9 8 9 12 5 12 19 8 15 4 15 4 9" fill="currentColor" stroke="none" />
    {!muted && <path d="M16 8.5a5 5 0 0 1 0 7" />}
    {!muted && <path d="M18.5 6a8.5 8.5 0 0 1 0 12" />}
    {muted && <line x1="16" y1="9" x2="21" y2="15" />}
    {muted && <line x1="21" y1="9" x2="16" y2="15" />}
  </svg>
);

export const SettingsIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
  </svg>
);

export const ChevronDownIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

export const LibraryIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M4 4v16" />
    <path d="M9 4v16" />
    <rect x="13" y="4" width="7" height="16" rx="1.5" transform="rotate(8 16.5 12)" />
  </svg>
);

export const GripIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <circle cx="9" cy="6" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="9" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="9" cy="18" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="15" cy="6" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="15" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="15" cy="18" r="1.2" fill="currentColor" stroke="none" />
  </svg>
);

export const EyeIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const EyeOffIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M17.94 17.94A10.9 10.9 0 0 1 12 19c-6.5 0-10-7-10-7a20 20 0 0 1 5.06-5.94" />
    <path d="M9.9 4.24A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a20 20 0 0 1-3.22 4.31" />
    <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
    <line x1="2" y1="2" x2="22" y2="22" />
  </svg>
);

export const SwapIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M4 7h13" />
    <path d="M14 3l4 4-4 4" />
    <path d="M20 17H7" />
    <path d="M10 13l-4 4 4 4" />
  </svg>
);

export const BroadcastIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
    <path d="M8.5 15.5a5 5 0 0 1 0-7" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7" />
    <path d="M5.8 18.2a9 9 0 0 1 0-12.4" />
    <path d="M18.2 5.8a9 9 0 0 1 0 12.4" />
  </svg>
);

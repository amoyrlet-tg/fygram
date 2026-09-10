type IconProps = { size?: number; className?: string };

const base = (size = 18) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.4,
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
    <path d="M20 12a8 8 0 1 1-2.6-5.9" />
    <path d="M20 3.5V9h-5.5" />
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
    <path d="M10 18V4" />
    <path d="M10 4l8-1.6v4L10 8Z" fill="currentColor" stroke="none" />
    <circle cx="6.5" cy="18" r="3.5" fill="currentColor" stroke="none" />
  </svg>
);

export const ChannelIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path
      d="M21.5 3 2.8 10.4c-.7.3-.7 1.2 0 1.4l4.7 1.6 1.7 5.1c.2.7 1.1.8 1.5.2l2.3-3.2 4.6 3.4c.6.4 1.4.1 1.6-.6l3.2-14c.2-.7-.5-1.3-1.1-1.1Z"
      fill="currentColor"
      stroke="none"
    />
  </svg>
);

export const PlaylistIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M4 7h16" />
    <path d="M4 12h16" />
    <path d="M4 17h9" />
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
    <path d="M4 7h16" />
    <path d="M9 7V4h6v3" />
    <path d="M6 7l1 13h10l1-13" />
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
  <svg {...base(size)} className={className} strokeWidth={3}>
    <line x1="19" y1="5" x2="5" y2="19" />
    <line x1="5" y1="5" x2="19" y2="19" />
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

export const SpeakerBoxIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <rect x="5" y="2.5" width="14" height="19" rx="2.6" />
    <circle cx="12" cy="15" r="3.4" />
    <circle cx="12" cy="7" r="1.4" fill="currentColor" stroke="none" />
  </svg>
);

export const SettingsIcon = ({ size = 18, className }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 84 84"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path d="M38.9729122,77 L45.0621813,77 C45.9910621,77 46.7792035,76.7356752 47.4266053,76.2070257 C48.0740071,75.6783761 48.4980534,74.9623594 48.6987443,74.0589756 L50.3914569,66.8909484 C50.9847563,66.6916994 53.2863044,65.7691219 53.814169,65.5084531 L60.0821955,69.3680335 C60.8385334,69.844403 61.6343514,70.0435606 62.4696496,69.9655062 C63.3049478,69.8874518 64.0375244,69.5343789 64.6673795,68.9062877 L68.9389154,64.6315748 C69.5921661,64.00129 69.956718,63.2562086 70.0325711,62.3963305 C70.1084243,61.5364524 69.8849774,60.7295855 69.3622306,59.9757298 L65.5414268,53.7416135 C65.8038968,53.1950499 66.7128548,50.9619991 66.8886878,50.3920374 L74.0943686,48.7029911 C75.0163039,48.5022797 75.7310596,48.0781902 76.2386357,47.4307225 C76.7462119,46.7832547 77,45.9950331 77,45.0660577 L77,39.0814597 C77,38.1758823 76.7462119,37.3992683 76.2386357,36.7516178 C75.7310596,36.1039672 75.0163039,35.6786895 74.0943686,35.4757846 L66.9270713,33.758222 C66.730036,33.1228188 65.8320447,30.8568646 65.6116138,30.3735487 L69.4357076,24.0593673 C69.9376177,23.27992 70.155307,22.477166 70.0887756,21.6511054 C70.0222442,20.8250448 69.6612564,20.0875494 69.0058124,19.4386193 L64.6607995,15.1600677 C64.0097421,14.5626864 63.2980022,14.2137265 62.5255799,14.113188 C61.7531575,14.0126496 60.978359,14.1853929 60.2011844,14.6314181 L53.814169,18.5683218 C53.3075067,18.3244703 51.027892,17.4029895 50.3947469,17.1825361 L48.6987443,9.90921768 C48.4980534,9.00583384 48.0740071,8.29511827 47.4266053,7.77707096 C46.7792035,7.25902365 45.9910621,7 45.0621813,7 L38.9729122,7 C38.0440314,7 37.25589,7.25957205 36.6084882,7.77871614 C35.9610864,8.29786023 35.5370401,9.00912419 35.3363492,9.91250803 L33.6118331,17.1123419 C33.0185338,17.3327954 30.6818921,18.2681687 30.1540275,18.5332247 L23.8021056,14.6314181 C23.0227377,14.1853929 22.2473908,14.0126496 21.4760651,14.113188 C20.7047394,14.2137265 19.9924512,14.5650628 19.3392005,15.1671968 L14.9974777,19.4386193 C14.3420336,20.0875494 13.9810459,20.8250448 13.9145144,21.6511054 C13.847983,22.477166 14.0656724,23.27992 14.5675824,24.0593673 L18.3916763,30.3735487 C18.1712453,30.8568646 17.2721573,33.1228188 17.0729287,33.758222 L9.90892142,35.4757846 C8.98442726,35.6786895 8.26848349,36.1039672 7.76109009,36.7516178 C7.2536967,37.3992683 7,38.1758823 7,39.0814597 L7,45.0660577 C7,45.9950331 7.2536967,46.7832547 7.76109009,47.4307225 C8.26848349,48.0781902 8.98442726,48.5022797 9.90892142,48.7029911 L17.1464057,50.3920374 C17.3010364,50.9619991 18.1982965,53.1950499 18.4585732,53.7416135 L14.6377694,59.9757298 C14.1150226,60.7295855 13.8921241,61.5364524 13.9690739,62.3963305 C14.0460237,63.2562086 14.4100272,64.00129 15.0610846,64.6315748 L19.3359105,68.9062877 C19.9657656,69.5343789 20.6983422,69.8874518 21.5336404,69.9655062 C22.3689386,70.0435606 23.1647566,69.844403 23.9210945,69.3680335 L30.189121,65.5084531 C30.7169856,65.7691219 33.0185338,66.6916994 33.6118331,66.8909484 L35.3363492,74.0589756 C35.5370401,74.9623594 35.9610864,75.6783761 36.6084882,76.2070257 C37.25589,76.7356752 38.0440314,77 38.9729122,77 Z M42.0156276,53.655516 C39.874559,53.655516 37.9195591,53.1254955 36.1506278,52.0654545 C34.3816966,51.0054134 32.9730219,49.5907458 31.9246038,47.8214515 C30.8761858,46.0521573 30.3519768,44.0957701 30.3519768,41.9522899 C30.3519768,39.8322078 30.8761858,37.8928208 31.9246038,36.1341288 C32.9730219,34.3754368 34.3816966,32.9666186 36.1506278,31.9076743 C37.9195591,30.8487301 39.874559,30.3192579 42.0156276,30.3192579 C44.159255,30.3192579 46.1102338,30.8487301 47.8685639,31.9076743 C49.626894,32.9666186 51.0354773,34.3754368 52.0943138,36.1341288 C53.1531502,37.8928208 53.6825684,39.8322078 53.6825684,41.9522899 C53.6825684,44.0957701 53.1531502,46.0521573 52.0943138,47.8214515 C51.0354773,49.5907458 49.626894,51.0054134 47.8685639,52.0654545 C46.1102338,53.1254955 44.159255,53.655516 42.0156276,53.655516 Z" />
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

export const ArrowLeftIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <line x1="20" y1="12" x2="5" y2="12" />
    <polyline points="11 18 5 12 11 6" />
  </svg>
);

export const ChevronRightIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

export const WindowIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <line x1="3" y1="9" x2="21" y2="9" />
  </svg>
);

export const LogOutIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

export const GlobeIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18" />
    <path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18" />
  </svg>
);

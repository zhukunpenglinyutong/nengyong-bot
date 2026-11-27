const PATHS = {
  panel: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
      <path d="M15 5v14" />
    </>
  ),
  panelOpen: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
      <path d="M15 5v14" />
      <rect x="16.6" y="7.4" width="1.8" height="9.2" rx="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  sidebar: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
      <path d="M9 5v14" />
    </>
  ),
  sidebarOpen: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
      <path d="M9 5v14" />
      <rect x="5.6" y="7.4" width="1.8" height="9.2" rx="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="m15.5 15.5 4 4" />
    </>
  ),
  close: <path d="m6 6 12 12M18 6 6 18" />,
  stop: <rect x="6.5" y="6.5" width="11" height="11" rx="2" />,
  down: <path d="m7 10 5 5 5-5" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l-2.5 2.5" />
    </>
  ),
  pulse: <path d="M3.5 12h3.5l2.5-6 5 12 2.5-6h3.5" />,
  chevron: <path d="m10 7 5 5-5 5" />,
  file: (
    <>
      <path d="M7 3.5h7l4 4v13H7z" />
      <path d="M14 3.5v4h4" />
    </>
  ),
  doc: (
    <>
      <rect x="5" y="4" width="14" height="16" rx="2" />
      <path d="M9 9h6M9 13h6" />
    </>
  ),
  pencil: <path d="M15.5 5.5l3 3L8 19H5v-3zM13.5 7.5l3 3" />,
  arrowUp: <path d="M12 19V5M6 11l6-6 6 6" />,
  arrowDown: <path d="M12 5v14M6 13l6 6 6-6" />,
  arrowLeft: <path d="M19 12H5M11 6l-6 6 6 6" />,
  back: <path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />,
  trash: (
    <>
      <path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13" />
      <path d="M10 11v5M14 11v5" />
    </>
  ),
  leave: (
    <>
      <path d="M13.5 4.5H7A1.5 1.5 0 0 0 5.5 6v12A1.5 1.5 0 0 0 7 19.5h6.5" />
      <path d="M10 12h10M16.5 8.5 20 12l-3.5 3.5" />
    </>
  ),
  pin: <path d="M14.5 4l5.5 5.5-3 1-3.5 3.5-.5 4-2-2-4.5 4.5M9 13l-2-2 4-.5L14.5 7z" />,
  folder: (
    <path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z" />
  ),
  folderPlus: (
    <>
      <path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z" />
      <path d="M12 11v5M9.5 13.5h5" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  select: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.5 12.2 2.4 2.4 4.6-4.8" />
    </>
  ),
  download: <path d="M12 4.5v10M7.5 10.5 12 15l4.5-4.5M5 19.5h14" />,
  upload: <path d="M12 15v-10M7.5 9 12 4.5 16.5 9M5 19.5h14" />,
  bellDot: (
    <>
      <path d="M6.5 16.5V11a5.5 5.5 0 0 1 8.2-4.8M17.5 12v4.5l1.5 1.5H5l1.5-1.5" />
      <path d="M10 20.5h4" />
      <circle cx="18" cy="6.5" r="2.2" />
    </>
  ),
  copy: (
    <>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
      <path d="M15.5 8.5V6A1.5 1.5 0 0 0 14 4.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" />
    </>
  ),
  share: (
    <>
      <path d="M12 14.5V3.5M8 7l4-3.5L16 7" />
      <path d="M8.5 10H7a2 2 0 0 0-2 2v6.5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V12a2 2 0 0 0-2-2h-1.5" />
    </>
  ),
  reply: <path d="M9.5 8.5 5 13l4.5 4.5M5 13h9a5 5 0 0 0 5-5V6.5" />,
  more: (
    <>
      <circle cx="6" cy="12" r="1.1" />
      <circle cx="12" cy="12" r="1.1" />
      <circle cx="18" cy="12" r="1.1" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5l1.6 2.2 2.7-.6.6 2.7 2.2 1.6-1.2 2.6 1.2 2.6-2.2 1.6-.6 2.7-2.7-.6L12 20.5l-1.6-2.2-2.7.6-.6-2.7-2.2-1.6L6.1 12 4.9 9.4l2.2-1.6.6-2.7 2.7.6z" />
    </>
  ),
  cube: (
    <>
      <path d="M12 3.5 19.5 7.5v9L12 20.5l-7.5-4v-9z" />
      <path d="M4.5 7.5 12 11.5l7.5-4M12 11.5v9" />
    </>
  ),
  plug: (
    <>
      <path d="M9 3.5v4M15 3.5v4" />
      <path d="M6.5 7.5h11v3a5.5 5.5 0 0 1-11 0z" />
      <path d="M12 16v4.5" />
    </>
  ),
  refresh: (
    <>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <path d="M19.5 4.5v4h-4" />
    </>
  ),
  terminal: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
      <path d="m7.5 9.5 2.5 2.5-2.5 2.5M12.5 14.5h4" />
    </>
  ),
  table: (
    <>
      <rect x="4" y="4.5" width="16" height="15" rx="2.5" />
      <path d="M4 9.5h16M4 14.5h16M10 9.5v10" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5.5" width="16" height="14" rx="2.5" />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
    </>
  ),
  minimize: <path d="M6.5 12h11" />,
  exit: (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none" />
    </>
  ),
  chart: <path d="M4.5 4.5v15h15M8.5 15.5v-4M12.5 15.5v-7M16.5 15.5v-5" />,
  chat: <path d="M5 18.5V7a2.5 2.5 0 0 1 2.5-2.5h9A2.5 2.5 0 0 1 19 7v6.5a2.5 2.5 0 0 1-2.5 2.5H9z" />,
  team: (
    <>
      <rect x="3" y="8" width="8" height="8" rx="2.5" />
      <rect x="13" y="8" width="8" height="8" rx="2.5" />
      <path d="M11 12h2" />
    </>
  ),
  flow: (
    <>
      <circle cx="6" cy="6" r="2" />
      <circle cx="6" cy="18" r="2" />
      <path d="M6 8v8M11 6h8M11 12h8M11 18h8" />
    </>
  ),
  // a bullseye: a bot's duty, the objectives it is to hit
  target: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  // a book with a spark: a skill someone else wrote, installed on a bot
  skill: (
    <>
      <path d="M5 5.5A1.5 1.5 0 0 1 6.5 4H18v13H6.5A1.5 1.5 0 0 0 5 18.5z" />
      <path d="M5 18.5A1.5 1.5 0 0 0 6.5 20H18v-3" />
      <path d="M11.5 7.5l.9 2 2 .9-2 .9-.9 2-.9-2-2-.9 2-.9z" />
    </>
  ),
  sliders: (
    <>
      <path d="M4.5 7.5h8M17.5 7.5h2M4.5 16.5h2M11.5 16.5h8" />
      <circle cx="15" cy="7.5" r="2.5" />
      <circle cx="9" cy="16.5" r="2.5" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </>
  ),
  moon: <path d="M12 3.5a6.5 6.5 0 0 0 8.5 8.5 8.5 8.5 0 1 1-8.5-8.5z" />,
  help: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.75 9.75a2.25 2.25 0 1 1 3.3 2c-.6.32-1.05.85-1.05 1.5v.25M12 16.75h.01" />
    </>
  ),
  braces: (
    <path d="M9 4.5H8a2 2 0 0 0-2 2V10a2 2 0 0 1-2 2 2 2 0 0 1 2 2v3.5a2 2 0 0 0 2 2h1M15 4.5h1a2 2 0 0 1 2 2V10a2 2 0 0 0 2 2 2 2 0 0 0-2 2v3.5a2 2 0 0 1-2 2h-1" />
  ),
  eyeOff: (
    <>
      <path d="M10 6a9 9 0 0 1 2-.5C18 5.5 21.5 12 21.5 12a16 16 0 0 1-2.6 3.4M6.6 6.6C3.9 8.4 2.5 12 2.5 12S6 18.5 12 18.5a9 9 0 0 0 4.7-1.3M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="M4 4l16 16" />
    </>
  ),
  phone: (
    <>
      <rect x="7" y="3" width="10" height="18" rx="2.5" />
      <path d="M11 18h2" />
    </>
  ),
  tablet: (
    <>
      <rect x="4.5" y="3" width="15" height="18" rx="2.5" />
      <path d="M11 18h2" />
    </>
  ),
  laptop: (
    <>
      <rect x="5" y="5" width="14" height="10" rx="1.5" />
      <path d="M3 18.5h18" />
    </>
  ),
  wifiOff: (
    <>
      <path d="M4 9a12 12 0 0 1 16 0M7 12.5a7.5 7.5 0 0 1 10 0M10 16a3 3 0 0 1 4 0" />
      <path d="M4 4l16 16" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="16" r="3.5" />
      <path d="M10.5 13.5 19.5 4.5M16.5 7.5l2 2M14 10l1.5 1.5" />
    </>
  ),
  warning: (
    <>
      <path d="M12 4.5 20.5 19h-17z" />
      <path d="M12 10v4M12 16.8v.01" />
    </>
  ),
}

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  )
}

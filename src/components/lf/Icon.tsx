// Thin stroke icons in one visual weight (1.5px on a 16px grid), so every
// screen uses the same set. Paths follow the Lucide shapes.

const PATHS: Record<string, string> = {
  upnext: 'M8 3.5v4.5l3 1.5M14.5 8a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z',
  quote: 'M9.5 1.5H4a1.5 1.5 0 0 0-1.5 1.5v10A1.5 1.5 0 0 0 4 14.5h8a1.5 1.5 0 0 0 1.5-1.5V5.5l-4-4Zm0 0v4h4M5.5 8.5h5M5.5 11h3',
  order: 'M13.5 5 8 2 2.5 5m11 0v6L8 14m5.5-9L8 8m0 6-5.5-3V5M8 14V8M2.5 5 8 8m2.75-4.5L5.25 6.5',
  stock: 'M2 5.5 8 2.5l6 3v5l-6 3-6-3v-5Zm0 0 6 3m0 0 6-3M8 8.5v5',
  settings: 'M6.6 2.2 6.3 3.6a4.8 4.8 0 0 0-1.2.7l-1.4-.4-1.4 2.4 1.1 1a4.9 4.9 0 0 0 0 1.4l-1.1 1 1.4 2.4 1.4-.4c.4.3.8.5 1.2.7l.3 1.4h2.8l.3-1.4c.4-.2.8-.4 1.2-.7l1.4.4 1.4-2.4-1.1-1a4.9 4.9 0 0 0 0-1.4l1.1-1-1.4-2.4-1.4.4a4.8 4.8 0 0 0-1.2-.7l-.3-1.4H6.6ZM10 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z',
  users: 'M10.5 13.5v-1a2.5 2.5 0 0 0-2.5-2.5H4.5A2.5 2.5 0 0 0 2 12.5v1M6.25 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm7.75 6v-1a2.5 2.5 0 0 0-1.9-2.4m-1.6-7.5a2.5 2.5 0 0 1 0 4.8',
  plug: 'M6 1.5v3m4-3v3M4 4.5h8V7a4 4 0 0 1-8 0V4.5ZM8 11v3.5',
  sliders: 'M2.5 4h7m2.5 0h1.5M2.5 8h2m2.5 0h6.5M2.5 12h7m2.5 0h1.5M9.5 2.5v3M4.5 6.5v3m5 1v3',
  // The bubble; the handset is a filled shape in FILLS so it stays crisp at 14–18px.
  whatsapp: 'M8 2.35a5.65 5.65 0 0 0-4.86 8.55L2.35 13.65l2.8-.74A5.65 5.65 0 1 0 8 2.35Z',
  sheet: 'M3 1.5h10a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5H3A1.5 1.5 0 0 1 1.5 13V3A1.5 1.5 0 0 1 3 1.5Zm-1.5 4.5h13m-13 4h13M6 6v8.5',
  webhook: 'M6.1 6.6 4.4 9.5a2.3 2.3 0 1 0 3.7 2.4h4.1M9.9 4.4a2.3 2.3 0 1 0-4 2.2l2 3.5m3.8-1.6a2.3 2.3 0 1 1 .9 4.3',
  mail: 'M2.5 3.5h11a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Zm-1 1L8 9l6.5-4.5',
  plus: 'M8 3v10M3 8h10',
  x: 'M4 4l8 8M12 4l-8 8',
  check: 'M3 8.5 6.5 12 13 4.5',
  back: 'M13 8H3m0 0 4-4M3 8l4 4',
  search: 'M7 12.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11Zm7.5 2-3.6-3.6',
  filter: 'M2 4h12M4 8h8M6.5 12h3',
  chevron: 'M4 6l4 4 4-4',
  download: 'M8 2v8m0 0 3-3m-3 3L5 7m-2.5 4.5v1A1.5 1.5 0 0 0 4 14h8a1.5 1.5 0 0 0 1.5-1.5v-1',
  send: 'M14 2 7 9m7-7-4.5 12L7 9m7-7L2 6.5 7 9',
  chart: 'M2.5 13.5h11M4.5 11V7m3.5 4V3.5m3.5 7.5V6',
  people: 'M5.5 7a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5Zm-4 6.5v-.5A3 3 0 0 1 4.5 10h2A3 3 0 0 1 9.5 13v.5m1-11a2.25 2.25 0 0 1 0 4.5m1.5 3a3 3 0 0 1 2.5 3v.5',
  bolt: 'M9 1.5 3 9h4.5L7 14.5 13 7H8.5L9 1.5Z',
  person: 'M8 7.5a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5ZM2.5 14c0-2.5 2.5-4 5.5-4s5.5 1.5 5.5 4',
  message: 'M2.5 3h11a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H6l-3.5 2.5V4a1 1 0 0 1 1-1Z',
  inbox: 'M1.5 9.5 3.5 3h9l2 6.5v3a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-3Zm0 0h4l1 1.5h3l1-1.5h4',
  phone: 'M5.5 2 4 2.1C3 2.3 2.4 3.3 2.6 4.3c.9 4.3 4.8 8.2 9.1 9.1 1 .2 2-.4 2.2-1.4l.1-1.5-2.5-1.3-1.3 1.2a7 7 0 0 1-3.8-3.8L7.6 5.5 6.3 3 5.5 2Z',
  logout: 'M6 14H3.5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1H6m4.5 9L14 8m0 0-3.5-3M14 8H6',
  external: 'M9.5 2.5h4v4m0-4L8 8m4 1.5V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3.5',
  refresh: 'M13.5 8A5.5 5.5 0 0 1 3.7 11.4M2.5 8a5.5 5.5 0 0 1 9.8-3.4m.7-2.1v2.6h-2.6M3 13.5v-2.6h2.6',
  upload: 'M8 10V2m0 0L5 5m3-3 3 3M2.5 11.5v1A1.5 1.5 0 0 0 4 14h8a1.5 1.5 0 0 0 1.5-1.5v-1',
  edit: 'M11 2.5l2.5 2.5L6 12.5l-3 .5.5-3L11 2.5Z',
  dot: 'M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
};

export type IconName = keyof typeof PATHS;

// Parts of an icon that are filled, not outlined.
const FILLS: Record<string, string> = {
  whatsapp: 'M6.1 5.9c.28 1.62 2.26 3.6 3.88 3.88l.9-.9-1.43-.95-.62.48a4.1 4.1 0 0 1-1.5-1.5l.48-.62-.95-1.43-.76 1.04Z',
};

export default function Icon({ name, size = 16, className }: { name: IconName | string; size?: number; className?: string }) {
  const d = PATHS[name] ?? PATHS.dot;
  return (
    <svg className={className ? `lf-icon ${className}` : 'lf-icon'} width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
      {FILLS[name] && <path d={FILLS[name]} fill="currentColor" stroke="none" />}
    </svg>
  );
}

const paths = {
  wallet: "M3 6h16v3H5a2 2 0 0 1 0-4h12 M3 7v12h18V9H5 M16 13h5v3h-5z",
  university: "M3 9h18L12 3 3 9ZM5 11v8m5-8v8m4-8v8m5-8v8M3 21h18",
  chart: "M4 3v17h17M8 15v-4m5 4V6m5 9V9",
  shield: "m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z M8 12l3 3 5-6",
  arrow: "M5 12h14m-5-5 5 5-5 5",
  chevron: "m9 5 7 7-7 7",
  down: "m6 9 6 6 6-6",
  check: "m5 12 4 4L19 6",
  lock: "M6 10h12v11H6zM8 10V7a4 4 0 0 1 8 0v3m-4 5v2",
  file: "M14 3H5v18h14V8l-5-5Zm0 0v5h5M8 12h8m-8 4h5",
  clock: "M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  globe: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c-5 5-5 13 0 18 5-5 5-13 0-18Z",
  help: "M9 9a3 3 0 0 1 6 0c0 2-3 2-3 5m0 3h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  info: "M12 11v6m0-10h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  external: "M14 3h7v7m0-7L10 14M10 3H3v18h18v-7",
  graduation: "m2 9 10-5 10 5-10 5L2 9Zm4 2v6c4 3 8 3 12 0v-6m4-2v8",
  plus: "M12 5v14M5 12h14",
  search: "m16 16 5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
  share: "M12 16V3m-5 5 5-5 5 5M5 13v8h14v-8",
  download: "M12 3v12m-5-5 5 5 5-5M5 17v4h14v-4",
  activity: "M3 12h4l3-8 4 16 3-8h4",
} as const;
export type IconName = keyof typeof paths;
export const Icon = ({ name, size = 20, className = "" }: { name: IconName; size?: number; className?: string }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>
);

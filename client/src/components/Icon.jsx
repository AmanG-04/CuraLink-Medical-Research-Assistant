const paths = {
  menu: "M4 6h16M4 12h16M4 18h16",
  chat: "M21 11a8 8 0 0 1-8 8H7l-5 3 2-6a8 8 0 1 1 17-5ZM8 10h8M8 14h5",
  search: "M21 21l-5-5M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Z",
  pin: "M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0ZM15 10a3 3 0 1 0-6 0 3 3 0 0 0 6 0Z",
  bookmark: "M6 3h12v19l-6-4-6 4V3Z",
  compare: "M8 3H3v18h5M16 3h5v18h-5M12 2v20M6 8h3M15 8h3M6 16h3M15 16h3",
  check: "m5 12 4 4L19 6",
  help: "M9 9a3 3 0 1 1 5 2c-1 1-2 1-2 3M12 18h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z",
  alert: "m12 3 10 18H2L12 3ZM12 9v5M12 17h.01",
  download: "M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5",
  arrow: "M4 12h16m-6-6 6 6-6 6",
  clock: "M12 7v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z",
  book: "M12 5c-3-2-7-2-10-1v16c3-1 7-1 10 1m0-16c3-2 7-2 10-1v16c-3-1-7-1-10 1V5Z",
  close: "m6 6 12 12M6 18 18 6",
  filter: "M3 5h18M6 12h12M9 19h6",
};
export function Icon({ name, size = 20 }) {
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
      focusable="false"
    >
      <path d={paths[name] || paths.search} />
    </svg>
  );
}

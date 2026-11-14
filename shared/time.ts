// SQLite stores "YYYY-MM-DD HH:MM:SS" in UTC; show it in the viewer's time zone.
export function formatTime(stored: string): string {
  const date = new Date(stored.replace(" ", "T") + "Z");
  if (Number.isNaN(date.getTime())) return stored;
  return date.toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

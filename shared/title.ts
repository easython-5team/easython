// Notice titles are always "[YYMMDD] summary", dated in Korean time.

const DATED = /^\s*\[(\d{6})\]\s*/;

/** Today's date in Korea as YYMMDD. */
export function noticeDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "2-digit", month: "2-digit", day: "2-digit" })
    .formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? "";
  return get("year") + get("month") + get("day");
}

/** Splits a title into its date and summary; a title without a date gets an empty date. */
export function splitTitle(title: string): { date: string; summary: string } {
  const match = DATED.exec(title);
  return match ? { date: match[1] ?? "", summary: title.slice(match[0].length).trim() } : { date: "", summary: title.trim() };
}

/** Builds "[YYMMDD] summary", dropping any bracketed prefixes the summary already carries. */
export function datedTitle(summary: string, date = noticeDate()): string {
  const clean = summary.replace(/^\s*(\[[^\]]*\]\s*)+/, "").trim();
  return `[${date}] ${clean}`;
}

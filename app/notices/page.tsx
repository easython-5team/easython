import type { Metadata } from "next";
import Shell from "../../ui/Shell";
import { recentNotices } from "../../server/db/store.ts";
import { formatTime } from "../../shared/time.ts";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "보낸 공지 · 현장노트" };

export default function NoticeList() {
  const notices = recentNotices(50);
  return (
    <Shell>
      <main className="mx-auto grid w-full max-w-[640px] gap-6 px-4 pt-8 pb-20 sm:px-6">
        <h1>보낸 공지</h1>
        {notices.length === 0 ? (
          <div className="grid justify-items-start gap-3">
            <p className="text-ink-2">아직 보낸 공지가 없습니다.</p>
            <a className="btn-primary" href="/">새 공지 작성</a>
          </div>
        ) : (
          <ul className="divide-y divide-grid rounded-card border border-grid bg-paper">
            {notices.map(n => (
              <li key={n.id}>
                <a href={"/notices/" + n.id} className="flex items-center justify-between gap-4 px-5 py-4 text-ink no-underline hover:bg-canvas">
                  <span className="min-w-0 truncate font-semibold">{n.title}</span>
                  <span className="shrink-0 text-[13px] text-ink-3 tabular-nums">{formatTime(n.createdAt)}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </main>
    </Shell>
  );
}

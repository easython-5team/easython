import Shell from "../ui/Shell";
import Splash from "../ui/Splash";
import { recentNotices } from "../server/db/store.ts";
import { dashboardView } from "../server/workflow.ts";
import { formatTime } from "../shared/time.ts";

export const dynamic = "force-dynamic";

// Home: every notice sent, with how many workers confirmed it.
export default function Home() {
  const notices = recentNotices(50).map(n => ({ ...n, stats: dashboardView(n.id).stats }));
  return (
    <Shell>
      <Splash />
      <main className="mx-auto grid w-full max-w-[640px] gap-6 px-4 pt-8 pb-20 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <h1>공지</h1>
          <a className="btn-primary" href="/new">+ 새 공지</a>
        </div>
        {notices.length === 0 ? (
          <div className="grid justify-items-center gap-4 rounded-card border border-grid bg-paper px-6 py-14 text-center">
            <p className="text-[17px] font-semibold">아직 보낸 공지가 없습니다</p>
            <p className="text-sm text-ink-2">작업 지시가 바뀌면 새 공지를 만들어 작업자에게 보내세요.</p>
            <a className="btn-primary" href="/new">새 공지 만들기</a>
          </div>
        ) : (
          <ul className="divide-y divide-grid overflow-hidden rounded-card border border-grid bg-paper">
            {notices.map(n => (
              <li key={n.id}>
                <a href={"/notices/" + n.id} className="grid gap-1 px-5 py-4 text-ink no-underline hover:bg-canvas">
                  <span className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate font-semibold">{n.title}</span>
                    {n.stats.recheck > 0 && <span className="tag shrink-0 bg-bad-bg text-bad-fg">재교육 {n.stats.recheck}</span>}
                  </span>
                  <span className="text-[13px] text-ink-3 tabular-nums">
                    {formatTime(n.createdAt)} · 확인 {n.stats.understood} / {n.stats.joined}명
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </main>
    </Shell>
  );
}

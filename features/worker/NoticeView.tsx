"use client";

import type { WorkerText } from "../../shared/languages.ts";
import type { QuestionType, WorkerNotice } from "../../shared/types.ts";
import { KIND_BG } from "../../ui/tone.ts";

/** Notice fields the view needs; the admin preview builds this before publishing. */
export type NoticeViewData = Pick<WorkerNotice, "lang" | "title" | "summary" | "questions" | "conditions" | "addenda">;

// The worker's view of a published notice. The admin preview renders the
// same component so the manager approves exactly what workers will see.
interface NoticeViewProps {
  notice: NoticeViewData;
  t: WorkerText;
  /** The worker app shows the questions on their own step; the admin preview keeps them inline. */
  showQuestion?: boolean;
}

interface SituationProps {
  question: string;
  type: QuestionType;
  /** 1-based position, shown when there is more than one question. */
  index: number;
  total: number;
  t: WorkerText;
}

export function SituationCard({ question, type, index, total, t }: SituationProps) {
  return (
    <section className="grid gap-2 rounded-bubble bg-ink p-5 text-paper shadow-float">
      <h3 className="eyebrow text-ink-3">
        {total > 1 && <span className="mr-1.5 tabular-nums text-paper">{index}/{total}</span>}
        {type === "short" ? t.shortQuestion : t.situation}
      </h3>
      <p className="text-xl leading-snug font-bold tracking-[-0.03em] text-balance">{question}</p>
    </section>
  );
}

export default function NoticeView({ notice, t, showQuestion }: NoticeViewProps) {
  return (
    <article lang={notice.lang} className="overflow-hidden rounded-card bg-ink shadow-float">
      {/* dark hero: what changed, in one line */}
      <header className="grid gap-4 px-5 pt-5 pb-7 text-paper">
        <span className="flex items-center gap-2 text-[13px] font-bold text-ink-3">
          <span aria-hidden="true" className="size-2 rounded-full bg-stop" />{t.whatChanged}
        </span>
        <h2 className="text-[26px] leading-[1.3] font-bold tracking-[-0.045em] text-balance">{notice.title}</h2>
      </header>

      {/* paper sheet: the conditions */}
      <div className="grid gap-5 rounded-t-card bg-paper px-4 pt-5 pb-4">
        <section aria-label={t.whatChanged}>
          <ul className="grid gap-2.5">
            {notice.conditions.map(c => (
              <li key={c.id} className="grid grid-cols-[auto_1fr] items-start gap-3">
                <span className={"tag mt-0.5 " + KIND_BG[c.kind ?? "action"]}>{t.kinds[c.kind ?? "action"]}</span>
                <span className="text-[16px] leading-snug font-semibold tracking-[-0.02em]">{c.text}</span>
              </li>
            ))}
          </ul>
        </section>

        {notice.addenda.length > 0 && (
          <section className="grid gap-2.5 rounded-bubble bg-place p-4">
            <h3 className="eyebrow text-ink">{t.managerUpdates}</h3>
            {notice.addenda.map(a => (
              <div key={a.id} className="grid gap-0.5">
                <p className="font-bold">Q. {a.question}</p>
                <p>A. {a.answer}</p>
              </div>
            ))}
          </section>
        )}

        <details className="text-[15px]">
          <summary className="text-sm text-ink-2">{t.fullNotice}</summary>
          <p className="mt-2 whitespace-pre-wrap text-ink/80">{notice.summary}</p>
        </details>

        {(showQuestion ?? true) && notice.questions.map((q, i) => (
          <SituationCard key={q.id} question={q.text} type={q.type} index={i + 1} total={notice.questions.length} t={t} />
        ))}
      </div>
    </article>
  );
}

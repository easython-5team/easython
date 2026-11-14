"use client";

import type { WorkerText } from "../../shared/languages.ts";
import type { QuestionType, WorkerNotice } from "../../shared/types.ts";

/** Notice fields the view needs; the admin preview builds this before publishing. */
export type NoticeViewData = Pick<WorkerNotice, "lang" | "title" | "summary" | "source" | "questions" | "conditions" | "addenda">;

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

export function SituationCard({ question, index, total, t }: SituationProps) {
  return (
    <section className="grid gap-1.5 rounded-card border border-grid bg-paper p-5">
      <h3 className="text-[13px] font-semibold text-ink-3 tabular-nums">{t.questionOf.replace("{n}", String(index)).replace("{total}", String(total))}</h3>
      <p className="text-[19px] leading-snug font-bold tracking-[-0.02em] text-balance">{question}</p>
    </section>
  );
}

export default function NoticeView({ notice, t, showQuestion }: NoticeViewProps) {
  return (
    <div className="grid gap-3">
      <article lang={notice.lang} className="grid gap-4 rounded-card border border-grid bg-paper p-5">
        <header className="grid gap-1">
          <span className="text-[13px] font-semibold text-ink-3">{t.whatChanged}</span>
          <h2 className="text-[21px] leading-snug text-balance">{notice.title}</h2>
        </header>
        <p className="text-[16px] leading-relaxed whitespace-pre-wrap">{notice.summary}</p>
        {notice.addenda.length > 0 && (
          <section className="grid gap-2 rounded-[10px] bg-violet-bg p-3.5">
            <h3 className="text-[13px] text-violet-fg">{t.managerUpdates}</h3>
            {notice.addenda.map(a => (
              <div key={a.id} className="grid gap-0.5 text-[15px]">
                <p className="font-semibold">Q. {a.question}</p>
                <p>A. {a.answer}</p>
              </div>
            ))}
          </section>
        )}
        <details className="border-t border-grid pt-3 text-[15px]">
          <summary className="text-[13px] text-ink-2">{t.originalKorean}</summary>
          <p lang="ko" className="mt-2 whitespace-pre-wrap text-ink-2">{notice.source}</p>
        </details>
      </article>

      {(showQuestion ?? true) && notice.questions.map((q, i) => (
        <SituationCard key={q.id} question={q.text} type={q.type} index={i + 1} total={notice.questions.length} t={t} />
      ))}
    </div>
  );
}

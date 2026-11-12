"use client";

import type { WorkerText } from "../lib/languages.ts";
import type { WorkerNotice } from "../lib/types.ts";
import type { Speaker } from "./speech.ts";
import { KIND_BG } from "./tone.ts";

interface ListenProps {
  id: string;
  text: string;
  speaker: Speaker | undefined;
  t: WorkerText;
  dark?: boolean;
}

export function ListenButton({ id, text, speaker, t, dark }: ListenProps) {
  if (!speaker) return null;
  const active = speaker.speaking === id;
  const tone = active ? "bg-except text-ink" : dark ? "bg-white/15 text-paper hover:bg-white/25" : "bg-white text-ink shadow-soft hover:bg-paper";
  return (
    <button type="button" aria-pressed={active}
      className={"inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] font-bold transition " + tone}
      onClick={() => (active ? speaker.stop() : speaker.speak(id, text))}>
      <span aria-hidden="true" className={active ? "size-2 rounded-[2px] bg-current"
        : "size-0 border-y-[5px] border-l-8 border-y-transparent border-l-current"} />
      {active ? t.stop : t.listen}
    </button>
  );
}

/** Notice fields the view needs; the admin preview builds this before publishing. */
export type NoticeViewData = Pick<WorkerNotice, "lang" | "title" | "summary" | "question" | "conditions" | "addenda">;

// The worker's view of a published notice. The admin preview renders the
// same component so the manager approves exactly what workers will see.
export default function NoticeView({ notice, t, speaker }: { notice: NoticeViewData; t: WorkerText; speaker?: Speaker }) {
  const everything = [notice.title, ...notice.conditions.map(c => c.text), notice.question].join(". ");
  return (
    <article lang={notice.lang} className="overflow-hidden rounded-card bg-ink shadow-float">
      {/* dark hero: what changed, in one line */}
      <header className="grid gap-4 px-5 pt-5 pb-7 text-paper">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-[13px] font-bold text-ink-3">
            <span aria-hidden="true" className="size-2 rounded-full bg-stop" />{t.whatChanged}
          </span>
          <ListenButton id="all" text={everything} speaker={speaker} t={t} dark />
        </div>
        <h2 className="text-[26px] leading-[1.3] font-bold tracking-[-0.045em] text-balance">{notice.title}</h2>
        {speaker && !speaker.hasVoice && <p className="text-[13px] text-ink-3">{t.listenUnsupported}</p>}
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
          <p className="mt-2 mb-3 whitespace-pre-wrap text-ink/80">{notice.summary}</p>
          <ListenButton id="summary" text={notice.summary} speaker={speaker} t={t} />
        </details>

        {/* situation question: black bubble */}
        <section className="grid gap-2 rounded-bubble bg-ink p-4 text-paper">
          <div className="flex items-center justify-between gap-3">
            <h3 className="eyebrow text-ink-3">{t.situation}</h3>
            <ListenButton id="question" text={notice.question} speaker={speaker} t={t} dark />
          </div>
          <p className="text-lg leading-snug font-bold tracking-[-0.03em]">{notice.question}</p>
        </section>
      </div>
    </article>
  );
}

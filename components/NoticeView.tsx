"use client";

import type { WorkerText } from "../lib/languages.ts";
import type { WorkerNotice } from "../lib/types.ts";
import type { Speaker } from "./speech.ts";

interface ListenProps {
  id: string;
  text: string;
  speaker: Speaker | undefined;
  t: WorkerText;
}

export function ListenButton({ id, text, speaker, t }: ListenProps) {
  if (!speaker) return null;
  const active = speaker.speaking === id;
  return (
    <button type="button" className={"listen" + (active ? " active" : "")} aria-pressed={active}
      onClick={() => (active ? speaker.stop() : speaker.speak(id, text))}>
      <span className="listen-icon" aria-hidden="true" />{active ? t.stop : t.listen}
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
    <article className="notice-view" lang={notice.lang}>
      <header className="notice-head">
        <h2>{notice.title}</h2>
        <ListenButton id="all" text={everything} speaker={speaker} t={t} />
      </header>
      {speaker && !speaker.hasVoice && <p className="hint">{t.listenUnsupported}</p>}

      <section className="changes" aria-label={t.whatChanged}>
        <h3>{t.whatChanged}</h3>
        <ul>
          {notice.conditions.map(c => (
            <li key={c.id} className={"change kind-" + (c.kind ?? "action")}>
              <span className="kind">{t.kinds[c.kind ?? "action"]}</span>
              <span>{c.text}</span>
            </li>
          ))}
        </ul>
      </section>

      {notice.addenda.length > 0 && (
        <section className="addenda">
          <h3>{t.managerUpdates}</h3>
          {notice.addenda.map(a => (
            <div key={a.id} className="addendum">
              <p className="addendum-q">Q. {a.question}</p>
              <p>A. {a.answer}</p>
            </div>
          ))}
        </section>
      )}

      <details className="full-notice">
        <summary>{t.fullNotice}</summary>
        <p>{notice.summary}</p>
        <ListenButton id="summary" text={notice.summary} speaker={speaker} t={t} />
      </details>

      <section className="situation">
        <div className="situation-head">
          <h3>{t.situation}</h3>
          <ListenButton id="question" text={notice.question} speaker={speaker} t={t} />
        </div>
        <p>{notice.question}</p>
      </section>
    </article>
  );
}

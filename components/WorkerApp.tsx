"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { LANGUAGES, WORKER_LANGS, WORKER_TEXT, type Lang, type WorkerText } from "../lib/languages.ts";
import type { InputMode, SessionView, TurnState } from "../lib/types.ts";
import NoticeView, { ListenButton } from "./NoticeView";
import { post } from "./request";
import { useRecognition, useSpeaker } from "./speech";

const TERMINAL: TurnState[] = ["understood", "guidance"];
const ICON = { met: "✓", missing: "?", conflict: "✕" } as const;
const noSubscription = () => () => {};

function storageKey(id: string) {
  return "fieldnote:" + id;
}

export default function WorkerApp({ id }: { id: string }) {
  // undefined during server render, then the session saved on this phone (or null).
  const savedId = useSyncExternalStore(noSubscription, () => localStorage.getItem(storageKey(id)), () => undefined);
  const [lang, setLang] = useState<Lang | null>(null);
  const [name, setName] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [view, setView] = useState<SessionView | null>(null);
  const [restoreFailed, setRestoreFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const t = WORKER_TEXT[lang ?? "en"];

  async function load(session: string) {
    const result = await post("session", { id, sessionId: session }, "network");
    setView(result);
    setLang(result.lang);
    return result;
  }

  // Reopening the link on the same phone continues the same conversation.
  useEffect(() => {
    if (!savedId || sessionId) return;
    let cancelled = false;
    post("session", { id, sessionId: savedId }, "network")
      .then(result => {
        if (cancelled) return;
        setView(result);
        setLang(result.lang);
        setSessionId(savedId);
      })
      .catch(() => {
        localStorage.removeItem(storageKey(id));
        if (!cancelled) setRestoreFailed(true);
      });
    return () => { cancelled = true; };
  }, [id, savedId, sessionId]);

  async function start(event: FormEvent) {
    event.preventDefault();
    if (!lang || !name.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const { sessionId: created } = await post("join", { id, lang, name: name.trim() }, t.retry);
      localStorage.setItem(storageKey(id), created);
      await load(created);
      setSessionId(created);
    } catch (err) {
      setError(err instanceof Error && err.message !== "network" ? err.message : t.retry);
    }
    setBusy(false);
  }

  const restoring = savedId === undefined || (typeof savedId === "string" && !sessionId && !restoreFailed);
  if (restoring) return <div className="worker-loading" aria-busy="true" />;

  if (sessionId && view && lang) {
    return <Conversation id={id} sessionId={sessionId} view={view} setView={setView} reload={load} t={t} lang={lang} />;
  }

  if (!lang) {
    return (
      <section className="lang-step">
        <h1 className="bilingual">
          {WORKER_LANGS.map(code => <span key={code} lang={code}>{WORKER_TEXT[code].chooseLanguage}</span>)}
        </h1>
        <div className="lang-buttons">
          {WORKER_LANGS.map(code => (
            <button key={code} type="button" className="lang-button" lang={code} onClick={() => setLang(code)}>
              <span className="lang-native">{LANGUAGES[code].native}</span>
              <span className="lang-code">{code.toUpperCase()}</span>
            </button>
          ))}
        </div>
      </section>
    );
  }

  return (
    <form className="name-step" lang={lang} onSubmit={start}>
      <button type="button" className="text-button back" onClick={() => setLang(null)}>← {LANGUAGES[lang].native}</button>
      <label className="field big">{t.namePrompt}
        <input autoFocus value={name} maxLength={40} placeholder={t.namePlaceholder} onChange={e => setName(e.target.value)} />
      </label>
      <p className="hint">{t.nameHint}</p>
      {error && <p role="alert" className="alert">{error}</p>}
      <button className="primary wide" disabled={busy || !name.trim()}>{busy ? t.starting : t.start}</button>
    </form>
  );
}

interface ConversationProps {
  id: string;
  sessionId: string;
  view: SessionView;
  setView: (view: SessionView) => void;
  reload: (sessionId: string) => Promise<SessionView>;
  t: WorkerText;
  lang: Lang;
}

function Conversation({ id, sessionId, view, setView, reload, t, lang }: ConversationProps) {
  const speaker = useSpeaker(lang);
  const [answer, setAnswer] = useState("");
  const [mode, setMode] = useState<InputMode>("text");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const running = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);
  const recognition = useRecognition(lang, text => {
    setAnswer(current => (current.trim() ? current.trim() + " " : "") + text);
    setMode("voice");
  });

  const turns = view.turns;
  const latest = turns.at(-1)?.state;
  const finished = latest !== undefined && TERMINAL.includes(latest);
  const waiting = view.escalations.some(e => e.answer === null);

  // Poll only while a question is waiting for the manager.
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => { reload(sessionId).catch(() => {}); }, 4000);
    return () => clearInterval(timer);
  }, [waiting, reload, sessionId]);

  useEffect(() => {
    if (turns.length) bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = answer.trim();
    if (running.current || finished || !text) return;
    running.current = true;
    setBusy(true);
    setError("");
    recognition.stop();
    try {
      const result = await post("respond", { id, sessionId, turn: turns.length, answer: text, mode }, t.retry);
      setView({ ...view, turns: [...turns, result] });
      setAnswer("");
      setMode("text");
      if (result.state === "manager") reload(sessionId).catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : t.retry);
    }
    setBusy(false);
    running.current = false;
  }

  const answers = new Map(view.escalations.map(e => [e.turn, e.answer]));
  const speechError = recognition.error === "" ? "" : recognition.error === "denied" ? t.speechDenied
    : recognition.error === "unsupported" ? t.speechUnsupported : t.speechFailed;

  return (
    <div className="conversation" lang={lang}>
      <p className="greeting">{view.name}</p>
      <NoticeView notice={view.notice} t={t} speaker={speaker} />

      <div className="turns" aria-live="polite">
        {turns.map(turn => {
          const managerAnswer = answers.get(turn.turn);
          return (
            <div className="turn" key={turn.turn}>
              <div className="bubble mine">
                <span className="who">{t.you}{turn.mode === "voice" && <> · {t.viaVoice}</>}</span>
                <p>{turn.answer}</p>
              </div>
              <div className={"bubble reply state-" + turn.state}>
                <div className="reply-head">
                  <strong>{t.states[turn.state]}</strong>
                  <ListenButton id={"turn-" + turn.turn} text={turn.message} speaker={speaker} t={t} />
                </div>
                {turn.conditions.length > 0 && (
                  <ul className="checks">
                    {turn.conditions.map(c => (
                      <li key={c.id} className={"check " + c.status}>
                        <span className="check-icon" aria-hidden="true">{ICON[c.status]}</span>
                        <span>{c.text}</span>
                        <span className="sr-only">{t.condition[c.status]}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="reply-text">{turn.message}</p>
                {turn.state === "manager" && (
                  managerAnswer
                    ? <div className="manager-answer"><strong>{t.managerAnswered}</strong><p>{managerAnswer}</p></div>
                    : <p className="waiting"><span className="pulse" aria-hidden="true" />{t.waitingManager}</p>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>

      {finished ? (
        <p className={"done " + latest}>{latest === "understood" ? t.doneUnderstood : t.doneGuidance}</p>
      ) : (
        <form className="answer-box" onSubmit={submit}>
          <label htmlFor="answer" className="answer-label">{latest === "followup" ? t.states.followup : t.yourAnswer}</label>
          <p className="hint">{t.answerHint}</p>
          <textarea id="answer" rows={3} value={recognition.listening ? recognition.interim || answer : answer}
            placeholder={t.placeholder} disabled={busy || recognition.listening}
            onChange={e => { setAnswer(e.target.value); if (!e.target.value) setMode("text"); }} />
          {mode === "voice" && answer && !recognition.listening && <p className="hint review">{t.speechReview}</p>}
          {speechError && <p className="hint warn">{speechError}</p>}
          {error && <p role="alert" className="alert">{error}</p>}
          <div className="answer-actions">
            {recognition.supported ? (
              <button type="button" className={"mic" + (recognition.listening ? " on" : "")} disabled={busy}
                aria-pressed={recognition.listening}
                onClick={() => (recognition.listening ? recognition.stop() : recognition.start())}>
                <span className="mic-icon" aria-hidden="true" />
                {recognition.listening ? t.listening : t.speak}
              </button>
            ) : <p className="hint">{t.speechUnsupported}</p>}
            <button className="primary" disabled={busy || recognition.listening || !answer.trim()}>
              {busy ? t.checking : t.send}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

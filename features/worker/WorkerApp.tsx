"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { LANGUAGES, WORKER_LANGS, WORKER_TEXT, type Lang, type WorkerText } from "../../shared/languages.ts";
import { progress as questionProgress } from "../../shared/questions.ts";
import type { InputMode, SessionView, WorkerTurn } from "../../shared/types.ts";
import NoticeView, { SituationCard } from "./NoticeView";
import { post } from "../../ui/request";
import { useRecognition } from "./speech";
import Loading, { VoiceWave } from "../../ui/Loading";
import Chevron from "../../ui/Chevron";
import { CHECK_BG, CHECK_ICON, TURN_BG } from "../../ui/tone.ts";

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

  // Before joining, the browser's back button returns from the name screen to the language list.
  useEffect(() => {
    if (sessionId) return;
    const onPop = (event: PopStateEvent) => {
      if ((event.state as { w?: unknown } | null)?.w !== "name") setLang(null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [sessionId]);
  function pickLanguage(code: Lang) {
    history.pushState({ ...history.state, w: "name" }, "");
    setLang(code);
  }

  const restoring = savedId === undefined || (typeof savedId === "string" && !sessionId && !restoreFailed);
  if (restoring) return <div className="grid min-h-[50vh] place-items-center" aria-busy="true"><Loading size={56} /></div>;

  if (sessionId && view && lang) {
    return <Conversation id={id} sessionId={sessionId} view={view} setView={setView} reload={load} t={t} lang={lang} />;
  }

  if (!lang) {
    return (
      <section className="grid gap-5 pt-6">
        <h1 lang="en">{WORKER_TEXT.en.chooseLanguage}</h1>
        <div className="grid divide-y divide-grid overflow-hidden rounded-card border border-grid bg-paper">
          {WORKER_LANGS.map(code => (
            <button key={code} type="button" lang={code} onClick={() => pickLanguage(code)}
              className="flex cursor-pointer items-center justify-between px-5 py-4 text-left text-[18px] font-semibold hover:bg-canvas active:bg-canvas">
              {LANGUAGES[code].native}
              <span aria-hidden="true" className="text-ink-3">›</span>
            </button>
          ))}
        </div>
      </section>
    );
  }

  return (
    <form className="grid gap-4 pt-6" lang={lang} onSubmit={start}>
      <button type="button" className="btn-text -ml-1 flex items-center gap-0.5 justify-self-start" onClick={() => history.back()}><Chevron />{LANGUAGES[lang].native}</button>
      <label className="grid gap-3 text-[26px] font-bold tracking-[-0.03em]">{t.namePrompt}
        <input autoFocus value={name} maxLength={40} placeholder={t.namePlaceholder} className="!py-3.5 !text-[18px]"
          onChange={e => setName(e.target.value)} />
      </label>
      {error && <p role="alert" className="rounded-[10px] bg-bad-bg px-4 py-3 text-sm font-semibold text-bad-fg">{error}</p>}
      <button className="btn-primary w-full !py-3 text-[16px]" aria-busy={busy} disabled={busy || !name.trim()}>{busy ? <><Loading size={24} tone="light" />{t.starting}</> : t.start}</button>
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
  const [answer, setAnswer] = useState("");
  const [mode, setMode] = useState<InputMode>("text");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // One job per screen: read the notice first, then answer. A returning worker
  // who already answered goes straight back to the conversation.
  const [step, setStep] = useState<"read" | "answer">(view.turns.length ? "answer" : "read");
  const [slide, setSlide] = useState("");
  const running = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);
  const recognition = useRecognition(lang, text => {
    setAnswer(current => (current.trim() ? current.trim() + " " : "") + text);
    setMode("voice");
  });

  const turns = view.turns;
  const questions = view.notice.questions;
  // Questions open one at a time: finished ones stay visible above the open one.
  const { current, results } = questionProgress(questions.map(q => q.id), turns);
  const finished = current === null;
  const allUnderstood = finished && [...results.values()].every(state => state === "understood");
  const shown = questions.filter(q => q.id === current || results.has(q.id));
  const open = questions.find(q => q.id === current);
  const latest = turns.filter(turn => turn.questionId === current).at(-1)?.state;
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

  // The quiz is a history entry, so the phone's back button returns to the notice.
  useEffect(() => {
    const onPop = (event: PopStateEvent) => {
      recognition.stop();
      const next = (event.state as { w?: unknown } | null)?.w === "answer" ? "answer" : "read";
      setSlide(next === "read" ? "slide-back" : "slide-forward");
      setStep(next);
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [recognition]);
  function go(next: "read" | "answer") {
    recognition.stop();
    if (next === "answer") {
      history.pushState({ ...history.state, w: "answer" }, "");
      setSlide("slide-forward");
      setStep("answer");
    } else if ((history.state as { w?: unknown } | null)?.w === "answer") {
      history.back();
      return;
    } else {
      setSlide("slide-back");
      setStep("read");
    }
    window.scrollTo({ top: 0 });
  }

  const stage = step === "read" ? 0 : finished ? 2 : 1;
  const progress = (
    <ol className="grid grid-cols-3 gap-1.5" aria-label={view.name}>
      {[t.steps.read, t.steps.answer, t.steps.done].map((label, i) => (
        <li key={label} aria-current={i === stage ? "step" : undefined}
          className={"grid gap-1.5 text-xs font-bold " + (i <= stage ? "text-ink" : "text-ink-3")}>
          <span aria-hidden="true" className={"h-1 rounded-full " + (i <= stage ? "bg-ink" : "bg-grid")} />
          {label}
        </li>
      ))}
    </ol>
  );

  if (step === "read") {
    return (
      <div key="read" className={"grid gap-4 " + slide} lang={lang}>
        {progress}
        <NoticeView notice={view.notice} t={t} showQuestion={false} />
        <div className="sticky bottom-3 pt-2">
          <button type="button" className="btn-primary w-full !py-3 text-[16px]" onClick={() => go("answer")}>
            {t.readDone}
          </button>
        </div>
      </div>
    );
  }

  const answers = new Map(view.escalations.map(e => [e.turn, e.answer]));
  const speechError = recognition.error === "" ? "" : recognition.error === "denied" ? t.speechDenied
    : recognition.error === "unsupported" ? t.speechUnsupported : t.speechFailed;

  return (
    <div key="answer" className={"grid gap-4 " + slide} lang={lang}>
      {progress}
      <button type="button" className="btn-text -ml-1 flex items-center gap-0.5 justify-self-start" onClick={() => go("read")}><Chevron />{t.backToNotice}</button>
      <div className="grid gap-5" aria-live="polite">
        {shown.map(q => {
          const index = questions.indexOf(q);
          return (
            <div key={q.id} className="grid gap-3">
            <SituationCard question={q.text} type={q.type} index={index + 1} total={questions.length} t={t} />
            {turns.filter(turn => turn.questionId === q.id).map((turn: WorkerTurn) => {
              const managerAnswer = answers.get(turn.turn);
              return (
                <div className="grid gap-2" key={turn.turn}>
                  <div className="max-w-[88%] justify-self-end rounded-bubble rounded-br-sm bg-ink px-4 py-3 text-white">
                    <span className="block text-xs font-bold text-ink-3">{t.you}{turn.mode === "voice" && <> · {t.viaVoice}</>}</span>
                    <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{turn.answer}</p>
                  </div>
                  <div className={"max-w-[94%] rounded-bubble rounded-bl-sm p-4 text-ink " + TURN_BG[turn.state]}>
                    <strong className="mb-2 block text-[15px] font-bold">{t.states[turn.state]}</strong>
                    {turn.conditions.length > 0 && (
                      <ul className="mb-2.5 grid gap-1.5">
                        {turn.conditions.map(c => (
                          <li key={c.id} className="grid grid-cols-[24px_1fr] items-start gap-2 rounded-2xl bg-white/60 px-2.5 py-2 text-sm">
                            <span aria-hidden="true" className={"grid size-6 place-items-center rounded-full text-[13px] font-black " + CHECK_BG[c.status]}>{CHECK_ICON[c.status]}</span>
                            <span>{c.text}</span>
                            <span className="sr-only">{t.condition[c.status]}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="text-[16px] whitespace-pre-wrap [overflow-wrap:anywhere]">{turn.message}</p>
                    {turn.state === "manager" && (
                      managerAnswer
                        ? <div className="mt-3 rounded-2xl bg-white/70 px-3.5 py-3"><strong className="eyebrow text-ink">{t.managerAnswered}</strong><p>{managerAnswer}</p></div>
                        : <p className="mt-3 flex items-center gap-2 text-sm font-bold"><Loading size={24} />{t.waitingManager}</p>
                    )}
                  </div>
                </div>
              );
            })}
            </div>
          );
        })}
      </div>

      {finished ? (
        <div className="grid justify-items-center gap-3 rounded-card border border-grid bg-paper px-6 py-8 text-center">
          <span aria-hidden="true" className={"grid size-12 place-items-center rounded-full text-xl font-bold text-white " + (allUnderstood ? "bg-action" : "bg-stop")}>
            {allUnderstood ? "✓" : "!"}
          </span>
          <p className="text-[19px] leading-snug font-bold text-balance">
            {allUnderstood ? t.allDone : t.doneGuidance}
          </p>
        </div>
      ) : (
        <form className="sticky bottom-3 grid gap-2.5 rounded-card border border-grid bg-paper p-4 shadow-float" onSubmit={submit}>
          <label htmlFor="answer" className="text-[15px] font-bold">
            {latest === "followup" ? t.states.followup : results.size > 0 && !latest ? t.nextQuestion : t.yourAnswer}
          </label>
          {open?.type === "short" && <p className="text-[13px] text-ink-2">{t.shortHint}</p>}
          <textarea id="answer" rows={3} value={recognition.listening ? recognition.interim || answer : answer}
            placeholder={t.placeholder} disabled={busy || recognition.listening} className="!bg-paper text-[17px]"
            onChange={e => { setAnswer(e.target.value); if (!e.target.value) setMode("text"); }} />
          {mode === "voice" && answer && !recognition.listening && <p className="text-[13px] font-semibold text-time">{t.speechReview}</p>}
          {speechError && <p className="text-[13px] font-semibold text-stop">{speechError}</p>}
          {error && <p role="alert" className="rounded-[10px] bg-bad-bg px-4 py-3 text-sm font-semibold text-bad-fg">{error}</p>}
          <div className="grid grid-cols-2 gap-2">
            {recognition.supported ? (
              <button type="button" disabled={busy} aria-pressed={recognition.listening}
                aria-label={recognition.listening ? t.listening : undefined}
                className={recognition.listening ? "btn-primary !bg-stop" : "btn-secondary"}
                onClick={() => (recognition.listening ? recognition.stop() : recognition.start())}>
                {recognition.listening ? <VoiceWave /> : (
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="size-[18px] shrink-0" fill="none" stroke="currentColor"
                    strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="2.5" width="6" height="12" rx="3" fill="currentColor" />
                    <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
                  </svg>
                )}
                {!recognition.listening && t.speak}
              </button>
            ) : <p className="self-center text-[13px] text-ink-2">{t.speechUnsupported}</p>}
            <button className="btn-primary" aria-busy={busy} disabled={busy || recognition.listening || !answer.trim()}>
              {busy ? <><Loading size={22} tone="light" />{t.checking}</> : t.send}
            </button>
          </div>
        </form>
      )}
      {/* After the answer box so the newest reply scrolls into view above it, not under it. */}
      <div ref={bottom} />
    </div>
  );
}

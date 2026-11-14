"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { LANGUAGES, WORKER_LANGS, WORKER_TEXT, type Lang } from "../../shared/languages.ts";
import { MAX_QUESTIONS } from "../../shared/questions.ts";
import type { Condition, Draft, PreviewResult, Question } from "../../shared/types.ts";
import NoticeView from "../worker/NoticeView";
import { post } from "../../ui/request";
import FloatingError from "../../ui/FloatingError";
import Loading from "../../ui/Loading";
import Chevron from "../../ui/Chevron";
import QuizAnswer from "./QuizAnswer";
import { slideTo } from "../../ui/slide.ts";
import { datedTitle, splitTitle } from "../../shared/title.ts";

// A new notice in four screens, one job each: write, check the items,
// check the quiz, preview and send. Every item is quizzed; there are no settings.

const networkError = "요청을 완료하지 못했습니다. 연결을 확인한 뒤 다시 시도하세요.";
const PLACEHOLDER = "예) 내일 오전 8시부터 B동 2층 도장 라인 사용 금지. A동 1층으로 이동해서 작업. 단, 반장 허락 시 B동 출입 가능.";
const DEFAULT_QUIZ = 3;
const STEPS = 4;

function nextId(prefix: string, ids: string[]): string {
  return prefix + (Math.max(0, ...ids.map(id => Number(id.slice(1)))) + 1);
}

// Every step has the same frame: back at top-left, step count at top-right,
// one title, the content, and the main button full-width at the bottom.
function Step({ index, title, onBack, dir, children, action }: {
  index: number; title: string; onBack?: () => void; dir: "forward" | "back"; children: ReactNode; action: ReactNode;
}) {
  return (
    <main key={index} className={"mx-auto grid w-full max-w-[640px] gap-6 px-4 pt-5 pb-28 sm:px-6 " + (dir === "back" ? "slide-back" : "slide-forward")}>
      <div className="flex h-9 items-center justify-between">
        {onBack ? (
          <button type="button" onClick={onBack} className="-ml-2 flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 text-[15px] font-semibold text-ink-2 hover:bg-paper hover:text-ink">
            <Chevron />이전
          </button>
        ) : <span />}
        <span className="text-[13px] font-semibold text-ink-3 tabular-nums">{index} / {STEPS}</span>
      </div>
      <h1 className="-mt-3">{title}</h1>
      {children}
      <div className="sticky bottom-0 -mx-4 flex justify-center border-t border-grid bg-canvas/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        {action}
      </div>
    </main>
  );
}

function RemoveButton({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}
      className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-[10px] text-lg text-ink-3 hover:enabled:bg-paper hover:enabled:text-stop">×</button>
  );
}

export default function AdminWorkspace() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [dir, setDir] = useState<"forward" | "back">("forward");
  const current = useRef(1);
  const [source, setSource] = useState("");
  const [analyzedSource, setAnalyzedSource] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewedDraft, setPreviewedDraft] = useState("");
  // The items the current quiz was written from; changing them asks for a new quiz.
  const [quizFor, setQuizFor] = useState("");
  const [previewLang, setPreviewLang] = useState<Lang>("en");
  const [acceptMismatch, setAcceptMismatch] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function run(name: string, work: () => Promise<void>) {
    setBusy(name);
    setError("");
    try {
      await work();
    } catch (err) {
      setError(err instanceof Error ? err.message : networkError);
    }
    setBusy("");
  }
  // Steps live in the browser history, so the browser's back button goes to the previous step.
  useEffect(() => {
    history.replaceState({ ...history.state, step: 1 }, "");
    const onPop = (event: PopStateEvent) => {
      const state = event.state as { step?: unknown } | null;
      const next = typeof state?.step === "number" ? state.step : 1;
      const d = next < current.current ? "back" : "forward";
      current.current = next;
      slideTo(d, () => {
        setDir(d);
        setStep(next);
        window.scrollTo({ top: 0 });
      });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  function go(next: number) {
    history.pushState({ ...history.state, step: next }, "");
    current.current = next;
    slideTo("forward", () => {
      setDir("forward");
      setStep(next);
      window.scrollTo({ top: 0 });
    });
  }
  function back() {
    if (!busy) history.back();
  }

  /* ---------- server steps ---------- */
  // 1 → 2: split the notice into items.
  const analyze = () => run("analyze", async () => {
    if (draft && source === analyzedSource) { go(2); return; }
    const { draft: analyzed } = await post("analyze", { source }, networkError);
    setAnalyzedSource(source);
    setDraft({ ...analyzed, conditions: analyzed.conditions.map(c => ({ ...c, check: true })), questions: [] });
    setQuizFor("");
    setPreview(null);
    go(2);
  });
  // 2 → 3: write the quiz from the items (kept as is when the items did not change).
  const itemsKey = draft ? JSON.stringify(draft.conditions.map(c => c.label)) : "";
  const quizCurrent = Boolean(draft?.questions.length) && quizFor === itemsKey;
  const makeQuiz = () => run("quiz", async () => {
    if (!draft) return;
    if (!quizCurrent) {
      const count = Math.min(MAX_QUESTIONS, DEFAULT_QUIZ, draft.conditions.length);
      const { draft: withQuiz } = await post("question", { source: analyzedSource, draft, type: "open", count }, networkError);
      setDraft(withQuiz);
      setQuizFor(itemsKey);
    }
    go(3);
  });
  // 3 → 4: translate for workers (skipped when nothing changed).
  const translate = () => run("preview", async () => {
    if (!draft) return;
    if (!preview || JSON.stringify(draft) !== previewedDraft) {
      const result = await post("preview", { source: analyzedSource, draft }, networkError);
      setPreview(result);
      setPreviewedDraft(JSON.stringify(draft));
      setAcceptMismatch(false);
    }
    go(4);
  });
  const publish = () => run("publish", async () => {
    if (!preview) return;
    const { id } = await post("publish", { previewId: preview.previewId, acceptMismatch }, networkError);
    router.push("/notices/" + encodeURIComponent(id));
  });

  /* ---------- editing ---------- */
  function edit(change: (d: Draft) => Draft) {
    setDraft(current => (current ? change(current) : current));
  }
  function addItem() {
    edit(d => {
      const item: Condition = { id: nextId("c", d.conditions.map(c => c.id)), kind: "action", label: "", evidence: "", check: true };
      return { ...d, conditions: [...d.conditions, item] };
    });
  }
  function removeItem(id: string) {
    edit(d => {
      const conditions = d.conditions.filter(c => c.id !== id);
      const all = conditions.map(c => c.id);
      const questions = d.questions.map(q => {
        const left = q.conditionIds.filter(x => x !== id);
        return { ...q, conditionIds: left.length ? left : all };
      });
      return { ...d, conditions, questions };
    });
  }
  function setQuestion(id: string, changes: Partial<Question>) {
    edit(d => ({ ...d, questions: d.questions.map(q => (q.id === id ? { ...q, ...changes } : q)) }));
  }
  function addQuestion() {
    edit(d => ({
      ...d,
      questions: [...d.questions, { id: nextId("q", d.questions.map(x => x.id)), type: "open", text: "", answer: "", conditionIds: d.conditions.map(c => c.id), reason: "" }],
    }));
  }

  const errorToast = error && <FloatingError message={error} onClose={() => setError("")} />;

  /* ---------- 1. write ---------- */
  if (step === 1 || !draft) {
    return (
      <Step dir={dir} index={1} title="바뀐 작업 내용을 입력하세요" onBack={() => { window.location.href = "/"; }}
        action={
          <button className="btn-primary min-w-48 !px-8" aria-busy={busy === "analyze"} disabled={Boolean(busy) || !source.trim()} onClick={analyze}>
            {busy === "analyze" ? <><Loading size={20} tone="light" />분석 중</> : "다음"}
          </button>
        }>
        <textarea aria-label="바뀐 작업 내용" rows={10} value={source} disabled={Boolean(busy)} autoFocus
          onChange={e => setSource(e.target.value)} className="min-h-[260px] text-[16px] leading-relaxed" placeholder={PLACEHOLDER} />
        {errorToast}
      </Step>
    );
  }

  const title = splitTitle(draft.title);
  const itemsReady = Boolean(title.summary.trim() && draft.conditions.length && draft.conditions.every(c => c.label.trim()));
  const quizReady = Boolean(draft.questions.length && draft.questions.every(q => q.text.trim() && q.answer.trim()));
  // What still blocks "다음" on the quiz step, so the button is never disabled without a reason.
  const missing = draft.questions.flatMap((q, i) => [
    ...(q.text.trim() ? [] : [`Q${i + 1} 질문`]),
    ...(q.answer.trim() ? [] : [`Q${i + 1} ${q.type === "short" ? "정답" : "예시 답변"}`]),
  ]);

  /* ---------- 2. items ---------- */
  if (step === 2) {
    return (
      <Step dir={dir} index={2} title="작업자에게 전달할 내용" onBack={back}
        action={
          <button className="btn-primary min-w-48 !px-8" aria-busy={busy === "quiz"} disabled={Boolean(busy) || !itemsReady} onClick={makeQuiz}>
            {busy === "quiz" ? <><Loading size={20} tone="light" />퀴즈 생성 중</> : quizCurrent ? "다음" : "AI 퀴즈 생성하기"}
          </button>
        }>
        <label className="grid gap-1.5 text-sm font-semibold text-ink-2">제목
          <span className="flex items-center gap-2">
            <span className="shrink-0 font-mono text-[15px] font-normal text-ink-3">[{title.date}]</span>
            <input className="font-semibold text-ink" value={title.summary}
              onChange={e => edit(d => ({ ...d, title: datedTitle(e.target.value, title.date) }))} />
          </span>
        </label>
        <div className="grid gap-2">
          <span className="text-sm font-semibold text-ink-2">전달 사항</span>
          {draft.conditions.map((c, i) => (
            <div key={c.id} className="flex items-center gap-1">
              <input aria-label={`전달 사항 ${i + 1}`} value={c.label}
                onChange={e => edit(d => ({ ...d, conditions: d.conditions.map(x => (x.id === c.id ? { ...x, label: e.target.value } : x)) }))} />
              <RemoveButton label={`전달 사항 ${i + 1} 삭제`} disabled={draft.conditions.length === 1} onClick={() => removeItem(c.id)} />
            </div>
          ))}
          <button type="button" className="btn-text justify-self-start" onClick={addItem}>+ 추가</button>
        </div>
        {errorToast}
      </Step>
    );
  }

  /* ---------- 3. quiz ---------- */
  if (step === 3 || !preview) {
    return (
      <Step dir={dir} index={3} title="확인 퀴즈" onBack={back}
        action={
          <button className="btn-primary min-w-48 !px-8" aria-busy={busy === "preview"} disabled={Boolean(busy) || !quizReady} onClick={translate}>
            {busy === "preview" ? <><Loading size={20} tone="light" />번역 중</> : "다음"}
          </button>
        }>
        <div className="grid gap-3">
          {draft.questions.map((q, i) => (
            <div key={q.id} className="grid gap-1.5">
              <span className="text-sm font-semibold text-ink-2">Q{i + 1}</span>
              <div className="flex items-start gap-1">
                <QuizAnswer label={`퀴즈 ${i + 1} 정답 보기`} defaultOpen={!q.answer.trim()}
                  question={<textarea rows={1} aria-label={`퀴즈 ${i + 1}`} value={q.text} placeholder="질문"
                    className="field-sizing-content resize-none !bg-transparent !py-2 text-[16px] font-medium !shadow-none"
                    onChange={e => setQuestion(q.id, { text: e.target.value })} />}
                  answer={
                    <textarea rows={1} aria-label={`퀴즈 ${i + 1} ${q.type === "short" ? "정답" : "예시 답변"}`} placeholder={q.type === "short" ? "정답" : "예시 답변"}
                      value={q.answer} className="field-sizing-content resize-none !bg-paper text-[15px]" onChange={e => setQuestion(q.id, { answer: e.target.value })} />
                  } />
                <RemoveButton label={`퀴즈 ${i + 1} 삭제`} disabled={draft.questions.length === 1}
                  onClick={() => edit(d => ({ ...d, questions: d.questions.filter(x => x.id !== q.id) }))} />
              </div>
            </div>
          ))}
          {draft.questions.length < MAX_QUESTIONS && (
            <button type="button" className="btn-text justify-self-start" onClick={addQuestion}>+ 추가</button>
          )}
        </div>
        {missing.length > 0 && (
          <p role="status" className="text-[13px] font-semibold text-bad-fg">{missing.join(" · ")}을 입력하세요</p>
        )}
        {errorToast}
      </Step>
    );
  }

  /* ---------- 4. preview and send ---------- */
  const translation = preview.translations[previewLang];
  const kinds = new Map(draft.conditions.map(c => [c.id, c.kind]));
  const types = new Map(draft.questions.map(q => [q.id, q.type]));
  const mismatch = WORKER_LANGS.flatMap(lang => preview.translations[lang].checks.filter(c => !c.preserved).map(c => ({ ...c, lang })));

  return (
    <Step dir={dir} index={4} title="작업자 화면 미리보기" onBack={back}
      action={
        <button className="btn-primary min-w-48 !px-8" aria-busy={busy === "publish"}
          disabled={Boolean(busy) || (mismatch.length > 0 && !acceptMismatch)} onClick={publish}>
          {busy === "publish" ? <><Loading size={20} tone="light" />발송 중</> : "작업자에게 발송"}
        </button>
      }>
      <div className="flex gap-1 justify-self-start rounded-[10px] border border-grid bg-paper p-1" role="tablist" aria-label="미리보기 언어">
        {WORKER_LANGS.map(lang => (
          <button key={lang} role="tab" type="button" aria-selected={previewLang === lang} onClick={() => setPreviewLang(lang)}
            className={"cursor-pointer rounded-lg px-3 py-1.5 text-[13px] font-semibold " + (previewLang === lang ? "bg-ink text-white" : "text-ink-2 hover:text-ink")}>
            {LANGUAGES[lang].native}
          </button>
        ))}
      </div>
      <div className="mx-auto w-full max-w-[380px] rounded-[40px] border border-grid bg-paper p-2 shadow-float">
        <div className="max-h-[620px] overflow-y-auto rounded-[32px] bg-canvas px-3 pt-8 pb-4">
          <NoticeView t={WORKER_TEXT[previewLang]}
            notice={{
              ...translation, lang: previewLang, source: analyzedSource, addenda: [],
              conditions: translation.conditions.map(c => ({ ...c, kind: kinds.get(c.id) })),
              questions: translation.questions.map(q => ({ ...q, type: types.get(q.id) ?? "open" })),
            }} />
        </div>
      </div>
      {mismatch.length > 0 && (
        <div className="grid gap-2 rounded-[10px] bg-bad-bg p-4 text-bad-fg">
          <p className="text-sm font-semibold">번역 검토 필요 {mismatch.length}건</p>
          <ul className="grid gap-1 text-[13px]">
            {mismatch.map(m => (
              <li key={m.lang + m.id}>{LANGUAGES[m.lang].native} · {draft.conditions.find(c => c.id === m.id)?.label}{m.note && ` — ${m.note}`}</li>
            ))}
          </ul>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={acceptMismatch} onChange={e => setAcceptMismatch(e.target.checked)} />
            확인했습니다
          </label>
        </div>
      )}
      {errorToast}
    </Step>
  );
}

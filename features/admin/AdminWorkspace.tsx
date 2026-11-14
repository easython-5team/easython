"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { LANGUAGES, WORKER_LANGS, WORKER_TEXT, type Lang } from "../../shared/languages.ts";
import { MAX_QUESTIONS } from "../../shared/questions.ts";
import type { Condition, Draft, PreviewResult, Question } from "../../shared/types.ts";
import NoticeView from "../worker/NoticeView";
import { post } from "../../ui/request";
import FloatingError from "../../ui/FloatingError";
import Loading from "../../ui/Loading";
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

function Step({ index, title, children, footer }: { index: number; title: string; children: ReactNode; footer: ReactNode }) {
  return (
    <main className="mx-auto grid w-full max-w-[640px] gap-6 px-4 pt-8 pb-28 sm:px-6">
      <header className="grid gap-1.5">
        <span className="text-[13px] font-semibold text-ink-3 tabular-nums">{index} / {STEPS}</span>
        <h1>{title}</h1>
      </header>
      {children}
      <div className="sticky bottom-0 -mx-4 flex items-center gap-2 border-t border-grid bg-canvas/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        {footer}
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
  const [source, setSource] = useState("");
  const [analyzedSource, setAnalyzedSource] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewedDraft, setPreviewedDraft] = useState("");
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
  function go(next: number) {
    setStep(next);
    window.scrollTo({ top: 0 });
  }

  /* ---------- server steps ---------- */
  // 1 → 2: split the notice into items and write the quiz in one go.
  const analyze = () => run("analyze", async () => {
    if (draft && source === analyzedSource) { go(2); return; }
    const { draft: analyzed } = await post("analyze", { source }, networkError);
    const all: Draft = { ...analyzed, conditions: analyzed.conditions.map(c => ({ ...c, check: true })) };
    const count = Math.min(MAX_QUESTIONS, DEFAULT_QUIZ, all.conditions.length);
    const { draft: withQuiz } = await post("question", { source, draft: all, type: "open", count }, networkError);
    setAnalyzedSource(source);
    setDraft(withQuiz);
    setPreview(null);
    go(2);
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
      <Step index={1} title="바뀐 작업 내용을 입력하세요"
        footer={
          <button className="btn-primary ml-auto min-w-28" aria-busy={busy === "analyze"} disabled={Boolean(busy) || !source.trim()} onClick={analyze}>
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
  const quizReady = Boolean(draft.questions.length && draft.questions.every(q => q.text.trim() && (q.type !== "short" || q.answer.trim())));
  const back = (to: number) => (
    <button type="button" className="btn-secondary" disabled={Boolean(busy)} onClick={() => go(to)}>이전</button>
  );

  /* ---------- 2. items ---------- */
  if (step === 2) {
    return (
      <Step index={2} title="작업자에게 전달할 내용"
        footer={<>
          {back(1)}
          <button className="btn-primary ml-auto min-w-28" disabled={!itemsReady} onClick={() => go(3)}>다음</button>
        </>}>
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
      <Step index={3} title="확인 퀴즈"
        footer={<>
          {back(2)}
          <button className="btn-primary ml-auto min-w-28" aria-busy={busy === "preview"} disabled={Boolean(busy) || !quizReady} onClick={translate}>
            {busy === "preview" ? <><Loading size={20} tone="light" />번역 중</> : "다음"}
          </button>
        </>}>
        <div className="grid gap-3">
          {draft.questions.map((q, i) => (
            <div key={q.id} className="grid gap-1.5">
              <span className="text-sm font-semibold text-ink-2">Q{i + 1}</span>
              <div className="flex items-start gap-1">
                <textarea rows={2} aria-label={`퀴즈 ${i + 1}`} value={q.text} onChange={e => setQuestion(q.id, { text: e.target.value })} />
                <RemoveButton label={`퀴즈 ${i + 1} 삭제`} disabled={draft.questions.length === 1}
                  onClick={() => edit(d => ({ ...d, questions: d.questions.filter(x => x.id !== q.id) }))} />
              </div>
              {q.type === "short" && (
                <input aria-label={`퀴즈 ${i + 1} 정답`} placeholder="정답" value={q.answer} onChange={e => setQuestion(q.id, { answer: e.target.value })} />
              )}
            </div>
          ))}
          {draft.questions.length < MAX_QUESTIONS && (
            <button type="button" className="btn-text justify-self-start" onClick={addQuestion}>+ 추가</button>
          )}
        </div>
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
    <Step index={4} title="작업자 화면 미리보기"
      footer={<>
        {back(3)}
        <button className="btn-primary ml-auto min-w-28" aria-busy={busy === "publish"}
          disabled={Boolean(busy) || (mismatch.length > 0 && !acceptMismatch)} onClick={publish}>
          {busy === "publish" ? <><Loading size={20} tone="light" />발송 중</> : "발송"}
        </button>
      </>}>
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
              ...translation, lang: previewLang, addenda: [],
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

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LANGUAGES, WORKER_LANGS, WORKER_TEXT, type Lang } from "../../shared/languages.ts";
import { MAX_QUESTIONS } from "../../shared/questions.ts";
import type { Condition, Draft, PreviewResult, Question, RecentNotice } from "../../shared/types.ts";
import NoticeView from "../worker/NoticeView";
import { post } from "../../ui/request";
import FloatingError from "../../ui/FloatingError";
import Loading from "../../ui/Loading";
import { datedTitle, splitTitle } from "../../shared/title.ts";

// The manager's whole job is two screens: write the change, then check what
// workers will see (the notice and its quiz) and send it. Everything the AI
// extracts is checked and quizzed by default, so there are no settings to learn.

const networkError = "요청을 완료하지 못했어요. 연결을 확인한 뒤 다시 시도하세요.";
const EXAMPLE = "내일 오전 8시부터 B동 2층 도장 라인은 환기 설비 점검으로 사용 금지입니다.\n해당 작업자는 A동 1층으로 이동해서 작업하세요.\n단, 반장 허락이 있으면 B동 출입 가능합니다.";
const DEFAULT_QUIZ = 3;

function nextId(prefix: string, ids: string[]): string {
  return prefix + (Math.max(0, ...ids.map(id => Number(id.slice(1)))) + 1);
}

export default function AdminWorkspace({ recent }: { recent: RecentNotice[] }) {
  const router = useRouter();
  const [source, setSource] = useState("");
  const [analyzedSource, setAnalyzedSource] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  // The draft the current preview was made from; any edit after that needs a refresh.
  const [previewedDraft, setPreviewedDraft] = useState("");
  const [previewLang, setPreviewLang] = useState<Lang>("en");
  const [acceptMismatch, setAcceptMismatch] = useState(false);
  const [screen, setScreen] = useState<"write" | "review">("write");
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
  function show(next: "write" | "review") {
    setScreen(next);
    window.scrollTo({ top: 0 });
  }

  async function refreshPreview(next: Draft): Promise<PreviewResult> {
    const result = await post("preview", { source: analyzedSource || source, draft: next }, networkError);
    setPreview(result);
    setPreviewedDraft(JSON.stringify(next));
    setAcceptMismatch(false);
    return result;
  }

  // One click: split the notice, write the quiz and translate both.
  const build = () => run("build", async () => {
    const { draft: analyzed } = await post("analyze", { source }, networkError);
    const all: Draft = { ...analyzed, conditions: analyzed.conditions.map(c => ({ ...c, check: true })) };
    const count = Math.min(MAX_QUESTIONS, DEFAULT_QUIZ, all.conditions.length);
    const { draft: withQuiz } = await post("question", { source, draft: all, type: "open", count }, networkError);
    setAnalyzedSource(source);
    setDraft(withQuiz);
    const result = await post("preview", { source, draft: withQuiz }, networkError);
    setPreview(result);
    setPreviewedDraft(JSON.stringify(withQuiz));
    setAcceptMismatch(false);
    show("review");
  });

  const stale = Boolean(draft && JSON.stringify(draft) !== previewedDraft);
  const mismatch = preview ? WORKER_LANGS.flatMap(lang => preview.translations[lang].checks.filter(c => !c.preserved).map(c => ({ ...c, lang }))) : [];
  const title = draft ? splitTitle(draft.title) : { date: "", summary: "" };
  const ready = Boolean(draft && title.summary.trim()
    && draft.conditions.length && draft.conditions.every(c => c.label.trim())
    && draft.questions.length && draft.questions.every(q => q.text.trim() && (q.type !== "short" || q.answer.trim())));

  const send = () => run("send", async () => {
    if (!draft) return;
    const current = stale || !preview ? await refreshPreview(draft) : preview;
    const changed = WORKER_LANGS.some(lang => current.translations[lang].checks.some(c => !c.preserved));
    // Translation warnings must be seen before sending; they show above the button.
    if (changed && (stale || !acceptMismatch)) throw new Error("번역에서 뜻이 달라졌을 수 있는 내용이 있어요. 확인한 뒤 다시 보내 주세요.");
    const { id } = await post("publish", { previewId: current.previewId, acceptMismatch }, networkError);
    router.push("/notices/" + encodeURIComponent(id));
  });

  /* ---------- editing ---------- */
  function edit(change: (d: Draft) => Draft) {
    setDraft(current => (current ? change(current) : current));
  }
  function setItem(id: string, label: string) {
    edit(d => ({ ...d, conditions: d.conditions.map(c => (c.id === id ? { ...c, label } : c)) }));
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
      // A quiz question that only tested the removed item now tests everything left.
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
    edit(d => {
      const q: Question = { id: nextId("q", d.questions.map(x => x.id)), type: "open", text: "", answer: "", conditionIds: d.conditions.map(c => c.id), reason: "" };
      return { ...d, questions: [...d.questions, q] };
    });
  }
  function removeQuestion(id: string) {
    edit(d => ({ ...d, questions: d.questions.filter(q => q.id !== id) }));
  }

  /* ---------- screen 1: write ---------- */
  if (screen === "write" || !draft || !preview) {
    return (
      <main className="mx-auto grid w-full max-w-[860px] gap-5 px-4 pt-4 pb-20 sm:px-6" aria-busy={Boolean(busy)}>
        <header className="grid gap-2 pt-2">
          <h1>안녕하세요, 관리자님<br />좋은 하루에요.</h1>
          <p className="text-[15px] text-ink-2">바뀐 작업 지시를 적으면 작업자 언어로 번역하고, 제대로 이해했는지 퀴즈로 확인해 드려요.</p>
        </header>

        <section className="card">
          <h2 className="mb-1"><label htmlFor="source">무엇이 바뀌나요?</label></h2>
          <p className="mb-4 text-[13px] text-ink-2">언제 · 어디서 · 무엇이 평소와 다른지 평소 말투로 적어 주세요.</p>
          <textarea id="source" rows={9} value={source} disabled={Boolean(busy)} onChange={e => setSource(e.target.value)}
            className="min-h-[220px] text-[16px] leading-relaxed" placeholder={EXAMPLE} />
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {!source.trim() && <button type="button" className="btn-secondary" onClick={() => setSource(EXAMPLE)}>예시로 채우기</button>}
            {draft && preview && source === analyzedSource && (
              <button type="button" className="btn-secondary" disabled={Boolean(busy)} onClick={() => show("review")}>만들어 둔 화면 보기</button>
            )}
            <button className="btn-primary !px-6 !py-4 text-base" aria-busy={busy === "build"} disabled={Boolean(busy) || !source.trim()} onClick={build}>
              {busy === "build" ? <><Loading size={22} tone="light" />공지와 퀴즈를 만드는 중</> : "공지와 퀴즈 만들기 →"}
            </button>
          </div>
        </section>

        {recent.length > 0 && (
          <section className="card">
            <h2>보낸 공지</h2>
            <ul className="mt-3 grid gap-1.5">
              {recent.map(n => (
                <li key={n.id} className="flex flex-wrap items-baseline gap-3">
                  <a className="font-bold text-ink underline-offset-4 hover:underline" href={"/notices/" + n.id}>{n.title}</a>
                  <span className="text-[13px] text-ink-2">{n.createdAt}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {error && <FloatingError message={error} onClose={() => setError("")} />}
      </main>
    );
  }

  /* ---------- screen 2: check and send ---------- */
  const translation = preview.translations[previewLang];
  const kinds = new Map(draft.conditions.map(c => [c.id, c.kind]));
  const types = new Map(draft.questions.map(q => [q.id, q.type]));

  return (
    <main className="mx-auto grid w-full max-w-[1180px] gap-5 px-4 pt-4 pb-20 sm:px-6" aria-busy={Boolean(busy)}>
      <header className="grid gap-2 pt-2">
        <button type="button" className="btn-text justify-self-start" disabled={Boolean(busy)} onClick={() => show("write")}>← 다시 쓰기</button>
        <h1>이렇게 보낼게요</h1>
        <p className="text-[15px] text-ink-2">작업자는 공지를 읽고, 아래 퀴즈에 답해요. 고칠 곳이 있으면 바로 고치고 보내 주세요.</p>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="grid gap-5">
          <section className="card grid gap-4">
            <div className="flex items-center gap-3">
              <span className="grid size-8 place-items-center rounded-full bg-ink text-sm font-black text-paper">1</span>
              <h2>공지</h2>
            </div>
            <label className="grid gap-1.5 text-sm font-bold">제목
              <span className="flex items-center gap-2">
                <span className="shrink-0 rounded-md bg-white px-2.5 py-2 font-mono text-[15px]">[{title.date}]</span>
                <input className="min-w-0 flex-1" value={title.summary} placeholder="무엇이 바뀌는지 짧게"
                  onChange={e => edit(d => ({ ...d, title: datedTitle(e.target.value, title.date) }))} />
              </span>
            </label>
            <div className="grid gap-2">
              <span className="text-sm font-bold">작업자에게 전할 내용</span>
              <ul className="grid gap-2">
                {draft.conditions.map(c => (
                  <li key={c.id} className="flex items-center gap-2">
                    <input className="min-w-0 flex-1 font-semibold" aria-label="전할 내용" value={c.label} placeholder="한 문장으로"
                      onChange={e => setItem(c.id, e.target.value)} />
                    <button type="button" className="btn-text shrink-0 !px-2 text-[13px] !text-ink-3 hover:!text-stop" aria-label="이 내용 지우기"
                      disabled={draft.conditions.length === 1} onClick={() => removeItem(c.id)}>지우기</button>
                  </li>
                ))}
              </ul>
              <button type="button" className="btn-text justify-self-start" onClick={addItem}>+ 내용 추가</button>
            </div>
          </section>

          <section className="card grid gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="grid size-8 place-items-center rounded-full bg-ink text-sm font-black text-paper">2</span>
              <h2>퀴즈</h2>
              <span className="text-[13px] text-ink-2">작업자가 순서대로 답하면 AI가 이해했는지 판단해요.</span>
            </div>
            <ol className="grid gap-2">
              {draft.questions.map((q, i) => (
                <li key={q.id} className="grid gap-2 rounded-bubble bg-white p-3">
                  <div className="flex items-start gap-2">
                    <span className="mt-2.5 text-sm font-black text-ink-2">Q{i + 1}</span>
                    <textarea rows={2} className="min-w-0 flex-1 font-semibold" aria-label={`퀴즈 ${i + 1}`} value={q.text}
                      placeholder="작업자에게 물어볼 질문" onChange={e => setQuestion(q.id, { text: e.target.value })} />
                    <button type="button" className="btn-text mt-1.5 shrink-0 !px-2 text-[13px] !text-ink-3 hover:!text-stop" aria-label={`퀴즈 ${i + 1} 지우기`}
                      disabled={draft.questions.length === 1} onClick={() => removeQuestion(q.id)}>지우기</button>
                  </div>
                  {q.type === "short" && (
                    <label className="ml-8 grid gap-1 text-[13px] font-bold text-ink-2">정답
                      <input value={q.answer} onChange={e => setQuestion(q.id, { answer: e.target.value })} />
                    </label>
                  )}
                </li>
              ))}
            </ol>
            {draft.questions.length < MAX_QUESTIONS && (
              <button type="button" className="btn-text justify-self-start" onClick={addQuestion}>+ 퀴즈 추가</button>
            )}
          </section>

        </div>

        {/* worker phone preview */}
        <aside className="grid gap-3 lg:sticky lg:top-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold">작업자 휴대폰 화면</span>
            <div className="flex gap-1 rounded-full bg-white p-1" role="tablist" aria-label="미리보기 언어">
              {WORKER_LANGS.map(lang => (
                <button key={lang} role="tab" type="button" aria-selected={previewLang === lang} onClick={() => setPreviewLang(lang)}
                  className={"cursor-pointer rounded-full px-3 py-1 text-[13px] font-bold " + (previewLang === lang ? "bg-ink text-paper" : "text-ink-2 hover:text-ink")}>
                  {LANGUAGES[lang].native}
                </button>
              ))}
            </div>
          </div>
          <div className="relative mx-auto w-full max-w-[400px] rounded-[46px] bg-ink p-2.5 shadow-float">
            <div className="max-h-[640px] overflow-y-auto rounded-[38px] bg-canvas px-3 pt-10 pb-4">
              <div aria-hidden="true" className="mx-auto -mt-7 mb-4 h-6 w-24 rounded-full bg-ink" />
              <NoticeView t={WORKER_TEXT[previewLang]}
                notice={{
                  ...translation, lang: previewLang, addenda: [],
                  conditions: translation.conditions.map(c => ({ ...c, kind: kinds.get(c.id) })),
                  questions: translation.questions.map(q => ({ ...q, type: types.get(q.id) ?? "open" })),
                }} />
            </div>
            {stale && (
              <div className="absolute inset-2.5 grid place-items-center rounded-[38px] bg-canvas/85 p-6 text-center backdrop-blur-[2px]">
                <div className="grid justify-items-center gap-3">
                  <p className="font-bold">고친 내용을 반영할까요?</p>
                  <button type="button" className="btn-primary" aria-busy={busy === "refresh"} disabled={Boolean(busy) || !ready}
                    onClick={() => run("refresh", async () => { await refreshPreview(draft); })}>
                    {busy === "refresh" ? <><Loading size={22} tone="light" />번역하는 중</> : "미리보기 새로고침"}
                  </button>
                  <p className="text-[13px] text-ink-2">바로 보내도 자동으로 반영돼요.</p>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
      <section className="mx-auto grid w-full max-w-[640px] justify-items-center gap-3">
        {mismatch.length > 0 && !stale && (
          <div className="grid w-full gap-2 rounded-2xl bg-stop/15 p-4">
            <p className="text-sm font-bold">번역하면서 뜻이 달라졌을 수 있는 내용이 있어요. 미리보기에서 확인해 주세요.</p>
            <ul className="grid gap-1 text-[13px] text-ink-2">
              {mismatch.map(m => (
                <li key={m.lang + m.id}>
                  <b className="mr-1.5 text-ink">{LANGUAGES[m.lang].native}</b>
                  {draft.conditions.find(c => c.id === m.id)?.label}{m.note && ` — ${m.note}`}
                </li>
              ))}
            </ul>
            <label className="flex items-center gap-2 text-sm font-bold">
              <input type="checkbox" checked={acceptMismatch} onChange={e => setAcceptMismatch(e.target.checked)} />
              확인했어요. 이대로 보낼게요.
            </label>
          </div>
        )}
        <button className="btn-primary !px-8 !py-4 text-[17px]" aria-busy={busy === "send"}
          disabled={Boolean(busy) || !ready || (mismatch.length > 0 && !stale && !acceptMismatch)} onClick={send}>
          {busy === "send" ? <><Loading size={22} tone="light" />보내는 중</> : "작업자에게 보내기"}
        </button>
        <p className="text-[13px] text-ink-2">{ready ? "보내면 작업자가 휴대폰으로 찍을 QR 코드가 나와요." : "비어 있는 칸을 채워 주세요."}</p>
      </section>
      {error && <FloatingError message={error} onClose={() => setError("")} />}
    </main>
  );
}

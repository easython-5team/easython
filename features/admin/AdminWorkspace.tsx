"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CONDITION_KINDS, LANGUAGES, WORKER_LANGS, WORKER_TEXT, type Lang } from "../../shared/languages.ts";
import { MAX_QUESTIONS, QUESTION_TYPES } from "../../shared/questions.ts";
import type { Condition, ConditionKind, Draft, PreviewResult, Question, QuestionType, RecentNotice } from "../../shared/types.ts";
import NoticeView from "../worker/NoticeView";
import { post } from "../../ui/request";
import { useSpeaker } from "../worker/speech";
import FloatingError from "../../ui/FloatingError";
import Loading from "../../ui/Loading";
import Select, { type SelectOption } from "../../ui/Select";
import { KIND_BG } from "../../ui/tone.ts";
import { datedTitle, splitTitle } from "../../shared/title.ts";

const networkError = "요청을 완료하지 못했어요. 연결을 확인한 뒤 다시 시도하세요.";
const STEPS = ["작업 변경 사항 작성", "AI 노트 검수", "작업자 화면 검수", "발행 · QR 공유"];
const KIND_OPTIONS: SelectOption<ConditionKind>[] = (Object.entries(CONDITION_KINDS) as Array<[ConditionKind, string]>)
  .map(([value, label]) => ({ value, label, swatch: KIND_BG[value].split(" ")[0] }));
const TYPE_ORDER: QuestionType[] = ["open", "short"];
const COUNTS = Array.from({ length: MAX_QUESTIONS }, (_, i) => i + 1);

function questionReady(q: Question): boolean {
  return Boolean(q.text.trim() && q.conditionIds.length && (q.type !== "short" || q.answer.trim()));
}

// A pill group for picking one of a few values.
function Segmented<T extends string | number>({ label, value, options, onChange, dark }: {
  label: string; value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void; dark?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={"inline-flex gap-1 rounded-full p-1 " + (dark ? "bg-white/10" : "bg-paper")}>
      {options.map(o => (
        <button key={String(o.value)} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={"min-w-9 cursor-pointer rounded-full px-3 py-1 text-[13px] font-bold transition "
            + (value === o.value ? (dark ? "bg-paper text-ink" : "bg-ink text-paper") : (dark ? "text-ink-3 hover:text-paper" : "text-ink-2 hover:text-ink"))}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Splits the source into plain and evidence-highlighted segments.
interface Segment { text: string; id?: string }

function segments(source: string, conditions: Condition[]): Segment[] {
  const ranges = conditions.filter(c => c.evidence)
    .map(c => ({ id: c.id, start: source.indexOf(c.evidence), length: c.evidence.length }))
    .filter(r => r.start >= 0).sort((a, b) => a.start - b.start);
  const parts: Segment[] = [];
  let cursor = 0;
  for (const r of ranges) {
    const start = Math.max(r.start, cursor);
    const end = r.start + r.length;
    if (end <= start) continue;
    if (start > cursor) parts.push({ text: source.slice(cursor, start) });
    parts.push({ text: source.slice(start, end), id: r.id });
    cursor = end;
  }
  if (cursor < source.length) parts.push({ text: source.slice(cursor) });
  return parts;
}

export default function AdminWorkspace({ recent }: { recent: RecentNotice[] }) {
  const router = useRouter();
  const [source, setSource] = useState("");
  // The text the current AI note was made from; editing the source afterwards needs a new note.
  const [analyzedSource, setAnalyzedSource] = useState("");
  // Which step's screen is open. Moving between screens never discards work.
  const [view, setView] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewLang, setPreviewLang] = useState<Lang>("en");
  const [acceptMismatch, setAcceptMismatch] = useState(false);
  // The Korean questions the current preview was translated from.
  const [previewedQuestions, setPreviewedQuestions] = useState("");
  // How the next "질문 생성하기" writes questions. A null count follows the number of checked conditions.
  const [questionKind, setQuestionKind] = useState<QuestionType>("open");
  const [chosenCount, setChosenCount] = useState<number | null>(null);
  const [focus, setFocus] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const speaker = useSpeaker(previewLang);

  const step = !draft ? 0 : !preview ? 1 : 2;
  const screen = Math.min(view, step);
  const marks = draft ? segments(analyzedSource, draft.conditions) : [];
  const mismatch = preview ? WORKER_LANGS.flatMap(lang => preview.translations[lang].checks.filter(c => !c.preserved).map(c => ({ ...c, lang }))) : [];

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
    speaker.stop();
    setView(next);
    window.scrollTo({ top: 0 });
  }
  function resetFrom(level: 1 | 2) {
    if (level <= 1) setDraft(null);
    setPreview(null);
    setAcceptMismatch(false);
    speaker.stop();
  }
  function updateDraft(changes: Partial<Draft>) {
    setDraft(current => (current ? { ...current, ...changes } : current));
    resetFrom(2);
  }
  // Editing questions in step 3 keeps the preview on screen but marks it out of date.
  function setQuestions(change: (questions: Question[]) => Question[]) {
    setDraft(current => (current ? { ...current, questions: change(current.questions) } : current));
  }
  function editQuestion(id: string, changes: Partial<Question>) {
    setQuestions(qs => qs.map(q => (q.id === id ? { ...q, ...changes } : q)));
  }
  function addQuestion() {
    setQuestions(qs => {
      const next = Math.max(0, ...qs.map(q => Number(q.id.slice(1)))) + 1;
      const checked = draft?.conditions.filter(c => c.check).map(c => c.id) ?? [];
      return [...qs, { id: "q" + next, type: questionKind, text: "", answer: "", conditionIds: checked, reason: "" }];
    });
  }
  function updateCondition(id: string, changes: Partial<Condition>) {
    if (!draft) return;
    updateDraft({ conditions: draft.conditions.map(c => (c.id === id ? { ...c, ...changes } : c)) });
  }
  function addCondition() {
    if (!draft) return;
    const next = Math.max(0, ...draft.conditions.map(c => Number(c.id.slice(1)))) + 1;
    updateDraft({ conditions: [...draft.conditions, { id: "c" + next, kind: "action", label: "", evidence: "", check: false }] });
  }

  const analyze = () => run("analyze", async () => {
    const { draft: result } = await post("analyze", { source }, networkError);
    resetFrom(2);
    setDraft(result);
    setAnalyzedSource(source);
    go(1);
  });
  async function previewDraft(next: Draft) {
    const result = await post("preview", { source: analyzedSource, draft: next }, networkError);
    setPreview(result);
    setPreviewedQuestions(JSON.stringify(next.questions));
    setAcceptMismatch(false);
    go(2);
  }
  // From the AI note: write questions from the checked conditions, then preview them.
  const makeQuestion = () => run("preview", async () => {
    const { draft: next } = await post("question", { source: analyzedSource, draft, type: questionKind, count: questionCount }, networkError);
    setDraft(next);
    await previewDraft(next);
  });
  // From the worker preview: keep the manager's edited questions and translate them again.
  const makePreview = () => run("preview", async () => {
    if (draft) await previewDraft(draft);
  });
  const publish = () => run("publish", async () => {
    if (!preview) return;
    const { id } = await post("publish", { previewId: preview.previewId, acceptMismatch }, networkError);
    router.push("/notices/" + encodeURIComponent(id));
  });

  const title = draft ? splitTitle(draft.title) : { date: "", summary: "" };
  const checked = draft?.conditions.filter(c => c.check) ?? [];
  const questionCount = chosenCount ?? Math.min(MAX_QUESTIONS, Math.max(1, checked.length));
  const canPreview = draft && title.summary &&
    draft.conditions.length && draft.conditions.every(c => c.label.trim()) && checked.length > 0;
  const questionsReady = Boolean(draft?.questions.length && draft.questions.every(questionReady));
  const translation = preview?.translations[previewLang];
  const questionChanged = Boolean(preview && draft && JSON.stringify(draft.questions) !== previewedQuestions);
  const questionTypes = new Map(draft?.questions.map(q => [q.id, q.type]));
  const kinds = new Map<string, ConditionKind>(draft?.conditions.map(c => [c.id, c.kind]));

  return (
    <main className="mx-auto grid w-full max-w-[1320px] gap-5 px-4 pt-4 pb-20 sm:px-6" aria-busy={Boolean(busy)}>
      <header className="grid gap-5 pt-2 pb-1">
        <h1>안녕하세요, 관리자님<br />좋은 하루에요.</h1>
        <ol className="flex w-full items-center" aria-label="진행 단계">
          {STEPS.map((label, i) => {
            const open = i <= step && i < 3;
            return (
              <li key={label} aria-current={i === screen ? "step" : undefined} className={"flex items-center gap-2 " + (i > 0 ? "flex-1 pl-2" : "")}>
                {i > 0 && <span aria-hidden="true" className={"h-0.5 flex-1 rounded-full " + (i <= step ? "bg-ink" : "bg-grid")} />}
                <button type="button" title={label} aria-label={`${i + 1}단계 ${label}${open ? "" : " (아직 열리지 않음)"}`}
                  disabled={!open || Boolean(busy)} onClick={() => go(i)}
                  className={"grid shrink-0 cursor-pointer place-items-center rounded-full font-black transition-all enabled:hover:scale-110 disabled:cursor-default disabled:opacity-100 "
                    + (i === screen ? "size-9 bg-ink text-[15px] text-paper shadow-float"
                      : open ? "size-7 bg-action text-xs text-ink" : "size-7 bg-paper text-xs text-ink-3")}>
                  {i + 1}
                </button>
              </li>
            );
          })}
        </ol>
      </header>

      {/* ---------- screen 1: the manager's text ---------- */}
      {screen === 0 && (
        <section className="card max-w-[760px]">
          <h2 className="mb-4"><label htmlFor="source">작업 변경 사항</label></h2>
          <textarea id="source" rows={11} value={source} disabled={Boolean(busy)} onChange={e => setSource(e.target.value)}
            className="min-h-[270px] text-[16px] leading-relaxed"
            placeholder="언제부터, 어디서, 무엇이 평소와 다르게 바뀌는지 평소처럼 적어 주세요." />
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {draft && source === analyzedSource && (
              <button type="button" className="btn-secondary" disabled={Boolean(busy)} onClick={() => go(1)}>AI 노트로 →</button>
            )}
            <button className="btn-primary" aria-busy={busy === "analyze"} disabled={Boolean(busy) || !source.trim()} onClick={analyze}>
              {busy === "analyze" ? <><Loading size={22} tone="light" />AI 노트를 만드는 중</> : draft ? "AI 노트 다시 생성" : "AI 노트 생성"}
            </button>
          </div>
        </section>
      )}

      {screen === 1 && draft && (
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <section className="card">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2>작업 변경 사항</h2>
            <button type="button" className="btn-text" disabled={Boolean(busy)} onClick={() => go(0)}>원문 수정</button>
          </div>
          <div className="rounded-bubble bg-white p-4 text-[16px] leading-loose whitespace-pre-wrap" aria-label="작업 변경 사항과 AI가 찾은 근거">
            {marks.map(({ text, id }, i) => id
              ? <mark key={i} onMouseEnter={() => setFocus(id)} onMouseLeave={() => setFocus("")}
                  className={"cursor-default rounded-md px-0.5 text-ink transition " + KIND_BG[kinds.get(id) ?? "action"]
                    + (focus === id ? " ring-2 ring-ink" : " opacity-80")}>
                  {text}<sup className="ml-0.5 text-[10px] font-black">{id.slice(1)}</sup>
                </mark>
              : <span key={i}>{text}</span>)}
          </div>
        </section>

        {/* ---------- screen 2: AI note review ---------- */}
          <section className="card">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2>AI 노트</h2>
              <span className="text-[13px] text-ink-2">체크한 조건을 묻는 질문을 만들고, 작업자 답변에서 확인해요</span>
            </div>
            <label className="grid gap-1.5 text-sm font-bold">공지 제목
              <span className="flex items-center gap-2">
                <span className="shrink-0 rounded-md bg-white px-2.5 py-2 font-mono text-[15px]" title="작성일(YYMMDD)">[{title.date}]</span>
                <input className="min-w-0 flex-1" value={title.summary} placeholder="작업 내용 요약"
                  onChange={e => updateDraft({ title: datedTitle(e.target.value, title.date) })} />
              </span>
            </label>
            <ul className="mt-4 mb-2.5 grid gap-2.5">
              {draft.conditions.map(c => (
                <li key={c.id} onMouseEnter={() => setFocus(c.id)} onMouseLeave={() => setFocus("")}
                  className={"grid gap-2 rounded-bubble bg-white p-3.5 transition " + (focus === c.id ? "ring-2 ring-ink" : "")}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={"grid size-6 place-items-center rounded-full text-xs font-black " + KIND_BG[c.kind]}>{c.id.slice(1)}</span>
                    <Select label="조건 종류" value={c.kind} options={KIND_OPTIONS} onChange={kind => updateCondition(c.id, { kind })} />
                    <label className="inline-flex items-center gap-1.5 text-[13px] font-bold">
                      <input type="checkbox" checked={c.check} onChange={e => updateCondition(c.id, { check: e.target.checked })} />
                      답변에서 확인
                    </label>
                    <button type="button" className="btn-text ml-auto text-[13px] !text-stop" aria-label={`조건 ${c.id.slice(1)} 삭제`}
                      disabled={draft.conditions.length === 1}
                      onClick={() => updateDraft({ conditions: draft.conditions.filter(x => x.id !== c.id) })}>삭제</button>
                  </div>
                  <input className="font-semibold" aria-label="조건 문장" value={c.label} placeholder="조건을 한 문장으로"
                    onChange={e => updateCondition(c.id, { label: e.target.value })} />
                  <p className="text-[13px] text-ink-2">{c.evidence ? <>근거 <q className="rounded-md bg-paper px-1 text-ink">{c.evidence}</q></> : <em>관리자가 직접 추가한 조건</em>}</p>
                </li>
              ))}
            </ul>
            <button type="button" className="btn-text" onClick={addCondition}>+ 조건 직접 추가</button>

            <div className="mt-5 grid gap-3 rounded-bubble bg-white p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-bold">질문 유형</span>
                <Segmented label="질문 유형" value={questionKind} onChange={setQuestionKind}
                  options={TYPE_ORDER.map(value => ({ value, label: QUESTION_TYPES[value] }))} />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-bold">질문 개수</span>
                <Segmented label="질문 개수" value={questionCount} onChange={setChosenCount}
                  options={COUNTS.map(value => ({ value, label: String(value) }))} />
              </div>
              <p className="text-[13px] text-ink-2">
                {questionKind === "short" ? "단답형은 정답이 있는 짧은 질문이에요. 정답은 다음 화면에서 고칠 수 있어요."
                  : "주관식은 무엇을 할지 직접 설명하게 하는 질문이에요."} 체크한 조건 {checked.length}개를 질문 {questionCount}개에 나눠 물어요.
              </p>
            </div>

            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {preview && (
                <button type="button" className="btn-secondary" disabled={Boolean(busy)} onClick={() => go(2)}>작업자 화면 검수로 →</button>
              )}
              <button className="btn-primary" aria-busy={busy === "preview"} disabled={Boolean(busy) || !canPreview} onClick={makeQuestion}>
                {busy === "preview" ? <><Loading size={22} tone="light" />질문을 만드는 중</> : preview ? "질문 다시 생성하기" : "질문 생성하기"}
              </button>
            </div>
          </section>
      </div>
      )}

      {/* ---------- worker preview & translation check ---------- */}
      {/* ---------- screen 3: worker preview, question and publish ---------- */}
      {screen === 2 && preview && translation && draft && (
        <section className="card">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2>작업자 화면 검수</h2>
            <div className="flex gap-1.5 rounded-full bg-white p-1" role="tablist" aria-label="미리보기 언어">
              {WORKER_LANGS.map(lang => {
                const bad = preview.translations[lang].checks.some(c => !c.preserved);
                return (
                  <button key={lang} role="tab" type="button" aria-selected={previewLang === lang}
                    className={"inline-flex cursor-pointer items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-bold "
                      + (previewLang === lang ? "bg-ink text-paper" : "text-ink-2 hover:text-ink")}
                    onClick={() => { speaker.stop(); setPreviewLang(lang); }}>
                    {LANGUAGES[lang].native}{bad && <span className="grid size-[18px] place-items-center rounded-full bg-stop text-xs text-ink" aria-label="검증 경고">!</span>}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid items-start gap-7 lg:grid-cols-[380px_minmax(0,1fr)]">
            <div className="mx-auto w-full max-w-[380px] rounded-[46px] bg-ink p-2.5 shadow-float" aria-label="작업자 휴대폰 화면 미리보기">
              <div className="max-h-[680px] overflow-y-auto rounded-[38px] bg-canvas px-3 pt-10 pb-4">
                <div aria-hidden="true" className="mx-auto -mt-7 mb-4 h-6 w-24 rounded-full bg-ink" />
                <NoticeView t={WORKER_TEXT[previewLang]} speaker={speaker}
                  notice={{
                    ...translation, lang: previewLang, addenda: [],
                    conditions: translation.conditions.map(c => ({ ...c, kind: kinds.get(c.id) })),
                    questions: translation.questions.map(q => ({ ...q, type: questionTypes.get(q.id) ?? "open" })),
                  }} />
              </div>
            </div>
            <div className="min-w-0">
              <div className="grid gap-3 rounded-bubble bg-ink p-5 text-paper">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm font-bold text-ink-3">작업자에게 차례로 물을 질문</h3>
                  <span className="text-[13px] text-ink-3">{draft.questions.length}/{MAX_QUESTIONS}</span>
                </div>
                <ol className="grid gap-3">
                  {draft.questions.map((q, i) => (
                    <li key={q.id} className="grid gap-2.5 rounded-2xl bg-white/5 p-3.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="grid size-6 place-items-center rounded-full bg-paper text-xs font-black text-ink">{i + 1}</span>
                        <Segmented dark label={`질문 ${i + 1} 유형`} value={q.type} onChange={type => editQuestion(q.id, { type })}
                          options={TYPE_ORDER.map(value => ({ value, label: QUESTION_TYPES[value] }))} />
                        <button type="button" className="btn-text ml-auto text-[13px] !text-stop" aria-label={`질문 ${i + 1} 삭제`}
                          disabled={draft.questions.length === 1}
                          onClick={() => setQuestions(qs => qs.filter(x => x.id !== q.id))}>삭제</button>
                      </div>
                      <textarea rows={2} value={q.text} aria-label={`질문 ${i + 1}`} placeholder="작업자에게 물을 질문"
                        className="text-[16px] font-bold" onChange={e => editQuestion(q.id, { text: e.target.value })} />
                      {q.type === "short" && (
                        <label className="grid gap-1.5 text-[13px] font-bold text-ink-3">정답
                          <input value={q.answer} placeholder="예: 2층 실내 정리" onChange={e => editQuestion(q.id, { answer: e.target.value })} />
                        </label>
                      )}
                      <div className="grid gap-1.5">
                        <span className="text-[13px] font-bold text-ink-3">이 질문으로 확인할 조건</span>
                        <div className="flex flex-wrap gap-1.5">
                          {checked.map(c => {
                            const on = q.conditionIds.includes(c.id);
                            return (
                              <button key={c.id} type="button" aria-pressed={on} title={c.label}
                                onClick={() => editQuestion(q.id, { conditionIds: on ? q.conditionIds.filter(x => x !== c.id) : checked.map(x => x.id).filter(x => x === c.id || q.conditionIds.includes(x)) })}
                                className={"max-w-full cursor-pointer truncate rounded-full px-2.5 py-1 text-xs font-bold transition "
                                  + (on ? KIND_BG[c.kind] : "bg-white/10 text-ink-3 hover:text-paper")}>
                                {c.id.slice(1)}. {c.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      {!questionReady(q) && (
                        <p className="text-[13px] text-except">
                          {!q.text.trim() ? "질문을 입력해 주세요." : !q.conditionIds.length ? "확인할 조건을 하나 이상 골라 주세요." : "정답을 입력해 주세요."}
                        </p>
                      )}
                      {q.reason && <p className="text-[13px] text-ink-3">{q.reason}</p>}
                    </li>
                  ))}
                </ol>
                {draft.questions.length < MAX_QUESTIONS && (
                  <button type="button" className="btn-text justify-self-start !text-paper" onClick={addQuestion}>+ 질문 직접 추가</button>
                )}
                {questionChanged && (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-[13px] text-except">질문을 바꿨어요. 미리보기에 반영해야 발행할 수 있어요.</p>
                    <button className="btn-secondary !py-2 text-sm" aria-busy={busy === "preview"}
                      disabled={Boolean(busy) || !questionsReady} onClick={makePreview}>
                      {busy === "preview" ? <><Loading size={20} />반영하는 중</> : "미리보기에 반영"}
                    </button>
                  </div>
                )}
              </div>

              <div className="mt-6 grid justify-items-center gap-3">
                {mismatch.length > 0 && (
                  <div className="grid gap-2 rounded-2xl bg-stop/15 p-4">
                    <p className="text-sm font-bold">번역에서 의미가 달라졌을 수 있는 조건이 {mismatch.length}건 있어요.</p>
                    <ul className="grid gap-1 text-[13px] text-ink-2">
                      {mismatch.map(m => (
                        <li key={m.lang + m.id}>
                          <span className="mr-1.5 font-bold text-ink">{LANGUAGES[m.lang].native} · {m.id.slice(1)}번</span>
                          {draft.conditions.find(c => c.id === m.id)?.label}{m.note && ` — ${m.note}`}
                        </li>
                      ))}
                    </ul>
                    <label className="flex items-center gap-2 text-sm font-bold">
                      <input type="checkbox" checked={acceptMismatch} onChange={e => setAcceptMismatch(e.target.checked)} />
                      확인했고, 이대로 발행합니다.
                    </label>
                  </div>
                )}
                <button className="btn-primary !px-6 !py-4 text-base" aria-busy={busy === "publish"} disabled={Boolean(busy) || questionChanged || (mismatch.length > 0 && !acceptMismatch)} onClick={publish}>
                  {busy === "publish" ? <><Loading size={22} tone="light" />전송하는 중</> : "작업자에게 전송하기"}
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {screen === 0 && recent.length > 0 && (
        <section className="card">
          <h2>발행한 공지</h2>
          <ul className="mt-3 grid gap-1.5">
            {recent.map(n => (
              <li key={n.id} className="flex flex-wrap items-baseline gap-3">
                <a className="font-bold text-ink underline-offset-4 hover:underline" href={"/notices/" + n.id}>{n.title}</a>
                <span className="text-[13px] text-ink-2">v{n.version} · {n.createdAt}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {error && <FloatingError message={error} onClose={() => setError("")} />}
    </main>
  );
}

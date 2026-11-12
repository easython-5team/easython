"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CONDITION_KINDS, LANGUAGES, WORKER_LANGS, WORKER_TEXT, type Lang } from "../../shared/languages.ts";
import type { Condition, ConditionKind, Draft, PreviewResult, RecentNotice } from "../../shared/types.ts";
import NoticeView from "../worker/NoticeView";
import { post } from "../../ui/request";
import { useSpeaker } from "../worker/speech";
import FloatingError from "../../ui/FloatingError";
import { KIND_BG } from "../../ui/tone.ts";

const networkError = "요청을 완료하지 못했어요. 연결을 확인한 뒤 다시 시도하세요.";
const STEPS = ["작업 변경 사항 작성", "AI 노트 검수", "작업자 화면 검수", "발행 · QR 공유"];

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
  const [draft, setDraft] = useState<Draft | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewLang, setPreviewLang] = useState<Lang>("en");
  const [acceptMismatch, setAcceptMismatch] = useState(false);
  const [focus, setFocus] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const speaker = useSpeaker(previewLang);

  const step = !draft ? 0 : !preview ? 1 : 2;
  const marks = draft ? segments(source, draft.conditions) : [];
  const mismatch = preview ? WORKER_LANGS.flatMap(lang => preview.translations[lang].checks.filter(c => !c.preserved)) : [];

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
  });
  const makePreview = () => run("preview", async () => {
    const result = await post("preview", { source, draft }, networkError);
    setPreview(result);
    setAcceptMismatch(false);
  });
  const publish = () => run("publish", async () => {
    if (!preview) return;
    const { id } = await post("publish", { previewId: preview.previewId, acceptMismatch }, networkError);
    router.push("/notices/" + encodeURIComponent(id));
  });

  const canPreview = draft && draft.title.trim() && draft.question.trim() &&
    draft.conditions.length && draft.conditions.every(c => c.label.trim()) && draft.conditions.some(c => c.check);
  const translation = preview?.translations[previewLang];
  const kinds = new Map<string, ConditionKind>(draft?.conditions.map(c => [c.id, c.kind]));

  return (
    <main className="mx-auto grid w-full max-w-[1320px] gap-5 px-4 pt-4 pb-20 sm:px-6" aria-busy={Boolean(busy)}>
      <header className="flex flex-wrap items-end justify-between gap-4 pt-2 pb-1">
        <div className="grid gap-1.5">
          <h1>안녕하세요, 관리자님</h1>
          <p className="text-lg font-semibold text-ink-2">좋은 하루에요.</p>
        </div>
        <ol className="flex items-center gap-1.5" aria-label="진행 단계">
          {STEPS.map((label, i) => (
            <li key={label} title={label} aria-current={i === step ? "step" : undefined} className="flex items-center gap-1.5">
              {i > 0 && <span aria-hidden="true" className={"h-0.5 w-4 rounded-full " + (i <= step ? "bg-ink" : "bg-grid")} />}
              <span className={"grid place-items-center rounded-full font-black transition-all "
                + (i === step ? "size-9 bg-ink text-[15px] text-paper shadow-float"
                  : i < step ? "size-7 bg-action text-xs text-ink" : "size-7 bg-paper text-xs text-ink-3")}>
                {i + 1}
              </span>
              <span className="sr-only">{label}</span>
            </li>
          ))}
        </ol>
      </header>

      <div className={"grid items-start gap-5 " + (draft ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]" : "max-w-[760px]")}>
        {/* ---------- source ---------- */}
        <section className="card">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2><label htmlFor="source">작업 변경 사항</label></h2>
            {draft && (
              <button type="button" className="btn-text" disabled={Boolean(busy)} onClick={() => resetFrom(1)}>원문 수정</button>
            )}
          </div>
          {draft ? (
            <div className="rounded-bubble bg-white p-4 text-[16px] leading-loose whitespace-pre-wrap" aria-label="작업 변경 사항과 AI가 찾은 근거">
              {marks.map(({ text, id }, i) => id
                ? <mark key={i} onMouseEnter={() => setFocus(id)} onMouseLeave={() => setFocus("")}
                    className={"cursor-default rounded-md px-0.5 text-ink transition " + KIND_BG[kinds.get(id) ?? "action"]
                      + (focus === id ? " ring-2 ring-ink" : " opacity-80")}>
                    {text}<sup className="ml-0.5 text-[10px] font-black">{id.slice(1)}</sup>
                  </mark>
                : <span key={i}>{text}</span>)}
            </div>
          ) : (
            <textarea id="source" rows={11} value={source} disabled={Boolean(busy)} onChange={e => setSource(e.target.value)}
              className="min-h-[270px] text-[16px] leading-relaxed"
              placeholder="언제부터, 어디서, 무엇이 평소와 다르게 바뀌는지 평소처럼 적어 주세요." />
          )}
          {!draft && (
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="btn-primary" disabled={Boolean(busy) || !source.trim()} onClick={analyze}>
                {busy === "analyze" ? "AI 노트를 만드는 중…" : "AI 노트 생성"}
              </button>
            </div>
          )}
        </section>

        {/* ---------- AI analysis review ---------- */}
        {draft && (
          <section className="card">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2>AI 노트</h2>
              <span className="text-[13px] text-ink-2">체크한 조건을 작업자 답변에서 확인해요</span>
            </div>
            <label className="grid gap-1.5 text-sm font-bold">공지 제목
              <input value={draft.title} onChange={e => updateDraft({ title: e.target.value })} />
            </label>
            <ul className="mt-4 mb-2.5 grid gap-2.5">
              {draft.conditions.map(c => (
                <li key={c.id} onMouseEnter={() => setFocus(c.id)} onMouseLeave={() => setFocus("")}
                  className={"grid gap-2 rounded-bubble bg-white p-3.5 transition " + (focus === c.id ? "ring-2 ring-ink" : "")}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={"grid size-6 place-items-center rounded-full text-xs font-black " + KIND_BG[c.kind]}>{c.id.slice(1)}</span>
                    <select aria-label="조건 종류" value={c.kind} onChange={e => updateCondition(c.id, { kind: e.target.value as ConditionKind })}>
                      {Object.entries(CONDITION_KINDS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                    </select>
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

            <div className="mt-5 grid gap-2 rounded-bubble bg-ink p-4 text-paper">
              <label className="grid gap-2 text-sm font-bold text-ink-3">작업자에게 물을 상황 질문
                <textarea rows={2} value={draft.question} className="font-bold" onChange={e => updateDraft({ question: e.target.value })} />
              </label>
              {draft.questionReason && <p className="text-[13px] text-ink-3"><strong className="mr-1.5 text-except">AI가 이 질문을 만든 이유</strong>{draft.questionReason}</p>}
            </div>

            {!preview && (
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="btn-primary" disabled={Boolean(busy) || !canPreview} onClick={makePreview}>
                  {busy === "preview" ? "번역하고 역번역으로 검증하는 중…" : `작업자 화면 미리보기 (${WORKER_LANGS.map(l => l.toUpperCase()).join("·")} 번역 + 검증)`}
                </button>
              </div>
            )}
          </section>
        )}
      </div>

      {/* ---------- worker preview & translation check ---------- */}
      {preview && translation && draft && (
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
                  notice={{ ...translation, lang: previewLang, addenda: [], conditions: translation.conditions.map(c => ({ ...c, kind: kinds.get(c.id) })) }} />
              </div>
            </div>
            <div className="min-w-0">
              <h3 className="mb-3 flex flex-wrap items-baseline gap-2.5">번역 의미 검증 <span className="text-[13px] font-medium text-ink-2">번역 → 독립 역번역 → 조건별 비교</span></h3>
              <div className="overflow-x-auto rounded-bubble bg-white px-3">
                <table className="w-full border-collapse text-sm">
                  <thead><tr className="border-b border-grid text-left text-xs text-ink-2">
                    <th className="px-2 py-2.5">승인한 조건</th><th className="px-2 py-2.5">{LANGUAGES[previewLang].native}</th><th className="px-2 py-2.5">결과</th>
                  </tr></thead>
                  <tbody>
                    {draft.conditions.map(c => {
                      const check = translation.checks.find(x => x.id === c.id);
                      const text = translation.conditions.find(x => x.id === c.id)?.text;
                      return (
                        <tr key={c.id} className={"border-b border-canvas align-top last:border-0 " + (check?.preserved ? "" : "bg-stop/10")}>
                          <td className="px-2 py-3"><span className={"mr-2 inline-grid size-5 place-items-center rounded-full text-[11px] font-black " + KIND_BG[c.kind]}>{c.id.slice(1)}</span>{c.label}</td>
                          <td className="px-2 py-3" lang={previewLang}>{text}</td>
                          <td className="px-2 py-3">{check?.preserved ? <span className="tag bg-action">의미 보존</span>
                            : <><span className="tag bg-stop">확인 필요</span><p className="mt-1 text-xs text-ink-2">{check?.note}</p></>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <details className="mt-3 text-sm">
                <summary>역번역 전문 보기</summary>
                <p className="mt-2 rounded-2xl bg-white p-3 whitespace-pre-wrap">{translation.backTranslation}</p>
              </details>

              <div className="mt-6 grid justify-items-start gap-3 rounded-bubble bg-white p-5">
                {mismatch.length > 0 && (
                  <label className="flex items-center gap-2 text-sm font-bold">
                    <input type="checkbox" checked={acceptMismatch} onChange={e => setAcceptMismatch(e.target.checked)} />
                    번역 검증 경고 {mismatch.length}건을 확인했고, 이대로 발행합니다.
                  </label>
                )}
                <button className="btn-primary !px-6 !py-4 text-base" disabled={Boolean(busy) || (mismatch.length > 0 && !acceptMismatch)} onClick={publish}>
                  {busy === "publish" ? "발행 중…" : "승인하고 발행 · QR 만들기"}
                </button>
                <p className="text-[13px] text-ink-2">발행 시에는 AI를 다시 호출하지 않아요. 지금 검수한 문장이 그대로 작업자에게 전달돼요.</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {recent.length > 0 && (
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

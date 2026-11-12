"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CONDITION_KINDS, LANGUAGES, WORKER_LANGS, WORKER_TEXT, type Lang } from "../lib/languages.ts";
import type { Condition, ConditionKind, Draft, PreviewResult, RecentNotice } from "../lib/types.ts";
import NoticeView from "./NoticeView";
import { post } from "./request";
import { useSpeaker } from "./speech";

const example = `[강풍 대비 옥상 작업 중단 안내]

강풍이 예상되어 오늘 오후 2시부터 옥상 작업을 모두 중단합니다. 공구와 남은 자재는 정리하지 말고 옥상에 그대로 두고 내려오세요. 내려온 뒤에는 1층 현장 사무실 앞에 모여 인원 확인을 받으세요.`;
const networkError = "요청을 완료하지 못했어요. 연결을 확인한 뒤 다시 시도하세요.";
const STEPS = ["공지 작성", "AI 분석 검수", "작업자 화면 검수", "발행 · QR 공유"];

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

export default function AdminWorkspace({ demoSource, recent }: { demoSource: string; recent: RecentNotice[] }) {
  const router = useRouter();
  const [source, setSource] = useState(demoSource);
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
    <main className="admin" aria-busy={Boolean(busy)}>
      <ol className="stepper" aria-label="진행 단계">
        {STEPS.map((label, i) => (
          <li key={label} className={i < step ? "done" : i === step ? "current" : ""} aria-current={i === step ? "step" : undefined}>
            <span className="step-num">{i + 1}</span>{label}
          </li>
        ))}
      </ol>

      <div className="admin-grid">
        {/* ---------- source ---------- */}
        <section className="panel source-panel">
          <div className="panel-heading">
            <h2><label htmlFor="source">한국어 변경 지시</label></h2>
            {draft ? (
              <button type="button" className="text-button" disabled={Boolean(busy)} onClick={() => resetFrom(1)}>원문 수정</button>
            ) : (
              <button type="button" className="text-button" disabled={Boolean(busy)}
                onClick={() => { setSource(demoSource || example); resetFrom(1); }}>예시 불러오기</button>
            )}
          </div>
          {draft ? (
            <div className="source-marked" aria-label="원문과 AI가 찾은 근거">
              {marks.map(({ text, id }, i) => id
                ? <mark key={i} className={focus === id ? "active" : ""} onMouseEnter={() => setFocus(id)}
                    onMouseLeave={() => setFocus("")}>{text}<sup>{id.slice(1)}</sup></mark>
                : <span key={i}>{text}</span>)}
            </div>
          ) : (
            <textarea id="source" rows={11} value={source} disabled={Boolean(busy)} onChange={e => setSource(e.target.value)}
              placeholder="언제부터, 어디서, 무엇이 평소와 다르게 바뀌는지 평소처럼 적어 주세요." />
          )}
          {!draft && (
            <div className="actions">
              <button className="primary" disabled={Boolean(busy) || !source.trim()} onClick={analyze}>
                {busy === "analyze" ? "AI가 지시를 분석하는 중…" : "AI로 변경 조건 분석"}
              </button>
            </div>
          )}
          {!draft && (
            <div className="ai-explainer">
              <h3>AI가 하는 일</h3>
              <ol>
                <li><strong>조건 추출</strong> 원문을 시점·장소·행동·금지·예외 조건으로 나누고, 각 조건의 원문 근거를 표시해요.</li>
                <li><strong>상황 질문</strong> 평소 습관 때문에 놓치기 쉬운 조건을 작업자가 직접 말하게 하는 질문을 만들어요.</li>
                <li><strong>번역 검증</strong> 영어·베트남어로 번역한 뒤 다시 한국어로 역번역해 조건별 의미 보존을 확인해요.</li>
                <li><strong>조건별 판정</strong> 작업자의 답에서 인용 근거를 찾아 충족·누락·충돌을 가리고, 근거 없는 질문은 관리자에게 넘겨요.</li>
              </ol>
            </div>
          )}
        </section>

        {/* ---------- AI analysis review ---------- */}
        {draft && (
          <section className="panel analysis-panel">
            <div className="panel-heading">
              <h2>AI가 찾은 지시 조건</h2>
              <span className="muted small">체크한 조건을 작업자 답변에서 확인해요</span>
            </div>
            <label className="field">공지 제목
              <input value={draft.title} onChange={e => updateDraft({ title: e.target.value })} />
            </label>
            <ul className="conditions">
              {draft.conditions.map(c => (
                <li key={c.id} className={"condition kind-" + c.kind + (focus === c.id ? " active" : "") + (c.check ? " checked" : "")}
                  onMouseEnter={() => setFocus(c.id)} onMouseLeave={() => setFocus("")}>
                  <div className="condition-top">
                    <span className="cid">{c.id.slice(1)}</span>
                    <select aria-label="조건 종류" value={c.kind} onChange={e => updateCondition(c.id, { kind: e.target.value as ConditionKind })}>
                      {Object.entries(CONDITION_KINDS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                    </select>
                    <label className="check-toggle">
                      <input type="checkbox" checked={c.check} onChange={e => updateCondition(c.id, { check: e.target.checked })} />
                      답변에서 확인
                    </label>
                    <button type="button" className="text-button danger" aria-label={`조건 ${c.id.slice(1)} 삭제`}
                      disabled={draft.conditions.length === 1}
                      onClick={() => updateDraft({ conditions: draft.conditions.filter(x => x.id !== c.id) })}>삭제</button>
                  </div>
                  <input className="condition-label" aria-label="조건 문장" value={c.label} placeholder="조건을 한 문장으로"
                    onChange={e => updateCondition(c.id, { label: e.target.value })} />
                  <p className="evidence">{c.evidence ? <>근거 <q>{c.evidence}</q></> : <em>관리자가 직접 추가한 조건</em>}</p>
                </li>
              ))}
            </ul>
            <button type="button" className="text-button" onClick={addCondition}>+ 조건 직접 추가</button>

            <div className="question-card">
              <label className="field">작업자에게 물을 상황 질문
                <textarea rows={2} value={draft.question} onChange={e => updateDraft({ question: e.target.value })} />
              </label>
              {draft.questionReason && <p className="reason"><strong>AI가 이 질문을 만든 이유</strong> {draft.questionReason}</p>}
            </div>

            {!preview && (
              <div className="actions">
                <button className="primary" disabled={Boolean(busy) || !canPreview} onClick={makePreview}>
                  {busy === "preview" ? "번역하고 역번역으로 검증하는 중…" : `작업자 화면 미리보기 (${WORKER_LANGS.map(l => l.toUpperCase()).join("·")} 번역 + 검증)`}
                </button>
              </div>
            )}
          </section>
        )}
      </div>

      {/* ---------- worker preview & translation check ---------- */}
      {preview && translation && draft && (
        <section className="panel preview-panel">
          <div className="panel-heading">
            <h2>작업자 화면 검수</h2>
            <div className="tabs" role="tablist" aria-label="미리보기 언어">
              {WORKER_LANGS.map(lang => {
                const bad = preview.translations[lang].checks.some(c => !c.preserved);
                return (
                  <button key={lang} role="tab" type="button" aria-selected={previewLang === lang}
                    className={"tab" + (previewLang === lang ? " selected" : "")}
                    onClick={() => { speaker.stop(); setPreviewLang(lang); }}>
                    {LANGUAGES[lang].native}{bad && <span className="tab-warn" aria-label="검증 경고">!</span>}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="preview-grid">
            <div className="phone" aria-label="작업자 휴대폰 화면 미리보기">
              <div className="phone-notch" aria-hidden="true" />
              <div className="phone-screen">
                <NoticeView t={WORKER_TEXT[previewLang]} speaker={speaker}
                  notice={{ ...translation, lang: previewLang, addenda: [], conditions: translation.conditions.map(c => ({ ...c, kind: kinds.get(c.id) })) }} />
              </div>
            </div>
            <div className="verify">
              <h3>번역 의미 검증 <span className="muted small">번역 → 독립 역번역 → 조건별 비교</span></h3>
              <table className="verify-table">
                <thead><tr><th>승인한 조건</th><th>{LANGUAGES[previewLang].native}</th><th>결과</th></tr></thead>
                <tbody>
                  {draft.conditions.map(c => {
                    const check = translation.checks.find(x => x.id === c.id);
                    const text = translation.conditions.find(x => x.id === c.id)?.text;
                    return (
                      <tr key={c.id} className={check?.preserved ? "ok" : "warn"}>
                        <td><span className="cid">{c.id.slice(1)}</span>{c.label}</td>
                        <td lang={previewLang}>{text}</td>
                        <td>{check?.preserved ? <span className="pill ok">의미 보존</span>
                          : <><span className="pill warn">확인 필요</span><p className="note">{check?.note}</p></>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <details className="back-translation">
                <summary>역번역 전문 보기</summary>
                <p>{translation.backTranslation}</p>
              </details>

              <div className="publish-box">
                {mismatch.length > 0 && (
                  <label className="accept">
                    <input type="checkbox" checked={acceptMismatch} onChange={e => setAcceptMismatch(e.target.checked)} />
                    번역 검증 경고 {mismatch.length}건을 확인했고, 이대로 발행합니다.
                  </label>
                )}
                <button className="primary big" disabled={Boolean(busy) || (mismatch.length > 0 && !acceptMismatch)} onClick={publish}>
                  {busy === "publish" ? "발행 중…" : "승인하고 발행 · QR 만들기"}
                </button>
                <p className="muted small">발행 시에는 AI를 다시 호출하지 않아요. 지금 검수한 문장이 그대로 작업자에게 전달돼요.</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {recent.length > 0 && (
        <section className="recent">
          <h2>발행한 공지</h2>
          <ul>
            {recent.map(n => (
              <li key={n.id}><a href={"/notices/" + n.id}>{n.title}</a><span className="muted small">v{n.version} · {n.createdAt}</span></li>
            ))}
          </ul>
        </section>
      )}

      {error && <p role="alert" className="alert floating-error">{error}<button className="text-button" onClick={() => setError("")}>닫기</button></p>}
    </main>
  );
}

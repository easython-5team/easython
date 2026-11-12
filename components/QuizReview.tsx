"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Shell from "./Shell";
import { post } from "./request";
import type { FormEvent } from "react";
import type { Workflow } from "../lib/types.ts";

export default function QuizReview({ workflow }: { workflow: Workflow }) {
  const router = useRouter();
  const [draft, setDraft] = useState(workflow.draft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reviewed, setReviewed] = useState(false);

  async function next(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await post("/api/preview", { id: workflow.id, revision: workflow.revision, draft, reviewed }, "영어 미리보기를 생성하지 못했습니다.");
      router.push(`/admin/preview/${encodeURIComponent(workflow.id)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "영어 미리보기를 생성하지 못했습니다.");
      setBusy(false);
    }
  }

  return <Shell><main className="container admin">
    <div className="page-heading"><h1>이해 확인 퀴즈 검수</h1><p>작업자가 실제 상황에서 취할 행동을 묻는 질문인지 확인합니다.</p></div>
    <nav className="steps" aria-label="발행 단계"><Link href={`/admin/edit/${encodeURIComponent(workflow.id)}`}>1. 공지 작성</Link><strong>2. 퀴즈 검수</strong><span>3. 작업자 미리보기·발행</span></nav>
    <div className="review-grid">
      <section className="panel"><h2>공지 원문</h2><p className="source-text">{workflow.source}</p></section>
      <form className="panel" onSubmit={next} aria-busy={busy}>
        <h2>적용형 퀴즈</h2>
        <p className="review-hint">한 가지 상황에서 바뀐 행동을 설명하게 합니다. 시간만 암기하거나 예·아니요로 답하는 질문은 피하고, 출입구와 하역 장소처럼 필요한 행동을 판단 기준에 함께 적습니다.</p>
        <label className="field">상황 질문<textarea rows={3} maxLength={2000} value={draft.question} disabled={busy || Boolean(workflow.publicId)} onChange={e => { setDraft({ ...draft, question: e.target.value }); setReviewed(false); }} /></label>
        <label className="field">답변에서 확인할 행동<textarea rows={3} maxLength={2000} value={draft.rubric} disabled={busy || Boolean(workflow.publicId)} onChange={e => { setDraft({ ...draft, rubric: e.target.value }); setReviewed(false); }} /></label>
        <div className="rubric"><h3>원문 근거</h3>{draft.evidence?.length ? [...new Set(draft.evidence)].map(quote => <blockquote key={quote}>{quote}</blockquote>) : <p>원문에서 판단 근거를 확인하세요.</p>}</div>
        {!workflow.publicId && <label className="check-field"><input type="checkbox" checked={reviewed} disabled={busy} onChange={e => setReviewed(e.target.checked)} />질문이 암기형이 아닌지, 판단 기준의 행동이 원문 근거와 일치하는지 확인했습니다.</label>}
        {error && <p role="alert" className="alert">{error}</p>}
        <div className="actions">{workflow.publicId
          ? <Link className="button" href={`/admin/preview/${encodeURIComponent(workflow.id)}`}>발행된 미리보기 보기</Link>
          : <button disabled={busy || !reviewed || !draft.question.trim() || !draft.rubric.trim()}>{busy ? "영어 미리보기 생성 중…" : "작업자 화면 미리보기"}</button>}</div>
      </form>
    </div>
  </main></Shell>;
}

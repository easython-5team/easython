"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Shell from "./Shell";
import Notice from "./Notice";
import { post } from "./request";
import type { Workflow, WorkerPreview } from "../lib/types.ts";

export default function PreviewReview({ workflow }: { workflow: Workflow }) {
  const [preview, setPreview] = useState<WorkerPreview>(workflow.preview!);
  const [publicId, setPublicId] = useState(workflow.publicId || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (publicId) setUrl(new URL(`/n/${encodeURIComponent(publicId)}`, window.location.origin).href);
  }, [publicId]);

  async function publish() {
    setBusy(true);
    setError("");
    try {
      const { id } = await post<{ id: string }>("/api/publish", { id: workflow.id, revision: workflow.revision, preview }, "공지를 발행하지 못했습니다.");
      setPublicId(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "공지를 발행하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopyStatus("링크를 복사했어요. 카카오톡 단체방에 붙여넣으세요.");
    } catch {
      setCopyStatus("자동 복사가 되지 않았어요. 링크를 직접 복사해 주세요.");
    }
  }

  return <Shell><main className="container admin">
    <div className="page-heading"><h1>작업자 화면 미리보기</h1><p>관리자가 확인한 공지와 질문이 작업자에게 그대로 표시됩니다.</p></div>
    <nav className="steps" aria-label="발행 단계"><Link href={`/admin/edit/${encodeURIComponent(workflow.id)}`}>1. 공지 작성</Link><Link href={`/admin/quiz/${encodeURIComponent(workflow.id)}`}>2. 퀴즈 검수</Link><strong>3. 작업자 미리보기·발행</strong></nav>
    <div className="review-grid">
      <section className="panel"><h2>검수 기준</h2><p className="source-text">{workflow.source}</p><div className="rubric"><h3>답변에서 확인할 행동</h3><p>{workflow.draft.rubric}</p></div></section>
      <section className="panel"><h2>작업자에게 보이는 화면</h2>
        <p className="review-hint">시간·장소·부정 표현과 질문을 대조하세요. 영어 표현을 수정하면 수정한 문구가 발행됩니다.</p>
        {!publicId && <><label className="field">영어 공지<textarea rows={7} value={preview.summary} disabled={busy} onChange={e => setPreview({ ...preview, summary: e.target.value })} /></label>
          <label className="field">영어 상황 질문<textarea rows={2} value={preview.question} disabled={busy} onChange={e => setPreview({ ...preview, question: e.target.value })} /></label></>}
        <div className="worker-preview" lang="en"><Notice notice={preview} /><label className="field">Your response<textarea rows={2} disabled placeholder="Describe your next action or ask a question…" /></label><div className="actions"><button disabled>Send response</button></div></div>
        {error && <p role="alert" className="alert">{error}</p>}
        {!publicId && <div className="actions"><button disabled={busy || !preview.summary.trim() || !preview.question.trim()} onClick={publish}>{busy ? "발행 중…" : "검수 완료 · 공지 발행"}</button></div>}
        {publicId && <div className="published"><h2>공지를 발행했어요</h2><p className="review-hint">위 미리보기는 발행 후에도 남아 있으며, 발행된 문구는 수정되지 않습니다.</p>
          <label className="field">작업자용 링크<input readOnly value={url} onFocus={e => e.target.select()} /></label>
          <div className="actions"><button onClick={copy}>공지 링크 복사</button>{url && <a className="button secondary" href={url} target="_blank" rel="noreferrer">작업자 화면 열기</a>}<Link className="button secondary" href="/">새 공지 작성</Link></div>
          <span role="status">{copyStatus}</span></div>}
      </section>
    </div>
  </main></Shell>;
}

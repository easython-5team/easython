"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Shell from "./Shell";
import { post } from "./request";
import type { FormEvent } from "react";
import type { Workflow } from "../lib/types.ts";

const example = "강풍이 예상되어 오늘 오후 2시부터 옥상 작업을 모두 중단합니다. 공구와 남은 자재는 옥상에 두고 내려오세요.";

export default function AdminWorkspace({ demoSource = "", workflow = null }: { demoSource?: string; workflow?: Workflow | null }) {
  const router = useRouter();
  const [source, setSource] = useState(workflow?.source || demoSource);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!source.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      // A new server-side workflow ID isolates this notice from earlier drafts.
      const { id } = workflow
        ? await post<{ id: string }>("/api/revise-source", { id: workflow.id, revision: workflow.revision, source }, "공지를 다시 생성하지 못했습니다.")
        : await post<{ id: string }>("/api/draft", { source }, "퀴즈를 생성하지 못했습니다. 연결을 확인해 주세요.");
      router.push(`/admin/quiz/${encodeURIComponent(id)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "퀴즈를 생성하지 못했습니다.");
      setBusy(false);
    }
  }

  return <Shell><main className="container admin">
    <div className="page-heading"><h1>{workflow ? "공지 원문 수정" : "새 작업 변경 공지"}</h1><p>공지 원문을 작성한 뒤, 상황 퀴즈와 작업자 화면을 차례로 검수합니다.</p></div>
    <nav className="steps" aria-label="발행 단계"><strong>1. 공지 작성</strong><span>2. 퀴즈 검수</span><span>3. 작업자 미리보기·발행</span></nav>
    <form className="panel editor-panel" onSubmit={generate} aria-busy={busy}>
      <div className="panel-heading"><h2><label htmlFor="source">한국어 공지 원문</label></h2>
        <button type="button" className="text-button" disabled={busy || Boolean(workflow?.publicId)} onClick={() => setSource(demoSource || example)}>예시 불러오기</button></div>
      {demoSource && <p className="review-hint">로컬 데모 · 자재 반입 예시로 검수와 작업자 응답을 테스트합니다.</p>}
      <textarea id="source" rows={10} value={source} disabled={busy || Boolean(workflow?.publicId)} onChange={e => setSource(e.target.value)} placeholder="언제부터 어떤 작업이 어떻게 달라지는지 입력하세요." />
      {error && <p role="alert" className="alert">{error}</p>}
      <div className="actions">{workflow?.publicId
        ? <Link className="button" href={`/admin/preview/${encodeURIComponent(workflow.id)}`}>발행된 미리보기 보기</Link>
        : <button disabled={busy || !source.trim()}>{busy ? "퀴즈 생성 중…" : workflow ? "원문 수정하고 퀴즈 다시 생성" : "퀴즈 생성하고 검수하기"}</button>}</div>
    </form>
  </main></Shell>;
}

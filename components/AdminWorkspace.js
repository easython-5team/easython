"use client";

import { useState } from "react";
import Shell from "./Shell";

import { post } from "./request";

const example = "강풍이 예상되어 오늘 오후 2시부터 옥상 작업을 모두 중단합니다. 공구와 남은 자재는 옥상에 두고 내려오세요.";
const networkError = "요청을 완료하지 못했어요. 연결을 확인한 뒤 다시 시도하세요.";

export default function AdminWorkspace({ demoSource = "" }) {
  const [source, setSource] = useState(demoSource);
  const [draft, setDraft] = useState(null);
  const [publicationKey, setPublicationKey] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [copyStatus, setCopyStatus] = useState("");

  const [editingQuiz, setEditingQuiz] = useState(false);

  function clearPublication() {
    setPublicationKey(crypto.randomUUID());
    setUrl("");
    setCopyStatus("");
    setError("");
  }
  function updateSource(value) {
    setSource(value);
    setDraft(null);
    clearPublication();
  }
  function updateDraft(changes) {
    setDraft({ ...draft, ...changes });
    clearPublication();
  }

  async function run(step, action) {
    setBusy(step);
    setError("");
    try {
      await action();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }
  function generate() {
    return run("draft", async () => {
      const result = await post("/api/draft", { source }, networkError);
      clearPublication();
      setEditingQuiz(false);
      setDraft(result.draft);
    });
  }
  function publish() {
    return run("publish", async () => {
      const { id } = await post("/api/publish", { source, draft, publicationKey }, networkError);
      setEditingQuiz(false);
      setUrl(new URL("/n/" + encodeURIComponent(id), window.location.origin).href);
    });
  }
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopyStatus("공지 링크를 복사했어요. 카카오톡 단체방에 붙여넣으세요.");
    } catch {
      setCopyStatus("자동 복사가 되지 않았어요. 위 링크를 직접 복사해 카카오톡 단체방에 붙여넣으세요.");
    }
  }
  const canPublish = draft?.question.trim() && draft.rubric.trim();

  return (
    <Shell>
      <main className="container admin">
        <div className="page-heading">
          <h1>작업 변경 공지</h1>
          {demoSource && <p>로컬 데모 · 자재 반입 예시로 퀴즈와 작업자 응답을 테스트합니다.</p>}
        </div>
        <div className="admin-form" aria-busy={Boolean(busy)}>
          <div className="column">
            <section className="panel">
              <div className="panel-heading">
                <h2><label htmlFor="source">한국어 공지 원문</label></h2>
                <button type="button" className="text-button" disabled={Boolean(busy)} onClick={() => updateSource(demoSource || example)}>예시 불러오기</button>
              </div>
              <textarea id="source" rows={10} value={source} disabled={Boolean(busy)} onChange={e => updateSource(e.target.value)} placeholder="언제부터 어떤 작업이 어떻게 달라지는지 입력하세요." />
              <div className="actions"><button disabled={Boolean(busy) || !source.trim()} onClick={generate}>{busy === "draft" ? "퀴즈 생성 중…" : draft ? "퀴즈 다시 생성" : "퀴즈 생성"}</button></div>
            </section>
            {draft && <section className="panel">
              <fieldset disabled={Boolean(busy)}>
                <div className="panel-heading">
                  <h2 id="quiz-title">이해 확인 퀴즈</h2>
                  <button type="button" className="text-button" aria-expanded={editingQuiz} onClick={() => setEditingQuiz(!editingQuiz)}>{editingQuiz ? "수정 완료" : "수정"}</button>
                </div>
                {editingQuiz
                  ? <textarea autoFocus aria-labelledby="quiz-title" rows={2} value={draft.question} onChange={e => updateDraft({question: e.target.value})} />
                  : <p>{draft.question}</p>}
                <div className="rubric">
                  <div className="panel-heading">
                    <h3 id="rubric-title">답변에서 확인할 내용</h3>
                  </div>
                  {editingQuiz
                    ? <textarea aria-labelledby="rubric-title" rows={2} maxLength={2000} value={draft.rubric} onChange={e => updateDraft({rubric: e.target.value})} />
                    : <p>{draft.rubric}</p>}
                  <details><summary>원문 근거 보기</summary>
                    {draft.evidence.length ? [...new Set(draft.evidence)].map(quote => <blockquote key={quote}>{quote}</blockquote>) : <p>원문을 확인해 주세요.</p>}
                  </details>
                </div>
              </fieldset>
              {!url && <div className="actions"><button disabled={Boolean(busy) || !canPublish} onClick={publish}>{busy === "publish" ? "발행 중…" : "공지 발행"}</button></div>}
            </section>}
            {url && <section className="panel published">
              <h2>공지를 발행했어요</h2>
              <label className="field">작업자용 링크<input readOnly value={url} onFocus={e => e.target.select()} /></label>
              <div className="actions"><button onClick={copyLink}>공지 링크 복사</button></div>
              <span role="status">{copyStatus}</span>
            </section>}
          </div>
        </div>
        {error && <p role="alert" className="alert floating-error">{error}<button className="text-button" onClick={() => setError("")}>닫기</button></p>}
      </main>
    </Shell>
  );
}

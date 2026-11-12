"use client";

import QRCode from "qrcode";
import { Fragment, useEffect, useState, type FormEvent } from "react";
import { CONDITION_KINDS, isLang, LANGUAGES } from "../lib/languages.ts";
import type { CheckStatus, Condition, DashboardEscalation, DashboardView, DashboardWorker, TurnState, WorkerStatus } from "../lib/types.ts";
import { post } from "./request";

const STATUS: Record<WorkerStatus, { label: string; tone: string }> = {
  understood: { label: "이해 확인", tone: "ok" },
  recheck: { label: "재확인 필요", tone: "bad" },
  inProgress: { label: "답변 중", tone: "mid" },
  notAnswered: { label: "응답 전", tone: "idle" },
};
const TURN_STATE: Record<TurnState, string> = {
  understood: "이해 확인", followup: "되묻기", guidance: "재설명 · 재확인 필요", answered: "공지로 답변", manager: "관리자 확인 요청",
};
const CHECK: Record<CheckStatus, string> = { met: "충족", missing: "누락", conflict: "충돌" };
const ICON: Record<CheckStatus, string> = { met: "✓", missing: "?", conflict: "✕" };

function languageName(lang: string): string {
  return isLang(lang) ? LANGUAGES[lang].native : lang;
}

function isLocal(url: string): boolean {
  try {
    return ["localhost", "127.0.0.1", "0.0.0.0", "[::1]"].includes(new URL(url).hostname);
  } catch {
    return true;
  }
}

function QrPanel({ id, baseUrl }: { id: string; baseUrl: string }) {
  const [url, setUrl] = useState("");
  const [svg, setSvg] = useState("");
  const [copied, setCopied] = useState("");
  const [poster, setPoster] = useState(false);

  useEffect(() => {
    const link = new URL("/n/" + encodeURIComponent(id), baseUrl || window.location.origin).href;
    setUrl(link);
    QRCode.toString(link, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#14302a", light: "#ffffff" } })
      .then(setSvg).catch(() => setSvg(""));
  }, [id, baseUrl]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied("링크를 복사했어요. 단체톡방에 붙여넣으세요.");
    } catch {
      setCopied("자동 복사가 되지 않았어요. 링크를 직접 복사해 주세요.");
    }
  }

  return (
    <section className="panel qr-panel">
      <div className="qr" aria-label="작업자 접속 QR 코드" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="qr-side">
        <h2>현장 QR · 공유 링크</h2>
        <p className="muted">작업자가 휴대폰 카메라로 스캔하면 언어 선택 화면이 열려요. 로그인은 필요 없어요.</p>
        <input readOnly value={url} aria-label="작업자 링크" onFocus={e => e.target.select()} />
        <div className="actions">
          <button className="primary" onClick={copy}>링크 복사</button>
          <button className="secondary" onClick={() => setPoster(true)}>현장 게시용 크게 보기</button>
          <a className="button secondary" href={url} target="_blank" rel="noreferrer">작업자 화면 열기</a>
        </div>
        <span role="status" className="muted small">{copied}</span>
        {url && isLocal(url) && (
          <p className="alert small">
            지금 주소({new URL(url).host})는 이 컴퓨터에서만 열려요. 휴대폰으로 스캔하려면 HTTPS 터널 주소를
            <code>PUBLIC_BASE_URL</code>에 넣고 서버를 다시 시작하세요. 음성 인식도 HTTPS에서만 동작해요.
          </p>
        )}
      </div>
      {poster && (
        <div className="poster" role="dialog" aria-modal="true" aria-label="현장 게시용 QR" onClick={() => setPoster(false)}>
          <div className="poster-card" onClick={e => e.stopPropagation()}>
            <p className="poster-lang">Scan to read today's work change · Quét để đọc thay đổi công việc hôm nay</p>
            <div className="qr big" dangerouslySetInnerHTML={{ __html: svg }} />
            <p className="poster-ko">작업 변경 공지 · 스캔하고 모국어로 확인하세요</p>
            <div className="actions"><button onClick={() => window.print()}>인쇄</button><button className="secondary" onClick={() => setPoster(false)}>닫기</button></div>
          </div>
        </div>
      )}
    </section>
  );
}

function Escalation({ item, id, onResolved, demoAnswer }: {
  item: DashboardEscalation; id: string; onResolved: () => void; demoAnswer: string | null;
}) {
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function resolve(event: FormEvent) {
    event.preventDefault();
    if (!answer.trim()) return;
    setBusy(true);
    setError("");
    try {
      await post("resolve", { id, escalationId: item.id, answer: answer.trim() }, "답변을 전달하지 못했어요. 다시 시도해 주세요.");
      onResolved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "답변을 전달하지 못했어요.");
    }
    setBusy(false);
  }
  return (
    <li className={"escalation" + (item.resolvedAt ? " resolved" : "")}>
      <div className="esc-meta"><strong>{item.name}</strong><span className="lang-tag">{languageName(item.lang)}</span><span className="muted small">{item.createdAt}</span></div>
      <p className="esc-ko">“{item.questionKo}”</p>
      <p className="esc-orig muted small" lang={item.lang}>원문: {item.question}</p>
      {item.resolvedAt ? (
        <p className="esc-answer"><strong>답변 완료</strong> {item.answerKo}</p>
      ) : (
        <form onSubmit={resolve}>
          <p className="muted small">공지에 근거가 없어 AI가 답하지 않고 넘긴 질문이에요. 한국어로 답하면 작업자 언어로 번역해 전달하고 공지에도 반영해요.</p>
          <textarea rows={2} value={answer} disabled={busy} placeholder="확정 답변을 한국어로 입력하세요" onChange={e => setAnswer(e.target.value)} />
          {demoAnswer && !answer && <button type="button" className="text-button" onClick={() => setAnswer(demoAnswer)}>데모 답변 넣기</button>}
          {error && <p role="alert" className="alert">{error}</p>}
          <div className="actions"><button className="primary" disabled={busy || !answer.trim()}>{busy ? "번역해서 전달하는 중…" : "답변 확정 · 작업자에게 전달"}</button></div>
        </form>
      )}
    </li>
  );
}

function WorkerRow({ worker, conditions, open, toggle }: {
  worker: DashboardWorker; conditions: Condition[]; open: boolean; toggle: () => void;
}) {
  const last = worker.turns.at(-1);
  const assessment = [...worker.turns].reverse().find(t => t.assessment.length)?.assessment ?? [];
  const status = STATUS[worker.status];
  return (
    <>
      <tr className={open ? "open" : ""}>
        <td><button type="button" className="row-toggle" aria-expanded={open} onClick={toggle}>{worker.name}</button></td>
        <td><span className="lang-tag">{languageName(worker.lang)}</span></td>
        <td>
          <span className={"status " + status.tone}>{status.label}</span>
          {worker.waiting && <span className="status wait">관리자 답변 대기</span>}
        </td>
        <td>
          <div className="chips">
            {conditions.filter(c => c.check).map(c => {
              const item = assessment.find(a => a.id === c.id);
              const s: CheckStatus = item?.status ?? "missing";
              return <span key={c.id} className={"chip " + s} title={c.label + " · " + CHECK[s]}>{ICON[s]} {c.id.slice(1)}</span>;
            })}
          </div>
        </td>
        <td className="last-answer">{last ? <>{last.inputKo}{last.mode === "voice" && <span className="voice-tag">음성</span>}</> : <span className="muted">-</span>}</td>
      </tr>
      {open && (
        <tr className="detail-row">
          <td colSpan={5}>
            <ol className="timeline">
              {worker.turns.map(turn => (
                <li key={turn.turn}>
                  <div className="tl-head"><span className="tl-state">{TURN_STATE[turn.state]}</span><span className="muted small">v{turn.version} · {turn.mode === "voice" ? "음성" : "텍스트"}</span></div>
                  <p lang={worker.lang}>{turn.answer}</p>
                  <p className="muted">→ {turn.inputKo}</p>
                  {turn.state !== "answered" && turn.state !== "manager" && (
                    <ul className="evidence-list">
                      {turn.assessment.map(a => (
                        <li key={a.id} className={a.status}>
                          <span className={"chip " + a.status}>{ICON[a.status]} {a.id.slice(1)}</span>
                          {conditions.find(c => c.id === a.id)?.label}
                          {a.quote && <q lang={worker.lang}>{a.quote}</q>}
                          {a.rejected && <em className="rejected">AI가 ‘{CHECK[a.rejected]}’으로 판정했지만 작업자 발화에서 인용 근거를 찾지 못해 누락으로 처리</em>}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
              {!worker.turns.length && <li className="muted">아직 답변하지 않았어요.</li>}
            </ol>
          </td>
        </tr>
      )}
    </>
  );
}

export default function Dashboard({ id, baseUrl, demoAnswer }: { id: string; baseUrl: string; demoAnswer: string | null }) {
  const [data, setData] = useState<DashboardView | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState("");

  async function refresh() {
    try {
      setData(await post("dashboard", { id }, "현황을 불러오지 못했어요."));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "현황을 불러오지 못했어요.");
    }
  }

  // Poll so new answers and escalations appear without a reload.
  useEffect(() => {
    let cancelled = false;
    const load = () => post("dashboard", { id }, "현황을 불러오지 못했어요.")
      .then(result => { if (!cancelled) { setData(result); setError(""); } })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : "현황을 불러오지 못했어요."); });
    load();
    const timer = setInterval(load, 3000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [id]);

  if (!data) return <main className="admin"><p className="muted">{error || "불러오는 중…"}</p></main>;
  const { notice, stats, workers, escalations } = data;
  const pending = escalations.filter(e => !e.resolvedAt);
  const done = escalations.filter(e => e.resolvedAt);

  return (
    <main className="admin dashboard">
      <div className="dash-title">
        <div>
          <p className="muted small">발행된 공지 · v{notice.version}</p>
          <h1>{notice.draft.title}</h1>
        </div>
        <a className="button secondary" href="/">새 공지 작성</a>
      </div>

      <QrPanel id={id} baseUrl={baseUrl} />

      <section className="stats" aria-label="이해 확인 현황">
        <div className="stat"><span className="stat-num">{stats.joined}</span><span>접속</span></div>
        <div className="stat ok"><span className="stat-num">{stats.understood}</span><span>이해 확인</span></div>
        <div className="stat bad"><span className="stat-num">{stats.recheck}</span><span>재확인 필요</span></div>
        <div className="stat mid"><span className="stat-num">{stats.inProgress}</span><span>답변 중</span></div>
        <div className="stat wait"><span className="stat-num">{stats.waiting}</span><span>관리자 답변 대기</span></div>
      </section>

      <div className="dash-grid">
        <section className="panel">
          <div className="panel-heading"><h2>관리자 확인 요청</h2>{pending.length > 0 && <span className="count">{pending.length}</span>}</div>
          {escalations.length === 0 ? <p className="muted">공지로 답할 수 없는 질문이 들어오면 여기에 표시돼요.</p> : (
            <ul className="escalations">
              {[...pending, ...done].map(item => <Escalation key={item.id} item={item} id={id} onResolved={refresh} demoAnswer={demoAnswer} />)}
            </ul>
          )}
        </section>

        <section className="panel">
          <div className="panel-heading"><h2>작업자별 이해 현황</h2><span className="muted small">이름을 누르면 판정 근거를 볼 수 있어요</span></div>
          {workers.length === 0 ? <p className="muted">아직 접속한 작업자가 없어요. QR을 공유해 주세요.</p> : (
            <div className="table-wrap">
              <table className="workers">
                <thead><tr><th>작업자</th><th>언어</th><th>상태</th><th>확인 조건</th><th>최근 답변 (한국어)</th></tr></thead>
                <tbody>
                  {workers.map(w => (
                    <Fragment key={w.id}>
                      <WorkerRow worker={w} conditions={notice.draft.conditions} open={open === w.id} toggle={() => setOpen(open === w.id ? "" : w.id)} />
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <section className="panel notice-detail">
        <h2>공지 내용과 반영 이력</h2>
        <ul className="conditions compact">
          {notice.draft.conditions.map(c => (
            <li key={c.id} className={"condition kind-" + c.kind + (c.check ? " checked" : "")}>
              <span className="cid">{c.id.slice(1)}</span><span className="kind-tag">{CONDITION_KINDS[c.kind]}</span>{c.label}
              {c.check && <span className="pill ok">답변 확인</span>}
            </li>
          ))}
        </ul>
        <p className="muted small">상황 질문: {notice.draft.question}</p>
        {notice.addenda.length > 0 && (
          <ol className="addenda-log">
            {notice.addenda.map(a => <li key={a.id}><strong>v{a.version}</strong> Q. {a.questionKo} → A. {a.answerKo}</li>)}
          </ol>
        )}
      </section>
      {error && <p role="alert" className="alert floating-error">{error}</p>}
    </main>
  );
}

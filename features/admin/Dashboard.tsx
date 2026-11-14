"use client";

import QRCode from "qrcode";
import { useEffect, useState, type FormEvent } from "react";
import { isLang, LANGUAGES } from "../../shared/languages.ts";
import type { CheckStatus, DashboardEscalation, DashboardView, DashboardWorker, Notice, TurnState, WorkerStatus } from "../../shared/types.ts";
import FloatingError from "../../ui/FloatingError";
import Loading from "../../ui/Loading";
import { post } from "../../ui/request";
import { formatTime } from "../../shared/time.ts";
import { CHECK_BG, TONE_BG, type Tone } from "../../ui/tone.ts";

const STATUS: Record<WorkerStatus, { label: string; tone: Tone }> = {
  understood: { label: "확인 완료", tone: "ok" },
  recheck: { label: "재교육 필요", tone: "bad" },
  inProgress: { label: "응답 중", tone: "idle" },
  notAnswered: { label: "미응답", tone: "idle" },
};
const TURN_STATE: Record<TurnState, string> = {
  understood: "이해함", followup: "추가 질문함", guidance: "재설명함", answered: "공지로 답변", manager: "관리자에게 질문",
};
const CHECK: Record<CheckStatus, string> = { met: "이해", missing: "누락", conflict: "잘못 이해" };

function languageName(lang: string): string {
  return isLang(lang) ? LANGUAGES[lang].native : lang;
}

function useWorkerLink(id: string, baseUrl: string) {
  const [url, setUrl] = useState("");
  const [svg, setSvg] = useState("");
  useEffect(() => {
    const link = new URL("/n/" + encodeURIComponent(id), baseUrl || window.location.origin).href;
    setUrl(link);
    QRCode.toString(link, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#18181b", light: "#ffffff" } })
      .then(setSvg).catch(() => setSvg(""));
  }, [id, baseUrl]);
  return { url, svg };
}

function QrCard({ url, svg }: { url: string; svg: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <section className="card grid justify-items-center gap-4 text-center">
      <div className="aspect-square w-[200px] max-w-full [&_svg]:block [&_svg]:size-full" aria-label="작업자 접속 QR 코드" dangerouslySetInnerHTML={{ __html: svg }} />
      <p className="text-sm text-ink-2">작업자 휴대폰 카메라로 스캔</p>
      <button type="button" className="btn-secondary" onClick={copy} aria-live="polite">{copied ? "복사됨" : "링크 복사"}</button>
    </section>
  );
}

function AnswerForm({ item, id }: { item: DashboardEscalation; id: string }) {
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!answer.trim() || busy || sent) return;
    setBusy(true);
    setError("");
    try {
      await post("resolve", { id, escalationId: item.id, answer: answer.trim() }, "답변을 보내지 못했습니다.");
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "답변을 보내지 못했습니다.");
    }
    setBusy(false);
  }
  return (
    <div className="grid gap-2 rounded-[10px] bg-violet-bg p-3">
      <p className="text-[13px] font-semibold text-violet-fg">질문</p>
      <p className="font-semibold">“{item.questionKo}”</p>
      {sent ? <p className="text-sm text-ink-2">답변을 보냈습니다.</p> : (
        <form className="grid gap-2" onSubmit={submit}>
          <textarea rows={2} value={answer} disabled={busy} placeholder="답변 (작업자 언어로 번역되어 전달됩니다)" onChange={e => setAnswer(e.target.value)} />
          {error && <p role="alert" className="text-sm text-bad-fg">{error}</p>}
          <button className="btn-primary justify-self-end" aria-busy={busy} disabled={busy || !answer.trim()}>
            {busy ? <><Loading size={20} tone="light" />보내는 중</> : "답변 보내기"}
          </button>
        </form>
      )}
    </div>
  );
}

function WorkerRow({ worker, notice, pending, id, open, toggle }: {
  worker: DashboardWorker; notice: Notice; pending: DashboardEscalation[]; id: string; open: boolean; toggle: () => void;
}) {
  const status = STATUS[worker.status];
  const questionNo = (qid: string) => notice.draft.questions.findIndex(q => q.id === qid) + 1;
  const label = (cid: string) => notice.draft.conditions.find(c => c.id === cid)?.label ?? "";
  return (
    <li>
      <button type="button" aria-expanded={open} onClick={toggle}
        className="flex w-full cursor-pointer items-center gap-3 px-5 py-3.5 text-left hover:bg-canvas">
        <span className="min-w-0 flex-1 truncate font-semibold">{worker.name}
          <span className="ml-2 text-[13px] font-normal text-ink-3">{languageName(worker.lang)}</span></span>
        {pending.length > 0 && <span className={"tag " + TONE_BG.wait}>질문 {pending.length}건</span>}
        <span className={"tag " + TONE_BG[status.tone]}>{status.label}</span>
        <span aria-hidden="true" className="text-ink-3">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="grid gap-3 px-5 pb-5">
          {pending.map(item => <AnswerForm key={item.id} item={item} id={id} />)}
          {worker.turns.length === 0 && <p className="text-sm text-ink-3">아직 응답이 없습니다.</p>}
          {worker.turns.map(turn => (
            <div key={turn.turn} className="grid gap-1.5 border-l-2 border-grid pl-3 text-sm">
              <p className="text-[13px] text-ink-3">Q{questionNo(turn.questionId)} · {TURN_STATE[turn.state]}{turn.mode === "voice" && " · 음성"}</p>
              <p>{turn.inputKo}</p>
              {turn.state !== "answered" && turn.state !== "manager" && turn.assessment.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {turn.assessment.map(a => (
                    <span key={a.id} className={"tag " + CHECK_BG[a.status]} title={a.quote}>{CHECK[a.status]} · {label(a.id)}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </li>
  );
}

export default function Dashboard({ id, baseUrl }: { id: string; baseUrl: string }) {
  const [data, setData] = useState<DashboardView | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState("");
  const [showQr, setShowQr] = useState(false);
  const link = useWorkerLink(id, baseUrl);

  // Poll so new answers and questions appear without a reload.
  useEffect(() => {
    let cancelled = false;
    const load = () => post("dashboard", { id }, "현황을 불러오지 못했습니다.")
      .then(result => { if (!cancelled) { setData(result); setError(""); } })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : "현황을 불러오지 못했습니다."); });
    load();
    const timer = setInterval(load, 3000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [id]);

  if (!data) {
    return (
      <main className="mx-auto grid min-h-[50vh] max-w-[640px] place-items-center px-4" aria-busy={!error}>
        {error ? <p className="text-ink-2">{error}</p> : <Loading size={48} />}
      </main>
    );
  }
  const { notice, stats, workers, escalations } = data;
  const pendingFor = (sessionId: string) => escalations.filter(e => e.sessionId === sessionId && !e.resolvedAt);
  const empty = workers.length === 0;
  const tiles = [
    { label: "확인 완료", value: stats.understood, tone: "" },
    { label: "재교육 필요", value: stats.recheck, tone: stats.recheck > 0 ? "text-bad-fg" : "" },
    { label: "미응답", value: stats.inProgress, tone: "" },
  ];

  return (
    <main className="mx-auto grid w-full max-w-[640px] gap-6 px-4 pt-5 pb-20 sm:px-6">
      <a href="/" className="-ml-2 -mb-3 flex h-9 items-center gap-1 justify-self-start rounded-lg px-2 text-[15px] font-semibold text-ink-2 no-underline hover:bg-paper hover:text-ink">
        <span aria-hidden="true" className="text-lg leading-none">←</span>공지 목록
      </a>
      <header className="flex items-start justify-between gap-4">
        <div className="grid min-w-0 gap-1">
          <h1 className="break-keep">{notice.draft.title}</h1>
          <p className="text-[13px] text-ink-3 tabular-nums">{formatTime(notice.createdAt)} 발송 · 접속 {stats.joined}명</p>
        </div>
        {!empty && (
          <button type="button" className="btn-secondary shrink-0" aria-expanded={showQr} onClick={() => setShowQr(!showQr)}>
            {showQr ? "QR 닫기" : "QR 코드"}
          </button>
        )}
      </header>

      {(empty || showQr) && <QrCard url={link.url} svg={link.svg} />}

      <section className="grid grid-cols-3 gap-3" aria-label="응답 현황">
        {tiles.map(t => (
          <div key={t.label} className="grid gap-1 rounded-card border border-grid bg-paper px-4 py-3">
            <span className="text-[13px] text-ink-2">{t.label}</span>
            <span className={"text-[26px] leading-none font-bold tabular-nums " + t.tone}>{t.value}</span>
          </div>
        ))}
      </section>

      <section className="grid gap-2">
        <h2>작업자</h2>
        {empty ? <p className="text-sm text-ink-3">아직 접속한 작업자가 없습니다.</p> : (
          <ul className="divide-y divide-grid overflow-hidden rounded-card border border-grid bg-paper">
            {workers.map(w => (
              <WorkerRow key={w.id} worker={w} notice={notice} pending={pendingFor(w.id)} id={id}
                open={open === w.id} toggle={() => setOpen(open === w.id ? "" : w.id)} />
            ))}
          </ul>
        )}
      </section>

      <details className="rounded-card border border-grid bg-paper px-5 py-4">
        <summary className="text-sm">보낸 내용</summary>
        <div className="mt-3 grid gap-4 text-sm">
          <div className="grid gap-1">
            <p className="text-[13px] text-ink-3">전달 사항</p>
            <ul className="grid list-disc gap-1 pl-5">{notice.draft.conditions.map(c => <li key={c.id}>{c.label}</li>)}</ul>
          </div>
          <div className="grid gap-1">
            <p className="text-[13px] text-ink-3">확인 퀴즈</p>
            <ol className="grid list-decimal gap-1 pl-5">{notice.draft.questions.map(q => <li key={q.id}>{q.text}</li>)}</ol>
          </div>
        </div>
      </details>
      {error && <FloatingError message={error} onClose={() => setError("")} />}
    </main>
  );
}

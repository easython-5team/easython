"use client";

import QRCode from "qrcode";
import { Fragment, useEffect, useState, type FormEvent } from "react";
import { CONDITION_KINDS, isLang, LANGUAGES } from "../../shared/languages.ts";
import type { CheckStatus, Condition, DashboardEscalation, DashboardView, DashboardWorker, TurnState, WorkerStatus } from "../../shared/types.ts";
import FloatingError from "../../ui/FloatingError";
import Loading from "../../ui/Loading";
import { post } from "../../ui/request";
import { CHECK_BG, CHECK_ICON, KIND_BG, TONE_BG, type Tone } from "../../ui/tone.ts";

const STATUS: Record<WorkerStatus, { label: string; tone: Tone }> = {
  understood: { label: "이해 확인", tone: "ok" },
  recheck: { label: "재확인 필요", tone: "bad" },
  inProgress: { label: "답변 중", tone: "mid" },
  notAnswered: { label: "응답 전", tone: "idle" },
};
const TURN_STATE: Record<TurnState, string> = {
  understood: "이해 확인", followup: "되묻기", guidance: "재설명 · 재확인 필요", answered: "공지로 답변", manager: "관리자 확인 요청",
};
const CHECK: Record<CheckStatus, string> = { met: "충족", missing: "누락", conflict: "충돌" };

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
    QRCode.toString(link, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#121212", light: "#ffffff" } })
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
    <section className="card grid items-center gap-6 sm:grid-cols-[210px_minmax(0,1fr)]">
      <div className="mx-auto aspect-square w-[210px] max-w-full rounded-bubble bg-white p-3 [&_svg]:block [&_svg]:size-full"
        aria-label="작업자 접속 QR 코드" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="grid min-w-0 gap-2.5">
        <h2>현장 QR · 공유 링크</h2>
        <p className="text-ink-2">작업자가 휴대폰 카메라로 스캔하면 언어 선택 화면이 열려요. 로그인은 필요 없어요.</p>
        <input readOnly value={url} aria-label="작업자 링크" onFocus={e => e.target.select()} />
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={copy}>링크 복사</button>
          <button className="btn-secondary" onClick={() => setPoster(true)}>현장 게시용 크게 보기</button>
          <a className="btn-secondary" href={url} target="_blank" rel="noreferrer">작업자 화면 열기</a>
        </div>
        <span role="status" className="text-[13px] text-ink-2">{copied}</span>
        {url && isLocal(url) && (
          <p className="rounded-2xl bg-except/25 px-4 py-3 text-[13px] [overflow-wrap:anywhere]">
            지금 주소({new URL(url).host})는 이 컴퓨터에서만 열려요. 휴대폰으로 스캔하려면 HTTPS 터널 주소를
            <code>PUBLIC_BASE_URL</code>에 넣고 서버를 다시 시작하세요. 음성 인식도 HTTPS에서만 동작해요.
          </p>
        )}
      </div>
      {poster && (
        <div className="poster fixed inset-0 z-[60] grid place-items-center bg-ink/80 p-5" role="dialog" aria-modal="true" aria-label="현장 게시용 QR" onClick={() => setPoster(false)}>
          <div className="grid max-w-[560px] justify-items-center gap-4 rounded-card bg-paper p-8 text-center" onClick={e => e.stopPropagation()}>
            <p className="text-lg font-bold">Scan to read today's work change · Quét để đọc thay đổi công việc hôm nay</p>
            <div className="aspect-square w-[min(400px,70vw)] [&_svg]:block [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: svg }} />
            <p className="text-xl font-black tracking-[-0.03em]">작업 변경 공지 · 스캔하고 모국어로 확인하세요</p>
            <div className="no-print flex gap-2"><button className="btn-primary" onClick={() => window.print()}>인쇄</button><button className="btn-secondary" onClick={() => setPoster(false)}>닫기</button></div>
          </div>
        </div>
      )}
    </section>
  );
}

function Escalation({ item, id, onResolved }: { item: DashboardEscalation; id: string; onResolved: () => void }) {
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
    <li className={"grid gap-2 rounded-bubble p-4 " + (item.resolvedAt ? "bg-white" : "bg-place")}>
      <div className="flex flex-wrap items-center gap-2"><strong>{item.name}</strong><span className="tag bg-white/70">{languageName(item.lang)}</span><span className="text-[13px] text-ink-2">{item.createdAt}</span></div>
      <p className="text-[17px] font-bold tracking-[-0.02em]">“{item.questionKo}”</p>
      <p className="text-[13px] text-ink-2" lang={item.lang}>원문: {item.question}</p>
      {item.resolvedAt ? (
        <p className="text-sm"><span className="tag mr-1.5 bg-action">답변 완료</span>{item.answerKo}</p>
      ) : (
        <form className="grid gap-2" onSubmit={resolve}>
          <p className="text-[13px] text-ink/70">공지에 근거가 없어 AI가 답하지 않고 넘긴 질문이에요. 한국어로 답하면 작업자 언어로 번역해 전달하고 공지에도 반영해요.</p>
          <textarea rows={2} value={answer} disabled={busy} placeholder="확정 답변을 한국어로 입력하세요" onChange={e => setAnswer(e.target.value)} />
          {error && <p role="alert" className="rounded-2xl bg-stop/25 px-4 py-3 text-sm">{error}</p>}
          <div><button className="btn-primary" aria-busy={busy} disabled={busy || !answer.trim()}>{busy ? <><Loading size={22} tone="light" />번역해서 전달하는 중</> : "답변 확정 · 작업자에게 전달"}</button></div>
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
      <tr className={"border-b border-canvas align-middle " + (open ? "bg-paper" : "")}>
        <td className="px-2 py-3"><button type="button" className="cursor-pointer font-bold underline underline-offset-4" aria-expanded={open} onClick={toggle}>{worker.name}</button></td>
        <td className="px-2 py-3"><span className="tag bg-canvas">{languageName(worker.lang)}</span></td>
        <td className="px-2 py-3">
          <span className={"tag m-0.5 " + TONE_BG[status.tone]}>{status.label}</span>
          {worker.waiting && <span className={"tag m-0.5 " + TONE_BG.wait}>관리자 답변 대기</span>}
        </td>
        <td className="px-2 py-3">
          <div className="flex flex-wrap gap-1">
            {conditions.filter(c => c.check).map(c => {
              const item = assessment.find(a => a.id === c.id);
              const s: CheckStatus = item?.status ?? "missing";
              return <span key={c.id} className={"tag " + CHECK_BG[s]} title={c.label + " · " + CHECK[s]}>{CHECK_ICON[s]} {c.id.slice(1)}</span>;
            })}
          </div>
        </td>
        <td className="max-w-[260px] px-2 py-3">{last ? <>{last.inputKo}{last.mode === "voice" && <span className="tag ml-1.5 bg-time text-white">음성</span>}</> : <span className="text-ink-3">-</span>}</td>
      </tr>
      {open && (
        <tr className="border-b border-canvas bg-paper">
          <td colSpan={5} className="px-2 py-4">
            <ol className="grid gap-3">
              {worker.turns.map(turn => (
                <li key={turn.turn} className="grid gap-1 border-l-[3px] border-ink pl-3">
                  <div className="flex items-baseline gap-2.5"><span className="text-[13px] font-black">{TURN_STATE[turn.state]}</span><span className="text-[13px] text-ink-2">v{turn.version} · {turn.mode === "voice" ? "음성" : "텍스트"}</span></div>
                  <p lang={worker.lang}>{turn.answer}</p>
                  <p className="text-ink-2">→ {turn.inputKo}</p>
                  {turn.state !== "answered" && turn.state !== "manager" && (
                    <ul className="mt-1 grid gap-1 text-[13px]">
                      {turn.assessment.map(a => (
                        <li key={a.id} className="flex flex-wrap items-baseline gap-1.5">
                          <span className={"tag " + CHECK_BG[a.status]}>{CHECK_ICON[a.status]} {a.id.slice(1)}</span>
                          {conditions.find(c => c.id === a.id)?.label}
                          {a.quote && <q className="rounded-md bg-white px-1.5" lang={worker.lang}>{a.quote}</q>}
                          {a.rejected && <em className="text-xs text-stop">AI가 ‘{CHECK[a.rejected]}’으로 판정했지만 작업자 발화에서 인용 근거를 찾지 못해 누락으로 처리</em>}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
              {!worker.turns.length && <li className="text-ink-2">아직 답변하지 않았어요.</li>}
            </ol>
          </td>
        </tr>
      )}
    </>
  );
}

export default function Dashboard({ id, baseUrl }: { id: string; baseUrl: string }) {
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

  if (!data) {
    return (
      <main className="mx-auto grid min-h-[50vh] max-w-[1320px] place-items-center px-4 pt-4 sm:px-6" aria-busy={!error}>
        {error ? <p className="text-ink-2">{error}</p>
          : <p className="grid justify-items-center gap-2 text-sm font-semibold text-ink-2"><Loading size={56} />현황을 불러오는 중</p>}
      </main>
    );
  }
  const { notice, stats, workers, escalations } = data;
  const pending = escalations.filter(e => !e.resolvedAt);
  const done = escalations.filter(e => e.resolvedAt);
  const tiles: { label: string; value: number; dot: string }[] = [
    { label: "접속", value: stats.joined, dot: "bg-ink" },
    { label: "이해 확인", value: stats.understood, dot: "bg-action" },
    { label: "재확인 필요", value: stats.recheck, dot: "bg-stop" },
    { label: "답변 중", value: stats.inProgress, dot: "bg-except" },
    { label: "관리자 답변 대기", value: stats.waiting, dot: "bg-place" },
  ];

  return (
    <main className="mx-auto grid w-full max-w-[1320px] gap-5 px-4 pt-4 pb-20 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1">
          <p className="eyebrow">발행된 공지 · v{notice.version}</p>
          <h1>{notice.draft.title}</h1>
        </div>
        <a className="btn-secondary" href="/">새 공지 작성</a>
      </div>

      <QrPanel id={id} baseUrl={baseUrl} />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-label="이해 확인 현황">
        {tiles.map(tile => (
          <div key={tile.label} className="grid gap-1 rounded-bubble bg-paper px-5 py-4 shadow-soft">
            <span className="flex items-center gap-1.5 text-[13px] font-bold text-ink-2"><i aria-hidden="true" className={"size-2.5 rounded-full " + tile.dot} />{tile.label}</span>
            <span className="text-[34px] leading-none font-black tracking-[-0.05em] tabular-nums">{tile.value}</span>
          </div>
        ))}
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,.85fr)_minmax(0,1.3fr)]">
        <section className="card">
          <div className="mb-4 flex items-center justify-between gap-3"><h2>관리자 확인 요청</h2>{pending.length > 0 && <span className="tag bg-ink !text-paper">{pending.length}</span>}</div>
          {escalations.length === 0 ? <p className="text-ink-2">공지로 답할 수 없는 질문이 들어오면 여기에 표시돼요.</p> : (
            <ul className="grid gap-3">
              {[...pending, ...done].map(item => <Escalation key={item.id} item={item} id={id} onResolved={refresh} />)}
            </ul>
          )}
        </section>

        <section className="card">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2>작업자별 이해 현황</h2><span className="text-[13px] text-ink-2">이름을 누르면 판정 근거를 볼 수 있어요</span></div>
          {workers.length === 0 ? <p className="text-ink-2">아직 접속한 작업자가 없어요. QR을 공유해 주세요.</p> : (
            <div className="overflow-x-auto rounded-bubble bg-white px-3">
              <table className="w-full border-collapse text-sm">
                <thead><tr className="border-b border-grid text-left text-xs whitespace-nowrap text-ink-2">
                  <th className="px-2 py-2.5">작업자</th><th className="px-2 py-2.5">언어</th><th className="px-2 py-2.5">상태</th><th className="px-2 py-2.5">확인 조건</th><th className="px-2 py-2.5">최근 답변 (한국어)</th>
                </tr></thead>
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

      <section className="card">
        <h2>공지 내용과 반영 이력</h2>
        <ul className="mt-4 mb-3 grid gap-2">
          {notice.draft.conditions.map(c => (
            <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-2xl bg-white px-3 py-2.5">
              <span className={"tag " + KIND_BG[c.kind]}>{CONDITION_KINDS[c.kind]}</span>{c.label}
              {c.check && <span className="tag ml-auto bg-canvas">답변 확인</span>}
            </li>
          ))}
        </ul>
        <p className="text-[13px] text-ink-2">상황 질문: {notice.draft.question}</p>
        {notice.addenda.length > 0 && (
          <ol className="mt-3 grid list-decimal gap-1.5 pl-5 text-sm">
            {notice.addenda.map(a => <li key={a.id}><strong>v{a.version}</strong> Q. {a.questionKo} → A. {a.answerKo}</li>)}
          </ol>
        )}
      </section>
      {error && <FloatingError message={error} onClose={() => setError("")} />}
    </main>
  );
}

"use client";

import QRCode from "qrcode";
import { Fragment, useEffect, useState, type FormEvent } from "react";
import { CONDITION_KINDS, isLang, LANGUAGES } from "../../shared/languages.ts";
import type { CheckStatus, Condition, DashboardEscalation, DashboardView, DashboardWorker, Question, TurnState, WorkerStatus } from "../../shared/types.ts";
import FloatingError from "../../ui/FloatingError";
import Loading from "../../ui/Loading";
import { post } from "../../ui/request";
import { CHECK_BG, CHECK_ICON, KIND_BG, TONE_BG, type Tone } from "../../ui/tone.ts";

const STATUS: Record<WorkerStatus, { label: string; tone: Tone }> = {
  understood: { label: "이해했어요", tone: "ok" },
  recheck: { label: "다시 설명 필요", tone: "bad" },
  inProgress: { label: "답하는 중", tone: "mid" },
  notAnswered: { label: "아직 답 안 함", tone: "idle" },
};
const TURN_STATE: Record<TurnState, string> = {
  understood: "이해함", followup: "한 번 더 물어봄", guidance: "다시 설명함 · 직접 확인 필요", answered: "공지 내용으로 답해줌", manager: "관리자에게 질문함",
};
const CHECK: Record<CheckStatus, string> = { met: "이해함", missing: "빠뜨림", conflict: "반대로 이해" };

function languageName(lang: string): string {
  return isLang(lang) ? LANGUAGES[lang].native : lang;
}

function QrPanel({ id, baseUrl }: { id: string; baseUrl: string }) {
  const [url, setUrl] = useState("");
  const [svg, setSvg] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const link = new URL("/n/" + encodeURIComponent(id), baseUrl || window.location.origin).href;
    setUrl(link);
    QRCode.toString(link, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#121212", light: "#ffffff" } })
      .then(setSvg).catch(() => setSvg(""));
  }, [id, baseUrl]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="card grid items-center gap-6 sm:grid-cols-[210px_minmax(0,1fr)]">
      <div className="mx-auto aspect-square w-[210px] max-w-full rounded-bubble bg-white p-3 [&_svg]:block [&_svg]:size-full"
        aria-label="작업자 접속 QR 코드" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="grid min-w-0 justify-items-center gap-2.5 text-center">
        <h2>작업자에게 이 QR을 보여주세요</h2>
        <p className="text-[13px] text-ink-2">작업자가 휴대폰 카메라로 찍으면 자기 언어로 공지를 보고 답해요. 단톡방엔 링크를 보내도 돼요.</p>
        <button className="btn-primary" onClick={copy} aria-live="polite">{copied ? "복사했어요" : "링크 복사"}</button>
      </div>
    </section>
  );
}

function WorkerRow({ worker, conditions, questions, open, toggle }: {
  worker: DashboardWorker; conditions: Condition[]; questions: Question[]; open: boolean; toggle: () => void;
}) {
  const last = worker.turns.at(-1);
  // Each condition's latest judgment, from whichever question tested it.
  const latest = (id: string) => [...worker.turns].reverse().flatMap(t => t.assessment).find(a => a.id === id);
  const number = (questionId: string) => questions.findIndex(q => q.id === questionId) + 1;
  const status = STATUS[worker.status];
  return (
    <>
      <tr className={"border-b border-canvas align-middle " + (open ? "bg-paper" : "")}>
        <td className="px-2 py-3 text-center whitespace-nowrap">
          <button type="button" className="cursor-pointer font-bold underline-offset-4 hover:underline" aria-expanded={open} onClick={toggle}>
            {worker.name} <span className="text-xs font-semibold text-ink-3">{languageName(worker.lang)}</span> <span aria-hidden="true" className="text-ink-3">{open ? "▴" : "▾"}</span>
          </button>
        </td>
        <td className="px-2 py-3 text-center">
          <span className={"tag m-0.5 " + TONE_BG[status.tone]}>{status.label}</span>
          {worker.waiting && <span className={"tag m-0.5 " + TONE_BG.wait}>질문에 답해 주세요</span>}
        </td>
        <td className="px-2 py-3 text-center">
          {(() => {
            const items = conditions.filter(c => c.check).map(c => ({ c, s: (latest(c.id)?.status ?? "missing") as CheckStatus }));
            const met = items.filter(x => x.s === "met").length;
            return (
              <span className="grid justify-items-center gap-1" title={items.map(x => `${CHECK_ICON[x.s]} ${x.c.label}`).join("\n")}>
                <b className="tabular-nums">{met} / {items.length}</b>
                <span className="flex gap-0.5">{items.map(x => <i key={x.c.id} aria-hidden="true" className={"h-1.5 w-4 rounded-full " + CHECK_BG[x.s].split(" ")[0]} />)}</span>
              </span>
            );
          })()}
        </td>
        <td className="max-w-[260px] px-2 py-3 text-center">{last ? <>{last.inputKo}{last.mode === "voice" && <span className="tag ml-1.5 bg-time text-white">음성</span>}</> : <span className="text-ink-3">-</span>}</td>
      </tr>
      {open && (
        <tr className="border-b border-canvas bg-paper">
          <td colSpan={4} className="px-2 py-4 text-left">
            <ol className="grid gap-3">
              {worker.turns.map(turn => (
                <li key={turn.turn} className="grid gap-1 border-l-[3px] border-ink pl-3">
                  <div className="flex items-baseline gap-2.5">{questions.length > 1 && <span className="tag bg-ink text-paper">Q{number(turn.questionId)}</span>}<span className="text-[13px] font-black">{TURN_STATE[turn.state]}</span><span className="text-[13px] text-ink-2">v{turn.version}{turn.mode === "voice" && " · 음성"}</span></div>
                  <p lang={worker.lang}>{turn.answer}</p>
                  <p className="text-ink-2">→ {turn.inputKo}</p>
                  {turn.state !== "answered" && turn.state !== "manager" && (
                    <ul className="mt-1 grid gap-1 text-[13px]">
                      {turn.assessment.map(a => (
                        <li key={a.id} className="flex flex-wrap items-baseline gap-1.5">
                          <span className={"tag " + CHECK_BG[a.status]}>{CHECK_ICON[a.status]} {a.id.slice(1)}</span>
                          {conditions.find(c => c.id === a.id)?.label}
                          {a.quote && <q className="rounded-md bg-white px-1.5" lang={worker.lang}>{a.quote}</q>}
                          {a.rejected && <em className="text-xs text-stop">AI는 ‘{CHECK[a.rejected]}’이라 했지만 답변에 근거가 없어 누락 처리</em>}
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

// A worker question the notice could not answer. The manager's Korean answer is
// translated for every worker and added to the notice.
function WorkerQuestion({ item, id }: { item: DashboardEscalation; id: string }) {
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  async function resolve(event: FormEvent) {
    event.preventDefault();
    if (!answer.trim() || busy || sent) return;
    setBusy(true);
    setError("");
    try {
      await post("resolve", { id, escalationId: item.id, answer: answer.trim() }, "답변을 전달하지 못했어요. 다시 시도해 주세요.");
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "답변을 전달하지 못했어요.");
    }
    setBusy(false);
  }
  return (
    <li className="grid gap-2 rounded-bubble bg-white p-4">
      <p className="text-[13px] font-bold text-ink-2">{item.name} · {languageName(item.lang)}</p>
      <p className="text-[17px] font-bold tracking-[-0.02em]">“{item.questionKo}”</p>
      {sent ? <p className="text-sm font-bold text-ink-2">전달했어요. 작업자 화면에 곧 나타나요.</p> : (
        <form className="grid gap-2" onSubmit={resolve}>
          <textarea rows={2} value={answer} disabled={busy} placeholder="한국어로 답을 적어 주세요. 작업자 언어로 번역해서 보내요." onChange={e => setAnswer(e.target.value)} />
          {error && <p role="alert" className="rounded-2xl bg-stop/25 px-4 py-3 text-sm">{error}</p>}
          <div><button className="btn-primary" aria-busy={busy} disabled={busy || !answer.trim()}>{busy ? <><Loading size={22} tone="light" />보내는 중</> : "답장 보내기"}</button></div>
        </form>
      )}
    </li>
  );
}

export default function Dashboard({ id, baseUrl }: { id: string; baseUrl: string }) {
  const [data, setData] = useState<DashboardView | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState("");

  // Poll so new worker answers appear without a reload.
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
  const tiles: { label: string; value: number; dot: string }[] = [
    { label: "들어온 작업자", value: stats.joined, dot: "bg-ink" },
    { label: "이해했어요", value: stats.understood, dot: "bg-action" },
    { label: "다시 설명 필요", value: stats.recheck, dot: "bg-stop" },
  ];

  return (
    <main className="mx-auto grid w-full max-w-[1320px] gap-5 px-4 pt-4 pb-20 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1>{notice.draft.title}</h1>
        <a className="btn-secondary" href="/">새 공지 작성</a>
      </div>

      <QrPanel id={id} baseUrl={baseUrl} />

      {pending.length > 0 && (
        <section className="card grid gap-3 !bg-place">
          <div className="grid gap-1">
            <h2>작업자가 질문했어요 · {pending.length}건</h2>
            <p className="text-[13px] text-ink">공지에 없는 내용이라 AI가 대신 답하지 않았어요. 작업자가 답을 기다리고 있어요.</p>
          </div>
          <ul className="grid gap-2.5">{pending.map(item => <WorkerQuestion key={item.id} item={item} id={id} />)}</ul>
        </section>
      )}

      <section className="grid grid-cols-3 gap-3" aria-label="이해 확인 현황">
        {tiles.map(tile => (
          <div key={tile.label} className="grid justify-items-center gap-1 rounded-bubble bg-paper px-5 py-4 shadow-soft">
            <span className="flex items-center gap-1.5 text-xs font-bold text-ink-2"><i aria-hidden="true" className={"size-2.5 rounded-full " + tile.dot} />{tile.label}</span>
            <span className="text-[28px] leading-none font-black tracking-[-0.05em] tabular-nums">{tile.value}</span>
          </div>
        ))}
      </section>

        <section className="card">
          <div className="mb-4 grid gap-1"><h2>작업자별 답변</h2><p className="text-[13px] text-ink-2">이름을 누르면 무엇을 이해했고 무엇을 놓쳤는지 볼 수 있어요. 새 답변은 자동으로 올라와요.</p></div>
          {workers.length === 0 ? <p className="text-ink-2">아직 들어온 작업자가 없어요. 위 QR을 보여주세요.</p> : (
            <div className="overflow-x-auto rounded-bubble bg-white px-3">
              <table className="w-full border-collapse text-sm">
                <thead><tr className="border-b border-grid text-center text-xs whitespace-nowrap text-ink-2">
                  <th className="px-2 py-2.5">이름</th><th className="px-2 py-2.5">상태</th><th className="px-2 py-2.5">이해한 내용</th><th className="px-2 py-2.5">최근 답변</th>
                </tr></thead>
                <tbody>
                  {workers.map(w => (
                    <Fragment key={w.id}>
                      <WorkerRow worker={w} conditions={notice.draft.conditions} questions={notice.draft.questions} open={open === w.id} toggle={() => setOpen(open === w.id ? "" : w.id)} />
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

      <details className="card">
        <summary className="cursor-pointer text-[17px] font-black tracking-[-0.03em]">보낸 공지와 퀴즈</summary>
        <p className="mt-4 rounded-2xl bg-white px-4 py-3 whitespace-pre-wrap">{notice.source}</p>
        <ol className="mt-3 grid gap-2">
          {notice.draft.questions.map((q, i) => (
            <li key={q.id} className="flex items-start gap-2.5 rounded-2xl bg-white px-4 py-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-ink text-xs font-black text-paper">{i + 1}</span>
              <div className="grid gap-1.5">
                <p className="font-semibold">{q.text}</p>
                {q.type === "short" ? <p className="text-[13px] text-ink-2">정답: {q.answer}</p> : (
                  <p className="flex flex-wrap items-center gap-1.5 text-[13px] text-ink-2">답에 들어가야 할 내용
                    {q.conditionIds.map(id => notice.draft.conditions.find(c => c.id === id)).filter(c => c !== undefined).map(c => (
                      <span key={c.id} className={"tag " + KIND_BG[c.kind]} title={c.label}>{CONDITION_KINDS[c.kind]} · {c.label}</span>
                    ))}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </details>
      {error && <FloatingError message={error} onClose={() => setError("")} />}
    </main>
  );
}

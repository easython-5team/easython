import "server-only";
import { analyzeNotice, judge, translateAddendum, translateNotice, writeQuestions } from "./ai/index.ts";
import type { QuestionRequest } from "./ai/tasks.ts";
import { decide, MAX_TURNS, mergeAssessment, verifyAssessment } from "./decide.ts";
import { progress } from "../shared/questions.ts";
import { fail } from "./errors.ts";
import { WORKER_LANGS, WORKER_TEXT, type Lang } from "../shared/languages.ts";
import {
  createSession, dashboard, getEscalation, getNotice, getPreview, getSession, getTurns, publishPreview,
  recordTurn, resolveEscalation, savePreview, sessionEscalations, workerNotice,
} from "./db/store.ts";
import type {
  Assessed, DashboardView, Draft, InputMode, Notice, PreviewResult, SessionView, Translation, Translations, Turn,
  WorkerNotice, WorkerStatus, WorkerTurn,
} from "../shared/types.ts";

/* ---------- manager: review and publish ---------- */

export async function analyze(source: string): Promise<Draft> {
  return analyzeNotice(source);
}

/** Writes the requested number and type of questions from the conditions the manager checked. */
export async function question(source: string, draft: Draft, request: QuestionRequest): Promise<Draft> {
  if (!draft.conditions.some(c => c.check)) fail(400, "답변에서 확인할 조건을 하나 이상 선택해 주세요.");
  return { ...draft, questions: await writeQuestions(source, draft, request) };
}

export async function preview(source: string, draft: Draft): Promise<PreviewResult> {
  const entries = await Promise.all(
    WORKER_LANGS.map(async lang => [lang, await translateNotice(source, draft, lang)] as const),
  );
  const translations = Object.fromEntries(entries) as Translations;
  return { previewId: savePreview({ source, draft, translations }), translations };
}

export function mismatches(translations: Translations) {
  return (Object.entries(translations) as Array<[Lang, Translation]>)
    .flatMap(([lang, t]) => t.checks.filter(c => !c.preserved).map(c => ({ lang, ...c })));
}

export function publish(previewId: string, acceptMismatch: boolean): string {
  const stored = getPreview(previewId);
  if (!stored) fail(404, "미리보기를 찾을 수 없어요. 미리보기를 다시 생성해 주세요.");
  if (mismatches(stored.translations).length && !acceptMismatch) {
    fail(409, "번역 검증에서 의미가 달라진 조건이 있어요. 내용을 확인한 뒤 ‘확인하고 발행’을 선택해 주세요.");
  }
  return publishPreview(previewId);
}

/* ---------- worker ---------- */

function loadNotice(id: string): Notice {
  return getNotice(id) ?? fail(404, "This notice could not be found.");
}

export function noticeFor(id: string, lang: Lang): WorkerNotice {
  return workerNotice(loadNotice(id), lang);
}

export function join(noticeId: string, name: string, lang: Lang): string {
  loadNotice(noticeId);
  return createSession({ noticeId, name, lang });
}

function workerTurn(turn: Turn, notice: Notice, lang: Lang): WorkerTurn {
  const texts = new Map(notice.translations[lang].conditions.map(c => [c.id, c.text]));
  return {
    turn: turn.turn, questionId: turn.questionId, answer: turn.answer, mode: turn.mode, state: turn.state, message: turn.message,
    conditions: turn.state === "answered" || turn.state === "manager" ? []
      : turn.assessment.map(c => ({ id: c.id, status: c.status, text: texts.get(c.id) ?? "" })),
  };
}

function ownSession(noticeId: string, sessionId: string) {
  const session = getSession(sessionId);
  if (!session || session.noticeId !== noticeId) fail(404, "This session could not be found.");
  return session;
}

export function sessionView(noticeId: string, sessionId: string): SessionView {
  const session = ownSession(noticeId, sessionId);
  const notice = loadNotice(noticeId);
  const answers = new Map(notice.addenda.map(a => [a.id, a.translations[session.lang]?.answer ?? a.answerKo]));
  return {
    name: session.name, lang: session.lang,
    notice: workerNotice(notice, session.lang),
    turns: getTurns(sessionId).map(t => workerTurn(t, notice, session.lang)),
    escalations: sessionEscalations(sessionId).map(e => ({
      turn: e.turn, answer: e.addendumId ? answers.get(e.addendumId) ?? null : null,
    })),
  };
}

const pending = new Map<string, { answer: string; result: Promise<WorkerTurn> }>();

export async function respond({ noticeId, sessionId, turn, answer, mode }: {
  noticeId: string; sessionId: string; turn: number; answer: string; mode: InputMode;
}): Promise<WorkerTurn> {
  const session = ownSession(noticeId, sessionId);
  const notice = loadNotice(noticeId);
  const lang = session.lang;
  const turns = getTurns(sessionId);
  const existing = turns[turn];
  if (existing) {
    if (existing.answer !== answer) fail(409, "This turn already has a different answer.");
    return workerTurn(existing, notice, lang);
  }
  // Questions are answered in order; only the open one's turns count here.
  const questionId = progress(notice.draft.questions.map(q => q.id), turns).current;
  const question = notice.draft.questions.find(q => q.id === questionId);
  if (turn !== turns.length || !question) fail(409, "This conversation is already finished.");
  const asked = turns.filter(t => t.questionId === question.id);
  if (asked.length >= MAX_TURNS) fail(429, "Too many answers for this question. Please talk to your manager.");
  const last = asked.at(-1);

  const key = sessionId + ":" + turn;
  const active = pending.get(key);
  if (active) {
    if (active.answer !== answer) fail(409, "Another answer is being checked.");
    return active.result;
  }
  const result = (async () => {
    const verdict = await judge({ notice, question, lang, history: asked, answer });
    const checkedIds = question.conditionIds;
    const prior: Assessed[] = last?.assessment ?? checkedIds.map(id => ({ id, status: "missing", quote: "" }));
    const assessment = verdict.intent === "question" ? prior
      : mergeAssessment(prior, verifyAssessment(verdict.conditions, checkedIds, [...asked.map(t => t.answer), answer]));
    const texts = new Map(notice.translations[lang].conditions.map(c => [c.id, c.text]));
    const decision = decide({
      verdict, assessment, history: asked, text: WORKER_TEXT[lang], conditionText: id => texts.get(id) ?? "",
    });
    const saved = recordTurn(sessionId, turn, {
      questionId: question.id, answer, mode, state: decision.state, message: decision.message, assessment,
      inputKo: verdict.inputKo, version: notice.version,
    }, decision.escalate ? { noticeId } : null);
    return workerTurn(saved, notice, lang);
  })();
  pending.set(key, { answer, result });
  try {
    return await result;
  } finally {
    pending.delete(key);
  }
}

/* ---------- manager: dashboard and escalations ---------- */

// A re-explained question needs an in-person check even before the rest are answered.
export function workerStatus(questionIds: string[], turns: Turn[], openEscalations: number): { status: WorkerStatus; waiting: boolean } {
  const { current, results } = progress(questionIds, turns);
  const judged = turns.some(t => t.state !== "answered" && t.state !== "manager");
  const status: WorkerStatus = [...results.values()].includes("guidance") ? "recheck"
    : current === null ? "understood" : judged ? "inProgress" : "notAnswered";
  return { status, waiting: openEscalations > 0 };
}

export function dashboardView(noticeId: string): DashboardView {
  const notice = loadNotice(noticeId);
  const { sessions, escalations } = dashboard(noticeId);
  const addenda = new Map(notice.addenda.map(a => [a.id, a]));
  const workers = sessions.map(s => {
    const open = escalations.filter(e => e.sessionId === s.id && !e.resolvedAt).length;
    return { ...s, ...workerStatus(notice.draft.questions.map(q => q.id), s.turns, open) };
  });
  const count = (status: WorkerStatus) => workers.filter(w => w.status === status).length;
  return {
    notice,
    stats: {
      joined: workers.length, understood: count("understood"), recheck: count("recheck"),
      inProgress: count("inProgress") + count("notAnswered"), waiting: escalations.filter(e => !e.resolvedAt).length,
    },
    workers,
    escalations: escalations.map(e => ({ ...e, answerKo: e.addendumId ? addenda.get(e.addendumId)?.answerKo ?? "" : "" })),
  };
}

export async function resolve(noticeId: string, escalationId: string, answerKo: string) {
  const escalation = getEscalation(escalationId);
  if (!escalation || escalation.noticeId !== noticeId) fail(404, "확인 요청을 찾을 수 없어요.");
  if (escalation.resolvedAt) fail(409, "이미 답변한 요청이에요.");
  const translations = await translateAddendum({ questionKo: escalation.questionKo, answerKo });
  return resolveEscalation({ escalationId, answerKo, questionKo: escalation.questionKo, translations });
}

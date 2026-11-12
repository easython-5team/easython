import { getHistory, getJudgmentContext, recordTurn } from './store.ts';
import type { JudgeInput, RespondInput, ResponseRow, Verdict, WorkerPreview, WorkerReply, WorkerState } from './types.ts';

const pending = new Map<string, { answer: string; result: Promise<WorkerReply> }>();
const openStates = new Set<WorkerState>(['followup', 'answered']);

function fail(status: number, message: string): never {
  throw Object.assign(new Error(message), { status });
}

function replay(row: ResponseRow, answer: string): WorkerReply {
  if (row.answer !== answer) fail(409, 'This turn already has a different answer.');
  return { state: row.state, message: row.message };
}

function decision(verdict: Verdict, history: ResponseRow[], preview: WorkerPreview): WorkerReply {
  const { kind, message, followup } = verdict;
  if (kind === 'ambiguous') {
    if (history.some(row => row.state === 'followup')) {
      return { state: 'guidance', message: preview.summary };
    }
    if (!followup?.trim()) fail(502, 'Please try your answer again.');
    return { state: 'followup', message: followup };
  }
  const states = { correct: 'understood', incorrect: 'guidance', question: 'answered', unsupported: 'manager' } as const;
  if (!Object.hasOwn(states, kind) || !message?.trim()) fail(502, 'Please try your answer again.');
  return { state: states[kind as keyof typeof states], message };
}

export async function respond({ id, sessionId, turn, answer }: RespondInput, judge: (input: JudgeInput) => Verdict | Promise<Verdict>): Promise<WorkerReply> {
  if (typeof id !== 'string' || typeof sessionId !== 'string' || !sessionId.trim() || sessionId.length > 128 ||
      !Number.isSafeInteger(turn) || turn < 0 || typeof answer !== 'string' || !answer.trim()) {
    fail(400, 'Please enter an answer for this notice.');
  }
  const context = getJudgmentContext(id);
  if (!context) fail(404, 'This notice could not be found.');

  const preview = context.preview;
  if (!preview) fail(409, "This notice is not ready for responses.");
  const history = getHistory(id, sessionId);
  if (history[turn]) return replay(history[turn], answer);
  if (turn !== history.length || (history.length && !openStates.has(history.at(-1)!.state))) {
    fail(409, 'This session cannot accept that turn.');
  }

  const key = JSON.stringify([id, sessionId, turn]);
  const active = pending.get(key);
  if (active) {
    if (active.answer !== answer) fail(409, 'Another answer is being checked.');
    return active.result;
  }

  const result = Promise.resolve()
    .then(() => judge({ ...context, history, answer }))
    .then(verdict => {
      const response = decision(verdict, history, preview);
      const saved = recordTurn({ id, sessionId, turn, answer }, response);
      return replay(saved, answer);
    });
  pending.set(key, { answer, result });
  try {
    return await result;
  } finally {
    pending.delete(key);
  }
}

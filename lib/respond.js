import { getHistory, getJudgmentContext, recordTurn } from './store.js';

const pending = new Map();
const openStates = new Set(['followup', 'answered']);

function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

function replay(row, answer) {
  if (row.answer !== answer) fail(409, 'This turn already has a different answer.');
  return { state: row.state, message: row.message };
}

function decision(verdict, history, preview) {
  const { kind, message, followup } = verdict;
  if (kind === 'ambiguous') {
    if (history.some(row => row.state === 'followup')) {
      return { state: 'guidance', message: preview.summary };
    }
    if (!followup?.trim()) fail(502, 'Please try your answer again.');
    return { state: 'followup', message: followup };
  }
  const states = { correct: 'understood', incorrect: 'guidance', question: 'answered', unsupported: 'manager' };
  if (!Object.hasOwn(states, kind) || !message?.trim()) fail(502, 'Please try your answer again.');
  return { state: states[kind], message };
}

export async function respond({ id, sessionId, turn, answer }, judge) {
  if (typeof id !== 'string' || typeof sessionId !== 'string' || !sessionId.trim() || sessionId.length > 128 ||
      !Number.isSafeInteger(turn) || turn < 0 || typeof answer !== 'string' || !answer.trim()) {
    fail(400, 'Please enter an answer for this notice.');
  }
  const context = getJudgmentContext(id);
  if (!context) fail(404, 'This notice could not be found.');

  if (!context.preview) fail(409, "Please select English first.");
  const history = getHistory(id, sessionId);
  if (history[turn]) return replay(history[turn], answer);
  if (turn !== history.length || (history.length && !openStates.has(history.at(-1).state))) {
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
      const response = decision(verdict, history, context.preview);
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

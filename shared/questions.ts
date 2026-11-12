// Questions are asked one by one. Shared by the server (judging, dashboard)
// and the worker screen so both agree on which question is open.
import type { Draft, Question, QuestionType, Translation, TurnState } from "./types.ts";

export const MAX_QUESTIONS = 5;
export const QUESTION_TYPES: Record<QuestionType, string> = { open: "주관식", short: "단답형" };

/** A question's conversation ends once it is confirmed or re-explained. */
export const QUESTION_DONE: ReadonlySet<TurnState> = new Set(["understood", "guidance"]);

export interface Progress {
  /** The question the worker answers next; null once every question is done. */
  current: string | null;
  /** Final state of each finished question. */
  results: Map<string, TurnState>;
}

export function progress(questionIds: string[], turns: ReadonlyArray<{ questionId: string; state: TurnState }>): Progress {
  const results = new Map<string, TurnState>();
  for (const turn of turns) if (QUESTION_DONE.has(turn.state)) results.set(turn.questionId, turn.state);
  return { current: questionIds.find(id => !results.has(id)) ?? null, results };
}

// Notices saved before multiple questions had one `question` string.
type LegacyDraft = Partial<Draft> & { question?: unknown; questionReason?: unknown };
type LegacyTranslation = Partial<Translation> & { question?: unknown };

export function upgradeDraft(draft: LegacyDraft): Draft {
  if (Array.isArray(draft.questions)) return draft as Draft;
  const conditions = draft.conditions ?? [];
  const questions: Question[] = typeof draft.question === "string" && draft.question ? [{
    id: "q1", type: "open", text: draft.question, answer: "",
    conditionIds: conditions.filter(c => c.check).map(c => c.id),
    reason: typeof draft.questionReason === "string" ? draft.questionReason : "",
  }] : [];
  return { title: draft.title ?? "", conditions, questions };
}

export function upgradeTranslation(translation: LegacyTranslation): Translation {
  if (Array.isArray(translation.questions)) return translation as Translation;
  const { question, ...rest } = translation;
  return { ...rest, questions: typeof question === "string" && question ? [{ id: "q1", text: question }] : [] } as Translation;
}

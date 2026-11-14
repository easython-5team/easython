import "server-only";
import { invalid } from "./errors.ts";
import { CONDITION_KINDS, isLang, type Lang } from "../shared/languages.ts";
import { datedTitle, splitTitle } from "../shared/title.ts";
import { MAX_QUESTIONS, QUESTION_TYPES } from "../shared/questions.ts";
import type { Condition, ConditionKind, Draft, Question, QuestionType } from "../shared/types.ts";

export { invalid };

export function field(value: unknown, label: string, max = 6000): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw invalid(`${label} 입력을 확인해 주세요. 최대 ${max}자입니다.`);
  }
  return value.trim();
}

export function language(value: unknown): Lang {
  if (!isLang(value)) throw invalid("Unsupported language.");
  return value;
}

function isKind(value: unknown): value is ConditionKind {
  return typeof value === "string" && Object.hasOwn(CONDITION_KINDS, value);
}

type Unknown<T> = { [K in keyof T]?: unknown };

export function questionType(value: unknown): QuestionType {
  if (typeof value !== "string" || !Object.hasOwn(QUESTION_TYPES, value)) throw invalid("질문 유형을 확인해 주세요.");
  return value as QuestionType;
}

export function questionCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > MAX_QUESTIONS) {
    throw invalid(`질문 개수는 1~${MAX_QUESTIONS}개여야 해요.`);
  }
  return value;
}

// Each question must test at least one checked condition, and a short
// question needs its expected answer.
function reviewedQuestions(value: unknown, checked: Set<string>): Question[] {
  if (!Array.isArray(value) || value.length > MAX_QUESTIONS) throw invalid(`질문은 최대 ${MAX_QUESTIONS}개예요.`);
  const ids = new Set<string>();
  return (value as Unknown<Question>[]).map((q, i): Question => {
    const n = i + 1;
    if (typeof q?.id !== "string" || !/^q\d{1,3}$/.test(q.id) || ids.has(q.id)) throw invalid("질문 ID를 확인해 주세요.");
    ids.add(q.id);
    const type = questionType(q.type);
    const conditionIds = Array.isArray(q.conditionIds) ? [...checked].filter(id => (q.conditionIds as unknown[]).includes(id)) : [];
    if (!conditionIds.length) throw invalid(`질문 ${n}에 확인할 조건을 하나 이상 연결해 주세요.`);
    return {
      id: q.id, type, conditionIds,
      text: field(q.text, `질문 ${n}`, 500),
      answer: type === "short" ? field(q.answer, `질문 ${n}의 정답`, 200) : "",
      reason: typeof q.reason === "string" ? q.reason.trim().slice(0, 500) : "",
    };
  });
}

// The manager may edit labels, the questions and which conditions are checked,
// and may add a condition by hand (no evidence). AI-extracted evidence must
// still be a verbatim part of the source.
export function reviewedDraft(value: unknown, source: string, { needQuestions }: { needQuestions: boolean }): Draft {
  const draft = (value ?? {}) as Unknown<Draft>;
  const conditions = draft.conditions;
  if (!Array.isArray(conditions) || !conditions.length || conditions.length > 10) {
    throw invalid("지시 조건은 1~10개여야 해요.");
  }
  const ids = new Set<string>();
  const reviewed = (conditions as Unknown<Condition>[]).map((c): Condition => {
    if (typeof c?.id !== "string" || !/^c\d{1,3}$/.test(c.id) || ids.has(c.id)) throw invalid("조건 ID를 확인해 주세요.");
    ids.add(c.id);
    if (!isKind(c.kind)) throw invalid("조건 종류를 확인해 주세요.");
    const evidence = typeof c.evidence === "string" ? c.evidence.trim() : "";
    if (evidence && !source.includes(evidence)) throw invalid("원문 근거가 원문과 달라요. 다시 분석해 주세요.");
    return { id: c.id, kind: c.kind, label: field(c.label, "조건 문장", 300), evidence, check: c.check === true };
  });
  if (!reviewed.some(c => c.check)) throw invalid("답변에서 확인할 조건을 하나 이상 선택해 주세요.");
  const title = splitTitle(field(draft.title, "공지 제목", 200));
  if (!title.summary) throw invalid("공지 제목을 입력해 주세요.");
  const checked = new Set(reviewed.filter(c => c.check).map(c => c.id));
  if (needQuestions && !Array.isArray(draft.questions)) throw invalid("질문을 먼저 만들어 주세요.");
  if (needQuestions && !(draft.questions as unknown[]).length) throw invalid("질문을 하나 이상 만들어 주세요.");
  return {
    title: datedTitle(title.summary, title.date || undefined),
    conditions: reviewed,
    questions: needQuestions ? reviewedQuestions(draft.questions, checked) : [],
  };
}

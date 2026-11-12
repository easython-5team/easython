import { invalid } from "./errors.ts";
import { CONDITION_KINDS, isLang, type Lang } from "./languages.ts";
import type { Condition, ConditionKind, Draft } from "./types.ts";

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

// The manager may edit labels, the question and which conditions are checked,
// and may add a condition by hand (no evidence). AI-extracted evidence must
// still be a verbatim part of the source.
export function reviewedDraft(value: unknown, source: string): Draft {
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
  return {
    title: field(draft.title, "공지 제목", 200),
    conditions: reviewed,
    question: field(draft.question, "상황 질문", 500),
    questionReason: typeof draft.questionReason === "string" ? draft.questionReason.trim().slice(0, 500) : "",
  };
}

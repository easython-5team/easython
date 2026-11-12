import "server-only";
// Development stand-in for the AI when OPENAI_API_KEY is not set. It builds
// answers from the manager's own sentences so every screen can be exercised;
// nothing here is translated or judged for real.
//
// Worker answers are judged by simple rules so each state can be reached:
//   contains "?"                     → question the notice cannot answer (sent to manager)
//   contains 아니 / no / không        → conflict (re-explanation)
//   shorter than 6 characters        → missing (one follow-up question)
//   anything else                    → every checked condition met
import { LANGUAGES, WORKER_LANGS, type Lang } from "../../shared/languages.ts";
import { datedTitle } from "../../shared/title.ts";
import type { QuestionRequest } from "./tasks.ts";
import type {
  AddendumTranslations, Condition, ConditionKind, Draft, JudgeContext, Question, RawAssessment, Translation, Verdict,
} from "../../shared/types.ts";

const tag = (lang: Lang) => `[${LANGUAGES[lang].native}] `;

function sentences(source: string): string[] {
  return source.split(/\n+|(?<=[.!?。])\s+/).map(s => s.trim()).filter(s => s && !/^\[.*\]$/.test(s));
}

function kindOf(sentence: string): ConditionKind {
  if (/말고|금지|하지 마|않/.test(sentence)) return "prohibition";
  if (/\d+\s*시|부터|까지|오전|오후|내일|오늘/.test(sentence)) return "time";
  if (/예외|단,|다만/.test(sentence)) return "exception";
  if (/에서|앞|층|현장|옥상|창고/.test(sentence)) return "place";
  return "action";
}

export async function analyzeNotice(source: string): Promise<Draft> {
  const bracket = /\[([^\]]+)\]/.exec(source)?.[1]?.trim();
  const parts = sentences(source).slice(0, 6);
  const conditions: Condition[] = (parts.length ? parts : [source.trim()]).map((sentence, i) => ({
    id: "c" + (i + 1), kind: kindOf(sentence), label: sentence, evidence: sentence, check: false,
  }));
  const firstProhibition = conditions.find(c => c.kind === "prohibition") ?? conditions[0];
  if (firstProhibition) firstProhibition.check = true;
  return {
    title: datedTitle(bracket ?? (parts[0] ?? source).slice(0, 20)),
    conditions,
    questions: [],
  };
}

// One question per checked condition in turn, repeating when more are asked for.
export async function writeQuestions(_source: string, draft: Draft, { type, count }: QuestionRequest): Promise<Question[]> {
  const checked = draft.conditions.filter(c => c.check);
  return Array.from({ length: count }, (_, i): Question => {
    const c = checked[i % checked.length];
    const label = c?.label ?? "";
    return {
      id: "q" + (i + 1), type, conditionIds: c ? [c.id] : [],
      text: type === "short" ? `‘${label}’ — 그래서 무엇을 하나요? 짧게 답해 주세요.` : `‘${label}’ — 이 변경 사항이 적용되면 무엇을 어떻게 하겠어요?`,
      answer: type === "short" ? label.slice(0, 20) : "",
      reason: "개발용 가짜 AI가 만든 질문이에요. OPENAI_API_KEY를 설정하면 실제 AI가 만들어요.",
    };
  });
}

export async function translateNotice(source: string, draft: Draft, lang: Lang): Promise<Translation> {
  return {
    title: tag(lang) + draft.title,
    summary: tag(lang) + source.trim(),
    questions: draft.questions.map(q => ({ id: q.id, text: tag(lang) + q.text })),
    conditions: draft.conditions.map(c => ({ id: c.id, text: tag(lang) + c.label })),
    backTranslation: draft.conditions.map(c => c.label).join("\n"),
    checks: draft.conditions.map(c => ({ id: c.id, preserved: true, note: "" })),
  };
}

export async function judge({ question, answer }: JudgeContext): Promise<Verdict> {
  const checked = question.conditionIds;
  const each = (status: string, quote: string): RawAssessment[] => checked.map(id => ({ id, status, quote }));
  const text = answer.trim();
  if (text.includes("?")) {
    return { intent: "question", inputKo: text, conditions: each("missing", ""), answerable: false, reply: "", followup: "" };
  }
  if (/아니|\bno\b|không/i.test(text)) {
    return { intent: "action", inputKo: text, conditions: each("conflict", text), answerable: false, reply: "", followup: "" };
  }
  if (text.length < 6) {
    return { intent: "action", inputKo: text, conditions: each("missing", ""), answerable: false, reply: "", followup: "" };
  }
  return { intent: "action", inputKo: text, conditions: each("met", text), answerable: false, reply: "", followup: "" };
}

export async function translateAddendum({ questionKo, answerKo }: { questionKo: string; answerKo: string }): Promise<AddendumTranslations> {
  return Object.fromEntries(
    WORKER_LANGS.map(lang => [lang, { question: tag(lang) + questionKo, answer: tag(lang) + answerKo }]),
  ) as AddendumTranslations;
}

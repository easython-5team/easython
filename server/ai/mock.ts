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
import type {
  AddendumTranslations, Condition, ConditionKind, Draft, JudgeContext, RawAssessment, Translation, Verdict,
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
    title: bracket ?? (parts[0] ?? source).slice(0, 30),
    conditions,
    question: "이 변경 사항이 적용되면 지금 무엇을 하겠어요?",
    questionReason: "개발용 가짜 AI가 만든 기본 질문이에요. OPENAI_API_KEY를 설정하면 실제 AI가 만들어요.",
  };
}

export async function translateNotice(source: string, draft: Draft, lang: Lang): Promise<Translation> {
  return {
    title: tag(lang) + draft.title,
    summary: tag(lang) + source.trim(),
    question: tag(lang) + draft.question,
    conditions: draft.conditions.map(c => ({ id: c.id, text: tag(lang) + c.label })),
    backTranslation: draft.conditions.map(c => c.label).join("\n"),
    checks: draft.conditions.map(c => ({ id: c.id, preserved: true, note: "" })),
  };
}

export async function judge({ notice, answer }: JudgeContext): Promise<Verdict> {
  const checked = notice.draft.conditions.filter(c => c.check).map(c => c.id);
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

// Deterministic layer between the model and the worker. The model proposes a
// per-condition assessment; this module checks the claims against what the
// worker actually said and alone decides the conversation state.
import type { WorkerText } from "./languages.ts";
import type { Assessed, CheckStatus, RawAssessment, Turn, TurnState, Verdict } from "./types.ts";

export const TERMINAL_STATES: ReadonlySet<TurnState> = new Set(["understood", "guidance"]);
export const MAX_TURNS = 6;
const STATUSES: ReadonlySet<string> = new Set<CheckStatus>(["met", "missing", "conflict"]);

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function normalize(text: string): string {
  return String(text).normalize("NFC").toLowerCase()
    .replace(/[’‘`]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();
}

// A "met" or "conflict" claim must quote the worker. A claim whose quote is
// not in the worker's own words is treated as not demonstrated ("missing"),
// so a hallucinated match can never produce "Understanding confirmed".
export function verifyAssessment(raw: unknown, checkedIds: string[], answers: string[]): Assessed[] {
  const said = normalize(answers.join("\n"));
  const byId = new Map<string, Partial<RawAssessment>>();
  for (const item of Array.isArray(raw) ? (raw as Partial<RawAssessment>[]) : []) {
    if (typeof item?.id === "string" && checkedIds.includes(item.id) && !byId.has(item.id)) byId.set(item.id, item);
  }
  return checkedIds.map((id): Assessed => {
    const item = byId.get(id);
    const quote = hasText(item?.quote) ? item.quote.trim().replace(/^["'“‘]|["'”’]$/g, "") : "";
    const claimed = typeof item?.status === "string" && STATUSES.has(item.status) ? (item.status as CheckStatus) : "missing";
    const grounded = claimed === "missing" || (quote !== "" && said.includes(normalize(quote)));
    return grounded ? { id, status: claimed, quote: claimed === "missing" ? "" : quote }
      : { id, status: "missing", quote: "", rejected: claimed };
  });
}

// A later explicit statement overrides an earlier one (corrections count);
// silence about a condition keeps what the worker already said.
export function mergeAssessment(prior: Assessed[] | undefined, current: Assessed[]): Assessed[] {
  const before = new Map((prior ?? []).map(item => [item.id, item]));
  return current.map(item => {
    const previous = before.get(item.id);
    return item.status === "missing" && previous && previous.status !== "missing" ? previous : item;
  });
}

export interface Decision {
  state: TurnState;
  message: string;
  escalate?: true;
}

type DecisionText = Pick<WorkerText, "managerSent" | "guidanceLead" | "doneUnderstood" | "followupFallback">;

export function decide({ verdict, assessment, history, text, conditionText }: {
  verdict: Pick<Verdict, "intent" | "answerable" | "reply" | "followup">;
  assessment: Pick<Assessed, "id" | "status">[];
  history: Pick<Turn, "state">[];
  text: DecisionText;
  conditionText: (id: string) => string;
}): Decision {
  if (verdict.intent === "question") {
    if (verdict.answerable && hasText(verdict.reply)) return { state: "answered", message: verdict.reply.trim() };
    return { state: "manager", message: text.managerSent, escalate: true };
  }
  const bullets = (items: { id: string }[]) => items.map(item => "• " + conditionText(item.id)).join("\n");
  const conflicts = assessment.filter(item => item.status === "conflict");
  if (conflicts.length) {
    const lead = hasText(verdict.reply) ? verdict.reply.trim() : text.guidanceLead;
    return { state: "guidance", message: lead + "\n" + bullets(conflicts) };
  }
  const missing = assessment.filter(item => item.status === "missing");
  if (!missing.length) {
    return { state: "understood", message: hasText(verdict.reply) ? verdict.reply.trim() : text.doneUnderstood };
  }
  if (history.some(turn => turn.state === "followup")) {
    return { state: "guidance", message: text.guidanceLead + "\n" + bullets(missing) };
  }
  return {
    state: "followup",
    message: hasText(verdict.followup) ? verdict.followup.trim() : text.followupFallback + "\n" + bullets(missing.slice(0, 1)),
  };
}

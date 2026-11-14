import "server-only";
// Every API action, its input validation and its response type. The route
// handler dispatches here; the client derives response types from this map.
import { invalid } from "./errors.ts";
import { field, language, questionCount, questionType, reviewedDraft } from "./input.ts";
import {
  analyze, dashboardView, join, noticeFor, preview, publish, question, resolve, respond, sessionView,
} from "./workflow.ts";

type Body = Record<string, unknown>;
const id = (value: unknown, label = "ID") => field(value, label, 100);

export const actions = {
  // manager
  analyze: async (body: Body) => ({ draft: await analyze(field(body.source, "한국어 원문")) }),
  question: async (body: Body) => {
    const source = field(body.source, "한국어 원문");
    const draft = reviewedDraft(body.draft, source, { needQuestions: false });
    return { draft: await question(source, draft, { type: questionType(body.type), count: questionCount(body.count) }) };
  },
  preview: async (body: Body) => {
    const source = field(body.source, "한국어 원문");
    return preview(source, reviewedDraft(body.draft, source, { needQuestions: true }));
  },
  publish: async (body: Body) => ({ id: publish(id(body.previewId, "미리보기 ID"), body.acceptMismatch === true) }),
  dashboard: async (body: Body) => dashboardView(id(body.id)),
  resolve: async (body: Body) => resolve(id(body.id), id(body.escalationId), field(body.answer, "관리자 답변", 2000)),
  // worker
  notice: async (body: Body) => noticeFor(id(body.id), language(body.lang)),
  join: async (body: Body) => ({ sessionId: join(id(body.id), field(body.name, "Name", 40), language(body.lang)) }),
  session: async (body: Body) => sessionView(id(body.id), id(body.sessionId)),
  respond: async (body: Body) => {
    if (typeof body.turn !== "number" || !Number.isSafeInteger(body.turn) || body.turn < 0) throw invalid("Invalid turn.");
    return respond({
      noticeId: id(body.id), sessionId: id(body.sessionId), turn: body.turn,
      answer: field(body.answer, "Answer", 1000), mode: body.mode === "voice" ? "voice" : "text",
    });
  },
} satisfies Record<string, (body: Body) => Promise<unknown>>;

export type Action = keyof typeof actions;
/** Response payload of each action, shared with the client in components/request.ts. */
export type ActionResult<A extends Action> = Awaited<ReturnType<(typeof actions)[A]>>;

export function isAction(value: string): value is Action {
  return Object.hasOwn(actions, value);
}

export type { Body };

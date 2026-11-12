import * as live from "../../../lib/ai.js";
import * as demo from "../../../lib/demo.js";
import { respond } from "../../../lib/respond.js";
import { publishReviewed, englishNotice } from "../../../lib/store.js";
import { field, invalid, reviewedDraft } from "../../../lib/input.js";

export const runtime = "nodejs";

async function run(action, body) {
  const { generateDraft, judge, translateNotice } = process.env.EASYTHON_DEMO === "1" ? demo : live;
  switch (action) {
    case "draft": {
      const source = field(body.source, "한국어 원문");
      return { draft: await generateDraft(source) };
    }
    case "publish": {
      const source = field(body.source, "한국어 원문");
      const draft = reviewedDraft(body.draft);
      return { id: publishReviewed(field(body.publicationKey, "발행 ID", 100), source, draft) };
    }
    case "english":
      return englishNotice(field(body.id, "Notice ID", 100), translateNotice);
    case "respond": {
      if (!Number.isSafeInteger(body.turn) || body.turn < 0) throw invalid("Invalid turn.");
      return respond({
        id: field(body.id, "Notice ID", 100),
        sessionId: field(body.sessionId, "Session ID", 100),
        turn: body.turn,
        answer: field(body.answer, "Answer", 3000),
      }, judge);
    }
    default:
      throw Object.assign(new Error("페이지를 찾을 수 없습니다."), { status: 404 });
  }
}

export async function POST(request, { params }) {
  const { action } = await params;
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin &&
        new URL(origin).host !== request.headers.get("host")) {
      return Response.json({ error: "요청 출처를 확인해 주세요." }, { status: 403 });
    }
    if (!request.headers.get("content-type")?.startsWith("application/json")) {
      throw invalid("JSON 형식으로 요청해 주세요.");
    }
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw invalid("Invalid request.");
    return Response.json(await run(action, body));
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 500;
    const message = error.status ? error.message : "요청 처리 중 오류가 발생했습니다.";
    return Response.json({ error: message }, { status });
  }
}

import * as live from "../../../lib/ai.ts";
import * as demo from "../../../lib/demo.ts";
import { respond } from "../../../lib/respond.ts";
import { createWorkflow, getWorkflow, updateWorkflowSource, saveWorkflowPreview, publishWorkflow } from "../../../lib/store.ts";
import { field, invalid, reviewedDraft, reviewedPreview } from "../../../lib/input.ts";

export const runtime = "nodejs";

async function run(action: string, body: Record<string, unknown>) {
  const { generateDraft, judge, translateNotice } = process.env.EASYTHON_DEMO === "1" ? demo : live;
  switch (action) {
    case "draft": {
      const source = field(body.source, "한국어 원문");
      const draft = await generateDraft(source);
      return { id: createWorkflow(source, draft), draft };
    }
    case "revise-source": {
      const id = field(body.id, "작성 ID", 100);
      if (typeof body.revision !== 'number' || !Number.isSafeInteger(body.revision)) throw invalid("작성 버전을 확인해 주세요.");
      const current = getWorkflow(id);
      if (!current || current.revision !== body.revision || current.publicId) {
        throw Object.assign(new Error("작성 내용이 변경되었거나 이미 발행되었습니다. 페이지를 새로고침해 주세요."), { status: 409 });
      }
      const source = field(body.source, "한국어 원문");
      const draft = await generateDraft(source);
      return { id, revision: updateWorkflowSource(id, body.revision, source, draft), draft };
    }
    case "preview": {
      if (body.reviewed !== true) throw invalid("퀴즈의 질문·판단 기준·원문 근거를 검수해 주세요.");
      const id = field(body.id, "작성 ID", 100);
      const workflow = getWorkflow(id);
      if (!workflow) throw Object.assign(new Error("작성 중인 공지를 찾을 수 없습니다."), { status: 404 });
      if (typeof body.revision !== 'number' || !Number.isSafeInteger(body.revision) || body.revision !== workflow.revision || workflow.publicId) {
        throw Object.assign(new Error("작성 내용이 변경되었습니다. 페이지를 새로고침해 주세요."), { status: 409 });
      }
      const draft = reviewedDraft(body.draft);
      const preview = await translateNotice(workflow.source, draft.question);
      return { ...saveWorkflowPreview(id, workflow.revision, draft, preview), preview };
    }
    case "publish": {
      const id = field(body.id, "작성 ID", 100);
      if (typeof body.revision !== 'number' || !Number.isSafeInteger(body.revision)) throw invalid("미리보기 버전을 확인해 주세요.");
      return { id: publishWorkflow(id, body.revision, reviewedPreview(body.preview)) };
    }
    case "respond": {
      if (typeof body.turn !== 'number' || !Number.isSafeInteger(body.turn) || body.turn < 0) throw invalid("Invalid turn.");
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

export async function POST(request: Request, { params }: { params: Promise<{ action: string }> }) {
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
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw invalid("Invalid request.");
    return Response.json(await run(action, body as Record<string, unknown>));
  } catch (error) {
    const known = error instanceof Error && 'status' in error ? error as Error & { status: number } : null;
    const status = known && Number.isInteger(known.status) ? known.status : 500;
    const message = known ? known.message : "요청 처리 중 오류가 발생했습니다.";
    return Response.json({ error: message }, { status });
  }
}

import { actions, isAction, type Action, type Body } from "../../../server/actions.ts";
import { HttpError, invalid } from "../../../server/errors.ts";

export const runtime = "nodejs";

// Public worker actions that call the AI are limited per client address.
const limited: Partial<Record<Action, number>> = { join: 20, respond: 20 };
const hits = new Map<string, number[]>();
function rateLimited(action: Action, request: Request): boolean {
  const limit = limited[action];
  if (!limit) return false;
  const client = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const key = action + ":" + client;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter(time => now - time < 60_000);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > limit;
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = new URL(origin).host;
  return [new URL(request.url).host, request.headers.get("host"), request.headers.get("x-forwarded-host")].includes(host);
}

export async function POST(request: Request, { params }: { params: Promise<{ action: string }> }): Promise<Response> {
  const { action } = await params;
  try {
    if (!isAction(action)) throw new HttpError(404, "페이지를 찾을 수 없습니다.");
    if (!sameOrigin(request)) return Response.json({ error: "요청 출처를 확인해 주세요." }, { status: 403 });
    if (rateLimited(action, request)) return Response.json({ error: "Too many requests. Please wait a minute." }, { status: 429 });
    if (!request.headers.get("content-type")?.startsWith("application/json")) {
      throw invalid("JSON 형식으로 요청해 주세요.");
    }
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw invalid("Invalid request.");
    return Response.json(await actions[action](body as Body));
  } catch (error) {
    if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status });
    console.error(error);
    return Response.json({ error: "요청 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}

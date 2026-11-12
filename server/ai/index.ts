import "server-only";
// Picks the real AI or, in development without OPENAI_API_KEY, the stand-in
// in mock.ts. Production always uses the real AI so a missing key fails loudly.
import * as mock from "./mock.ts";
import * as live from "./tasks.ts";

type Engine = Pick<typeof live, "analyzeNotice" | "translateNotice" | "judge" | "translateAddendum">;

let warned = false;
function engine(): Engine {
  const useMock = !process.env.OPENAI_API_KEY?.trim() && process.env.NODE_ENV !== "production";
  if (useMock && !warned) {
    warned = true;
    console.warn("[ai] OPENAI_API_KEY가 없어 개발용 가짜 AI(server/ai/mock.ts)를 사용합니다.");
  }
  const chosen: Engine = useMock ? mock : live;
  return chosen;
}

export const analyzeNotice: typeof live.analyzeNotice = source => engine().analyzeNotice(source);
export const translateNotice: typeof live.translateNotice = (source, draft, lang) => engine().translateNotice(source, draft, lang);
export const judge: typeof live.judge = context => engine().judge(context);
export const translateAddendum: typeof live.translateAddendum = input => engine().translateAddendum(input);

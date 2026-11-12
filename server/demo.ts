import "server-only";
// Keyless demo engine. Same interface as lib/ai.js, backed by a scripted
// rooftop-wind scenario in English and Vietnamese so the team can rehearse
// and design screens without an API key. Storage, sessions, escalations and
// the deterministic decision layer are the real ones.
import { HttpError } from "./errors.ts";
import type { Lang } from "../shared/languages.ts";
import type { AddendumTranslations, Draft, JudgeContext, RawAssessment, Translation, Verdict } from "../shared/types.ts";

export const demoNotice = `[강풍 대비 옥상 작업 중단 안내]

강풍이 예상되어 오늘 오후 2시부터 옥상 작업을 모두 중단합니다. 공구와 남은 자재는 정리하지 말고 옥상에 그대로 두고 내려오세요. 내려온 뒤에는 1층 현장 사무실 앞에 모여 인원 확인을 받으세요.`;

export const demoManagerAnswer = "내일 오전 8시 안전 점검을 마친 뒤 재개 여부를 단체톡으로 알려 드립니다. 그 전에는 옥상에 올라가지 마세요.";

const draft: Draft = {
  title: "강풍 대비 옥상 작업 중단",
  conditions: [
    { id: "c1", kind: "time", label: "오늘 오후 2시부터 적용한다.", evidence: "오늘 오후 2시부터", check: false },
    { id: "c2", kind: "action", label: "옥상 작업을 모두 중단한다.", evidence: "옥상 작업을 모두 중단합니다", check: false },
    { id: "c3", kind: "prohibition", label: "공구와 남은 자재를 정리하지 말고 옥상에 그대로 둔다.", evidence: "공구와 남은 자재는 정리하지 말고 옥상에 그대로 두고", check: true },
    { id: "c4", kind: "action", label: "옥상에서 바로 내려온다.", evidence: "그대로 두고 내려오세요", check: true },
    { id: "c5", kind: "place", label: "1층 현장 사무실 앞에 모여 인원 확인을 받는다.", evidence: "1층 현장 사무실 앞에 모여 인원 확인을 받으세요", check: false },
  ],
  question: "오후 2시, 옥상에서 공구를 쓰던 중이라면 바로 무엇을 하겠어요?",
  questionReason: "평소처럼 공구를 정리해 챙겨 내려오는 습관이 드러나도록, '정리하지 않고 그대로 두고 내려온다'는 변경점을 작업자가 직접 말하게 하는 질문이에요.",
};

const backTranslation = `[강풍으로 옥상 작업 중단]

강한 바람이 예상되어 오늘 오후 2시부터 옥상의 모든 작업을 멈춥니다. 공구와 남은 자재를 정리하지 마세요. 옥상에 있는 그대로 두고 내려오세요. 내려온 뒤 1층 현장 사무실 앞에 모여 인원 점검을 받으세요.`;

type DemoText = Omit<Translation, "conditions" | "backTranslation" | "checks"> & { conditions: Record<string, string> };

const translations: Record<Lang, DemoText> = {
  en: {
    title: "Rooftop work stopped due to strong wind",
    summary: `[Rooftop work stopped due to strong wind]

Strong wind is expected, so all rooftop work stops from 2 PM today. Do not tidy up the tools and leftover materials. Leave them on the roof as they are and come down. After you come down, gather in front of the site office on the 1st floor for a headcount.`,
    conditions: {
      c1: "Applies from 2 PM today.",
      c2: "Stop all rooftop work.",
      c3: "Do not tidy up tools and leftover materials. Leave them on the roof as they are.",
      c4: "Come down from the roof right away.",
      c5: "Gather in front of the 1st-floor site office for a headcount.",
    },
    question: "At 2 PM you are using tools on the roof. What will you do right away?",
  },
  vi: {
    title: "Dừng làm việc trên mái do gió mạnh",
    summary: `[Dừng làm việc trên mái do gió mạnh]

Dự báo có gió mạnh, vì vậy từ 2 giờ chiều nay dừng toàn bộ công việc trên mái. Không dọn dẹp dụng cụ và vật liệu còn lại. Hãy để nguyên chúng trên mái và đi xuống. Sau khi xuống, hãy tập trung trước văn phòng công trường ở tầng 1 để điểm danh.`,
    conditions: {
      c1: "Áp dụng từ 2 giờ chiều nay.",
      c2: "Dừng toàn bộ công việc trên mái.",
      c3: "Không dọn dẹp dụng cụ và vật liệu còn lại. Để nguyên chúng trên mái.",
      c4: "Đi xuống khỏi mái ngay.",
      c5: "Tập trung trước văn phòng công trường tầng 1 để điểm danh.",
    },
    question: "Lúc 2 giờ chiều, bạn đang dùng dụng cụ trên mái. Bạn sẽ làm gì ngay lúc đó?",
  },
};

function demoError(message: string): HttpError {
  return new HttpError(400, message);
}

export function analyzeNotice(source: string): Draft {
  if (source.replace(/\r\n/g, "\n").trim() !== demoNotice) {
    throw demoError("데모 모드에서는 ‘예시 불러오기’로 옥상 작업 중단 공지를 사용해 주세요.");
  }
  return structuredClone(draft);
}

// Edited wording cannot be translated without the AI, so the demo returns it
// untranslated and flags it, which also exercises the "check failed" review UI.
export function translateNotice(_source: string, reviewed: Draft, lang: Lang): Translation {
  const base = translations[lang];
  const original = new Map(draft.conditions.map(c => [c.id, c.label]));
  const checks: Translation["checks"] = [];
  const conditions = reviewed.conditions.map(c => {
    const same = original.get(c.id) === c.label ? base.conditions[c.id] : undefined;
    checks.push({ id: c.id, preserved: Boolean(same), note: same ? "" : "데모 모드에서는 수정한 문장을 번역하지 않아요. 일반 모드에서 확인하세요." });
    return { id: c.id, text: same ?? c.label };
  });
  return {
    title: base.title, summary: base.summary, conditions,
    question: reviewed.question === draft.question ? base.question : reviewed.question,
    backTranslation, checks,
  };
}

const koreanOf = new Map<string, string>(Object.entries({
  "i'll go downstairs": "아래로 내려가겠습니다.",
  "i'll leave them there": "그것들은 거기 그대로 두겠습니다.",
  "i'll take the tools with me and go down": "공구를 챙겨서 내려가겠습니다.",
  "can we restart tomorrow morning?": "내일 아침에 작업을 다시 시작해도 되나요?",
  "where should we gather?": "어디에 모여야 하나요?",
  "tôi sẽ đi xuống": "내려가겠습니다.",
  "tôi sẽ để nguyên dụng cụ ở đó": "공구를 거기 그대로 두겠습니다.",
  "tôi sẽ mang dụng cụ theo rồi đi xuống": "공구를 가지고 내려가겠습니다.",
  "sáng mai có được làm lại không?": "내일 아침에 다시 작업해도 되나요?",
}));
function key(text: string): string {
  return text.normalize("NFC").toLowerCase().replace(/[’']/g, "'").replace(/[.!]+$/, "").trim();
}

interface Patterns { leave: RegExp; take: RegExp; down: RegExp; question: RegExp; restart: RegExp; gather: RegExp }
const patterns: Record<Lang, Patterns> = {
  en: {
    leave: /\b(leave|leaving)\b[^.?!]*|\b(don't|do not|won't|will not|not)\s+(tidy|clean|pack|take|touch|bring|move)[^.?!]*/i,
    take: /\b(take|bring|carry|pack|tidy|clean|collect|put away)\b[^.?!]*/i,
    down: /\b(go|come|get|head|climb|walk)(ing)?\s+(down|downstairs)\b|\bdownstairs\b/i,
    question: /\?\s*$|^(can|may|should|when|where|what|is|do|does|will)\b/i,
    restart: /tomorrow|restart|resume|start again/i,
    gather: /gather|meet|where.*go|office|headcount/i,
  },
  vi: {
    leave: /để (nguyên|lại|yên)[^.?!]*|không (dọn|mang|cất|thu|lấy)[^.?!]*/i,
    take: /(mang|dọn|cất|thu|lấy)[^.?!]*/i,
    down: /(đi |leo )?xuống/i,
    question: /\?\s*$|(có được|được không|khi nào|ở đâu)/i,
    restart: /ngày mai|sáng mai|làm lại|tiếp tục/i,
    gather: /tập trung|ở đâu|văn phòng|điểm danh/i,
  },
};
const replies: Record<Lang, { understood: string; conflict: string; restate: string; followup: Record<string, string> }> = {
  en: {
    understood: "Correct. Leave the tools as they are and come down right away.",
    conflict: "Do not take or tidy up the tools. The notice says to leave them on the roof.",
    restate: "The notice says to leave the tools as they are and come down.",
    followup: { c3: "What will you do with the tools you are using?", c4: "And then, where will you go?" },
  },
  vi: {
    understood: "Đúng rồi. Để nguyên dụng cụ và đi xuống ngay.",
    conflict: "Không mang theo hoặc dọn dẹp dụng cụ. Thông báo yêu cầu để nguyên chúng trên mái.",
    restate: "Thông báo yêu cầu để nguyên dụng cụ và đi xuống.",
    followup: { c3: "Bạn sẽ làm gì với dụng cụ đang dùng?", c4: "Sau đó bạn sẽ đi đâu?" },
  },
};

type Found = Pick<RawAssessment, "status" | "quote">;

function assess(p: Patterns, text: string): Record<string, Found | null> {
  const leave = text.match(p.leave);
  const take = !leave && text.match(p.take);
  const down = text.match(p.down);
  return {
    c3: leave ? { status: "met", quote: leave[0] } : take ? { status: "conflict", quote: take[0] } : null,
    c4: down ? { status: "met", quote: down[0] } : null,
  };
}

export function judge({ notice, lang, history, answer }: JudgeContext): Verdict {
  const p = patterns[lang];
  const r = replies[lang];
  const inputKo = koreanOf.get(key(answer)) ?? "(데모: 번역 생략) " + answer;
  const checked = notice.draft.conditions.filter(c => c.check).map(c => c.id);
  if (p.question.test(answer.trim())) {
    const missing = checked.map(id => ({ id, status: "missing", quote: "" }));
    const addendum = notice.addenda.at(-1);
    if (p.restart.test(answer) && addendum) {
      return { intent: "question", inputKo, conditions: missing, answerable: true, reply: addendum.translations[lang].answer, followup: "" };
    }
    if (p.gather.test(answer) && !p.restart.test(answer)) {
      return { intent: "question", inputKo, conditions: missing, answerable: true, reply: translations[lang].conditions.c5 ?? "", followup: "" };
    }
    return { intent: "question", inputKo, conditions: missing, answerable: false, reply: "", followup: "" };
  }
  // Like the live model, judge the whole conversation: earlier answers count
  // unless the latest answer says something about the same condition.
  const found: Record<string, Found> = {};
  for (const text of [...history.map(t => t.answer), answer]) {
    for (const [id, result] of Object.entries(assess(p, text))) if (result) found[id] = result;
  }
  const conditions = checked.map(id => ({ id, status: found[id]?.status ?? "missing", quote: found[id]?.quote ?? "" }));
  const conflict = conditions.some(c => c.status === "conflict");
  const missing = conditions.filter(c => c.status === "missing");
  return {
    intent: "action", inputKo, conditions, answerable: false,
    reply: conflict ? r.conflict : missing.length ? r.restate : r.understood,
    followup: !conflict && missing[0] ? r.followup[missing[0].id] ?? "" : "",
  };
}

const addendumTranslations: AddendumTranslations = {
  en: {
    question: "Can we restart rooftop work tomorrow morning?",
    answer: "After the safety check at 8 AM tomorrow, we will announce in the group chat whether work can restart. Do not go up to the roof before then.",
  },
  vi: {
    question: "Sáng mai có được làm lại việc trên mái không?",
    answer: "Sau khi kiểm tra an toàn lúc 8 giờ sáng mai, chúng tôi sẽ thông báo trong nhóm chat việc có được làm lại hay không. Trước đó không được lên mái.",
  },
};

export function translateAddendum({ questionKo, answerKo }: { questionKo: string; answerKo: string }): AddendumTranslations {
  if (answerKo.trim() === demoManagerAnswer) return structuredClone(addendumTranslations);
  const note = "(demo) ";
  return {
    en: { question: note + questionKo, answer: note + answerKo },
    vi: { question: note + questionKo, answer: note + answerKo },
  };
}

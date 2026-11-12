export const materialNotice = `[내일 오전 1층 자재 반입 장소 변경 안내]

내일 오전 8시부터 낮 12시까지 1층 동쪽 출입구의 바닥을 보수합니다. 이 시간에 도착하는 자재는 모두 서쪽 출입구로 반입해 1층 자재실 앞 노란색 표시 구역에 놓아 주세요. 자재를 내려놓은 뒤에는 운반 대차를 표시 구역 옆 대차 보관소에 반납해 주세요.

이미 동쪽 출입구에 도착한 경우에도 그곳에서 자재를 내리지 말고, 건물 바깥쪽 통로를 따라 서쪽 출입구로 이동해 주세요. 배송 기사님이 예전 안내를 보고 동쪽으로 오시면 짐을 내리기 전에 서쪽 출입구 위치를 알려 주세요.

작업은 낮 12시에 끝날 예정입니다. 다만 바닥이 마르는 데 시간이 더 걸릴 수 있으니, 12시가 지나도 현장 단체톡에 ‘동쪽 출입구 사용 가능’ 공지가 올라올 때까지는 서쪽 출입구를 계속 이용해 주세요.`;

const question = "내일 오전 9시에 자재가 도착하면 어느 출입구로 반입하고 어디에 놓겠어요?";
const rubric = "서쪽 출입구로 반입해 1층 자재실 앞 노란색 표시 구역에 놓는지 확인합니다.";
const summary = `[First-floor material deliveries tomorrow morning]

The floor at the first-floor east entrance will be repaired tomorrow from 8 AM to noon. Bring all deliveries through the west entrance and leave the materials in the yellow marked area in front of the first-floor materials room. After unloading, return the cart to the cart storage area beside the marked area.

If you have already arrived at the east entrance, do not unload there. Follow the outside path to the west entrance. If a driver follows the old instructions to the east entrance, show them where the west entrance is before they unload.

The work is scheduled to finish at noon. The floor may need more time to dry. Even after noon, keep using the west entrance until the site group chat announces that the east entrance is available.`;

export function generateDraft(source) {
  if (source.replace(/\r\n/g, "\n") !== materialNotice) {
    throw Object.assign(new Error("데모에서는 ‘예시 불러오기’로 자재 반입 공지를 선택해 주세요."), { status: 400 });
  }
  return { question, rubric, evidence: ["서쪽 출입구로 반입해 1층 자재실 앞 노란색 표시 구역에 놓아 주세요."] };
}

export function translateNotice(_source, reviewedQuestion) {
  return { summary, question: reviewedQuestion === question
    ? "A delivery arrives at 9 AM tomorrow. Which entrance will you use and where will you leave the materials?"
    : reviewedQuestion };
}

// Only recognize scripted replies. Unrecognized text exercises the clarification flow.
function replyKey(text) {
  return text.toLowerCase().replace(/[’']/g, "'").replace(/[.!]$/, "").trim();
}

export function judge({ draft, history, answer }) {
  if (draft.question !== question || draft.rubric !== rubric) {
    return { kind: "unsupported", message: "This edited quiz needs manager confirmation in demo mode." };
  }
  const replies = [...history.map(turn => turn.answer), answer].map(replyKey);
  const west = replies.includes("i'll use the west entrance");
  const yellow = replies.includes("in the yellow marked area in front of the first-floor materials room");
  if (west && yellow) return { kind: "correct", message: "Correct. Use the west entrance and leave the materials in the marked area." };
  return { kind: "ambiguous", message: "Use the west entrance and the designated yellow area.", followup: west
    ? "Where exactly will you leave the materials?"
    : "Which entrance will you use to bring the materials in?" };
}

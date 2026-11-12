export function invalid(message) {
  return Object.assign(new Error(message), { status: 400 });
}

export function field(value, label, max = 6000) {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw invalid(`${label} 입력을 확인해 주세요. 최대 ${max}자입니다.`);
  }
  return value.trim();
}

export function reviewedDraft(value) {
  return {
    question: field(value?.question, "상황 질문", 2000),
    rubric: field(value?.rubric, "답변에서 확인할 내용", 2000),
  };
}

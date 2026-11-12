import type { NoticeDraft, WorkerPreview } from './types.ts';

export function invalid(message: string) {
  return Object.assign(new Error(message), { status: 400 });
}

export function field(value: unknown, label: string, max = 6000): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw invalid(`${label} 입력을 확인해 주세요. 최대 ${max}자입니다.`);
  }
  return value.trim();
}

export function reviewedDraft(value: unknown): NoticeDraft {
  const draft = value as Partial<NoticeDraft> | null;
  return {
    question: field(draft?.question, "상황 질문", 2000),
    rubric: field(draft?.rubric, "답변에서 확인할 내용", 2000),
  };
}

export function reviewedPreview(value: unknown): WorkerPreview {
  const preview = value as Partial<WorkerPreview> | null;
  const summary = field(preview?.summary, "영어 공지", 6000);
  const question = field(preview?.question, "영어 상황 질문", 2000);
  // The offline demo intentionally preserves edited Korean quiz text verbatim.
  if (process.env.EASYTHON_DEMO !== "1" && /\p{Script=Hangul}/u.test(summary + question)) {
    throw invalid("작업자용 공지와 질문을 영어로 확인해 주세요.");
  }
  return { summary, question };
}

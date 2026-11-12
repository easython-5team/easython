export type NoticeDraft = {
  question: string;
  rubric: string;
  evidence?: string[];
};

export type WorkerPreview = {
  summary: string;
  question: string;
};

export type Workflow = {
  id: string;
  source: string;
  draft: NoticeDraft;
  preview: WorkerPreview | null;
  previewId: string | null;
  revision: number;
  publicId: string | null;
};

export type VerdictKind = "correct" | "incorrect" | "ambiguous" | "unsupported" | "question";

export type Verdict = {
  kind: VerdictKind;
  message: string;
  followup?: string;
};

export type WorkerState = "followup" | "understood" | "guidance" | "manager" | "answered";

export type WorkerReply = { state: WorkerState; message: string };
export type ResponseRow = WorkerReply & { answer: string };

export type RespondInput = {
  id: string;
  sessionId: string;
  turn: number;
  answer: string;
};

export type JudgmentContext = {
  source: string;
  draft: unknown;
  preview: WorkerPreview | null;
};

export type JudgeInput = JudgmentContext & { history: ResponseRow[]; answer: string };

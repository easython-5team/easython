import type { Lang } from "./languages.ts";

export type { Lang };

export type ConditionKind = "time" | "place" | "action" | "prohibition" | "exception";

export interface Condition {
  id: string;
  kind: ConditionKind;
  label: string;
  /** Verbatim substring of the source; empty for a condition the manager added by hand. */
  evidence: string;
  /** Whether the worker's answer must demonstrate this condition. */
  check: boolean;
}

export interface Draft {
  title: string;
  conditions: Condition[];
  question: string;
  questionReason: string;
}

export interface TranslatedCondition {
  id: string;
  text: string;
}

export interface TranslationCheck {
  id: string;
  preserved: boolean;
  note: string;
}

export interface Translation {
  title: string;
  summary: string;
  question: string;
  conditions: TranslatedCondition[];
  backTranslation: string;
  checks: TranslationCheck[];
}

export type Translations = Record<Lang, Translation>;

export interface QA {
  question: string;
  answer: string;
}

export type AddendumTranslations = Record<Lang, QA>;

export interface Addendum {
  id: string;
  version: number;
  questionKo: string;
  answerKo: string;
  translations: AddendumTranslations;
  createdAt: string;
}

export interface Notice {
  id: string;
  source: string;
  draft: Draft;
  translations: Translations;
  version: number;
  createdAt: string;
  addenda: Addendum[];
}

export type CheckStatus = "met" | "missing" | "conflict";

export interface Assessed {
  id: string;
  status: CheckStatus;
  quote: string;
  /** Set when the model claimed met/conflict without a quote from the worker. */
  rejected?: CheckStatus;
}

export type TurnState = "understood" | "followup" | "guidance" | "answered" | "manager";
export type InputMode = "voice" | "text";

export interface TurnRecord {
  answer: string;
  mode: InputMode;
  state: TurnState;
  message: string;
  assessment: Assessed[];
  inputKo: string;
  version: number;
}

export interface Turn extends TurnRecord {
  turn: number;
  createdAt: string;
}

/** Unverified per-condition claim from the model. */
export interface RawAssessment {
  id: string;
  status: string;
  quote: string;
}

export interface Verdict {
  intent: "action" | "question";
  inputKo: string;
  conditions: RawAssessment[];
  answerable: boolean;
  reply: string;
  followup: string;
}

export interface JudgeContext {
  notice: Notice;
  lang: Lang;
  history: Turn[];
  answer: string;
}

type MaybePromise<T> = T | Promise<T>;

/** Implemented by the live OpenAI engine (lib/ai.ts) and the keyless demo (lib/demo.ts). */
export interface Engine {
  analyzeNotice(source: string): MaybePromise<Draft>;
  translateNotice(source: string, draft: Draft, lang: Lang): MaybePromise<Translation>;
  judge(context: JudgeContext): MaybePromise<Verdict>;
  translateAddendum(input: { questionKo: string; answerKo: string }): MaybePromise<AddendumTranslations>;
}

export interface Session {
  id: string;
  noticeId: string;
  name: string;
  lang: Lang;
  createdAt: string;
}

export interface Escalation {
  id: string;
  noticeId: string;
  sessionId: string;
  turn: number;
  question: string;
  questionKo: string;
  addendumId: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

/* ---------- API payloads ---------- */

export interface WorkerCondition {
  id: string;
  kind: ConditionKind | undefined;
  text: string;
}

export interface WorkerNotice {
  id: string;
  lang: Lang;
  version: number;
  title: string;
  summary: string;
  question: string;
  conditions: WorkerCondition[];
  addenda: Array<QA & { id: string }>;
}

export interface WorkerTurn {
  turn: number;
  answer: string;
  mode: InputMode;
  state: TurnState;
  message: string;
  conditions: Array<{ id: string; status: CheckStatus; text: string }>;
}

export interface SessionView {
  name: string;
  lang: Lang;
  notice: WorkerNotice;
  turns: WorkerTurn[];
  escalations: Array<{ turn: number; answer: string | null }>;
}

export type WorkerStatus = "understood" | "recheck" | "inProgress" | "notAnswered";

export interface DashboardWorker {
  id: string;
  name: string;
  lang: Lang;
  createdAt: string;
  turns: Turn[];
  status: WorkerStatus;
  waiting: boolean;
}

export interface DashboardEscalation extends Escalation {
  name: string;
  lang: Lang | "";
  answerKo: string;
}

export interface DashboardView {
  notice: Notice;
  stats: { joined: number; understood: number; recheck: number; inProgress: number; waiting: number };
  workers: DashboardWorker[];
  escalations: DashboardEscalation[];
}

export interface PreviewResult {
  previewId: string;
  translations: Translations;
}

export interface RecentNotice {
  id: string;
  title: string;
  version: number;
  createdAt: string;
}

import "server-only";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { fail } from "../errors.ts";
import { upgradeDraft, upgradeTranslation } from "../../shared/questions.ts";
import type { Lang } from "../../shared/languages.ts";
import type {
  Addendum, AddendumTranslations, Draft, Escalation, Notice, RecentNotice, Session, Translations, Turn, TurnRecord,
  WorkerNotice,
} from "../../shared/types.ts";

let connection: DatabaseSync | undefined;

function database(): DatabaseSync {
  if (connection) return connection;
  const path = process.env.SQLITE_PATH || resolve("data", "fieldnote.db");
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  try {
    db.exec(`
      PRAGMA busy_timeout = 5000;
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS previews (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        draft TEXT NOT NULL,
        translations TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS notices (
        id TEXT PRIMARY KEY,
        preview_id TEXT NOT NULL UNIQUE REFERENCES previews(id),
        source TEXT NOT NULL,
        draft TEXT NOT NULL,
        translations TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS addenda (
        id TEXT PRIMARY KEY,
        notice_id TEXT NOT NULL REFERENCES notices(id),
        version INTEGER NOT NULL,
        question_ko TEXT NOT NULL,
        answer_ko TEXT NOT NULL,
        translations TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        notice_id TEXT NOT NULL REFERENCES notices(id),
        name TEXT NOT NULL,
        lang TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS turns (
        session_id TEXT NOT NULL REFERENCES sessions(id),
        turn INTEGER NOT NULL,
        question_id TEXT NOT NULL DEFAULT 'q1',
        answer TEXT NOT NULL,
        mode TEXT NOT NULL,
        state TEXT NOT NULL,
        message TEXT NOT NULL,
        assessment TEXT NOT NULL,
        input_ko TEXT NOT NULL,
        notice_version INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (session_id, turn)
      );
      CREATE TABLE IF NOT EXISTS escalations (
        id TEXT PRIMARY KEY,
        notice_id TEXT NOT NULL REFERENCES notices(id),
        session_id TEXT NOT NULL REFERENCES sessions(id),
        turn INTEGER NOT NULL,
        question TEXT NOT NULL,
        question_ko TEXT NOT NULL,
        addendum_id TEXT REFERENCES addenda(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        resolved_at TEXT,
        UNIQUE (session_id, turn)
      );
    `);
    // Databases created before multiple questions lack the column.
    const columns = db.prepare("PRAGMA table_info(turns)").all() as Array<{ name: string }>;
    if (!columns.some(c => c.name === "question_id")) db.exec("ALTER TABLE turns ADD COLUMN question_id TEXT NOT NULL DEFAULT 'q1'");
  } catch (error) {
    db.close();
    throw error;
  }
  connection = db;
  return db;
}

export function closeStore(): void {
  connection?.close();
  connection = undefined;
}

// node:sqlite returns loosely typed rows; each query names its row shape here.
function get<T>(sql: string, ...params: SQLInputValue[]): T | undefined {
  return database().prepare(sql).get(...params) as T | undefined;
}
function all<T>(sql: string, ...params: SQLInputValue[]): T[] {
  return database().prepare(sql).all(...params) as T[];
}
function run(sql: string, ...params: SQLInputValue[]) {
  return database().prepare(sql).run(...params);
}
const parse = <T>(json: string): T => JSON.parse(json) as T;
const parseDraft = (json: string): Draft => upgradeDraft(parse(json));
function parseTranslations(json: string): Translations {
  const stored = parse<Record<Lang, Parameters<typeof upgradeTranslation>[0]>>(json);
  return Object.fromEntries(Object.entries(stored).map(([lang, t]) => [lang, upgradeTranslation(t)])) as Translations;
}

function transaction<T>(work: () => T): T {
  const db = database();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

interface PreviewRow { source: string; draft: string; translations: string }
interface NoticeRow extends PreviewRow { id: string; version: number; created_at: string }
interface AddendumRow { id: string; version: number; question_ko: string; answer_ko: string; translations: string; created_at: string }
interface SessionRow { id: string; notice_id: string; name: string; lang: Lang; created_at: string }
interface TurnRow {
  turn: number; question_id: string; answer: string; mode: Turn["mode"]; state: Turn["state"]; message: string;
  assessment: string; input_ko: string; notice_version: number; created_at: string;
}
interface EscalationRow {
  id: string; notice_id: string; session_id: string; turn: number; question: string; question_ko: string;
  addendum_id: string | null; created_at: string; resolved_at: string | null;
}

export function savePreview({ source, draft, translations }: { source: string; draft: Draft; translations: Translations }): string {
  const id = randomUUID();
  run("INSERT INTO previews (id, source, draft, translations) VALUES (?, ?, ?, ?)",
    id, source, JSON.stringify(draft), JSON.stringify(translations));
  return id;
}

export function getPreview(id: string): { source: string; draft: Draft; translations: Translations } | undefined {
  const row = get<PreviewRow>("SELECT source, draft, translations FROM previews WHERE id = ?", id);
  return row && { source: row.source, draft: parseDraft(row.draft), translations: parseTranslations(row.translations) };
}

// Publishing copies the reviewed preview verbatim: no AI call happens here,
// so workers read exactly what the manager approved. Repeat calls are no-ops.
export function publishPreview(previewId: string): string {
  return transaction(() => {
    const existing = get<{ id: string }>("SELECT id FROM notices WHERE preview_id = ?", previewId);
    if (existing) return existing.id;
    const preview = get<PreviewRow>("SELECT source, draft, translations FROM previews WHERE id = ?", previewId);
    if (!preview) fail(404, "미리보기를 찾을 수 없어요. 미리보기를 다시 생성해 주세요.");
    const id = randomUUID();
    run("INSERT INTO notices (id, preview_id, source, draft, translations) VALUES (?, ?, ?, ?, ?)",
      id, previewId, preview.source, preview.draft, preview.translations);
    return id;
  });
}

function addenda(noticeId: string): Addendum[] {
  return all<AddendumRow>(
    "SELECT id, version, question_ko, answer_ko, translations, created_at FROM addenda WHERE notice_id = ? ORDER BY version",
    noticeId,
  ).map(row => ({
    id: row.id, version: row.version, questionKo: row.question_ko, answerKo: row.answer_ko,
    translations: parse<AddendumTranslations>(row.translations), createdAt: row.created_at,
  }));
}

export function getNotice(id: string): Notice | null {
  const row = get<NoticeRow>("SELECT id, source, draft, translations, version, created_at FROM notices WHERE id = ?", id);
  if (!row) return null;
  return {
    id: row.id, source: row.source, draft: parseDraft(row.draft), translations: parseTranslations(row.translations),
    version: row.version, createdAt: row.created_at, addenda: addenda(id),
  };
}

// What a worker may see: the translated notice only, never the Korean
// evidence, the check flags, or the manager's review metadata.
export function workerNotice(notice: Notice, lang: Lang): WorkerNotice {
  const t = notice.translations[lang];
  const kinds = new Map(notice.draft.conditions.map(c => [c.id, c.kind]));
  const types = new Map(notice.draft.questions.map(q => [q.id, q.type]));
  return {
    id: notice.id, lang, version: notice.version, title: t.title, summary: t.summary,
    questions: t.questions.map(q => ({ ...q, type: types.get(q.id) ?? "open" })),
    conditions: t.conditions.map(c => ({ id: c.id, kind: kinds.get(c.id), text: c.text })),
    addenda: notice.addenda.map(a => ({ id: a.id, ...a.translations[lang] })),
  };
}

export function createSession({ noticeId, name, lang }: { noticeId: string; name: string; lang: Lang }): string {
  const id = randomUUID();
  run("INSERT INTO sessions (id, notice_id, name, lang) VALUES (?, ?, ?, ?)", id, noticeId, name, lang);
  return id;
}

export function getSession(id: string): Session | undefined {
  const row = get<SessionRow>("SELECT id, notice_id, name, lang, created_at FROM sessions WHERE id = ?", id);
  return row && { id: row.id, noticeId: row.notice_id, name: row.name, lang: row.lang, createdAt: row.created_at };
}

function turnRow(row: TurnRow): Turn {
  return {
    turn: row.turn, questionId: row.question_id, answer: row.answer, mode: row.mode, state: row.state, message: row.message,
    assessment: parse<Turn["assessment"]>(row.assessment), inputKo: row.input_ko, version: row.notice_version, createdAt: row.created_at,
  };
}

export function getTurns(sessionId: string): Turn[] {
  return all<TurnRow>("SELECT * FROM turns WHERE session_id = ? ORDER BY turn", sessionId).map(turnRow);
}

// Records the turn and, when needed, the escalation in one transaction so a
// worker is never told "sent to your manager" without a request existing.
export function recordTurn(sessionId: string, turn: number, record: TurnRecord, escalation: { noticeId: string } | null): Turn {
  return transaction(() => {
    const inserted = run(`
      INSERT INTO turns (session_id, turn, question_id, answer, mode, state, message, assessment, input_ko, notice_version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (session_id, turn) DO NOTHING
    `, sessionId, turn, record.questionId, record.answer, record.mode, record.state, record.message,
    JSON.stringify(record.assessment), record.inputKo, record.version);
    if (inserted.changes && escalation) {
      run("INSERT INTO escalations (id, notice_id, session_id, turn, question, question_ko) VALUES (?, ?, ?, ?, ?, ?)",
        randomUUID(), escalation.noticeId, sessionId, turn, record.answer, record.inputKo);
    }
    const saved = get<TurnRow>("SELECT * FROM turns WHERE session_id = ? AND turn = ?", sessionId, turn);
    if (!saved) fail(500, "Turn was not saved.");
    return turnRow(saved);
  });
}

function escalationRow(row: EscalationRow): Escalation {
  return {
    id: row.id, noticeId: row.notice_id, sessionId: row.session_id, turn: row.turn, question: row.question,
    questionKo: row.question_ko, addendumId: row.addendum_id, createdAt: row.created_at, resolvedAt: row.resolved_at,
  };
}

export function sessionEscalations(sessionId: string): Escalation[] {
  return all<EscalationRow>("SELECT * FROM escalations WHERE session_id = ? ORDER BY created_at, turn", sessionId)
    .map(escalationRow);
}

export function getEscalation(id: string): Escalation | undefined {
  const row = get<EscalationRow>("SELECT * FROM escalations WHERE id = ?", id);
  return row && escalationRow(row);
}

// A manager's answer becomes a new notice version that every worker sees
// and that later judgments treat as part of the notice.
export function resolveEscalation({ escalationId, answerKo, questionKo, translations }: {
  escalationId: string; answerKo: string; questionKo: string; translations: AddendumTranslations;
}): { addendumId: string; version: number } {
  return transaction(() => {
    const row = get<EscalationRow>("SELECT * FROM escalations WHERE id = ?", escalationId);
    if (!row) fail(404, "확인 요청을 찾을 수 없어요.");
    if (row.resolved_at) fail(409, "이미 답변한 요청이에요.");
    const notice = get<{ version: number }>("UPDATE notices SET version = version + 1 WHERE id = ? RETURNING version", row.notice_id);
    if (!notice) fail(404, "공지를 찾을 수 없어요.");
    const addendumId = randomUUID();
    run("INSERT INTO addenda (id, notice_id, version, question_ko, answer_ko, translations) VALUES (?, ?, ?, ?, ?, ?)",
      addendumId, row.notice_id, notice.version, questionKo, answerKo, JSON.stringify(translations));
    run("UPDATE escalations SET addendum_id = ?, resolved_at = datetime('now') WHERE id = ?", addendumId, escalationId);
    return { addendumId, version: notice.version };
  });
}

export function recentNotices(limit = 6): RecentNotice[] {
  return all<{ id: string; draft: string; version: number; created_at: string }>(
    "SELECT id, draft, version, created_at FROM notices ORDER BY created_at DESC, rowid DESC LIMIT ?", limit,
  ).map(row => ({ id: row.id, title: parseDraft(row.draft).title, version: row.version, createdAt: row.created_at }));
}

export function dashboard(noticeId: string) {
  const sessions = all<SessionRow>("SELECT id, notice_id, name, lang, created_at FROM sessions WHERE notice_id = ? ORDER BY created_at", noticeId)
    .map(row => ({ id: row.id, name: row.name, lang: row.lang, createdAt: row.created_at, turns: getTurns(row.id) }));
  const byId = new Map(sessions.map(s => [s.id, s]));
  const escalations = all<EscalationRow>("SELECT * FROM escalations WHERE notice_id = ? ORDER BY created_at", noticeId)
    .map(escalationRow)
    .map(e => ({ ...e, name: byId.get(e.sessionId)?.name ?? "", lang: byId.get(e.sessionId)?.lang ?? ("" as const) }));
  return { sessions, escalations };
}

import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { NoticeDraft, RespondInput, ResponseRow, WorkerPreview, WorkerReply, Workflow, JudgmentContext } from './types.ts';

let connection: DatabaseSync | undefined;

function database() {
  if (connection) return connection;
  const path = process.env.SQLITE_PATH || resolve('data', 'easython.db');
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  try {
    db.exec(`
      PRAGMA busy_timeout = 5000;
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS notices (
        preview_id TEXT PRIMARY KEY,
        public_id TEXT UNIQUE,
        source TEXT NOT NULL,
        draft TEXT NOT NULL,
        preview TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS responses (
        notice_id TEXT NOT NULL REFERENCES notices(public_id),
        session_id TEXT NOT NULL,
        turn INTEGER NOT NULL,
        answer TEXT NOT NULL,
        state TEXT NOT NULL,
        message TEXT NOT NULL,
        PRIMARY KEY (notice_id, session_id, turn)
      );
      CREATE TABLE IF NOT EXISTS workflows (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        draft TEXT NOT NULL,
        preview_id TEXT REFERENCES notices(preview_id),
        revision INTEGER NOT NULL DEFAULT 1
      );
    `);
  } catch (error) {
    db.close();
    throw error;
  }
  connection = db;
  return db;
}

export function closeStore() {
  connection?.close();
  connection = undefined;
}

export function savePreview(source: string, draft: unknown, preview: WorkerPreview) {
  const id = randomUUID();
  database().prepare('INSERT INTO notices (preview_id, source, draft, preview) VALUES (?, ?, ?, ?)')
    .run(id, source, JSON.stringify(draft), JSON.stringify(preview));
  return id;
}

export function createWorkflow(source: string, draft: NoticeDraft) {
  const id = randomUUID();
  database().prepare('INSERT INTO workflows (id, source, draft) VALUES (?, ?, ?)')
    .run(id, source, JSON.stringify(draft));
  return id;
}

export function getWorkflow(id: string): Workflow | null {
  const row = database().prepare(`
    SELECT w.id, w.source, w.draft, w.preview_id, w.revision,
           n.preview, n.public_id
    FROM workflows w LEFT JOIN notices n ON n.preview_id = w.preview_id
    WHERE w.id = ?
  `).get(id) as { id: string; source: string; draft: string; preview_id: string | null; revision: number; preview: string | null; public_id: string | null } | undefined;
  if (!row) return null;
  return {
    id: row.id, source: row.source, draft: JSON.parse(row.draft),
    preview: row.preview ? JSON.parse(row.preview) : null,
    previewId: row.preview_id, revision: row.revision, publicId: row.public_id,
  };
}

export function updateWorkflowSource(id: string, revision: number, source: string, draft: NoticeDraft) {
  const db = database();
  const changed = db.prepare(`
    UPDATE workflows SET source = ?, draft = ?, preview_id = NULL, revision = revision + 1
    WHERE id = ? AND revision = ? AND NOT EXISTS (
      SELECT 1 FROM notices WHERE preview_id = workflows.preview_id AND public_id IS NOT NULL
    )
    RETURNING revision
  `).get(source, JSON.stringify(draft), id, revision) as { revision: number } | undefined;
  if (!changed) throw Object.assign(new Error('작성 내용이 변경되었거나 이미 발행되었습니다. 페이지를 새로고침해 주세요.'), { status: 409 });
  return changed.revision;
}

export function saveWorkflowPreview(id: string, revision: number, draft: NoticeDraft, preview: WorkerPreview) {
  const db = database();
  db.exec('BEGIN IMMEDIATE');
  try {
    const current = getWorkflow(id);
    if (!current || current.revision !== revision || current.publicId) {
      throw Object.assign(new Error('작성 내용이 변경되었습니다. 페이지를 새로고침해 주세요.'), { status: 409 });
    }
    const reviewedDraft = { ...draft, evidence: current.draft.evidence || [] };
    const previewId = savePreview(current.source, reviewedDraft, preview);
    db.prepare('UPDATE workflows SET draft = ?, preview_id = ?, revision = revision + 1 WHERE id = ?')
      .run(JSON.stringify(reviewedDraft), previewId, id);
    db.exec('COMMIT');
    return { previewId, revision: revision + 1 };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function publishWorkflow(id: string, revision: number, preview: WorkerPreview) {
  const db = database();
  db.exec('BEGIN IMMEDIATE');
  try {
    const current = getWorkflow(id);
    if (!current || current.revision !== revision || !current.previewId) {
      throw Object.assign(new Error('미리보기가 변경되었습니다. 다시 확인해 주세요.'), { status: 409 });
    }
    const publicId = publishApproved(current.previewId, preview);
    db.exec('COMMIT');
    return publicId;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function publish(previewId: string) {
  const row = database().prepare(`
    UPDATE notices SET public_id = COALESCE(public_id, ?) WHERE preview_id = ?
    RETURNING public_id
  `).get(randomUUID(), previewId) as { public_id: string } | undefined;
  return row?.public_id ?? null;
}

export function publishApproved(previewId: string, preview: WorkerPreview) {
  const db = database();
  const approved = JSON.stringify(preview);
  // Publish the manager's reviewed wording in the same SQLite statement.
  const row = db.prepare(`
    UPDATE notices
    SET preview = ?, public_id = COALESCE(public_id, ?)
    WHERE preview_id = ? AND (public_id IS NULL OR preview = ?)
    RETURNING public_id
  `).get(approved, randomUUID(), previewId, approved) as { public_id: string } | undefined;
  if (!row) throw Object.assign(new Error('미리보기가 변경되었거나 존재하지 않습니다. 다시 확인해 주세요.'), { status: 409 });
  return row.public_id;
}

export function getPublicNotice(id: string): WorkerPreview | null {
  const row = database().prepare('SELECT preview FROM notices WHERE public_id = ?').get(id) as { preview: string } | undefined;
  if (!row || row.preview === "null") return null;
  const { summary, question } = JSON.parse(row.preview);
  return { summary, question };
}

export function getJudgmentContext(id: string): JudgmentContext | null {
  const row = database().prepare('SELECT source, draft, preview FROM notices WHERE public_id = ?').get(id) as { source: string; draft: string; preview: string } | undefined;
  if (!row) return null;
  return { source: row.source, draft: JSON.parse(row.draft), preview: JSON.parse(row.preview) };
}

export function getHistory(id: string, sessionId: string): ResponseRow[] {
  return database().prepare(
    'SELECT answer, state, message FROM responses WHERE notice_id = ? AND session_id = ? ORDER BY turn'
  ).all(id, sessionId).map(row => ({ ...row })) as ResponseRow[];
}

export function recordTurn({ id, sessionId, turn, answer }: RespondInput, { state, message }: WorkerReply): ResponseRow {
  const db = database();
  db.prepare(`
    INSERT INTO responses (notice_id, session_id, turn, answer, state, message)
    VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (notice_id, session_id, turn) DO NOTHING
  `).run(id, sessionId, turn, answer, state, message);
  return db.prepare(
    'SELECT answer, state, message FROM responses WHERE notice_id = ? AND session_id = ? AND turn = ?'
  ).get(id, sessionId, turn) as ResponseRow;
}

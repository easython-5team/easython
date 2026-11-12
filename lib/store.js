import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

let connection;

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

export function savePreview(source, draft, preview) {
  const id = randomUUID();
  database().prepare('INSERT INTO notices (preview_id, source, draft, preview) VALUES (?, ?, ?, ?)')
    .run(id, source, JSON.stringify(draft), JSON.stringify(preview));
  return id;
}

export function publish(previewId) {
  const row = database().prepare(`
    UPDATE notices SET public_id = COALESCE(public_id, ?) WHERE preview_id = ?
    RETURNING public_id
  `).get(randomUUID(), previewId);
  return row?.public_id ?? null;
}

export function getPublicNotice(id) {
  const row = database().prepare('SELECT preview FROM notices WHERE public_id = ?').get(id);
  if (!row || row.preview === "null") return null;
  const { summary, question } = JSON.parse(row.preview);
  return { summary, question };
}

export function getJudgmentContext(id) {
  const row = database().prepare('SELECT source, draft, preview FROM notices WHERE public_id = ?').get(id);
  if (!row) return null;
  return { source: row.source, draft: JSON.parse(row.draft), preview: JSON.parse(row.preview) };
}

export function getHistory(id, sessionId) {
  return database().prepare(
    'SELECT answer, state, message FROM responses WHERE notice_id = ? AND session_id = ? ORDER BY turn'
  ).all(id, sessionId).map(row => ({ ...row }));
}

export function publishReviewed(key, source, draft) {
  const db = database();
  const serialized = JSON.stringify(draft);
  db.prepare(`
    INSERT INTO notices (preview_id, public_id, source, draft, preview) VALUES (?, ?, ?, ?, 'null')
    ON CONFLICT(preview_id) DO NOTHING
  `).run(key, randomUUID(), source, serialized);
  const row = db.prepare('SELECT public_id, source, draft FROM notices WHERE preview_id = ?').get(key);
  if (!row.public_id || row.source !== source || row.draft !== serialized) {
    throw Object.assign(new Error('발행 내용이 변경되었습니다. 다시 확인해 주세요.'), { status: 409 });
  }
  return row.public_id;
}

const translating = new Map();

export async function englishNotice(id, translate) {
  const notice = getJudgmentContext(id);
  if (!notice) throw Object.assign(new Error('Notice not found.'), { status: 404 });
  if (notice.preview) return getPublicNotice(id);
  if (!translating.has(id)) {
    const pending = Promise.resolve().then(async () => {
      const english = await translate(notice.source, notice.draft.question);
      database().prepare("UPDATE notices SET preview = ? WHERE public_id = ? AND preview = 'null'")
        .run(JSON.stringify(english), id);
      return getPublicNotice(id);
    }).finally(() => translating.delete(id));
    translating.set(id, pending);
  }
  return translating.get(id);
}

export function recordTurn({ id, sessionId, turn, answer }, { state, message }) {
  const db = database();
  db.prepare(`
    INSERT INTO responses (notice_id, session_id, turn, answer, state, message)
    VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (notice_id, session_id, turn) DO NOTHING
  `).run(id, sessionId, turn, answer, state, message);
  return db.prepare(
    'SELECT answer, state, message FROM responses WHERE notice_id = ? AND session_id = ? AND turn = ?'
  ).get(id, sessionId, turn);
}

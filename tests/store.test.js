import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { getPublicNotice, publish, savePreview, closeStore } from '../lib/store.js';
import { respond } from '../lib/respond.js';

const directory = mkdtempSync(join(tmpdir(), 'easython-store-'));
process.env.SQLITE_PATH = join(directory, 'test.db');
test.after(() => {
  closeStore();
  rmSync(directory, { recursive: true, force: true });
});

const source = '오후 2시부터 옥상 작업을 중단하고 공구는 그대로 두고 내려오세요.';
const draft = { summary: source, question: '어떻게 할까요?', criteria: [{ action: '공구를 둔다', evidence: '공구는 그대로 두고' }] };
const preview = { summary: 'Leave the tools and go downstairs.', question: 'What will you do at 2 PM?' };
const start = () => ({ id: publish(savePreview(source, draft, preview)), sessionId: randomUUID(), turn: 0, answer: 'I will go downstairs.' });
const ambiguous = () => ({ kind: 'ambiguous', followup: 'What about the tools?', message: 'Leave the tools.' });

test('publish freezes reviewed wording, is idempotent, and survives process restart', () => {
  const previewId = savePreview(source, draft, preview);
  assert.equal(getPublicNotice(previewId), null);
  const id = publish(previewId);
  assert.equal(publish(previewId), id);
  assert.equal(publish(randomUUID()), null);
  assert.deepEqual(getPublicNotice(id), preview);
  const restarted = spawnSync(process.execPath, ['--input-type=module', '-e',
    'import { getPublicNotice } from "./lib/store.js"; console.log(JSON.stringify(getPublicNotice(process.argv[1])))', id], { encoding: 'utf8' });
  assert.equal(restarted.status, 0, restarted.stderr);
  assert.deepEqual(JSON.parse(restarted.stdout), preview);
});

test('a follow-up passes the actual exchange to judgment and preserves a terminal response on retry', async () => {
  const first = start();
  const followup = await respond(first, ambiguous);
  assert.deepEqual(followup, { state: 'followup', message: 'What about the tools?' });
  const next = { ...first, turn: 1, answer: 'I will leave them there.' };
  const result = await respond(next, async context => {
    assert.deepEqual(context.history, [{ answer: first.answer, ...followup }]);
    assert.deepEqual(context.draft, draft);
    assert.equal(context.answer, next.answer);
    return { kind: 'correct', message: 'Understood.' };
  });
  assert.equal(result.state, 'understood');
  assert.deepEqual(await respond(next, assert.fail), result);
  await assert.rejects(respond({ ...next, turn: 2 }, assert.fail), { status: 409 });
  assert.equal((await respond({ ...first, sessionId: randomUUID() }, ambiguous)).state, 'followup');
});

test('a second ambiguous response ends with the reviewed instruction', async () => {
  const first = start();
  await respond(first, ambiguous);
  assert.deepEqual(await respond({ ...first, turn: 1 }, ambiguous), { state: 'guidance', message: preview.summary });
});

test('unsupported and incorrect end the session, grounded questions permit an action answer', async () => {
  for (const [kind, state] of [['unsupported', 'manager'], ['incorrect', 'guidance'], ['question', 'answered']]) {
    const first = start();
    assert.equal((await respond(first, () => ({kind, message: 'English response.'}))).state, state);
    const next = { ...first, turn: 1 };
    if (state === 'answered') assert.equal((await respond(next, ambiguous)).state, 'followup');
    else await assert.rejects(respond(next, assert.fail), { status: 409 });
  }
});

test('concurrent duplicate submissions share judgment and failure leaves the same turn retryable', async () => {
  const first = start();
  await assert.rejects(respond(first, () => { throw new Error('Network'); }), /Network/);
  let release;
  let calls = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const judge = async () => { calls++; await gate; return ambiguous(); };
  const a = respond(first, judge);
  const b = respond(first, judge);
  await assert.rejects(respond({ ...first, answer: 'Another answer' }, judge), { status: 409 });
  release();
  assert.deepEqual(await a, await b);
  assert.equal(calls, 1);
  await assert.rejects(respond({ ...first, answer: 'Another answer' }, judge), { status: 409 });
});

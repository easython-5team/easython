import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { getPublicNotice, publish, savePreview, closeStore, createWorkflow, getWorkflow, updateWorkflowSource, saveWorkflowPreview, publishWorkflow } from '../lib/store.ts';
import { respond } from '../lib/respond.ts';
import type { Verdict } from '../lib/types.ts';

const directory = mkdtempSync(join(tmpdir(), 'easython-store-'));
process.env.SQLITE_PATH = join(directory, 'test.db');
test.after(() => {
  closeStore();
  rmSync(directory, { recursive: true, force: true });
});

const source = '오후 2시부터 옥상 작업을 중단하고 공구는 그대로 두고 내려오세요.';
const draft = { question: '어떻게 할까요?', rubric: '공구를 두고 내려오는지 확인', evidence: ['공구는 그대로 두고'] };
const preview = { summary: 'Leave the tools and go downstairs.', question: 'What will you do at 2 PM?' };
const start = () => ({ id: publish(savePreview(source, draft, preview))!, sessionId: randomUUID(), turn: 0, answer: 'I will go downstairs.' });
const ambiguous = (): Verdict => ({ kind: 'ambiguous', followup: 'What about the tools?', message: 'Leave the tools.' });

test('publish freezes reviewed wording, is idempotent, and survives process restart', () => {
  const previewId = savePreview(source, draft, preview);
  assert.equal(getPublicNotice(previewId), null);
  const id = publish(previewId)!;
  assert.equal(publish(previewId), id);
  assert.equal(publish(randomUUID()), null);
  assert.deepEqual(getPublicNotice(id), preview);
  const restarted = spawnSync(process.execPath, ['--input-type=module', '-e',
    'import { getPublicNotice } from "./lib/store.ts"; console.log(JSON.stringify(getPublicNotice(process.argv[1])))', id], { encoding: 'utf8' });
  assert.equal(restarted.status, 0, restarted.stderr);
  assert.deepEqual(JSON.parse(restarted.stdout), preview);
});

test('separate workflows keep previous quiz and preview out of the next notice', () => {
  const first = createWorkflow(source, draft);
  const second = createWorkflow('새 공지입니다.', { question: '새 질문?', rubric: '새 행동', evidence: ['새 공지'] });
  assert.equal(getWorkflow(first)!.preview, null);
  assert.equal(getWorkflow(second)!.preview, null);
  const saved = saveWorkflowPreview(first, 1, draft, preview);
  assert.equal(saved.revision, 2);
  assert.deepEqual(getWorkflow(first)!.preview, preview);
  assert.equal(getWorkflow(second)!.preview, null);
  assert.throws(() => saveWorkflowPreview(first, 1, draft, preview), { status: 409 });
  saveWorkflowPreview(second, 1, { question: '새 질문?', rubric: '새 행동' }, { summary: 'Old preview', question: 'Old question?' });
  const changed = updateWorkflowSource(second, 2, '수정한 공지', { question: '수정 질문?', rubric: '수정 행동' });
  assert.equal(changed, 3);
  assert.equal(getWorkflow(second)!.source, '수정한 공지');
  assert.equal(getWorkflow(second)!.preview, null);
  assert.throws(() => updateWorkflowSource(second, 2, '오래된 공지', draft), { status: 409 });
  const id = publishWorkflow(first, 2, preview);
  assert.equal(publishWorkflow(first, 2, preview), id);
  assert.deepEqual(getPublicNotice(id), preview);
  assert.throws(() => saveWorkflowPreview(first, 2, draft, preview), { status: 409 });
  assert.throws(() => updateWorkflowSource(first, 2, '발행 후 수정', draft), { status: 409 });
  assert.equal(getWorkflow(first)!.publicId, id);
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
  assert.deepEqual(await respond(next, () => assert.fail()), result);
  await assert.rejects(respond({ ...next, turn: 2 }, () => assert.fail()), { status: 409 });
  assert.equal((await respond({ ...first, sessionId: randomUUID() }, ambiguous)).state, 'followup');
});

test('a second ambiguous response ends with the reviewed instruction', async () => {
  const first = start();
  await respond(first, ambiguous);
  assert.deepEqual(await respond({ ...first, turn: 1 }, ambiguous), { state: 'guidance', message: preview.summary });
});

test('unsupported and incorrect end the session, grounded questions permit an action answer', async () => {
  for (const [kind, state] of [['unsupported', 'manager'], ['incorrect', 'guidance'], ['question', 'answered']] as const) {
    const first = start();
    assert.equal((await respond(first, () => ({kind, message: 'English response.'}))).state, state);
    const next = { ...first, turn: 1 };
    if (state === 'answered') assert.equal((await respond(next, ambiguous)).state, 'followup');
    else await assert.rejects(respond(next, () => assert.fail()), { status: 409 });
  }
});

test('concurrent duplicate submissions share judgment and failure leaves the same turn retryable', async () => {
  const first = start();
  await assert.rejects(respond(first, () => { throw new Error('Network'); }), /Network/);
  let release!: () => void;
  let calls = 0;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const judge = async () => { calls++; await gate; return ambiguous(); };
  const a = respond(first, judge);
  const b = respond(first, judge);
  await assert.rejects(respond({ ...first, answer: 'Another answer' }, judge), { status: 409 });
  release();
  assert.deepEqual(await a, await b);
  assert.equal(calls, 1);
  await assert.rejects(respond({ ...first, answer: 'Another answer' }, judge), { status: 409 });
});

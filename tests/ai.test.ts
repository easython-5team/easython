import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { generateDraft, judge, translateNotice } from '../lib/ai.ts';

const source = '오후 2시에 옥상 작업을 중단한다. 공구는 두고 내려온다.';
const draft = {
  question: '두 시에 공구가 남아 있다면 어떻게 하겠어요?',
  rubric: '공구를 두고 내려간다', evidence: ['공구는 두고 내려온다.'],
};
const preview = { summary: 'Stop rooftop work at 2 p.m. Leave the tools and go downstairs.', question: 'What will you do at 2 p.m. if tools remain?' };
let originalFetch!: typeof fetch;
let originalKey: string | undefined;
let request!: { model: string; text: { format: { strict: boolean } }; store: boolean; input: string };

beforeEach(() => {
  originalFetch = globalThis.fetch;
  originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'fixture';
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalKey;
});

function mockOutput(value: unknown) {
  globalThis.fetch = async (url, options) => {
    request = JSON.parse(String(options?.body));
    assert.equal(url, 'https://api.openai.com/v1/responses');
    return Response.json({
      status: 'completed',
      output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }],
    });
  };
}

test('draft uses the chosen model and strict schema and returns verbatim grounds', async () => {
  mockOutput(draft);
  assert.deepEqual(await generateDraft(source), draft);
  assert.equal(request.model, 'gpt-5.4-mini');
  assert.equal(request.text.format.strict, true);
  assert.equal(request.store, false);
});

test('fabricated evidence is rejected', async () => {
  mockOutput({ ...draft, rubric: '정리한다', evidence: ['정리하라'] });
  await assert.rejects(generateDraft(source), { status: 502 });
});

test('quote marks added by the model are removed before checking source evidence', async () => {
  const [quote] = draft.evidence;
  mockOutput({ ...draft, evidence: ['"' + quote + '"'] });
  assert.deepEqual((await generateDraft(source)).evidence, [quote]);
});

test('translation uses the reviewed Korean wording', async () => {
  mockOutput(preview);
  assert.deepEqual(await translateNotice(source, draft.question), preview);
  assert.deepEqual(JSON.parse(request.input), {source, question: draft.question});
});

test('judge receives the real clarification exchange and current answer', async () => {
  const history = [{ answer: "I'll go downstairs.", state: 'followup' as const, message: 'What about the tools?' }];
  const answer = "I'll leave them there.";
  const result = { kind: 'correct', message: 'Yes. Leave the tools and go downstairs.', followup: '' };
  mockOutput(result);
  assert.deepEqual(await judge({ source, draft, preview, history, answer }), result);
  assert.deepEqual(JSON.parse(request.input).history, history);
  assert.equal(JSON.parse(request.input).answer, answer);
});

test('ambiguous result must include a follow-up question and separate grounded guidance', async () => {
  mockOutput({ kind: 'ambiguous', followup: '', message: 'Leave the tools.' });
  await assert.rejects(judge({ source, draft, preview, history: [], answer: 'Okay.' }), { status: 502 });
});

test('missing key and provider failures produce actionable status codes', async () => {
  globalThis.fetch = async () => new Response(null, { status: 429 });
  await assert.rejects(generateDraft(source), { status: 429 });
  delete process.env.OPENAI_API_KEY;
  await assert.rejects(generateDraft(source), { status: 503 });
});

test('refusal and interrupted responses are never accepted as decisions', async () => {
  globalThis.fetch = async () => Response.json({
    status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'declined' }] }],
  });
  await assert.rejects(generateDraft(source), { status: 502 });
  globalThis.fetch = async () => { throw new Error('offline'); };
  await assert.rejects(generateDraft(source), { status: 503 });
});

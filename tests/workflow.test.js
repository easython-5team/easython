import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../app/api/[action]/route.js";
import { closeStore, getPublicNotice } from "../lib/store.js";

test("translation waits for a worker and is cached and clarification resolves the original answer", async (t) => {
  process.env.SQLITE_PATH = ":memory:";
  process.env.OPENAI_API_KEY = "test-only";
  t.after(closeStore);
  const source = "오후 2시에 공구는 옥상에 두고 내려오세요.";
  const draft = {
    question: "공구가 남아 있다면 어떻게 하겠어요?",
    rubric: "공구를 둔다", evidence: ["공구는 옥상에 두고"],
  };
  const preview = { summary: "Leave the tools on the roof and go downstairs at 2.", question: "What will you do at 2?" };
  const outputs = [
    draft, preview,
    { kind: "ambiguous", message: preview.summary, followup: "What about the tools?" },
    { kind: "correct", message: "That follows the notice.", followup: "" },
  ];
  const inputs = [];
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    inputs.push(JSON.parse(JSON.parse(options.body).input));
    assert.ok(outputs.length, "unexpected extra AI call");
    const text = JSON.stringify(outputs.shift());
    return Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text }] }] });
  });
  async function call(action, body, status = 200) {
    const headers = { "content-type": "application/json" };
    const request = new Request("http://localhost/api/" + action, {
      method: "POST", headers, body: JSON.stringify(body),
    });
    const response = await POST(request, { params: Promise.resolve({ action }) });
    const result = await response.json();
    assert.equal(response.status, status, JSON.stringify(result));
    return result;
  }
  const generated = await call("draft", { source });
  generated.draft.question = "두 시에 옥상 공구를 어떻게 하겠어요?";
  generated.draft.rubric = "공구를 두고 내려오는지 확인해요.";
  const publication = { source, draft: generated.draft, publicationKey: crypto.randomUUID() };
  const { id } = await call("publish", publication);
  assert.equal((await call("publish", publication)).id, id);
  assert.equal(inputs.length, 1);
  assert.equal(getPublicNotice(id), null);
  const translations = await Promise.all([call("english", { id }), call("english", { id })]);
  assert.deepEqual(translations, [preview, preview]);
  assert.deepEqual(inputs[1], { source, question: generated.draft.question });
  assert.deepEqual(await call("english", { id }), preview);
  assert.equal(inputs.length, 2);
  const session = { id, sessionId: "worker-1" };
  const first = await call("respond", { ...session, turn: 0, answer: "I'll go downstairs." });
  assert.equal(first.state, "followup");
  const last = await call("respond", { ...session, turn: 1, answer: "I'll leave them there." });
  assert.equal(last.state, "understood");
  assert.equal(inputs[3].draft.rubric, generated.draft.rubric);
  assert.equal(inputs[3].history[0].message, first.message);
  assert.equal(outputs.length, 0);
});

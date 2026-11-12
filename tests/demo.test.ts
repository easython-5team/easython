import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../app/api/[action]/route.ts";
import { materialNotice as source } from "../lib/demo.ts";
import { closeStore, getPublicNotice } from "../lib/store.ts";

test("keyless material delivery demo publishes and resolves one clarification offline", async t => {
  process.env.EASYTHON_DEMO = "1";
  process.env.SQLITE_PATH = ":memory:";
  delete process.env.OPENAI_API_KEY;
  t.after(closeStore);
  const network = t.mock.method(globalThis, "fetch", () => assert.fail("Unexpected external call"));
  async function call(action: string, body: unknown) {
    const request = new Request("http://localhost/api/" + action, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const response = await POST(request, { params: Promise.resolve({ action }) });
    assert.equal(response.status, 200);
    return response.json();
  }
  const { id: workflowId, draft } = await call("draft", { source });
  assert.ok(source.includes(draft.evidence[0]));
  const { revision, preview } = await call("preview", { id: workflowId, revision: 1, draft, reviewed: true });
  assert.match(preview.summary, /west entrance/);
  const { id } = await call("publish", { id: workflowId, revision, preview });
  const session = { id, sessionId: "qa" };
  const first = await call("respond", { ...session, turn: 0, answer: "I'll use the west entrance." });
  assert.equal(first.state, "followup");
  assert.match(first.message, /where/i);
  const second = await call("respond", { ...session, turn: 1, answer: "In the yellow marked area in front of the first-floor materials room." });
  assert.equal(second.state, "understood");
  const wrong = await call("respond", { id, sessionId: "wrong", turn: 0, answer: "I'll use the east entrance." });
  assert.equal(wrong.state, "guidance");
  assert.match(wrong.message, /west entrance/);
  const question = await call("respond", { id, sessionId: "question", turn: 0, answer: "Can I use the east entrance at 1 PM?" });
  assert.equal(question.state, "answered");
  const unknown = await call("respond", { id, sessionId: "unknown", turn: 0, answer: "When will the group chat announce that the east entrance is available?" });
  assert.equal(unknown.state, "manager");
  const edited = { ...draft, question: "내일 오후에는 어느 출입구를 쓰겠어요?" };
  const { id: revisedId } = await call("draft", { source });
  const revised = await call("preview", { id: revisedId, revision: 1, draft: edited, reviewed: true });
  assert.equal(revised.preview.question, edited.question);
  const revisedPublication = await call("publish", { id: revisedId, revision: revised.revision, preview: revised.preview });
  assert.equal(getPublicNotice(revisedPublication.id)!.question, edited.question);
  assert.equal(network.mock.callCount(), 0);
});

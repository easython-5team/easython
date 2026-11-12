import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../app/api/[action]/route.js";
import { materialNotice as source } from "../lib/demo.js";
import { closeStore } from "../lib/store.js";

test("keyless material delivery demo publishes and resolves one clarification offline", async t => {
  process.env.EASYTHON_DEMO = "1";
  process.env.SQLITE_PATH = ":memory:";
  delete process.env.OPENAI_API_KEY;
  t.after(closeStore);
  const network = t.mock.method(globalThis, "fetch", () => assert.fail("Unexpected external call"));
  async function call(action, body) {
    const request = new Request("http://localhost/api/" + action, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const response = await POST(request, { params: { action } });
    assert.equal(response.status, 200);
    return response.json();
  }
  const { draft } = await call("draft", { source });
  assert.ok(source.includes(draft.evidence[0]));
  const { id } = await call("publish", { source, draft, publicationKey: crypto.randomUUID() });
  assert.match((await call("english", { id })).summary, /west entrance/);
  const session = { id, sessionId: "qa" };
  const first = await call("respond", { ...session, turn: 0, answer: "I'll use the west entrance." });
  assert.equal(first.state, "followup");
  assert.match(first.message, /where/i);
  const second = await call("respond", { ...session, turn: 1, answer: "In the yellow marked area in front of the first-floor materials room." });
  assert.equal(second.state, "understood");
  assert.equal(network.mock.callCount(), 0);
});

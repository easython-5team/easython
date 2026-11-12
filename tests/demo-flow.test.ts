import assert from "node:assert/strict";
import test from "node:test";
import { demoManagerAnswer, demoNotice } from "../server/demo.ts";
import { closeStore } from "../server/db/store.ts";
import { client, must, type Call } from "./helpers.ts";

process.env.EASYTHON_DEMO = "1";
process.env.SQLITE_PATH = ":memory:";
test.after(closeStore);

async function published(call: Call): Promise<string> {
  const { draft } = await call("analyze", { source: demoNotice });
  const { previewId, translations } = await call("preview", { source: demoNotice, draft });
  assert.deepEqual(Object.keys(translations), ["en", "vi"]);
  const { id } = await call("publish", { previewId });
  assert.equal((await call("publish", { previewId })).id, id, "publishing twice returns the same notice");
  return id;
}

test("full user flow: publish → EN worker follow-up → VI worker conflict → escalation → manager answer reaches everyone", async () => {
  const call = client();
  const id = await published(call);

  const en = await call("notice", { id, lang: "en" });
  assert.equal(en.question, "At 2 PM you are using tools on the roof. What will you do right away?");
  assert.equal(en.conditions.length, 5);
  assert.equal(JSON.stringify(en).includes("근거"), false, "worker payload carries no Korean review data");

  const { sessionId: anna } = await call("join", { id, lang: "en", name: "Anna" });
  const first = await call("respond", { id, sessionId: anna, turn: 0, answer: "I'll go downstairs.", mode: "voice" });
  assert.equal(first.state, "followup");
  assert.equal(first.message, "What will you do with the tools you are using?");
  assert.deepEqual(first.conditions.map(c => c.status), ["missing", "met"]);
  const second = await call("respond", { id, sessionId: anna, turn: 1, answer: "I'll leave them there.", mode: "text" });
  assert.equal(second.state, "understood");
  assert.deepEqual(second.conditions.map(c => c.status), ["met", "met"]);
  await call("respond", { id, sessionId: anna, turn: 2, answer: "More?", mode: "text" }, 409);

  const { sessionId: minh } = await call("join", { id, lang: "vi", name: "Minh" });
  const wrong = await call("respond", { id, sessionId: minh, turn: 0, answer: "Tôi sẽ mang dụng cụ theo rồi đi xuống.", mode: "text" });
  assert.equal(wrong.state, "guidance");
  assert.match(wrong.message, /Để nguyên chúng trên mái/);

  const { sessionId: lan } = await call("join", { id, lang: "vi", name: "Lan" });
  const asked = await call("respond", { id, sessionId: lan, turn: 0, answer: "Sáng mai có được làm lại không?", mode: "text" });
  assert.equal(asked.state, "manager");

  let board = await call("dashboard", { id });
  assert.deepEqual(board.stats, { joined: 3, understood: 1, recheck: 1, inProgress: 1, waiting: 1 });
  const escalation = must(board.escalations[0]);
  assert.equal(escalation.name, "Lan");
  assert.equal(escalation.questionKo, "내일 아침에 다시 작업해도 되나요?");
  assert.equal(board.workers.find(w => w.name === "Lan")?.waiting, true);

  const resolved = await call("resolve", { id, escalationId: escalation.id, answer: demoManagerAnswer });
  assert.equal(resolved.version, 2);
  await call("resolve", { id, escalationId: escalation.id, answer: demoManagerAnswer }, 409);

  const lanView = await call("session", { id, sessionId: lan });
  assert.match(must(lanView.escalations[0]?.answer), /8 giờ sáng mai/);
  assert.equal(lanView.notice.addenda.length, 1);
  assert.equal(lanView.notice.version, 2);

  // The manager's answer is now part of the notice: the next worker gets it without escalation.
  const { sessionId: bob } = await call("join", { id, lang: "en", name: "Bob" });
  const grounded = await call("respond", { id, sessionId: bob, turn: 0, answer: "Can we restart tomorrow morning?", mode: "text" });
  assert.equal(grounded.state, "answered");
  assert.match(grounded.message, /safety check at 8 AM/);

  board = await call("dashboard", { id });
  assert.equal(board.stats.waiting, 0);
  const annaFirst = must(board.workers.find(w => w.name === "Anna")?.turns[0]);
  assert.equal(annaFirst.mode, "voice");
  assert.equal(annaFirst.inputKo, "아래로 내려가겠습니다.");
});

test("edited wording fails the demo translation check and needs explicit acknowledgement to publish", async () => {
  const call = client();
  const { draft } = await call("analyze", { source: demoNotice });
  draft.question = "2시에 공구는 어떻게 하나요?";
  must(draft.conditions[2]).label = "공구를 그대로 둔다.";
  const { previewId, translations } = await call("preview", { source: demoNotice, draft });
  assert.equal(translations.en.checks.find(c => c.id === "c3")?.preserved, false);
  await call("publish", { previewId }, 409);
  assert.ok((await call("publish", { previewId, acceptMismatch: true })).id);
});

test("tampered evidence and missing checked conditions are rejected at preview", async () => {
  const call = client();
  const { draft } = await call("analyze", { source: demoNotice });
  await call("preview", { source: demoNotice, draft: { ...draft, conditions: draft.conditions.map(c => ({ ...c, check: false })) } }, 400);
  must(draft.conditions[0]).evidence = "원문에 없는 문장";
  await call("preview", { source: demoNotice, draft }, 400);
});

test("a session can only answer for its own notice and turns are idempotent", async () => {
  const call = client();
  const id = await published(call);
  const other = await published(call);
  const { sessionId } = await call("join", { id, lang: "en", name: "Kim" });
  await call("respond", { id: other, sessionId, turn: 0, answer: "x", mode: "text" }, 404);
  const once = await call("respond", { id, sessionId, turn: 0, answer: "I'll go downstairs.", mode: "text" });
  assert.deepEqual(await call("respond", { id, sessionId, turn: 0, answer: "I'll go downstairs.", mode: "text" }), once);
  await call("respond", { id, sessionId, turn: 0, answer: "different", mode: "text" }, 409);
  await call("join", { id, lang: "ko", name: "Kim" }, 400);
});

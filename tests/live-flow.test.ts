import assert from "node:assert/strict";
import test from "node:test";
import { analyzeNotice, MODEL, translateNotice } from "../lib/ai.ts";
import { closeStore } from "../lib/store.ts";
import { client, must } from "./helpers.ts";
import type { TestContext } from "node:test";
import type { Draft, Lang } from "../lib/types.ts";

delete process.env.EASYTHON_DEMO;
process.env.SQLITE_PATH = ":memory:";
process.env.OPENAI_API_KEY = "test-only";
test.after(closeStore);

const source = "오후 2시에 옥상 작업을 중단합니다. 공구는 정리하지 말고 그대로 두고 내려오세요.";
const analysis = {
  title: "옥상 작업 중단",
  conditions: [
    { kind: "time", label: "오후 2시부터", evidence: "“오후 2시에”", check: false },
    { kind: "prohibition", label: "공구를 정리하지 않고 둔다", evidence: "공구는 정리하지 말고 그대로 두고", check: true },
    { kind: "action", label: "내려온다", evidence: "내려오세요", check: true },
  ],
  question: "2시에 공구를 쓰던 중이면 어떻게 하겠어요?",
  questionReason: "공구를 챙기는 습관을 확인합니다.",
};
const translation = (lang: Lang) => ({
  title: lang + " title", summary: lang + " summary: leave tools, go down at 2.", question: lang + " question?",
  conditions: [{ id: "c1", text: lang + " at 2" }, { id: "c2", text: lang + " leave tools" }, { id: "c3", text: lang + " go down" }],
});
const verified = { backTranslation: "2시에 공구를 두고 내려오세요.", checks: ["c1", "c2", "c3"].map(id => ({ id, preserved: true, note: "" })) };

interface RequestBody { model: string; store: boolean; input: string; instructions: string; text: { format: { name: string; strict: boolean } } }
interface Output { name: string; value: unknown; used?: boolean }

function mockOpenAI(t: TestContext, outputs: Output[]): RequestBody[] {
  const requests: RequestBody[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    assert.equal(url, "https://api.openai.com/v1/responses");
    const body = JSON.parse(String(options.body)) as RequestBody;
    requests.push(body);
    const next = outputs.find(o => o.name === body.text.format.name && !o.used);
    assert.ok(next, "unexpected AI call " + body.text.format.name);
    next.used = true;
    const value = typeof next.value === "function" ? (next.value as (body: RequestBody) => unknown)(body) : next.value;
    return Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(value) }] }] });
  });
  return requests;
}
const out = (name: string, value: unknown): Output => ({ name, value });
const langOf = (body: RequestBody): Lang => body.instructions.includes("Vietnamese") ? "vi" : "en";

test("analysis uses a strict schema, assigns ids and strips quotes from verbatim evidence", async t => {
  const requests = mockOpenAI(t, [out("notice_analysis", analysis)]);
  const draft = await analyzeNotice(source);
  assert.deepEqual(draft.conditions.map(c => [c.id, c.evidence]), [["c1", "오후 2시에"], ["c2", "공구는 정리하지 말고 그대로 두고"], ["c3", "내려오세요"]]);
  const [request] = requests;
  assert.equal(request?.model, MODEL);
  assert.equal(request?.text.format.strict, true);
  assert.equal(request?.store, false);
});

test("fabricated evidence is rejected", async t => {
  mockOpenAI(t, [out("notice_analysis", { ...analysis, conditions: [{ ...analysis.conditions[1], evidence: "공구를 챙기세요" }] })]);
  await assert.rejects(analyzeNotice(source), { status: 502 });
});

test("a translation that still contains Korean is rejected, and skipped checks count as not preserved", async t => {
  const draft: Draft = { title: "t", question: "q", questionReason: "", conditions: [
    { id: "c1", kind: "action", label: "내려온다", evidence: "", check: true }, { id: "c2", kind: "action", label: "둔다", evidence: "", check: true }] };
  mockOpenAI(t, [out("worker_translation", { ...translation("en"), conditions: [{ id: "c1", text: "내려온다" }, { id: "c2", text: "x" }] })]);
  await assert.rejects(translateNotice(source, draft, "en"), { status: 502 });
  t.mock.restoreAll();
  mockOpenAI(t, [
    out("worker_translation", { ...translation("en"), conditions: [{ id: "c1", text: "go down" }, { id: "c2", text: "leave" }] }),
    out("translation_check", { backTranslation: "내려오세요", checks: [{ id: "c1", preserved: true, note: "" }] }),
  ]);
  const result = await translateNotice(source, draft, "en");
  assert.deepEqual(result.checks.map(c => c.preserved), [true, false]);
});

test("live flow: a hallucinated quote cannot confirm understanding; escalation is answered in every language", async t => {
  const call = client();
  const requests = mockOpenAI(t, [
    out("notice_analysis", analysis),
    out("worker_translation", (body: RequestBody) => translation(langOf(body))), out("worker_translation", (body: RequestBody) => translation(langOf(body))),
    out("translation_check", verified), out("translation_check", verified),
    // The model claims c2 is met, quoting words the worker never said.
    out("worker_judgment", { intent: "action", inputKo: "내려가겠습니다.", answerable: false, reply: "Leave tools and go down.", followup: "What about the tools?",
      conditions: [{ id: "c2", status: "met", quote: "leave the tools" }, { id: "c3", status: "met", quote: "go downstairs" }] }),
    out("worker_judgment", { intent: "action", inputKo: "두고 가겠습니다.", answerable: false, reply: "Good.", followup: "",
      conditions: [{ id: "c2", status: "met", quote: "leave them" }, { id: "c3", status: "missing", quote: "" }] }),
    out("worker_judgment", { intent: "question", inputKo: "내일 재개하나요?", answerable: false, reply: "", followup: "", conditions: [] }),
    out("manager_answer", { en: { question: "Restart tomorrow?", answer: "Wait for the 8 AM notice." }, vi: { question: "Mai làm lại?", answer: "Chờ thông báo lúc 8 giờ." } }),
  ]);
  const { draft } = await call("analyze", { source });
  const { previewId, translations } = await call("preview", { source, draft });
  assert.equal(translations.vi.title, "vi title");
  const { id } = await call("publish", { previewId });

  const { sessionId } = await call("join", { id, lang: "en", name: "Anna" });
  const first = await call("respond", { id, sessionId, turn: 0, answer: "I'll go downstairs.", mode: "text" });
  assert.equal(first.state, "followup", "unsupported 'met' claim must not confirm");
  assert.deepEqual(first.conditions.map(c => c.status), ["missing", "met"]);
  const judged = requests.find(r => r.text.format.name === "worker_judgment");
  assert.deepEqual(JSON.parse(must(judged).input).checkedConditionIds, ["c2", "c3"]);

  const second = await call("respond", { id, sessionId, turn: 1, answer: "I'll leave them there.", mode: "text" });
  assert.equal(second.state, "understood", "earlier 'go downstairs' still counts");

  const { sessionId: other } = await call("join", { id, lang: "vi", name: "Minh" });
  assert.equal((await call("respond", { id, sessionId: other, turn: 0, answer: "Mai có làm lại không?", mode: "voice" })).state, "manager");
  const board = await call("dashboard", { id });
  const escalation = must(board.escalations[0]);
  assert.equal(escalation.questionKo, "내일 재개하나요?");
  assert.equal(board.workers[0]?.turns[0]?.assessment[0]?.rejected, "met", "dashboard shows the rejected AI claim");
  await call("resolve", { id, escalationId: escalation.id, answer: "내일 8시 공지를 기다리세요." });
  const view = await call("session", { id, sessionId: other });
  assert.equal(view.escalations[0]?.answer, "Chờ thông báo lúc 8 giờ.");
  assert.equal(view.notice.addenda[0]?.question, "Mai làm lại?");
});

import assert from "node:assert/strict";
import test from "node:test";
import { decide, mergeAssessment, verifyAssessment } from "../server/decide.ts";
import { WORKER_TEXT } from "../shared/languages.ts";
import type { Assessed, Verdict } from "../shared/types.ts";

const text = WORKER_TEXT.en;
const conditionTexts: Record<string, string> = { c3: "Leave the tools.", c4: "Come down." };
const conditionText = (id: string) => conditionTexts[id] ?? "";
const action = (extra: Partial<Verdict> = {}): Verdict =>
  ({ intent: "action", inputKo: "", conditions: [], answerable: false, reply: "", followup: "", ...extra });
const question = (answerable: boolean, reply: string): Verdict => ({ ...action(), intent: "question", answerable, reply });
const assessed = (...items: Array<[string, Assessed["status"]]>): Assessed[] => items.map(([id, status]) => ({ id, status, quote: "" }));

test("a met claim whose quote is not in the worker's words is downgraded to missing", () => {
  const result = verifyAssessment([
    { id: "c3", status: "met", quote: "I will leave the tools" },
    { id: "c4", status: "met", quote: "go downstairs" },
  ], ["c3", "c4"], ["I'll go downstairs."]);
  assert.deepEqual(result, [
    { id: "c3", status: "missing", quote: "", rejected: "met" },
    { id: "c4", status: "met", quote: "go downstairs" },
  ]);
});

test("quotes match despite case, curly apostrophes, surrounding quotes and spacing", () => {
  const [item] = verifyAssessment([{ id: "c3", status: "met", quote: "“I'll  LEAVE them”" }], ["c3"], ["I’ll leave them there"]);
  assert.equal(item?.status, "met");
});

test("unknown ids are ignored and unassessed conditions are missing", () => {
  const result = verifyAssessment([{ id: "zz", status: "met", quote: "x" }], ["c3"], ["x"]);
  assert.deepEqual(result, [{ id: "c3", status: "missing", quote: "" }]);
});

test("merge keeps earlier statements and lets explicit corrections win", () => {
  const prior: Assessed[] = [{ id: "c3", status: "conflict", quote: "take" }, { id: "c4", status: "met", quote: "down" }];
  const now: Assessed[] = [{ id: "c3", status: "met", quote: "leave" }, { id: "c4", status: "missing", quote: "" }];
  assert.deepEqual(mergeAssessment(prior, now), [{ id: "c3", status: "met", quote: "leave" }, prior[1]]);
});

test("one missing condition gets one follow-up, a second miss ends with guidance", () => {
  const assessment = assessed(["c3", "missing"], ["c4", "met"]);
  const first = decide({ verdict: action({ followup: "What about the tools?" }), assessment, history: [], text, conditionText });
  assert.deepEqual(first, { state: "followup", message: "What about the tools?" });
  const second = decide({ verdict: action(), assessment, history: [{ state: "followup" }], text, conditionText });
  assert.equal(second.state, "guidance");
  assert.match(second.message, /Leave the tools\./);
});

test("a conflict is never confirmed, even if other conditions are met", () => {
  const assessment = assessed(["c3", "conflict"], ["c4", "met"]);
  const result = decide({ verdict: action({ reply: "Do not take the tools." }), assessment, history: [], text, conditionText });
  assert.equal(result.state, "guidance");
  assert.match(result.message, /^Do not take the tools\.\n• Leave the tools\.$/);
});

test("all conditions met confirms understanding", () => {
  const assessment = assessed(["c3", "met"], ["c4", "met"]);
  assert.equal(decide({ verdict: action(), assessment, history: [], text, conditionText }).state, "understood");
});

test("questions are answered only with grounding, otherwise escalated with a fixed message", () => {
  const answered = decide({ verdict: question(true, "At 2 PM."), assessment: [], history: [], text, conditionText });
  assert.deepEqual(answered, { state: "answered", message: "At 2 PM." });
  const unsupported = decide({ verdict: question(true, " "), assessment: [], history: [], text, conditionText });
  assert.deepEqual(unsupported, { state: "manager", message: text.managerSent, escalate: true });
});

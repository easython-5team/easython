import assert from "node:assert/strict";
import test from "node:test";
import { progress, upgradeDraft, upgradeTranslation } from "../shared/questions.ts";

const ids = ["q1", "q2", "q3"];

test("questions open in order; a follow-up keeps the same question open", () => {
  assert.equal(progress(ids, []).current, "q1");
  assert.equal(progress(ids, [{ questionId: "q1", state: "followup" }]).current, "q1");
  assert.equal(progress(ids, [{ questionId: "q1", state: "manager" }]).current, "q1");
});

test("a confirmed or re-explained question moves on to the next one", () => {
  const turns = [{ questionId: "q1", state: "understood" as const }, { questionId: "q2", state: "guidance" as const }];
  const p = progress(ids, turns);
  assert.equal(p.current, "q3");
  assert.deepEqual([...p.results], [["q1", "understood"], ["q2", "guidance"]]);
});

test("every question done means no open question", () => {
  const turns = ids.map(questionId => ({ questionId, state: "understood" as const }));
  assert.equal(progress(ids, turns).current, null);
});

test("a notice saved with one question becomes a single open question on the checked conditions", () => {
  const draft = upgradeDraft({
    title: "t", question: "무엇을 하겠어요?", questionReason: "이유",
    conditions: [
      { id: "c1", kind: "time", label: "a", evidence: "a", check: false },
      { id: "c2", kind: "action", label: "b", evidence: "b", check: true },
    ],
  });
  assert.deepEqual(draft.questions, [{ id: "q1", type: "open", text: "무엇을 하겠어요?", answer: "", conditionIds: ["c2"], reason: "이유" }]);
  assert.deepEqual(upgradeTranslation({ title: "t", question: "What will you do?" }).questions, [{ id: "q1", text: "What will you do?" }]);
});

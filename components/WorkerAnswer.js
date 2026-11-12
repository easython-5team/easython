"use client";

import { useRef, useState } from "react";
import { post } from "./request";

const feedback = {
  followup: "One more question",
  understood: "Understanding confirmed",
  guidance: "Action to follow",
  manager: "Manager confirmation needed",
  answered: "Answer to your question",
};

export default function WorkerAnswer({ id }) {
  const session = useRef(null);
  const running = useRef(false);
  const [history, setHistory] = useState([]);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const latest = history.at(-1)?.state;
  const complete = ["guidance","understood","manager"].includes(latest);
  async function submit(event) {
    event.preventDefault();
    if (running.current || complete || !answer.trim()) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      session.current ??= crypto.randomUUID();
      const result = await post("/api/respond", {
        id, sessionId: session.current, turn: history.length, answer: answer.trim(),
      }, "Could not send your response. Please try again.");
      setHistory([...history, { ...result, answer: answer.trim() }]);
      setAnswer("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      running.current = false;
    }
  }
  return <div className="worker-response">
    <div aria-live="polite">
      {history.map((entry, i) => <div className="exchange" key={i}>
        <div className="reply"><h3>Your response</h3><p>{entry.answer}</p></div>
        <div className={`feedback ${entry.state}`}><h3>{feedback[entry.state]}</h3><p>{entry.message}</p></div>
      </div>)}
    </div>
    {!complete && <form onSubmit={submit}>
      <label className="field">{latest === "followup" ? "Your follow-up" : "Your response"}
        <textarea rows={3} placeholder="Describe your next action or ask a question…" value={answer} disabled={busy} onChange={e => setAnswer(e.target.value)} />
      </label>
      {error && <p role="alert" className="alert">{error}</p>}
      <div className="actions"><button disabled={busy || !answer.trim()}>{busy ? "Checking response…" : "Send response"}</button></div>
    </form>}
  </div>;
}

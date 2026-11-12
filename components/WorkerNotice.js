"use client";

import { useState } from "react";
import Notice from "./Notice";
import WorkerAnswer from "./WorkerAnswer";
import { post } from "./request";

export default function WorkerNotice({ id }) {
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function selectEnglish() {
    setLoading(true);
    setError("");
    try {
      setNotice(await post("/api/english", { id }, "Please try again."));
    } catch {
      setError("Could not load the English notice. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (notice) return <><Notice notice={notice} /><WorkerAnswer id={id} /></>;
  return <>
    <button onClick={selectEnglish} disabled={loading}>{loading ? "Loading English notice…" : "English"}</button>
    {error && <p role="alert" className="alert">{error}</p>}
  </>;
}

"use client";

// Browser Web Speech API recognition wrapper. It degrades to "unsupported" so
// the worker can always type instead. Written for the React Compiler:
// no manual memoization, no ref writes during render, and browser
// capabilities are read through useSyncExternalStore.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { LANGUAGES, type Lang } from "../../shared/languages.ts";

/* ---------- minimal Web Speech recognition typings (not in lib.dom) ---------- */

interface RecognitionResultEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionConstructor = new () => Recognition;

function recognitionClass(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const noSubscription = () => () => {};

export type RecognitionError = "" | "unsupported" | "denied" | "failed";

// Speech recognition: the transcript is handed back for the worker to review
// and edit; it is never submitted automatically.
export function useRecognition(lang: Lang, onTranscript: (text: string) => void) {
  const supported = useSyncExternalStore(noSubscription, () => recognitionClass() !== null, () => false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<RecognitionError>("");
  const recognition = useRef<Recognition | null>(null);
  const deliver = useRef(onTranscript);

  useEffect(() => {
    deliver.current = onTranscript;
  });
  useEffect(() => () => recognition.current?.abort(), []);

  function stop() {
    recognition.current?.stop();
  }

  function start() {
    const RecognitionClass = recognitionClass();
    if (!RecognitionClass) {
      setError("unsupported");
      return;
    }
    recognition.current?.abort();
    const r = new RecognitionClass();
    r.lang = LANGUAGES[lang].speech;
    r.interimResults = true;
    r.continuous = false;
    r.maxAlternatives = 1;
    let finalText = "";
    r.onresult = event => {
      let pendingText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result) continue;
        if (result.isFinal) finalText += result[0].transcript;
        else pendingText += result[0].transcript;
      }
      setInterim((finalText + " " + pendingText).trim());
    };
    r.onerror = event => {
      setError(event.error === "not-allowed" || event.error === "service-not-allowed" ? "denied"
        : event.error === "aborted" ? "" : "failed");
    };
    r.onend = () => {
      setListening(false);
      setInterim("");
      if (finalText.trim()) deliver.current(finalText.trim());
      recognition.current = null;
    };
    setError("");
    setInterim("");
    recognition.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      setError("failed");
    }
  }

  return { supported, listening, interim, error, start, stop };
}

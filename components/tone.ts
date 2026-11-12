// Meaning → color. Every screen takes its condition and status colors from here
// so a color always means the same thing (see the design-tone spec).
import type { CheckStatus, ConditionKind, TurnState } from "../lib/types.ts";

export const KIND_BG: Record<ConditionKind, string> = {
  time: "bg-time text-white",
  place: "bg-place text-ink",
  action: "bg-action text-ink",
  prohibition: "bg-stop text-ink",
  exception: "bg-except text-ink",
};

export const CHECK_BG: Record<CheckStatus, string> = {
  met: "bg-action text-ink",
  missing: "bg-except text-ink",
  conflict: "bg-stop text-ink",
};

export const CHECK_ICON: Record<CheckStatus, string> = { met: "✓", missing: "?", conflict: "✕" };

export const TURN_BG: Record<TurnState, string> = {
  understood: "bg-action",
  followup: "bg-except",
  guidance: "bg-stop",
  answered: "bg-white",
  manager: "bg-place",
};

export type Tone = "ok" | "bad" | "mid" | "idle" | "wait";

export const TONE_BG: Record<Tone, string> = {
  ok: "bg-action text-ink",
  bad: "bg-stop text-ink",
  mid: "bg-except text-ink",
  idle: "bg-grid text-ink-2",
  wait: "bg-place text-ink",
};

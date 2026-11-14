// Meaning → color. Every screen takes its condition and status colors from here
// so a color always means the same thing.
import type { CheckStatus, ConditionKind, TurnState } from "../shared/types.ts";

export const KIND_BG: Record<ConditionKind, string> = {
  time: "bg-info-bg text-info-fg",
  place: "bg-violet-bg text-violet-fg",
  action: "bg-ok-bg text-ok-fg",
  prohibition: "bg-bad-bg text-bad-fg",
  exception: "bg-warn-bg text-warn-fg",
};

export const CHECK_BG: Record<CheckStatus, string> = {
  met: "bg-ok-bg text-ok-fg",
  missing: "bg-warn-bg text-warn-fg",
  conflict: "bg-bad-bg text-bad-fg",
};

export const CHECK_ICON: Record<CheckStatus, string> = { met: "✓", missing: "?", conflict: "✕" };

export const TURN_BG: Record<TurnState, string> = {
  understood: "bg-ok-bg",
  followup: "bg-warn-bg",
  guidance: "bg-bad-bg",
  answered: "bg-white border border-grid",
  manager: "bg-violet-bg",
};

export type Tone = "ok" | "bad" | "mid" | "idle" | "wait";

export const TONE_BG: Record<Tone, string> = {
  ok: "bg-ok-bg text-ok-fg",
  bad: "bg-bad-bg text-bad-fg",
  mid: "bg-warn-bg text-warn-fg",
  idle: "bg-canvas text-ink-2",
  wait: "bg-violet-bg text-violet-fg",
};

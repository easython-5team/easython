"use client";

import { useEffect } from "react";

const VISIBLE_MS = 3000;

// A short error toast at the top of the screen that hides itself after 3 seconds.
export default function FloatingError({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [message, onClose]);

  return (
    <p role="alert"
      className="fixed top-[calc(12px+env(safe-area-inset-top,0px))] left-1/2 z-50 flex w-max max-w-[min(420px,calc(100%-32px))] -translate-x-1/2 items-center gap-2 rounded-full bg-ink py-2 pr-2 pl-3.5 text-[13px] leading-snug font-semibold text-paper shadow-float [overflow-wrap:anywhere]">
      <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-stop" />
      <span className="min-w-0">{message}</span>
      <button type="button" aria-label="닫기" onClick={onClose}
        className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-full text-ink-3 hover:bg-white/10 hover:text-paper">✕</button>
    </p>
  );
}

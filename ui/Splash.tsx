"use client";

import { useState } from "react";

// Runs while the page is still being parsed, before the splash is painted:
// after the first visit in this tab it hides the splash so it never flashes.
// It also remembers the visit right away, so a reload mid-splash skips it.
const SKIP_SCRIPT = `try{if(sessionStorage.getItem("splash-seen"))document.documentElement.dataset.splash="off";else sessionStorage.setItem("splash-seen","1")}catch(e){}`;

/** Brand splash shown once per tab session on the admin home; tap to skip. Styles in globals.css. */
export default function Splash() {
  const [gone, setGone] = useState(false);
  if (gone) return null;
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: SKIP_SCRIPT }} />
      <div
        className="splash"
        aria-hidden="true"
        onClick={() => setGone(true)}
        onAnimationEnd={e => { if (e.target === e.currentTarget) setGone(true); }}
      >
        <img src="/icon.svg" alt="" className="splash-logo size-20" />
        <span className="splash-name text-[28px] font-bold tracking-[-0.03em]">현장노트</span>
        <span className="splash-tag text-[15px] text-white/60">읽음에서 이해로</span>
      </div>
    </>
  );
}

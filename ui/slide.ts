import { flushSync } from "react-dom";

export type SlideDir = "forward" | "back";

// Swaps screens as a sideways slide: the old screen leaves and the new one
// enters from the other side (styles in globals.css). Without View Transitions
// or with reduced motion, the update just happens.
export function slideTo(dir: SlideDir, update: () => void) {
  if (typeof document.startViewTransition !== "function" || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    update();
    return;
  }
  document.documentElement.dataset.slide = dir;
  document.startViewTransition(() => flushSync(update));
}

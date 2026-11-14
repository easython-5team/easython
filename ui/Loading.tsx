"use client";

import { useEffect, useRef, type RefObject } from "react";
import animation from "./lottie/loading.json";

// "Loading" by khan cindy, LottieFiles (Lottie Simple License):
// https://lottiefiles.com/free-animation/loading-1iEs7DAHLF

// lottie-web touches the DOM when imported, so it is loaded only in the browser.
// Kept outside the component: the React Compiler cannot compile import().
const loadPlayer = () => import("lottie-web/build/player/lottie_light");

/** Plays a looping animation in `box`; holds `stillFrame` when the viewer prefers reduced motion. */
function useLottie(box: RefObject<HTMLSpanElement | null>, data: object, stillFrame: number) {
  useEffect(() => {
    const container = box.current;
    if (!container) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let stop = () => {};
    let cancelled = false;
    loadPlayer().then(({ default: lottie }) => {
      if (cancelled) return;
      const player = lottie.loadAnimation({
        container, renderer: "svg", loop: !still, autoplay: !still, animationData: structuredClone(data),
      });
      if (still) player.goToAndStop(stillFrame, true);
      stop = () => player.destroy();
    }).catch(() => {});
    return () => { cancelled = true; stop(); };
  }, [box, data, stillFrame]);
}

interface LoadingProps {
  /** Pixel size of the square animation. */
  size?: number;
  /** "light" brightens the grey dots for dark backgrounds such as the black button. */
  tone?: "dark" | "light";
  className?: string;
}

export default function Loading({ size: sizeProp, tone: toneProp, className: classProp }: LoadingProps) {
  const size = sizeProp ?? 24;
  const tone = toneProp ?? "dark";
  const box = useRef<HTMLSpanElement>(null);
  useLottie(box, animation, 10);

  return (
    <span ref={box} aria-hidden="true" style={{ width: size, height: size }}
      className={"inline-block shrink-0 " + (tone === "light" ? "brightness-[2.2] " : "") + (classProp ?? "")} />
  );
}


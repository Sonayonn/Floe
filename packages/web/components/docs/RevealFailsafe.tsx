"use client";
import { useEffect } from "react";

/**
 * Docs is a content/reference page, so scroll-reveal must never leave a section
 * permanently invisible. In any non-scrolling render — full-page screenshots,
 * no-JS / crawler fallbacks, print — the IntersectionObserver in `Reveal` never
 * fires for below-fold sections, leaving them at `opacity: 0` (a large black
 * gap). After first paint we mark the document root so any not-yet-revealed
 * `.lp-reveal` inside the docs fades in regardless of scroll. Above-fold
 * sections still animate via the observer; this only backstops the long tail.
 */
export function RevealFailsafe({ delay = 900 }: { delay?: number }) {
  useEffect(() => {
    const id = window.setTimeout(
      () => document.documentElement.classList.add("dx-reveal-ready"),
      delay,
    );
    return () => {
      window.clearTimeout(id);
      document.documentElement.classList.remove("dx-reveal-ready");
    };
  }, [delay]);
  return null;
}

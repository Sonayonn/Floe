"use client";
import { useEffect } from "react";

/* One lightweight client controller for the whole landing page:
   · cursor-following spotlight: writes --mx/--my (%) on any [data-spotlight] el
   · scroll progress: writes --scroll (0..1) on <html> for scroll-driven accents
   All updates are rAF-batched and transform/opacity-only — no layout thrash. */
export function Interactions() {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // ── cursor spotlight ───────────────────────────────────────────────
    let pending: { el: HTMLElement; x: number; y: number } | null = null;
    let raf = 0;
    const flush = () => {
      raf = 0;
      if (!pending) return;
      const { el, x, y } = pending;
      el.style.setProperty("--mx", `${x}%`);
      el.style.setProperty("--my", `${y}%`);
      pending = null;
    };
    const onMove = (e: PointerEvent) => {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-spotlight]");
      if (!el) return;
      const r = el.getBoundingClientRect();
      pending = { el, x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
      if (!raf) raf = requestAnimationFrame(flush);
    };
    if (!reduce) window.addEventListener("pointermove", onMove, { passive: true });

    // ── scroll progress + hero parallax ────────────────────────────────
    const hero = document.querySelector<HTMLElement>(".lp-hero");
    let sraf = 0;
    const onScroll = () => {
      if (sraf) return;
      sraf = requestAnimationFrame(() => {
        sraf = 0;
        const root = document.documentElement;
        const max = root.scrollHeight - window.innerHeight;
        root.style.setProperty("--scroll", String(max > 0 ? window.scrollY / max : 0));
        if (hero) {
          const p = Math.min(1, Math.max(0, window.scrollY / (hero.offsetHeight || 1)));
          hero.style.setProperty("--hero", reduce ? "0" : String(p));
        }
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
      if (sraf) cancelAnimationFrame(sraf);
    };
  }, []);
  return null;
}

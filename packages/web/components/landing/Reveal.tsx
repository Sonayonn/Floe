"use client";
import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react";

/** Scroll-reveal: fades + lifts its children in the first time they enter view. */
export function Reveal({
  children, className = "", delay = 0, as: Tag = "div" as ElementType, ...rest
}: { children: ReactNode; className?: string; delay?: number; as?: ElementType; [key: string]: any }) {
  const ref = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setInView(true); obs.disconnect(); } },
      { threshold: 0.16, rootMargin: "0px 0px -8% 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  // Dynamic-tag components type their children/props as `never` under `ElementType`; render through
  // an `any`-typed alias so the spread props + children check cleanly.
  const Box: any = Tag;
  return (
    <Box ref={ref as any} className={`lp-reveal ${inView ? "is-in" : ""} ${className}`} style={{ transitionDelay: `${delay}ms` }} {...rest}>
      {children}
    </Box>
  );
}

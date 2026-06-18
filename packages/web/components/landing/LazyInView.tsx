"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Mounts children only while near the viewport — keeps a second WebGL canvas
 *  from running until the user scrolls to it, and frees it again when they leave. */
export function LazyInView({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => setShow(e.isIntersecting), { rootMargin: "250px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return <div ref={ref} className={className}>{show && children}</div>;
}

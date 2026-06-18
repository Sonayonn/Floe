"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Brand } from "@/components/shell/Brand";
import { FloeMark } from "@/components/shell/FloeMark";

const LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#suite", label: "Products" },
  { href: "#proof", label: "Live proof" },
  { href: "/docs", label: "Docs" },
];

export function LandingNav() {
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 32);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`lp-nav${solid ? " is-solid" : ""}`}>
      <div className="lp-nav__inner">
        <Link href="/" aria-label="Floe home" className="lp-nav__brand"><Brand size={28} /></Link>
        <nav className="lp-nav__links">
          {LINKS.map((l) => <a key={l.href} href={l.href}>{l.label}</a>)}
        </nav>
        <Link href="/earn" className="k-btn k-btn--primary lp-nav__cta" aria-label="Enter the Floe app">
          <FloeMark size={15} className="lp-nav__cta-mark" />
          Enter app <ArrowRight size={15} />
        </Link>
      </div>
    </header>
  );
}

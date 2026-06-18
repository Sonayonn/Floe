"use client";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Brand } from "@/components/shell/Brand";
import { DOC_NAV, DOC_IDS } from "./nav";
import { useScrollSpy } from "./useScrollSpy";

export function DocsSidebar() {
  const active = useScrollSpy(DOC_IDS);
  return (
    <aside className="dx-side">
      <div className="dx-side__top">
        <Link href="/" aria-label="Floe home" className="dx-side__brand"><Brand size={26} /></Link>
        <Link href="/earn" className="dx-side__app">Back to app <ArrowUpRight size={13} /></Link>
      </div>
      <nav className="dx-side__nav">
        {DOC_NAV.map((g) => (
          <div className="dx-side__group" key={g.group}>
            <div className="dx-side__glabel">{g.group}</div>
            {g.items.map((it) => (
              <a key={it.id} href={`#${it.id}`} className={`dx-side__link${active === it.id ? " is-active" : ""}`}>
                {it.label}
              </a>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}

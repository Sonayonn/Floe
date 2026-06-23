"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { Brand } from "@/components/shell/Brand";
import { DOC_NAV, DOC_IDS } from "./nav";
import { useScrollSpy } from "./useScrollSpy";

export function DocsSidebar() {
  const active = useScrollSpy(DOC_IDS);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="dx-side__toggle"
        aria-label={open ? "Close contents" : "Open contents"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <X size={18} /> : <Menu size={18} />}
        <span>Contents</span>
      </button>

      {open && <button className="dx-side__scrim" aria-label="Close contents" onClick={() => setOpen(false)} />}

      <aside className={`dx-side${open ? " is-open" : ""}`}>
        <div className="dx-side__top">
          <Link href="/" aria-label="Floe home" className="dx-side__brand"><Brand size={26} /></Link>
          <Link href="/earn" className="dx-side__app">Back to app <ArrowUpRight size={13} /></Link>
        </div>
        <nav className="dx-side__nav">
          {DOC_NAV.map((g) => (
            <div className="dx-side__group" key={g.group}>
              <div className="dx-side__glabel">{g.group}</div>
              {g.items.map((it) => (
                <a
                  key={it.id}
                  href={`#${it.id}`}
                  className={`dx-side__link${active === it.id ? " is-active" : ""}`}
                  onClick={() => setOpen(false)}
                >
                  {it.label}
                </a>
              ))}
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}

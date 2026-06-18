"use client";
import { ListTree } from "lucide-react";
import { DOC_NAV, DOC_IDS } from "./nav";
import { useScrollSpy } from "./useScrollSpy";

/** The right-hand "on this page" rail — flat scrollspy index of every section. */
export function OnThisPage() {
  const active = useScrollSpy(DOC_IDS);
  const items = DOC_NAV.flatMap((g) => g.items);
  return (
    <aside className="dx-toc">
      <div className="dx-toc__head"><ListTree size={13} /> On this page</div>
      <ul>
        {items.map((it) => (
          <li key={it.id}>
            <a href={`#${it.id}`} className={active === it.id ? "is-active" : ""}>{it.label}</a>
          </li>
        ))}
      </ul>
    </aside>
  );
}

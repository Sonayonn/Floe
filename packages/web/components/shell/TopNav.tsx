"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Droplets, BookOpen, Send, Menu, X } from "lucide-react";
import { Brand } from "./Brand";
import { AuthButton } from "@/components/auth/AuthButton";
import { NAV, NAV_OPERATE } from "./nav";

const SUI_FAUCET = "https://faucet.sui.io/";
const TELEGRAM = "https://t.me/+DQEQCqMcq5phNWE0";

export function TopNav() {
  const pathname = usePathname();
  const items = [...NAV, ...NAV_OPERATE];
  const [open, setOpen] = useState(false);

  // close the drawer whenever the route changes
  useEffect(() => { setOpen(false); }, [pathname]);

  // lock body scroll + close on Escape while the drawer is open
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
    <header className="floe-topnav">
      <div className="floe-topnav__inner">
        <Link href="/" aria-label="Floe home" className="floe-topnav__brand">
          <Brand size={29} />
        </Link>

        <nav className="floe-topnav__links">
          {items.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link key={item.key} href={item.href} className={`floe-topnav__link${active ? " is-active" : ""}`}>
                <Icon /> {item.label}
              </Link>
            );
          })}
          <Link href="/docs" className="floe-topnav__link"><BookOpen size={16} /> Docs</Link>
        </nav>

        <div className="floe-topnav__right">
          <a className="floe-iconlink" href={TELEGRAM} target="_blank" rel="noreferrer" title="Join the Floe community on Telegram" aria-label="Floe on Telegram">
            <Send size={15} />
          </a>
          <a className="floe-faucet" href={SUI_FAUCET} target="_blank" rel="noreferrer" title="Get testnet SUI for gas">
            <Droplets size={13} /> Faucet
          </a>
          <span className="floe-net">
            <span className="floe-net__dot" /> Testnet
          </span>
          <AuthButton />
          <button
            type="button"
            className="floe-topnav__burger"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      <div className={`floe-mobnav${open ? " is-open" : ""}`} hidden={!open}>
        <button className="floe-mobnav__scrim" aria-label="Close menu" onClick={() => setOpen(false)} />
        <nav className="floe-mobnav__panel" aria-label="Primary">
          {items.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link key={item.key} href={item.href} className={`floe-mobnav__link${active ? " is-active" : ""}`}>
                <Icon size={18} /> {item.label}
              </Link>
            );
          })}
          <Link href="/docs" className={`floe-mobnav__link${pathname.startsWith("/docs") ? " is-active" : ""}`}>
            <BookOpen size={18} /> Docs
          </Link>
          <a className="floe-mobnav__link" href={SUI_FAUCET} target="_blank" rel="noreferrer">
            <Droplets size={18} /> Testnet faucet
          </a>
          <a className="floe-mobnav__link" href={TELEGRAM} target="_blank" rel="noreferrer">
            <Send size={18} /> Community
          </a>
        </nav>
      </div>
    </header>
  );
}

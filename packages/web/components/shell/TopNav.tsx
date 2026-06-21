"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Droplets, BookOpen, Send } from "lucide-react";
import { Brand } from "./Brand";
import { AuthButton } from "@/components/auth/AuthButton";
import { NAV, NAV_OPERATE } from "./nav";

const SUI_FAUCET = "https://faucet.sui.io/";
const TELEGRAM = "https://t.me/+DQEQCqMcq5phNWE0";

export function TopNav() {
  const pathname = usePathname();
  const items = [...NAV, ...NAV_OPERATE];

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
        </div>
      </div>
    </header>
  );
}

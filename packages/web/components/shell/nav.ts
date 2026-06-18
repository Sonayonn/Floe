import { Layers, Wallet, ArrowDownToLine, ShieldCheck, Boxes } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; key: string; icon: LucideIcon };

export const NAV: NavItem[] = [
  { href: "/earn",      label: "Earn",      key: "earn",      icon: Layers },
  { href: "/portfolio", label: "Portfolio", key: "portfolio", icon: Wallet },
  { href: "/borrow",    label: "Borrow",    key: "borrow",    icon: ArrowDownToLine },
  { href: "/verify",    label: "Verify",    key: "verify",    icon: ShieldCheck },
];

// curator/operator surface (absorbed Lagoon "Deploy" role) — separate nav group
export const NAV_OPERATE: NavItem[] = [
  { href: "/deploy", label: "Deploy", key: "deploy", icon: Boxes },
];

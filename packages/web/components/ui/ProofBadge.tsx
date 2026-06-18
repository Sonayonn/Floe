import { ShieldCheck, Clock, CircleDashed, AlertTriangle } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type VaultSafety = "verified" | "unattested" | "degraded-stale" | "degraded-divergent";

type Visual = { state: "verified" | "stale" | "unattested"; Icon: LucideIcon; text: string; sub: string | null };

const VISUAL: Record<VaultSafety, Visual> = {
  verified:             { state: "verified",   Icon: ShieldCheck,   text: "Proven",        sub: "floor attested" },
  "degraded-stale":     { state: "stale",      Icon: Clock,         text: "Floor proven",  sub: "re-attest pending" },
  "degraded-divergent": { state: "stale",      Icon: AlertTriangle, text: "Mark divergent", sub: "floor enforced" },
  unattested:           { state: "unattested", Icon: CircleDashed,  text: "Unattested",    sub: null },
};

/** Floe's signature provenance device. Every NAV / valuation carries one.
 *  Stale is rendered as calm, designed-safe behavior — never as an error. */
export function ProofBadge({
  label,
  fresh = false,
  size = "md",
}: {
  label: VaultSafety;
  fresh?: boolean;
  size?: "sm" | "md";
}) {
  const v = VISUAL[label] ?? VISUAL.unattested;
  const Icon = v.Icon;
  return (
    <span className="proof-badge" data-state={v.state} data-fresh={fresh ? "1" : undefined} data-size={size}>
      <span className="proof-badge__dot" aria-hidden />
      <Icon className="proof-badge__icon" aria-hidden />
      <span className="proof-badge__text">{v.text}</span>
      {v.sub && (
        <>
          <span className="proof-badge__sep" aria-hidden>·</span>
          <span className="proof-badge__sub">{v.sub}</span>
        </>
      )}
    </span>
  );
}

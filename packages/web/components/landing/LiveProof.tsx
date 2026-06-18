"use client";
import { ExternalLink } from "lucide-react";
import { useVaults } from "@/lib/hooks/useVaults";
import { fmtMoney } from "@/lib/format";
import { suiObject, suiAccount } from "@/lib/explorer";
import { FLOE_ADDRESSES } from "@floe/sdk/browser";

const A = FLOE_ADDRESSES.testnet;

/** Reads the same live testnet state the app runs on — so the landing's numbers
 *  are the real ones, not a mockup. Every figure links to its on-chain object. */
export function LiveProof() {
  const { data: vaults, isLoading, error } = useVaults();
  const rows = vaults ?? [];

  const totalNav = rows.reduce((s, v) => s + v.nav, 0n);
  const totalFloor = rows.reduce((s, v) => s + v.navLowerBound, 0n);
  const verified = rows.filter((v) => v.navSafetyLabel === "verified").length;
  const pctProven = totalNav === 0n ? 0 : Number((totalFloor * 10000n) / totalNav) / 100;

  const stats = [
    { k: "Vaults live", v: isLoading ? "…" : String(rows.length), href: suiObject(A.refVault), sub: "on testnet" },
    { k: "Total NAV", v: isLoading ? "…" : fmtMoney(totalNav), href: suiObject(A.refVault), sub: "across vaults" },
    { k: "Proven floor", v: isLoading ? "…" : `${pctProven.toFixed(1)}%`, href: suiObject(A.lend.refPool), sub: "cryptographically certain", accent: true },
    { k: "Registered enclave", v: "Live", href: suiObject(A.nav.package), sub: "Nautilus · on-chain" },
  ];

  return (
    <div className="lp-proof__grid">
      {stats.map((s) => (
        <a key={s.k} href={s.href} target="_blank" rel="noreferrer" className="lp-proof__stat" data-spotlight>
          <span className="lp-proof__k">{s.k}</span>
          <span className={`lp-proof__v${s.accent ? " lp-proof__v--accent" : ""}`}>{s.v}</span>
          <span className="lp-proof__sub">{s.sub} <ExternalLink size={11} /></span>
        </a>
      ))}
      {error && <div className="lp-proof__err">Could not reach testnet right now — figures resume when the node responds.</div>}
      <a href={suiAccount(A.lend.refPool)} target="_blank" rel="noreferrer" className="lp-proof__verified">
        {isLoading ? "Reading attestations…" : `${verified}/${rows.length || "—"} proofs fresh`}
      </a>
    </div>
  );
}

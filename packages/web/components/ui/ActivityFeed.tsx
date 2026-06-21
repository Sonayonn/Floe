"use client";
import { useMemo } from "react";
import { useSuiClientQuery } from "@mysten/dapp-kit";
import {
  ArrowDownToLine, ArrowUpFromLine, Hourglass, CheckCircle2, Coins,
  ShieldAlert, Sparkles, Layers, ExternalLink,
} from "lucide-react";
import { FLOE_ADDRESSES } from "@floe/sdk/browser";
import { fmt6, shortAddr } from "@/lib/format";
import { suiTx, suiAccount } from "@/lib/explorer";

const ORIG = FLOE_ADDRESSES.testnet.packageOriginal; // type-origin pkg: floe events match across upgrades

// Map a vault event (by type suffix) to a display row. `j` is the event's parsedJson.
type Row = { icon: React.ComponentType<{ size?: number }>; tone: string; label: string; detail: string; who?: string };
function describe(typeSuffix: string, j: any): Row | null {
  const dUSDC = (v: any) => `${fmt6(BigInt(v ?? 0))} dUSDC`;
  const sh = (v: any) => `${fmt6(BigInt(v ?? 0))} flShare`;
  switch (typeSuffix) {
    case "DepositEvent":
      return { icon: ArrowDownToLine, tone: "pos", label: "Deposit", detail: `${dUSDC(j.amount)} → ${sh(j.shares)}`, who: j.who };
    case "WithdrawEvent":
      return { icon: ArrowUpFromLine, tone: "neg", label: "Withdraw", detail: `${sh(j.shares)} → ${dUSDC(j.payout)}`, who: j.who };
    case "RedeemRequested":
      return { icon: Hourglass, tone: "muted", label: "Redeem requested", detail: `${sh(j.shares)} → ${dUSDC(j.owed_q)}`, who: j.owner };
    case "RedeemsFulfilled":
      return { icon: CheckCircle2, tone: "pos", label: "Redeems fulfilled", detail: `${dUSDC(j.reserved_q)} reserved` };
    case "RedeemClaimed":
      return { icon: CheckCircle2, tone: "pos", label: "Redeem claimed", detail: dUSDC(j.owed_q) };
    case "PositionSettled":
      return { icon: Layers, tone: "muted", label: "Position settled", detail: dUSDC(j.settled_value) };
    case "FeeAccrued":
      return { icon: Coins, tone: "muted", label: "Fees accrued", detail: `${sh(BigInt(j.curator_shares ?? 0) + BigInt(j.protocol_shares ?? 0))}` };
    case "NavGuardTripped":
      return { icon: ShieldAlert, tone: "neg", label: "NAV guard tripped", detail: `floor ${dUSDC(j.lower_bound)} · full ${dUSDC(j.full_nav)}` };
    case "VaultDeployed":
      return { icon: Sparkles, tone: "pos", label: "Vault created", detail: "", who: j.curator };
    default:
      return null; // agent/guardian/admin events: not surfaced in the user activity feed
  }
}

function ago(ms: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function ActivityFeed({ vaultId }: { vaultId: string }) {
  // All floe events (type-origin pkg ⇒ matches every upgraded version), newest first; filter to this vault.
  const ev = useSuiClientQuery(
    "queryEvents",
    { query: { MoveEventModule: { package: ORIG, module: "floe" } }, limit: 50, order: "descending" },
    { refetchInterval: 20_000 }
  );

  const rows = useMemo(() => {
    const want = vaultId.toLowerCase();
    return (ev.data?.data ?? [])
      .map((e) => {
        const j = e.parsedJson as any;
        const vid = (j?.vault_id ?? "").toString().toLowerCase();
        if (vid !== want) return null;
        const suffix = e.type.split("::").pop() ?? "";
        const r = describe(suffix, j);
        if (!r) return null;
        return { ...r, digest: e.id.txDigest, ts: Number(e.timestampMs ?? 0) };
      })
      .filter(Boolean) as (Row & { digest: string; ts: number })[];
  }, [ev.data, vaultId]);

  if (ev.isLoading) return <div className="k-proof k-proof--pending">Reading vault activity from testnet…</div>;
  if (ev.error) return <div className="k-proof k-proof--pending">Could not read activity — {(ev.error as Error).message}</div>;
  if (rows.length === 0)
    return (
      <div className="floe-panel" style={{ padding: 20, color: "var(--text-subtle)", fontSize: 13 }}>
        No on-chain activity for this vault yet. Deposits, withdrawals, redeems, settlements, and fee accruals
        will appear here as they happen — each linked to its transaction.
      </div>
    );

  return (
    <div className="floe-panel" style={{ padding: 0, overflow: "hidden" }}>
      {rows.map((r, i) => {
        const Icon = r.icon;
        return (
          <a
            key={`${r.digest}-${i}`}
            href={suiTx(r.digest)}
            target="_blank"
            rel="noreferrer"
            className="act-row"
            style={{
              display: "flex", alignItems: "center", gap: 12, padding: "13px 18px",
              borderTop: i === 0 ? "none" : "1px solid var(--border)", textDecoration: "none", color: "inherit",
            }}
          >
            <span data-tone={r.tone} className="act-dot" style={{ display: "inline-flex", color: "var(--text-muted)" }}>
              <Icon size={16} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 500 }}>{r.label}</div>
              {r.detail && <div style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text-subtle)" }}>{r.detail}</div>}
            </div>
            {r.who && (
              <span
                onClick={(e) => { e.stopPropagation(); window.open(suiAccount(r.who!), "_blank"); }}
                style={{ fontSize: 11.5, fontFamily: "var(--font-mono)", color: "var(--text-subtle)" }}
                title={r.who}
              >
                {shortAddr(r.who)}
              </span>
            )}
            <span style={{ fontSize: 11.5, color: "var(--text-subtle)", whiteSpace: "nowrap", minWidth: 56, textAlign: "right" }}>
              {r.ts ? ago(r.ts) : ""}
            </span>
            <ExternalLink size={13} style={{ color: "var(--text-subtle)", opacity: 0.6 }} />
          </a>
        );
      })}
    </div>
  );
}

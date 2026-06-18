import { fmt6 } from "@/lib/format";
import { VenueMark } from "./Logo";

export interface Allocation { venue: string; label: string; amount: bigint; live: boolean; }

export function AllocationBar({ allocations, total }: { allocations: Allocation[]; total: bigint }) {
  const t = total > 0n ? total : 1n;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", height: 12, borderRadius: 999, overflow: "hidden", background: "var(--surface-raised)", border: "1px solid var(--border)" }}>
        {allocations.map((a) => {
          const pct = Number((a.amount * 10000n) / t) / 100;
          if (pct <= 0) return null;
          return <div key={a.venue} style={{ width: `${pct}%`, background: a.live ? "linear-gradient(90deg, var(--accent-deep), var(--accent))" : "var(--border-strong)" }} title={`${a.label}: ${pct.toFixed(1)}%`} />;
        })}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {allocations.map((a) => {
          const pct = Number((a.amount * 10000n) / t) / 100;
          return (
            <div key={a.venue} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
              <VenueMark venueKey={a.venue} size={18} live={a.live} title={a.label} />
              <span style={{ color: "var(--text)" }}>{a.label}</span>
              {!a.live && <span className="floe-eyebrow" style={{ fontSize: 9 }}>mainnet</span>}
              <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>{fmt6(a.amount)}</span>
              <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-subtle)", width: 52, textAlign: "right" }}>{pct.toFixed(1)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

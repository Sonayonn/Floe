"use client";
import { use, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useVault } from "@/lib/hooks/useVault";
import { useVaults } from "@/lib/hooks/useVaults";
import { ProofBadge, type VaultSafety } from "@/components/ui/ProofBadge";
import { WaterlineBar } from "@/components/ui/WaterlineBar";
import { Tabs } from "@/components/ui/Tabs";
import { StatBlock } from "@/components/ui/StatBlock";
import { VenueChip } from "@/components/ui/VenueChip";
import { OfficialBadge } from "@/components/ui/OfficialBadge";
import { AllocationBar } from "@/components/ui/AllocationBar";
import { LiquidityEarnings } from "@/components/ui/LiquidityEarnings";
import { YieldComposition } from "@/components/ui/YieldComposition";
import { AttestationFeed } from "@/components/ui/AttestationFeed";
import { DepositPanel } from "@/components/ui/DepositPanel";
import { deriveAllocations, vaultVenues } from "@/lib/allocations";
import { isHidden } from "@/lib/hidden";
import { isOfficial } from "@/lib/official";
import { fmt6, shortAddr } from "@/lib/format";
import { FLOE_ADDRESSES } from "@floe/sdk/browser";

const Q = FLOE_ADDRESSES.testnet.refVaultQType;
const S = FLOE_ADDRESSES.testnet.refVaultSType;

export default function VaultDetail({ params }: { params: Promise<{ vaultId: string }> }) {
  const { vaultId } = use(params);
  const router = useRouter();
  // Hidden vaults (e.g. the SDK demo) are removed product-wide; a direct link bounces to Earn.
  useEffect(() => {
    if (isHidden(vaultId)) router.replace("/earn");
  }, [vaultId, router]);
  const { data: v, isLoading, error } = useVault(vaultId);
  // Name + strategy kind live on the registry entry, not on the live VaultState —
  // pull them from the (cached) vaults list so the header isn't a generic "Vault".
  const { data: vaults } = useVaults();
  const meta = vaults?.find((r) => r.vaultId === vaultId);

  // All hooks above run unconditionally; guard renders only after them (the effect redirects).
  if (isHidden(vaultId)) return null;
  if (isLoading) return <div className="k-proof k-proof--pending">Reading vault from testnet…</div>;
  if (error || !v) return <div className="k-proof k-proof--pending">Could not read vault — {(error as Error)?.message ?? "not found"}</div>;

  const name = meta?.name ?? "Vault";
  const strategyKind = meta?.strategyKind ?? "structured";

  const { allocations, total } = deriveAllocations(v);
  // Header chips + strategy phrase show the vault's venue MANDATE (DeepBook base
  // + Cetus for multi-venue); the AllocationBar below shows the honest live split.
  const venues = vaultVenues(strategyKind);
  const venuePhrase = venues.map((vn) => vn.name).join(" + ");
  const mgmtPct = (Number(v.managementFeeBps) / 100).toFixed(2);
  const perfPct = (Number(v.performanceFeeBps) / 100).toFixed(2);

  const overview = (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-7)" }}>
      <LiquidityEarnings vaultId={vaultId} live={v} />
      <div className="floe-hero__statgrid">
        <StatBlock label="NAV" value={fmt6(v.nav)} size={30} sub="total assets · 6dp" />
        <StatBlock label="Proven floor" value={fmt6(v.navLowerBound)} size={30} accent sub={`${v.pctCertain.toFixed(1)}% certain`} />
        <StatBlock label="Share price" value={fmt6(v.sharePrice)} size={30} sub="per flShare" />
      </div>
      <div className="floe-panel" style={{ padding: 20 }}>
        <div className="floe-panel__title" style={{ marginBottom: 14 }}>Allocation across venues</div>
        <AllocationBar allocations={allocations} total={total} />
        <p style={{ fontSize: 12, color: "var(--text-subtle)", marginTop: 14, lineHeight: 1.5 }}>
          Capital is spread across Sui venues — if any single venue pauses, the vault still holds its other positions and idle reserve, and still redeems at the proven floor.
        </p>
      </div>
      <div className="floe-panel" style={{ padding: 20 }}>
        <div className="floe-panel__title" style={{ marginBottom: 14 }}>Yield composition</div>
        <YieldComposition
          lines={[
            { label: "Gross strategy yield", value: "—", tone: "pos" },
            { label: `Management fee (${mgmtPct}%)`, value: `-${mgmtPct}%`, tone: "neg" },
            { label: `Performance fee (${perfPct}%)`, value: `-${perfPct}%`, tone: "neg" },
          ]}
          net={{ label: "Net to depositor", value: "tracked on-chain" }}
        />
        <p style={{ fontSize: 11.5, color: "var(--text-subtle)", marginTop: 12, lineHeight: 1.5 }}>
          Returns accrue as share-price growth. APY figures are shown with their window and net of fees — never a headline number without context.
        </p>
      </div>
    </div>
  );

  const verify = (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      <WaterlineBar nav={v.nav} floor={v.navLowerBound} pctCertain={v.pctCertain} />
      <AttestationFeed vault={v} />
    </div>
  );

  const info = (
    <div className="floe-table" style={{ display: "block" }}>
      <table className="floe-table">
        <tbody>
          {[
            ["Deposit asset", "dUSDC"],
            ["Share token", "flShare"],
            ["Curator", shortAddr(v.curator)],
            ["Vault ID", shortAddr(v.vaultId)],
            ["Management fee", `${mgmtPct}%`],
            ["Performance fee", `${perfPct}%`],
            ["Strategy", `${strategyKind} · ${venuePhrase}`],
            ["Attestation", v.attested ? "Hardware (AWS Nitro enclave)" : "Not registered"],
            ["Withdrawal", "Synchronous at floor; async redeem for full NAV"],
            ["Version", `v${v.version.toString()}`],
          ].map(([k, val]) => (
            <tr key={k}>
              <td className="muted">{k}</td>
              <td className="r num">{val}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="vd">
      <div className="vd__main">
        <Link href="/earn" className="vd__back">
          <ArrowLeft size={15} /> All vaults
        </Link>
        <div className="vd__title-row">
          <h1 className="vd__title">{name}</h1>
          <ProofBadge label={v.navSafetyLabel as VaultSafety} fresh={v.navFresh} />
          {isOfficial(v.curator) && <OfficialBadge />}
        </div>
        <p className="vd__strategy">
          {strategyKind.charAt(0).toUpperCase() + strategyKind.slice(1)} strategy. Allocates across {venuePhrase} and
          redeems at the attested floor — full NAV when proven fresh, the proven floor when stale. Never overpaid, never blocked.
        </p>
        <div className="vd__venues">
          {venues.map((vn) => <VenueChip key={vn.key} venueKey={vn.key} name={vn.name} status={vn.status} />)}
        </div>
        <Tabs tabs={[{ label: "Overview", content: overview }, { label: "Verify", content: verify }, { label: "Vault Info", content: info }]} />
      </div>
      <DepositPanel vault={v} qType={Q} sType={S} />
    </div>
  );
}

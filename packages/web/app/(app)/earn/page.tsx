"use client";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { useVaults, type VaultRow } from "@/lib/hooks/useVaults";
import { ProofBadge, type VaultSafety } from "@/components/ui/ProofBadge";
import { WaterlineBar } from "@/components/ui/WaterlineBar";
import { AssetBadge } from "@/components/ui/AssetBadge";
import { OfficialBadge } from "@/components/ui/OfficialBadge";
import { VenueChip } from "@/components/ui/VenueChip";
import { VenueMark } from "@/components/ui/Logo";
import { vaultVenues } from "@/lib/allocations";
import { isOfficial } from "@/lib/official";
import { fmt6, fmtMoney, shortAddr } from "@/lib/format";

const DEPOSIT_SYMBOL = "dUSDC"; // all live testnet vaults are Vault<DUSDC, SHARE>

/** Venue identity for a row (DeepBook base + Cetus for multi-venue), in the shape
 *  the table/feature render with: `{ key, meta, live }`. See {@link vaultVenues}. */
function activeVenues(v: VaultRow) {
  return vaultVenues(v.strategyKind).map((m) => ({ key: m.key, meta: m, live: m.status === "live" }));
}

export default function EarnPage() {
  const { data: vaults, isLoading, error } = useVaults();

  const sorted = (vaults ?? []).slice().sort((a, b) => {
    // Floe-official first, then by NAV descending
    const o = Number(isOfficial(b.curator)) - Number(isOfficial(a.curator));
    if (o !== 0) return o;
    return b.nav > a.nav ? 1 : b.nav < a.nav ? -1 : 0;
  });
  const feature = sorted[0];

  // live aggregate KPIs
  const totalNav = sorted.reduce((s, v) => s + v.nav, 0n);
  const totalFloor = sorted.reduce((s, v) => s + v.navLowerBound, 0n);
  const verified = sorted.filter((v) => v.navSafetyLabel === "verified").length;
  const aggCertain = totalNav === 0n ? 0 : Number((totalFloor * 10000n) / totalNav) / 100;

  return (
    <div className="earn">
      <div className="page-head">
        <div>
          <div className="floe-eyebrow">Verifiable asset management · on Sui</div>
          <h1 className="page-head__title">Earn</h1>
          <p className="page-head__sub">
            Curator-run vaults that allocate across Sui venues and prove their redeemable floor with hardware
            attestation — not a trusted oracle. Every figure below is verifiable on-chain.
          </p>
        </div>
        {!isLoading && !error && sorted.length > 0 && (
          <div className="kpi-strip">
            <div className="kpi">
              <span className="kpi__k">Vaults</span>
              <span className="kpi__v">{sorted.length}</span>
            </div>
            <div className="kpi">
              <span className="kpi__k">Total NAV</span>
              <span className="kpi__v">{fmtMoney(totalNav)}</span>
            </div>
            <div className="kpi">
              <span className="kpi__k">Proven floor</span>
              <span className="kpi__v kpi__v--accent">{aggCertain.toFixed(1)}%</span>
            </div>
            <div className="kpi">
              <span className="kpi__k">Proofs fresh</span>
              <span className="kpi__v">{verified}/{sorted.length}</span>
            </div>
          </div>
        )}
      </div>

      {isLoading && (
        <>
          <div className="state-line"><span className="state-line__spinner" /> Reading vaults from testnet…</div>
          <div className="floe-panel" style={{ padding: "var(--space-6)", display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
            {[0, 1, 2].map((i) => <div key={i} className="skel" style={{ height: 56 }} />)}
          </div>
        </>
      )}

      {error && (
        <div className="floe-panel" style={{ padding: "var(--space-7)" }}>
          <div className="state-line" style={{ color: "var(--stale)" }}>
            Could not read vaults from testnet — {(error as Error).message}
          </div>
        </div>
      )}

      {!isLoading && !error && sorted.length === 0 && (
        <div className="floe-panel" style={{ padding: "var(--space-8)", textAlign: "center" }}>
          <p style={{ color: "var(--text-muted)" }}>No vaults are live on the registry yet.</p>
        </div>
      )}

      {/* Featured flagship */}
      {feature && (
        <section className="earn-feature">
          <div className="earn-feature__main">
            <div className="earn-feature__top">
              <span className="earn-feature__label">Flagship vault</span>
              {isOfficial(feature.curator) && <OfficialBadge />}
              <ProofBadge label={feature.navSafetyLabel as VaultSafety} fresh={feature.navFresh} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)", marginBottom: "var(--space-2)" }}>
              <AssetBadge symbol={DEPOSIT_SYMBOL} size={34} showSymbol={false} />
              <h2 className="earn-feature__name">{feature.name}</h2>
            </div>
            <p className="earn-feature__strategy">
              {feature.strategyKind ? `${feature.strategyKind} strategy. ` : ""}
              Allocates across {activeVenues(feature).map((v) => v.meta?.name ?? v.key).join(", ") || "idle reserve"} and
              redeems at the attested floor — full NAV when proven fresh, the proven floor when stale. Never overpaid,
              never blocked.
            </p>
            <div className="earn-feature__venues">
              {activeVenues(feature).map((v) =>
                v.meta ? <VenueChip key={v.key} venueKey={v.key} name={v.meta.name} status={v.meta.status} /> : null
              )}
            </div>
            <div className="earn-feature__meta">
              <div className="kpi">
                <span className="kpi__k">Curator</span>
                <span className="kpi__v" style={{ fontSize: "var(--text-base)" }}>{shortAddr(feature.curator)}</span>
              </div>
              <div className="kpi">
                <span className="kpi__k">Deposit asset</span>
                <span className="kpi__v" style={{ fontSize: "var(--text-base)" }}>{DEPOSIT_SYMBOL}</span>
              </div>
            </div>
            <div className="earn-feature__actions">
              <Link href={`/earn/${feature.vaultId}`} className="k-btn k-btn--primary">
                Open vault <ArrowRight size={15} />
              </Link>
              <Link href={`/earn/${feature.vaultId}`} className="k-btn k-btn--secondary">View attestation</Link>
            </div>
          </div>

          <div className="earn-feature__rail">
            <WaterlineBar nav={feature.nav} floor={feature.navLowerBound} pctCertain={feature.pctCertain} symbol={DEPOSIT_SYMBOL} />
            <div className="earn-feature__substats">
              <div className="kpi">
                <span className="kpi__k">Share price</span>
                <span className="kpi__v">{fmt6(feature.sharePrice, 4)}</span>
              </div>
              <div className="kpi">
                <span className="kpi__k">Active venues</span>
                <span className="kpi__v">{activeVenues(feature).length}</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Directory */}
      {sorted.length > 0 && (
        <div className="floe-panel">
          <div className="floe-panel__head">
            <div className="floe-panel__title">All vaults</div>
            <div className="floe-panel__sub">{sorted.length} live · testnet · deploy-parity</div>
          </div>
          <div className="earn-dir__scroll">
            <table className="earn-table">
              <thead>
                <tr>
                  <th>Vault</th>
                  <th>Venues</th>
                  <th className="r">NAV</th>
                  <th className="r">Proven floor</th>
                  <th className="r">Share price</th>
                  <th className="r" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((v) => {
                  const venues = activeVenues(v);
                  return (
                    <tr key={v.vaultId} onClick={() => { window.location.href = `/earn/${v.vaultId}`; }}>
                      <td>
                        <div className="earn-row__vault">
                          <AssetBadge symbol={DEPOSIT_SYMBOL} size={32} showSymbol={false} />
                          <div className="earn-row__id">
                            <span className="earn-row__name">
                              {v.name}
                              {isOfficial(v.curator) && <OfficialBadge />}
                            </span>
                            <span className="earn-row__strategy">
                              {v.strategyKind || "structured"} · {shortAddr(v.curator)}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="venue-mix">
                          {venues.slice(0, 3).map((vn) => (
                            <VenueMark key={vn.key} venueKey={vn.key} size={30} live={vn.live} title={vn.meta?.name ?? vn.key} />
                          ))}
                          {venues.length > 3 && <span className="venue-mix__more">+{venues.length - 3}</span>}
                        </span>
                      </td>
                      <td className="r">
                        <div className="earn-row__num">{fmt6(v.nav)}</div>
                        <div style={{ marginTop: 6, display: "inline-flex" }}>
                          <ProofBadge label={v.navSafetyLabel as VaultSafety} fresh={v.navFresh} size="sm" />
                        </div>
                      </td>
                      <td className="r">
                        <div className="earn-row__num earn-row__num--floor">{fmt6(v.navLowerBound)}</div>
                        <div className="earn-row__sub">{v.pctCertain.toFixed(1)}% certain</div>
                      </td>
                      <td className="r">
                        <div className="earn-row__num">{fmt6(v.sharePrice, 4)}</div>
                        <div className="earn-row__sub">per share</div>
                      </td>
                      <td className="r">
                        <span className="earn-row__cta">Deposit <ArrowUpRight size={14} /></span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

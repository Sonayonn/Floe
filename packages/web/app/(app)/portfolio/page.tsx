"use client";
import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight, ArrowUpRight, ExternalLink, ShieldCheck, Wallet } from "lucide-react";
import { useCurrentAccount, useSuiClientQuery } from "@mysten/dapp-kit";
import { useVaults, type VaultRow } from "@/lib/hooks/useVaults";
import { useLendMarket } from "@/lib/hooks/useLendMarket";
import { useCoins } from "@/lib/hooks/useCoins";
import { ProofBadge, type VaultSafety } from "@/components/ui/ProofBadge";
import { OfficialBadge } from "@/components/ui/OfficialBadge";
import { AssetBadge } from "@/components/ui/AssetBadge";
import { WaterlineBar } from "@/components/ui/WaterlineBar";
import { isOfficial } from "@/lib/official";
import { fmt6, shortAddr } from "@/lib/format";
import { suiAccount, suiObject } from "@/lib/explorer";
import { FLOE_ADDRESSES, assetFor } from "@floe/sdk/browser";

const A = FLOE_ADDRESSES.testnet;
const Q = A.refVaultQType; // dUSDC (borrow asset)
const S = A.refVaultSType; // flShare (vault share = collateral)
const LEND = A.lend;

/** Health factor = collateralValue × liqThreshold / debt. >1 solvent; <1 liquidatable. */
function healthFactor(collateralValue: bigint, debt: bigint, liqThresholdBps: bigint): number {
  if (debt <= 0n) return Infinity;
  return (Number(collateralValue) * (Number(liqThresholdBps) / 10000)) / Number(debt);
}
function hfTone(hf: number): "ok" | "warn" | "danger" {
  if (hf >= 1.6) return "ok";
  if (hf >= 1.15) return "warn";
  return "danger";
}

export default function PortfolioPage() {
  const account = useCurrentAccount();
  const addr = account?.address;

  const { data: vaults, isLoading: vaultsLoading } = useVaults();
  const { data: market } = useLendMarket();

  // The vault that issued flShare — its attested state is the valuation basis for every share figure.
  const shareVault: VaultRow | undefined = useMemo(() => {
    const vs = vaults ?? [];
    return vs.find((v) => v.vaultId === A.refVault) ?? vs.find((v) => isOfficial(v.curator)) ?? vs[0];
  }, [vaults]);

  // per-share value, 6dp. floor = trustless redeemable floor; full = current share price.
  const floorPerShare =
    shareVault && shareVault.shareSupply > 0n
      ? (shareVault.navLowerBound * 1_000_000n) / shareVault.shareSupply
      : 0n;
  const fullPerShare = shareVault?.sharePrice ?? 0n;

  // wallet balances
  const { total: walletShares } = useCoins(addr, S);
  const { total: walletDusdc } = useCoins(addr, Q);

  // open borrow positions (DebtPosition<Q,S> owned by the user, in the live pool)
  const debtType = `${LEND.package}::${LEND.module}::DebtPosition<${Q}, ${S}>`;
  const owned = useSuiClientQuery(
    "getOwnedObjects",
    { owner: addr ?? "", filter: { StructType: debtType }, options: { showContent: true } },
    { enabled: !!addr, refetchInterval: 20_000 }
  );
  const positions = useMemo(() => {
    return (owned.data?.data ?? [])
      .map((o) => {
        const f = (o.data?.content as any)?.fields;
        if (!f) return null;
        const collateral = BigInt(f.collateral ?? 0);
        const debt = BigInt(f.debt_principal ?? 0);
        return {
          id: o.data!.objectId,
          poolId: f.pool_id as string,
          collateral,
          debt,
          collateralValue: (collateral * floorPerShare) / 1_000_000n,
        };
      })
      .filter(Boolean) as {
      id: string; poolId: string; collateral: bigint; debt: bigint; collateralValue: bigint;
    }[];
  }, [owned.data, floorPerShare]);

  // ── aggregate equity (floor basis — what you can prove you own) ──
  const positionFull = (walletShares * fullPerShare) / 1_000_000n;
  const positionFloor = (walletShares * floorPerShare) / 1_000_000n;
  const lockedShares = positions.reduce((s, p) => s + p.collateral, 0n);
  const lockedFloor = positions.reduce((s, p) => s + p.collateralValue, 0n);
  const lockedFull = (lockedShares * fullPerShare) / 1_000_000n;
  const totalDebt = positions.reduce((s, p) => s + p.debt, 0n);

  const exposureFull = positionFull + lockedFull + walletDusdc;
  const exposureFloor = positionFloor + lockedFloor + walletDusdc;
  const netWorthFloor = exposureFloor - totalDebt;
  const pctCertain = exposureFull > 0n ? Number((exposureFloor * 10000n) / exposureFull) / 100 : 0;

  const sMeta = assetFor(S);
  const qMeta = assetFor(Q);
  const hasShares = walletShares > 0n;
  const hasBorrows = positions.length > 0;
  const hasAnything = hasShares || walletDusdc > 0n || hasBorrows;

  return (
    <div className="pf">
      <div className="page-head">
        <div>
          <div className="floe-eyebrow">Your stake · proven on-chain</div>
          <h1 className="page-head__title">Portfolio</h1>
          <p className="page-head__sub">
            Everything you hold across Floe — vault shares, idle balance, and open borrows — valued at the
            enclave-attested floor. Not a dashboard estimate: every figure resolves to on-chain state you can verify.
          </p>
        </div>
        {addr && (
          <div className="kpi-strip">
            <div className="kpi">
              <span className="kpi__k">Net worth</span>
              <span className="kpi__v kpi__v--accent">{fmt6(netWorthFloor)}</span>
            </div>
            <div className="kpi">
              <span className="kpi__k">Vault exposure</span>
              <span className="kpi__v">{fmt6(positionFull + lockedFull)}</span>
            </div>
            <div className="kpi">
              <span className="kpi__k">Idle {qMeta.symbol}</span>
              <span className="kpi__v">{fmt6(walletDusdc)}</span>
            </div>
            <div className="kpi">
              <span className="kpi__k">Borrowed</span>
              <span className="kpi__v">{fmt6(totalDebt)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Not connected */}
      {!addr && (
        <div className="floe-panel pf-connect">
          <div className="pf-connect__icon"><Wallet size={26} /></div>
          <div className="pf-connect__t">Connect your wallet to see your position</div>
          <p className="pf-connect__d">
            Your portfolio is read straight from the chain — connect to value your vault shares at the proven floor and
            track any open borrows. Nothing is stored off-chain.
          </p>
          <Link href="/earn" className="k-btn k-btn--secondary">Browse vaults <ArrowRight size={15} /></Link>
        </div>
      )}

      {addr && (
        <>
          {/* Snapshot hero — net worth + proven-floor waterline across the whole portfolio */}
          <section className="pf-hero floe-panel">
            <div className="pf-hero__main">
              <div className="floe-eyebrow">Total equity · floor basis</div>
              <div className="pf-hero__nw">{fmt6(netWorthFloor)} <span>{qMeta.symbol}</span></div>
              <p className="pf-hero__sub">
                Vault shares valued at the attested redeemable floor, plus idle {qMeta.symbol}, minus what you owe.
                {exposureFull > exposureFloor && (
                  <> Full mark would be {fmt6(exposureFull - totalDebt)} — the gap is unproven upside Floe never lets
                  you over-redeem against.</>
                )}
              </p>
              <Link href={suiAccount(addr)} target="_blank" rel="noreferrer" className="pf-hero__addr">
                {shortAddr(addr)} <ExternalLink size={12} />
              </Link>
            </div>
            <div className="pf-hero__rail">
              {exposureFull > 0n ? (
                <WaterlineBar nav={exposureFull} floor={exposureFloor} pctCertain={pctCertain} symbol={qMeta.symbol} />
              ) : (
                <div className="pf-empty-mini">No vault exposure yet</div>
              )}
            </div>
          </section>

          {vaultsLoading && !shareVault && (
            <div className="state-line"><span className="state-line__spinner" /> Reading your position from testnet…</div>
          )}

          {/* Holdings */}
          <div className="pf-cols">
            {/* Vault shares */}
            <div className="floe-panel">
              <div className="floe-panel__head">
                <div className="floe-panel__title">Vault shares</div>
                <div className="floe-panel__sub">redeemable at the proven floor</div>
              </div>
              {hasShares && shareVault ? (
                <div className="pf-pos">
                  <div className="pf-pos__top">
                    <AssetBadge symbol={qMeta.symbol} size={32} showSymbol={false} />
                    <div className="pf-pos__id">
                      <span className="pf-pos__name">
                        {shareVault.name}
                        {isOfficial(shareVault.curator) && <OfficialBadge />}
                      </span>
                      <span className="pf-pos__sub">{shareVault.strategyKind || "structured"} · {shortAddr(shareVault.curator)}</span>
                    </div>
                    <ProofBadge label={shareVault.navSafetyLabel as VaultSafety} fresh={shareVault.navFresh} size="sm" />
                  </div>
                  <div className="pf-pos__grid">
                    <Stat k={`${sMeta.symbol} held`} v={fmt6(walletShares)} />
                    <Stat k="Proven floor" v={fmt6(positionFloor)} accent sub={qMeta.symbol} />
                    <Stat k="Full value" v={fmt6(positionFull)} sub={qMeta.symbol} />
                    <Stat k="Share price" v={fmt6(fullPerShare, 4)} sub={`floor ${fmt6(floorPerShare, 4)}`} />
                  </div>
                  <div className="pf-pos__actions">
                    <Link href={`/earn/${shareVault.vaultId}`} className="k-btn k-btn--secondary k-btn--sm">
                      Manage <ArrowUpRight size={14} />
                    </Link>
                    <Link href="/borrow" className="k-btn k-btn--ghost k-btn--sm">Borrow against shares</Link>
                  </div>
                </div>
              ) : (
                <div className="pf-empty">
                  <p>You don’t hold any vault shares yet.</p>
                  <Link href="/earn" className="k-btn k-btn--primary k-btn--sm">Deposit in Earn <ArrowRight size={14} /></Link>
                </div>
              )}
            </div>

            {/* Wallet */}
            <div className="floe-panel">
              <div className="floe-panel__head">
                <div className="floe-panel__title">Wallet</div>
                <div className="floe-panel__sub">ready to deploy</div>
              </div>
              <div className="pf-wallet">
                <WalletRow symbol={qMeta.symbol} name={qMeta.name} amount={fmt6(walletDusdc)} />
                <WalletRow symbol={sMeta.symbol} name={sMeta.name} amount={fmt6(walletShares)} />
                <div className="pf-wallet__cta">
                  {walletDusdc > 0n ? (
                    <Link href="/earn" className="k-btn k-btn--primary k-btn--sm">
                      Put {qMeta.symbol} to work <ArrowRight size={14} />
                    </Link>
                  ) : (
                    <span className="pf-wallet__hint">Acquire {qMeta.symbol} to deposit into a vault.</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Borrows */}
          <div className="floe-panel">
            <div className="floe-panel__head">
              <div className="floe-panel__title">Open borrows</div>
              <div className="floe-panel__sub">{hasBorrows ? `${positions.length} position${positions.length > 1 ? "s" : ""} · Floe Lend` : "Floe Lend"}</div>
            </div>
            {hasBorrows ? (
              <div className="earn-dir__scroll">
                <table className="earn-table">
                  <thead>
                    <tr>
                      <th>Position</th>
                      <th className="r">Collateral locked</th>
                      <th className="r">Debt</th>
                      <th className="r">Health</th>
                      <th className="r" />
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((p) => {
                      const hf = healthFactor(p.collateralValue, p.debt, market?.pool.liqThresholdBps ?? 8000n);
                      const tone = hfTone(hf);
                      return (
                        <tr key={p.id}>
                          <td>
                            <a href={suiObject(p.id)} target="_blank" rel="noreferrer" className="pf-debt__id">
                              {shortAddr(p.id)} <ExternalLink size={12} />
                            </a>
                          </td>
                          <td className="r">
                            <div className="earn-row__num">{fmt6(p.collateralValue)} {qMeta.symbol}</div>
                            <div className="earn-row__sub">{fmt6(p.collateral)} {sMeta.symbol} · floor</div>
                          </td>
                          <td className="r">
                            <div className="earn-row__num">{fmt6(p.debt)} {qMeta.symbol}</div>
                          </td>
                          <td className="r">
                            <span className="brw-hf" data-tone={tone}>{hf === Infinity ? "∞" : hf.toFixed(2)}</span>
                          </td>
                          <td className="r">
                            <Link href="/borrow" className="earn-row__cta">Manage <ArrowUpRight size={14} /></Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="pf-empty">
                <p>No open borrows. Lock vault shares to borrow {qMeta.symbol} against your proven floor.</p>
                <Link href="/borrow" className="k-btn k-btn--secondary k-btn--sm">Open Floe Lend <ArrowRight size={14} /></Link>
              </div>
            )}
          </div>

          {/* Provenance footer */}
          <Link href="/verify" className="pf-prov">
            <ShieldCheck size={16} />
            <span>Every figure here is computed from on-chain state and the enclave-attested floor — not a server estimate. See how a number becomes provable.</span>
            <ArrowRight size={15} />
          </Link>

          {!hasAnything && !vaultsLoading && (
            <p className="pf-foot-note">Wallet connected, but no Floe position yet — start in Earn.</p>
          )}
        </>
      )}
    </div>
  );
}

// ─── bits ──────────────────────────────────────────────────────────────────
function Stat({ k, v, sub, accent }: { k: string; v: string; sub?: string; accent?: boolean }) {
  return (
    <div className="pf-stat">
      <span className="pf-stat__k">{k}</span>
      <span className={`pf-stat__v${accent ? " pf-stat__v--accent" : ""}`}>{v}</span>
      {sub && <span className="pf-stat__u">{sub}</span>}
    </div>
  );
}

function WalletRow({ symbol, name, amount }: { symbol: string; name: string; amount: string }) {
  return (
    <div className="pf-wrow">
      <AssetBadge symbol={symbol} size={28} showSymbol={false} />
      <div className="pf-wrow__id">
        <span className="pf-wrow__sym">{symbol}</span>
        <span className="pf-wrow__name">{name}</span>
      </div>
      <span className="pf-wrow__amt">{amount}</span>
    </div>
  );
}

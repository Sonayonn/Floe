"use client";
import {
  ExternalLink, Cpu, PenLine, ShieldCheck, Landmark, Layers, ArrowUpRight, Zap,
} from "lucide-react";
import { useLendMarket } from "@/lib/hooks/useLendMarket";
import { BorrowPanel } from "@/components/ui/BorrowPanel";
import { ProofBadge, type VaultSafety } from "@/components/ui/ProofBadge";
import { fmt6, fmtMoney, shortAddr } from "@/lib/format";
import { suiObject } from "@/lib/explorer";
import { FLOE_ADDRESSES, assetFor } from "@floe/sdk/browser";

const LEND = FLOE_ADDRESSES.testnet.lend;
const NAV = FLOE_ADDRESSES.testnet.nav;

const STEPS = [
  { n: "01", Icon: Cpu, t: "Compute", d: "The vault's NAV lower bound and share supply are computed inside the AWS Nitro enclave — the same root of trust that secures every Floe figure." },
  { n: "02", Icon: PenLine, t: "Sign", d: "The enclave signs a typed CollateralPayload (intent 3) over (vault, floor, supply, timestamp) — a valuation that can never be replayed as a NAV or vol number." },
  { n: "03", Icon: ShieldCheck, t: "Verify", d: "lock_and_borrow self-verifies the ed25519 signature against the pool's registered attester, checks freshness and the vault binding, then derives the collateral value on-chain." },
  { n: "04", Icon: Landmark, t: "Borrow", d: "Only then is the loan issued — against a value the borrower could not forge, inflate, or stale. No price oracle to manipulate. No trust assumption to exploit." },
];

export default function BorrowPage() {
  const { data: m, isLoading, error } = useLendMarket();

  const util = m ? Number(m.pool.utilizationBps) / 100 : 0;
  const label = (m?.vault.navSafetyLabel ?? "unattested") as VaultSafety;

  return (
    <div className="brw">
      <div className="page-head">
        <div>
          <div className="floe-eyebrow">Floe Lend · Attested-collateral money market</div>
          <h1 className="page-head__title">Borrow</h1>
          <p className="page-head__sub">
            The lending market that removed the oracle trust assumption. Your vault SHARE is productive collateral —
            valued at the vault's <strong>enclave-attested NAV floor</strong>, a number the contract verifies on-chain
            before it lends. No price oracle to manipulate, no curator to trust. Borrow against proof.
          </p>
        </div>
        <div className="kpi-strip">
          <div className="kpi"><span className="kpi__k">Pool liquidity</span><span className="kpi__v">{m ? fmtMoney(m.pool.totalSupplied) : "—"}</span></div>
          <div className="kpi"><span className="kpi__k">Borrowed</span><span className="kpi__v">{m ? fmtMoney(m.pool.totalBorrowed) : "—"}</span></div>
          <div className="kpi"><span className="kpi__k">Utilization</span><span className="kpi__v kpi__v--accent">{m ? `${util.toFixed(1)}%` : "—"}</span></div>
        </div>
      </div>

      {isLoading && (
        <div className="floe-panel" style={{ padding: "var(--space-8)" }}>
          <div className="state-line"><span className="state-line__spinner" /> Reading the Floe Lend market from testnet…</div>
        </div>
      )}
      {error && (
        <div className="floe-panel" style={{ padding: "var(--space-8)" }}>
          <div className="state-line" style={{ color: "var(--stale)" }}>Could not read the lending market — {(error as Error).message}</div>
        </div>
      )}

      {m && (
        <div className="brw-grid">
          <div className="brw-main">
            {/* Market overview */}
            <section className="floe-panel brw-market">
              <div className="floe-panel__head">
                <div className="floe-panel__title">Stratos market · {assetFor(m.qType).symbol}</div>
                <a className="vf-link" href={suiObject(m.poolId)} target="_blank" rel="noreferrer">pool on-chain <ExternalLink size={13} /></a>
              </div>

              <div className="brw-util">
                <div className="brw-util__head">
                  <span>Utilization</span>
                  <span className="brw-util__pct">{util.toFixed(1)}%</span>
                </div>
                <div className="brw-util__track"><div className="brw-util__fill" style={{ width: `${Math.min(100, util)}%` }} /></div>
                <div className="brw-util__legend">
                  <span>{fmt6(m.pool.totalBorrowed)} borrowed</span>
                  <span>{fmt6(m.pool.availableLiquidity)} available</span>
                </div>
              </div>

              <div className="brw-stats">
                <Stat k="Total supplied" v={`${fmt6(m.pool.totalSupplied)}`} unit={assetFor(m.qType).symbol} />
                <Stat k="Total borrowed" v={`${fmt6(m.pool.totalBorrowed)}`} unit={assetFor(m.qType).symbol} />
                <Stat k="Available" v={`${fmt6(m.pool.availableLiquidity)}`} unit={assetFor(m.qType).symbol} />
                <Stat k="Max LTV" v={`${(Number(m.pool.ltvBps) / 100).toFixed(0)}%`} />
                <Stat k="Liquidation" v={`${(Number(m.pool.liqThresholdBps) / 100).toFixed(0)}%`} />
                <Stat k="Collateral" v={assetFor(m.sType).symbol} />
              </div>
            </section>

            {/* Collateral basis — the proven valuation */}
            <section className="floe-panel brw-basis">
              <div className="floe-panel__head">
                <div className="floe-panel__title">Collateral valuation basis</div>
                <ProofBadge label={label} fresh={m.vault.navFresh} size="sm" />
              </div>
              <p className="brw-basis__lead">
                One SHARE is worth the vault's proven floor per share — the enclave-signed NAV lower bound divided by
                share supply. This is the number the borrower locks against, and it is verified on-chain at borrow time.
              </p>
              <div className="brw-basis__grid">
                <BasisRow k="Attested value / SHARE" v={`${fmt6(m.pricePerShare, 4)} ${assetFor(m.qType).symbol}`} />
                <BasisRow k="Vault NAV floor" v={`${fmt6(m.vault.navLowerBound)} ${assetFor(m.qType).symbol}`} href={suiObject(m.vaultId)} />
                <BasisRow k="Share supply" v={fmt6(m.vault.shareSupply)} />
                <BasisRow k="% certain" v={`${m.vault.pctCertain.toFixed(1)}%`} />
                <BasisRow k="Registered attester" v={shortAddr(LEND.attesterPubkey)} href={suiObject(NAV.enclave)} />
                <BasisRow k="Intent" v={`#${LEND.collateralIntent} · CollateralPayload`} />
              </div>
            </section>

            {/* How attested collateral works */}
            <section>
              <div className="vf-section-head">
                <h2 className="vf-h2">How a borrow becomes trustless</h2>
                <p>Every other money market trusts a price oracle for collateral value. Floe verifies a hardware-signed valuation on-chain instead.</p>
              </div>
              <div className="vf-steps__grid">
                {STEPS.map((s) => (
                  <div key={s.n} className="vf-step">
                    <span className="vf-step__n">{s.n}</span>
                    <s.Icon className="vf-step__icon" size={20} />
                    <span className="vf-step__t">{s.t}</span>
                    <span className="vf-step__d">{s.d}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Composability headline */}
            <section className="brw-compose">
              <div className="brw-compose__icon"><Zap size={18} /></div>
              <div>
                <h3 className="brw-compose__t">Borrow-and-trade, in one transaction</h3>
                <p className="brw-compose__d">
                  Because SHARE stays productive while locked, you can borrow against it and open a DeepBook Predict
                  position atomically — without unwinding your yield. This is amplified directional exposure, not free
                  yield: it adds liquidation risk, and the UI labels it honestly before you confirm.
                </p>
                <a className="vf-link" href={suiObject(FLOE_ADDRESSES.testnet.predict.package)} target="_blank" rel="noreferrer">
                  DeepBook Predict venue <ArrowUpRight size={13} />
                </a>
              </div>
            </section>
          </div>

          {/* Action rail */}
          <aside className="brw-aside">
            <BorrowPanel market={m} />
            <div className="brw-consumer">
              <Landmark size={15} />
              <span>Floe Lend is the third proven consumer of the same Verifiable Valuation primitive that secures vault NAV and the volatility index.</span>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function Stat({ k, v, unit }: { k: string; v: string; unit?: string }) {
  return (
    <div className="brw-stat">
      <span className="brw-stat__k">{k}</span>
      <span className="brw-stat__v">{v}{unit && <span className="brw-stat__u"> {unit}</span>}</span>
    </div>
  );
}

function BasisRow({ k, v, href }: { k: string; v: string; href?: string }) {
  return (
    <div className="brw-brow">
      <span className="brw-brow__k">{k}</span>
      {href ? (
        <a className="brw-brow__v brw-brow__link" href={href} target="_blank" rel="noreferrer">{v} <ExternalLink size={11} /></a>
      ) : (
        <span className="brw-brow__v">{v}</span>
      )}
    </div>
  );
}

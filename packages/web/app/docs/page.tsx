import Link from "next/link";
import {
  ArrowRight, ShieldCheck, Boxes, Layers, Activity, BadgeCheck, Landmark,
  Database, Lock, KeyRound, LineChart, Terminal, Coins, Gauge,
  GitBranch, Workflow, Receipt, Boxes as BoxesIcon, Wallet,
} from "lucide-react";
import { Reveal } from "@/components/landing/Reveal";
import { Interactions } from "@/components/landing/Interactions";
import { CodeBlock } from "@/components/docs/CodeBlock";
import { DocsSidebar } from "@/components/docs/DocsSidebar";
import { OnThisPage } from "@/components/docs/OnThisPage";
import { ArchitectureDiagram } from "@/components/docs/ArchitectureDiagram";
import { HeroConsole } from "@/components/docs/HeroConsole";
import { FloeMark } from "@/components/shell/FloeMark";

export const metadata = {
  title: "Floe Docs — Build on the verifiable allocation layer",
  description: "The @floe/sdk: read vaults, prove NAV with hardware attestation, compose venues, lend against the proven floor, and deploy your own vault on Sui.",
};

const CONCEPTS = [
  { icon: ShieldCheck, t: "The proven floor", d: "nav_lower_bound = idle + PLP×price + settled. A redeemable floor a curator can never inflate — withdrawals fall back to it, never below." },
  { icon: Gauge, t: "Circuit breaker", d: "nav_is_safe gates on freshness + divergence. Deposits fail closed when unsafe; withdrawals degrade to the floor and emit NavGuardTripped." },
  { icon: BadgeCheck, t: "Intent separation", d: "Every signed value carries an intent — NAV=1, Vol=2, Collateral=3, Risk=4 — so a signature for one can never be replayed as another." },
  { icon: KeyRound, t: "Caps & roles", d: "OwnerCap, CuratorCap, ExecCap (with an attenuated Mandate) and a GuardianCap kill-switch. Authority is explicit and revocable on-chain." },
  { icon: Workflow, t: "Strata", d: "A vault allocates across enabled strata — PLP base yield, a vertical RANGE ladder, and a delta HEDGE — each a bit flag enforced by policy." },
  { icon: Receipt, t: "Async redeem", d: "ERC-7540-style: request_redeem fixes the liability at safe NAV, fulfill_redeems pays FIFO from idle, claim_redeem settles. Sync withdraw stays instant when idle covers it." },
];

const NAMESPACES = [
  { icon: Layers, ns: "FloeVault", d: "Vault reads, the rich VaultState, redemption, settlement, and curator deploy.", m: ["getVaultState", "deploy", "requestRedeem", "fulfillRedeems", "claimRedeem", "settlePosition"] },
  { icon: BoxesIcon, ns: "Registry", d: "The Earn directory — every live vault, curator, TVL, venues, strategy.", m: ["listVaults"] },
  { icon: Activity, ns: "Vol", d: "On-chain implied-volatility index from the Predict SVI oracle.", m: ["volNow", "currentVol", "attestedVol", "updateVolIndex"] },
  { icon: BadgeCheck, ns: "Attestation", d: "The Nautilus moat — verify enclave-signed values on-chain.", m: ["enclaveInfo", "isEnclaveLive", "verifyNav", "verifyVolAttested", "verifyCollateral", "verifyRiskAttested"] },
  { icon: Landmark, ns: "FloeLend", d: "Attested-collateral money market — borrow against the proven floor.", m: ["poolState", "supply", "lockAndBorrow", "repay", "liquidate", "fetchSignedValuation", "borrowAndTradePredict"] },
  { icon: Database, ns: "Walrus", d: "Tamper-evident audit trail — NAV/rebalance snapshots, indexed on-chain.", m: ["storeSnapshot", "readSnapshot", "listBlobIds", "reconstructHistory"] },
  { icon: Lock, ns: "Seal", d: "Strategy-parameter privacy — encrypted config, capability-gated decryption.", m: ["encryptStrategy", "setStrategyBlob", "getStrategyBlob", "decryptStrategyAsCurator"] },
  { icon: KeyRound, ns: "Agent", d: "Attenuated, revocable agent authority over a vault.", m: ["authorizeAgent", "revokeAgent", "listAgents", "consumeMandateCycle"] },
  { icon: LineChart, ns: "TrackRecord", d: "Verifiable performance — APR/drawdown from attested snapshots.", m: ["computeTrackRecord", "verifyTrackRecord"] },
  { icon: GitBranch, ns: "Venues", d: "The multi-venue spine — DeepBookModule & CetusModule implement one interface.", m: ["DeepBookModule.value", "CetusModule.value", "VenueModule"] },
  { icon: Coins, ns: "Share / Policy / Fees", d: "Per-vault share codegen and on-chain-enforced policy + fee encoders.", m: ["generateShareModule", "Policy.Stratum", "encodePolicy", "encodeFees"] },
  { icon: Wallet, ns: "Treasury", d: "Protocol revenue accounting.", m: ["getProtocolRevenue"] },
];

function Sec({ id, kicker, title, children }: { id: string; kicker: string; title: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className="dx-sec">
      <Reveal className="dx-sechead" as="header">
        <div className="dx-kicker">{kicker}</div>
        <h2>{title}</h2>
      </Reveal>
      {children}
    </section>
  );
}

export default function Docs() {
  return (
    <div className="dx">
      <Interactions />
      <DocsSidebar />

      <div className="dx-main">
        <article className="dx-content">
          {/* slim sticky header */}
          <div className="dx-topbar">
            <span className="dx-topbar__crumb">Documentation</span>
            <Link href="/earn" className="k-btn k-btn--primary lp-nav__cta" aria-label="Enter the Floe app">
              <FloeMark size={14} className="lp-nav__cta-mark" /> Enter app <ArrowRight size={14} />
            </Link>
          </div>

          {/* ── HERO / intro ──────────────────────────────────── */}
          <section id="intro" className="dx-hero">
            <div className="dx-hero__copy">
              <div className="docs-eyebrow"><Terminal size={13} /> Developer documentation</div>
              <h1 className="dx-hero__title">Build on the <span className="lp-accent">verifiable</span> allocation layer.</h1>
              <p className="dx-hero__sub">
                <code>@floe/sdk</code> is how you read Floe vaults, prove a NAV with hardware attestation, compose
                across Sui yield venues, lend against the proven floor, and deploy your own vault — without
                touching the Move contracts.
              </p>
              <div className="docs-hero__install"><Terminal size={15} /><code>pnpm add @floe/sdk @mysten/sui</code></div>
              <div className="dx-hero__cta">
                <a href="#quickstart" className="k-btn k-btn--primary k-btn--lg">Quickstart <ArrowRight size={16} /></a>
                <a href="#architecture" className="k-btn k-btn--secondary k-btn--lg"><GitBranch size={15} /> Architecture</a>
              </div>
            </div>
            <div className="dx-hero__visual"><HeroConsole /></div>
          </section>

          {/* ── ARCHITECTURE ──────────────────────────────────── */}
          <Sec id="architecture" kicker="Overview · Architecture" title={<>How Floe fits together.</>}>
            <Reveal className="dx-lead">
              Strategy logic runs off-chain under on-chain policy the contract enforces — plus attestation proving the
              executor was the registered code. <strong>NAV = idle + Σ <code>VenueModule.value()</code> + settled value.</strong> The
              enclave signs that figure; the contract verifies the signature before it accepts the number.
            </Reveal>
            <Reveal delay={80}><ArchitectureDiagram /></Reveal>
            <Reveal className="dx-notes">
              <ul>
                <li><strong>One uniform interface.</strong> The allocator vault speaks only <code>VenueModule</code> — it never knows which protocol a module wraps.</li>
                <li><strong>One attestation primitive.</strong> <code>floe_nav</code> verifies a TEE signature natively on-chain — structurally impossible on EVM/Solana.</li>
                <li><strong>One warm enclave</strong> attests every vault via a keeper loop; if it lags, the circuit breaker degrades vaults safely to floor-based withdrawals.</li>
              </ul>
            </Reveal>
          </Sec>

          {/* ── CONCEPTS ──────────────────────────────────────── */}
          <Sec id="concepts" kicker="Overview · Core concepts" title={<>The six ideas everything builds on.</>}>
            <div className="dx-concepts">
              {CONCEPTS.map((c, i) => {
                const Icon = c.icon;
                return (
                  <Reveal className="dx-concept" key={c.t} delay={(i % 3) * 70} data-spotlight>
                    <span className="dx-concept__icon"><Icon size={17} /></span>
                    <h3>{c.t}</h3>
                    <p>{c.d}</p>
                  </Reveal>
                );
              })}
            </div>
          </Sec>

          {/* ── QUICKSTART ────────────────────────────────────── */}
          <Sec id="quickstart" kicker="SDK · Quickstart" title={<>Connect and read a live vault.</>}>
            <Reveal className="dx-lead">Everything is typed. The client points at testnet by default; pass a signer only when you write.</Reveal>
            <Reveal>
              <CodeBlock lang="ts" filename="setup.ts" code={`
import { FloeClient, FloeVault } from "@floe/sdk";

const floe = new FloeClient({ network: "testnet" });

const v = await FloeVault.getVaultState(floe, vaultId);
v.nav;          // total assets (6dp)
v.sharePrice;   // NAV / supply (6dp)
v.navLowerBound;// the proven, redeemable floor
v.attested;     // on the hardware-attested NAV tier?
`} />
            </Reveal>
          </Sec>

          {/* ── READING ───────────────────────────────────────── */}
          <Sec id="reading" kicker="SDK · Reading vaults" title={<>One read, the whole truth.</>}>
            <Reveal className="dx-lead">
              <code>getVaultState</code> returns a rich, settlement-aware snapshot — not just a NAV, but exactly how
              <em> certain</em> that NAV is. <code>navSafetyLabel</code> drives the proof badge across the app.
            </Reveal>
            <div className="dx-grid2">
              <Reveal>
                <CodeBlock lang="ts" filename="state.ts" code={`
const v = await FloeVault.getVaultState(floe, vaultId);

v.nav; v.navLowerBound; v.pctCertain;   // 0–100 % certain
v.settledTotal; v.unsettledMarks;        // certain vs soft marks
v.navSafe; v.navFresh; v.navWithinDivergence;
v.navSafetyLabel;
//  "verified" | "unattested"
//  | "degraded-stale" | "degraded-divergent"
v.plpHeld; v.plpPrice; v.idle; v.shareSupply;
v.managementFeeBps; v.performanceFeeBps;
`} />
              </Reveal>
              <Reveal delay={100}>
                <CodeBlock lang="ts" filename="directory.ts" code={`
import { Registry } from "@floe/sdk";

// browse the Earn directory
const vaults = await Registry.listVaults(floe);

for (const v of vaults) {
  console.log(v.name, v.curator, v.nav, v.venues);
}
`} />
              </Reveal>
            </div>
          </Sec>

          {/* ── ATTESTATION ───────────────────────────────────── */}
          <Sec id="attestation" kicker="SDK · Verifiable NAV" title={<>The moat — what no other vault has.</>}>
            <Reveal className="dx-lead">
              A value is signed inside a registered AWS Nitro enclave; Floe verifies that signature <em>on-chain</em>
              before accepting it. The same primitive proves NAV, volatility, collateral, and risk.
            </Reveal>
            <Reveal>
              <CodeBlock lang="ts" filename="attestation.ts" code={`
import { Attestation } from "@floe/sdk";

const info = Attestation.enclaveInfo(floe);          // Enclave id + PCR0 + packages
const live = await Attestation.isEnclaveLive(floe);  // moat health check → true

// verify an enclave-signed NAV on-chain — resolves on success, throws if it can't
await Attestation.verifyNav(floe, { nav, plpPrice, vaultId, timestampMs, signatureHex });

// the same primitive, four proven intents:
await Attestation.verifyVolAttested(floe, payload);  // intent 2
await Attestation.verifyCollateral(floe, payload);   // intent 3 → powers Floe Lend
await Attestation.verifyRiskAttested(floe, payload); // intent 4
`} />
            </Reveal>
          </Sec>

          {/* ── VOL ───────────────────────────────────────────── */}
          <Sec id="vol" kicker="SDK · Volatility index" title={<>On-chain implied volatility.</>}>
            <Reveal className="dx-lead">
              <code>Vol.volNow</code> computes ATM implied vol entirely on-chain from DeepBook Predict's Block Scholes
              SVI oracle — synchronously composable by any protocol.
            </Reveal>
            <Reveal>
              <CodeBlock lang="ts" filename="vol.ts" code={`
import { Vol } from "@floe/sdk";

const bps = await Vol.volNow(floe);     // live BTC ATM implied vol, on-chain compute
Vol.bpsToPercent(bps);                  // e.g. 51.32
const snap = await Vol.currentVol(floe);// last on-chain snapshot { volBps, samples }
const att = await Vol.attestedVol(floe);// the enclave-signed vol tier
`} />
            </Reveal>
          </Sec>

          {/* ── VENUES ────────────────────────────────────────── */}
          <Sec id="venues" kicker="SDK · Venues" title={<>One interface, many protocols.</>}>
            <Reveal className="dx-lead">
              Every venue implements the same <code>VenueModule</code> — <code>deploy</code> / <code>value</code> / <code>redeem</code>. The
              vault sums <code>value()</code> across venues; that sum is what the enclave attests. Two live on testnet today
              (DeepBook Predict + Cetus CLMM); the interface drives more.
            </Reveal>
            <Reveal>
              <CodeBlock lang="ts" filename="venues.ts" code={`
import { DeepBookModule, CetusModule, type VenueModule } from "@floe/sdk";

// the live reference venue (DeepBook Predict — manager position)
const a = await DeepBookModule.value(floe, vaultId);  // → { venue, valueRaw, parts }

// Cetus CLMM (NFT position) implements the SAME interface
const b = await CetusModule.value(floe, vaultId);

// NAV = idle + Σ module.value(vaultId) across every venue the vault holds
`} />
            </Reveal>
          </Sec>

          {/* ── LEND ──────────────────────────────────────────── */}
          <Sec id="lend" kicker="SDK · Floe Lend" title={<>The market that removed the oracle.</>}>
            <Reveal className="dx-lead">
              Collateral is valued at the enclave-signed floor (<code>CollateralPayload</code>, intent 3) — so a borrower
              can't forge what their shares are worth. Zero contract deps; any attested vault's SHARE can be collateral.
            </Reveal>
            <Reveal>
              <CodeBlock lang="ts" filename="lend.ts" code={`
import { FloeLend } from "@floe/sdk";

const pool = await FloeLend.poolState(floe, poolId);   // liquidity, utilization, LTV, liqThreshold

await FloeLend.supply(floe, { poolId, amount });        // provide dUSDC liquidity

// fetch a fresh signed valuation, then lock collateral + borrow against the proven floor
const sig = await FloeLend.fetchSignedValuation(floe, { vaultId });
await FloeLend.lockAndBorrow(floe, { poolId, collateral, borrow, valuation: sig });

await FloeLend.repay(floe, { poolId, amount });
`} />
            </Reveal>
          </Sec>

          {/* ── WALRUS & SEAL ─────────────────────────────────── */}
          <Sec id="data" kicker="SDK · Walrus & Seal" title={<>Auditable history. Private alpha.</>}>
            <Reveal className="dx-lead">
              Every rebalance is written to Walrus as a tamper-evident blob and indexed on-chain; curator strategy
              parameters are Seal-encrypted and decryptable only by the holder of the matching capability.
            </Reveal>
            <div className="dx-grid2">
              <Reveal>
                <CodeBlock lang="ts" filename="walrus.ts" code={`
import { Walrus } from "@floe/sdk";

await Walrus.storeSnapshot(floe, snapshot);      // tamper-evident blob
const ids = await Walrus.listBlobIds(floe, vaultId);
const hist = await Walrus.reconstructHistory(floe, vaultId);
`} />
              </Reveal>
              <Reveal delay={100}>
                <CodeBlock lang="ts" filename="seal.ts" code={`
import { Seal } from "@floe/sdk";

const blob = await Seal.encryptStrategy(floe, params);
await Seal.setStrategyBlob(floe, { vaultId, blob });
const params2 = await Seal.decryptStrategyAsCurator(floe, vaultId);
`} />
              </Reveal>
            </div>
          </Sec>

          {/* ── AGENTS ────────────────────────────────────────── */}
          <Sec id="agents" kicker="SDK · Agents & authority" title={<>Delegate execution, keep the kill-switch.</>}>
            <Reveal className="dx-lead">
              A curator mints an <em>attenuated</em> <code>ExecCap</code> with a <code>Mandate</code> (expiry + cycle budget). Revocation is a
              dynamic field, so it's upgrade-safe and instant — and a <code>GuardianCap</code> can veto an agent or halt the vault.
            </Reveal>
            <Reveal>
              <CodeBlock lang="ts" filename="agents.ts" code={`
import { Agent } from "@floe/sdk";

const cap = await Agent.authorizeAgent(floe, { vaultId, agent, expiryMs, maxCycles });
const agents = await Agent.listAgents(floe);   // [{ agent, active, expiryMs, … }]
await Agent.revokeAgent(floe, { vaultId, agentCapId });   // instant kill-switch
`} />
            </Reveal>
          </Sec>

          {/* ── DEPLOY ────────────────────────────────────────── */}
          <Sec id="deploy" kicker="Build · Deploy a vault" title={<>Deploy your own vault.</>}>
            <Reveal className="dx-lead">
              <code>deploy()</code> encodes policy + fees for you. Fee caps (3% mgmt / 20% perf) and the enabled strata are
              enforced on-chain. The vault lists in the directory under your name with provable NAV by default.
            </Reveal>
            <Reveal>
              <CodeBlock lang="ts" filename="deploy-vault.ts" code={`
import { FloeClient, FloeVault, Policy } from "@floe/sdk";

const floe = new FloeClient({ network: "testnet", signer });

const v = await FloeVault.deploy(floe, {
  asset: "…::dusdc::DUSDC",
  name: "My Vault",
  symbol: "MYV",
  policy: {
    maxPositionSize: 1_000_000_000n,
    maxLeverageBps: 30_000,
    enabledStrata: Policy.Stratum.PLP | Policy.Stratum.RANGE | Policy.Stratum.HEDGE,
    plpFloorBps: 5_000,
  },
  fees: { managementBps: 100, performanceBps: 1_500 },
});
// → { vaultId, shareType, … } now live, sourcing third-party capital
`} />
            </Reveal>
            <Reveal className="docs-callout">
              <Boxes size={18} />
              <div><strong>Prefer no code?</strong> The in-app deploy flow walks you through the same curator path with a guided form.</div>
              <Link href="/deploy" className="k-btn k-btn--secondary">Open Deploy <ArrowRight size={14} /></Link>
            </Reveal>
          </Sec>

          {/* ── HELLO_VAULT ───────────────────────────────────── */}
          <Sec id="hello" kicker="Build · Primer" title={<><code className="docs-mono-h">hello_vault</code> — feel the cycle first.</>}>
            <Reveal className="dx-lead">
              Before the real engine, a throwaway single-asset Move vault: take a deposit, mint a share receipt, allow
              1:1 withdrawal. No strategy, no NAV math — just the publish → call → read loop on testnet.
            </Reveal>
            <Reveal>
              <CodeBlock lang="move" filename="hello_vault.move" code={`
module hello_vault::hello_vault;

use sui::balance::{Self, Balance};
use sui::coin::{Self, Coin};
use sui::sui::SUI;

/// The shared vault. Anyone deposits; a matching VaultShare withdraws.
public struct Vault has key { id: UID, pool: Balance<SUI> }
public struct VaultShare has key, store { id: UID, amount: u64 }

/// Deposit SUI → mint a VaultShare receipt to the sender.
public fun deposit(vault: &mut Vault, payment: Coin<SUI>, ctx: &mut TxContext): VaultShare {
    let amount = payment.value();
    vault.pool.join(payment.into_balance());
    VaultShare { id: object::new(ctx), amount }
}

/// Surrender a VaultShare → withdraw the recorded amount of SUI.
public fun withdraw(vault: &mut Vault, share: VaultShare, ctx: &mut TxContext): Coin<SUI> {
    let VaultShare { id, amount } = share;
    object::delete(id);
    coin::take(&mut vault.pool, amount, ctx)
}
`} />
            </Reveal>
          </Sec>

          {/* ── API REFERENCE ─────────────────────────────────── */}
          <Sec id="api" kicker="Build · API reference" title={<>One primitive, every namespace.</>}>
            <Reveal className="dx-lead">Each Floe product is a consumer of the same verifiable-valuation core — and a namespace in the SDK.</Reveal>
            <div className="dx-ns">
              {NAMESPACES.map((n, i) => {
                const Icon = n.icon;
                return (
                  <Reveal className="docs-ns__card" key={n.ns} delay={(i % 3) * 60} data-spotlight>
                    <div className="docs-ns__head">
                      <span className="docs-ns__icon"><Icon size={16} /></span>
                      <code className="docs-ns__name">{n.ns}</code>
                    </div>
                    <p className="docs-ns__d">{n.d}</p>
                    <div className="docs-ns__methods">
                      {n.m.map((m) => <span key={m} className="docs-ns__m">{m.includes(".") ? m : `${m}()`}</span>)}
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </Sec>

          {/* ── PACKAGES ──────────────────────────────────────── */}
          <Sec id="packages" kicker="Reference · Browser vs Node" title={<>Three import targets.</>}>
            <Reveal className="dx-lead">
              The barrel pulls Node-only publish code, so the frontend imports <code>@floe/sdk/browser</code> — reads plus
              dapp-kit transaction builders, no deploy/publish.
            </Reveal>
            <Reveal>
              <CodeBlock lang="ts" filename="imports.ts" code={`
import { FloeClient, FloeVault } from "@floe/sdk";        // Node: everything
import { deploy } from "@floe/sdk/node";                   // Node: deploy, scripts, keeper
import {
  getVaultState, listVaults, buildDepositTx, buildWithdrawTx, FLOE_ADDRESSES,
} from "@floe/sdk/browser";                                // browser-safe surface only

// tx builders return a Transaction for dapp-kit's useSignAndExecuteTransaction
const tx = buildDepositTx({ vaultId, qType, sType, sender, paymentCoinId, amount });
`} />
            </Reveal>
          </Sec>

          {/* ── ADDRESSES ─────────────────────────────────────── */}
          <Sec id="addresses" kicker="Reference · Addresses & tour" title={<>Canonical ids, and a live tour.</>}>
            <Reveal className="dx-lead">
              Every on-chain id lives in <code>FLOE_ADDRESSES.testnet</code> — the runtime source of truth. Never hardcode.
            </Reveal>
            <div className="dx-grid2">
              <Reveal>
                <CodeBlock lang="ts" filename="addresses.ts" code={`
import { FLOE_ADDRESSES, FLOE_VENUES, FLOE_ASSETS } from "@floe/sdk";
const A = FLOE_ADDRESSES.testnet;
A.package; A.registry; A.refVault; A.nav.enclave; A.lend.refPool;
`} />
              </Reveal>
              <Reveal delay={100}>
                <CodeBlock lang="bash" filename="terminal" code={`# exercise every read surface against testnet
pnpm exec tsx examples/sdk-tour.ts`} />
              </Reveal>
            </div>
            <Reveal className="dx-foot__cta">
              <Link href="/earn" className="k-btn k-btn--primary k-btn--lg">Enter the app <ArrowRight size={16} /></Link>
              <Link href="/verify" className="k-btn k-btn--secondary k-btn--lg"><ShieldCheck size={15} /> See the proof</Link>
            </Reveal>
          </Sec>
        </article>

        <OnThisPage />
      </div>
    </div>
  );
}

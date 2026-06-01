# What Is Floe

> Canonical source of truth. README, landing page, and pitch all derive from this.

## One sentence
Floe is onchain vault infrastructure for Sui — a layer where anyone deploys and runs
structured-product vault strategies on DeepBook, or earns by depositing into curated
vaults, with one property no vault layer on any chain offers: cryptographically
provable, TEE-attested NAV that every vault inherits by default.

Compressed: the Enzyme/Lagoon/IPOR-Fusion of Sui — but where you never trust the
manager's numbers.

## Why it exists
Onchain vault infrastructure ("capital allocators") is a ~$10B+ category, $131B AUM,
growing fast; "curation" is the 2026 institutional theme (Morpho $5.8B, Apollo, Kraken,
Bitwise). Every leader — Enzyme, Lagoon, Fusion on EVM; Ember on Sui — shares one
structural gap: strategy runs on a centralized server, NAV is self-reported, you trust
the curator. The infrastructure is mature; the verifiability does not exist. Sui's native
primitives close that gap. Floe is the protocol that makes the closing into a product.

## What it does
Base: a vault issuing share tokens (NAV-redeemable). Deposit a quote asset, receive
shares proportional to NAV; burn shares to withdraw your slice.

Reference strategy — Floe Stratos, three coordinated strata:
- Stratum A (PLP base yield): keep a floor (default 50% TVL) in DeepBook Predict's
  liquidity vault for passive yield.
- Stratum B (1σ vertical-range ladder): read the live Block Scholes SVI surface across
  all active Predict expiries, write 1σ vertical ranges harvesting premium when the
  underlying stays in-band. Strikes snap to the oracle tick grid.
- Stratum C (delta hedge via Margin): neutralize directional drift with an offsetting
  Margin position — delta-managed, unlike the naked option vaults (Ribbon/Friktion/
  Thetanuts) that died selling unhedged.

Strategy logic runs OFF-CHAIN in a Nautilus TEE enclave, constrained by ON-CHAIN
policies the contract enforces (the Enzyme model) — plus attestation that proves the
off-chain execution was the registered code (the part Enzyme can't do).

## The moat — three Sui primitives composed
- Nautilus (TEE attestation) -> proves NAV/rebalances came from authorized code. Provable execution.
- Walrus (blob storage) -> every rebalance writes a tamper-evident snapshot, indexed on-chain. Auditable history.
- Seal (threshold encryption) -> curator's strategy params stay private, decryptable only in their enclave. Private alpha.

Synthesis no one else can do: Enzyme gives transparency OR privacy. Floe gives private
alpha AND provable execution simultaneously — privacy (Seal) and proof (Nautilus) on
different layers. A serious quant runs secret alpha; depositors still get cryptographic
proof. Impossible without Sui's exact stack.

## Who uses it
Depositor (earns): browse a directory of vaults (curator, strategy, TVL, APR), deposit,
receive shares, verify NAV history (Walrus) and attestation (Nautilus), redeem per policy.

Curator/builder (deploys): deploy a vault via factory or @floe/sdk — set policy (allowed
oracles, max size, leverage cap, enabled strata, floor), supply a strategy (Stratos or
custom against the Strategy interface), params Seal-encrypted client-side. Vault appears
in the directory under their name, inherits provable NAV, sources third-party capital,
earns fees.

Developer (builds on Floe): write a strategy in ~20 lines against the Strategy interface,
@floe/sdk handles deploy + Seal + manager provisioning. Get the whole engine free — SVI
reading, PTB composition, DeepBook adapters, Walrus audit, Seal privacy, Nautilus
attestation. Never touch the Move contract.

## Sui competitive landscape (May 2026)
- Abyss: margin-pool yield vaults + composable aTokens. One strategy, no options, no provable NAV.
- Lotus: HFT market-making + fund layer. One black-box strategy, no verifiability.
- Ember (Bluefin-incubated): THE benchmark. Permissionless curator vaults, $10M seed.
  = Sui's Morpho (curated yield). But yield/lending not options; Polymarket DATA not
  composable options; NAV self-reported.
- Cetus/Aftermath/Bluefin/Turbos/Volo: CLMM/AMM auto-rebalance vaults. Different vertical.
- Pebble: lending + one-click leverage.

Positioning: Ember proved Sui wants vault layers. Floe = the VERIFIABLE, OPTIONS-NATIVE
layer. "Where Ember is Sui's Morpho, Floe is Sui's Ribbon-meets-Enzyme — with proof none offer."

## Status (honest line)
LIVE: v2 vault (custody, O(1) NAV, shares, capability gating, hot-potato receipt safety);
full rebalancer engine (SVI surface validated vs live term structure, Stratos, PTB
composer); one real automated rebalance executed on chain; Stratum C margin lifecycle
proven; engine/strategy seam works.

NEXT (per BUILD_ORDER.md): PolicyConfig + curator + factory + fees (v3); @floe/sdk;
second vault via SDK; Walrus/Seal/Nautilus as layer-wide guarantees; Earn/Portfolio/
Deploy app; backtest.

GAPS (deliberate): geometric delta proxy not exact BS greeks; Nautilus interface frozen,
PCR verification stubbed; provable-NAV architecturally complete, enclave not yet deployed.
$500M-TVL "industry standard" is the vision; the hackathon proves factory + SDK + 2nd
live vault + provable-NAV guarantee — what makes that future credible, not a number asserted.

## Positioning line (what a judge hears)
"Enzyme proved vault infrastructure is a $10B category. Floe is the first vault layer
where you don't trust the manager's numbers — purpose-built for the newest, least-served
category, composable options. What Enzyme is to Ethereum, Floe is to Sui — with proof
Enzyme structurally can't offer, because every vault on Floe inherits TEE-attested NAV,
Walrus-audited history, and Seal-private alpha by default."

## The agentic layer (Tier 3 — built, live, on-thesis)
Floe is agent-operable infrastructure, not via a bolt-on but as a consequence of the
capability model. Every vault can be operated by an autonomous AI agent holding an
attenuated ExecCap — the SAME execution authority a human rebalancer holds, narrowed by
an on-chain Mandate (expiry, max_cycles, revocable) and attributed to the curator who
issued it (the delegation chain). The contract re-evaluates the mandate on EVERY action
(continuous, not at-the-gate) and — with Nautilus — verifies a fresh attestation per
action. Revocation flips a terminal condition; the next action aborts.

WHAT THIS PROVES: the agent-authority control plane the whole agentic-enterprise industry
is bolting onto OAuth (scoped authority + verifiable delegation chain + continuous
attestation + revocation), Floe has natively — because on Sui a capability IS a
first-class object, attenuation makes agent authority a strict subset of execution
authority, and Nautilus makes re-evaluation per-action. Agents are first-class precisely
because they are NOT special.

LIVE DEMO ARTIFACT: among the curated vaults in the directory, one ("Floe Agent Alpha")
is deployed and operated by an autonomous agent that authored its own Strategy, deployed
via @floe/sdk, and runs under an attenuated, attested, revocable mandate. Not a puppet —
a real autonomous operator the contract bounds. This is shown ON Floe, not in a roadmap.

AGENT INFRASTRUCTURE (real, built to the same rigor):
- ExecCap attenuation (one cap type; agents hold mandated instances)
- Mandate object with terminal conditions (expiry/max_cycles/revoked)
- authorize_agent / revoke_agent (curator-gated issuance + revocation)
- AgentRegistry (discoverable first-class agent operators + delegation chain + attestation state)
- Per-action mandate + attestation re-evaluation

## Revenue: agents pay fees too (a feature, not a loophole)
An agent-operated vault is structurally just a vault with an attenuated ExecCap — same
FeeConfig, same accrue_fees, same protocol split. So agents pay mgmt+perf fees (capped
3%/20%) and Floe takes its 10% protocol cut automatically, no agent-specific logic. Agent
vaults skew to the 15% ATTESTED premium tier (verifiability matters most when no human is
in the loop). Agents = a fee-generating segment that scales with Sui's agent economy.
The mandate cannot waive fees or exceed caps — fee terms are the vault's, enforced on-chain.

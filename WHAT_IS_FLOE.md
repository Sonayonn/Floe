# What Is Floe

> Canonical source of truth. README, landing page, pitch, demo script, and
> DeepSurge submission all derive from this. Do not improvise new taglines.

## One sentence
Floe is the verifiable allocation layer for Sui yield — an isolated vault that
allocates across Sui's fragmented yield venues (DeepBook, Suilend, NAVI, Cetus,
Volo) and proves its NAV with hardware attestation, so depositors never trust a
reported number. Structured products on DeepBook Predict are the flagship strategy.

Compressed: the Enzyme/Yearn of Sui — but where the NAV is cryptographically
provable and one vault spans every venue, instead of you managing a dozen apps yourself.

## The bottleneck Floe fixes (researched, 2026)
Sui has the yield VENUES (Suilend $745M, NAVI $723M, Cetus/Turbos LP, Volo/Haedal
staking, DeepBook) but NO verifiable allocation LAYER across them. The actual user
experience, per ecosystem guides: "stake 40-50%, LP 30%, rotate 20% into whatever's
best, and track your performance yourself." Users are forced to be their own portfolio
managers across a dozen fragmented, self-reporting apps. Developers must integrate every
venue individually and rebuild accounting, rebalancing, share tokens, and risk controls.
Post-Cetus-exploit ($260M, May 2025), the market wants ISOLATED vaults with VERIFIABLE
backing — which no Sui vault offers. Floe is that missing layer.

## What it does
Base: an isolated vault issuing a fungible share Coin (NAV-redeemable). Deposit a quote
asset, receive shares proportional to NAV; burn shares to withdraw your slice.

The layer allocates across venues through a uniform VenueAdapter interface
(deploy / value / redeem). Every venue position the vault holds is valued on-chain into
ONE NAV — and that NAV is what hardware attests. Three integration archetypes cover the
ecosystem: fungible yield receipts (Suilend cTokens, NAVI nTokens, Volo/Haedal LSTs,
DeepBook PLP), NFT positions (Cetus CLMM), and manager positions (DeepBook Predict ranges).

Flagship strategy — Floe Stratos (structured products on DeepBook Predict), three strata:
- Stratum A (PLP base yield): a floor (default 50% TVL) in Predict's liquidity vault.
- Stratum B (1σ vertical-range ladder): read the live Block Scholes SVI surface across
  active expiries, write 1σ vertical ranges harvesting premium when the underlying stays
  in-band. Strikes snap to the oracle tick grid.
- Stratum C (delta hedge via Margin): neutralize directional drift — delta-managed, unlike
  the naked option vaults (Ribbon/Friktion/Thetanuts) that died selling unhedged.

Strategy logic runs OFF-CHAIN in a Nautilus TEE enclave, constrained by ON-CHAIN policy
the contract enforces (the Enzyme model) — PLUS attestation proving the off-chain execution
was the registered code (the part Enzyme can't do).

## The moat — provable NAV across venues, three Sui primitives composed
- Nautilus (TEE attestation) -> proves the multi-venue NAV came from authorized code.
- Walrus (blob storage) -> every rebalance writes a tamper-evident snapshot (incl. per-venue
  allocation), indexed on-chain. Auditable history.
- Seal (threshold encryption) -> curator's allocation/strategy params stay private,
  decryptable only in their enclave. Private alpha.

Synthesis no one else can do: Enzyme gives transparency OR privacy. Floe gives private alpha
AND provable execution simultaneously, across multiple venues — impossible without Sui's
exact stack. And no Sui vault offers verifiable NAV at all.

## Who uses it
Depositor (earns): browse a directory of vaults (curator, venues, strategy, TVL, APR),
deposit, receive shares, verify NAV history (Walrus) + attestation (Nautilus), see exactly
which venues hold their money, redeem per policy. No more being your own portfolio manager.

Curator/builder (deploys): deploy a vault via @floe/sdk — pick venues, set policy (allowed
oracles/venues, max size, leverage cap, enabled strata, floor), supply a strategy (Stratos
or custom against the Strategy interface), params Seal-encrypted client-side. Vault appears
in the directory under their name, inherits provable NAV, sources third-party capital, earns fees.

Developer (builds on Floe): write a Strategy or a VenueAdapter in ~20 lines against the
interfaces; @floe/sdk handles deploy + Seal + manager provisioning. Get the whole engine free
— SVI reading, PTB composition, venue adapters, on-chain valuation, Walrus audit, Seal privacy,
Nautilus attestation. Never touch the Move contract.

## The VenueAdapter abstraction (what makes "layer" real, not a slide)
VenueAdapter: deploy(coin) -> position | value(position) -> u64 | redeem(position, amt) -> coin.
NAV = idle + Σ adapter.value(position_i). Strategy decides WHERE to allocate; VenueAdapter
knows HOW. The vault holds each venue position as a dynamic field on its own UID (PROVEN with
PLP). DeepBook is the reference adapter (shipped); Suilend is the proven second venue;
NAVI/Cetus/Volo are roadmap adapters the same interface already supports. This is Yearn-v3 /
Morpho "multi-strategy in one vault" — but with PROVABLE NAV and ISOLATED per-vault objects.

## Sui competitive landscape (2026)
- Ember (Bluefin-incubated): the benchmark — permissionless curator vaults, $10M seed =
  Sui's Morpho. But single-venue lending/yield, NAV self-reported, no options, no proof.
- Abyss: margin-pool yield + composable aTokens. One strategy, no provable NAV.
- Cetus/Aftermath/Bluefin/Turbos/Volo: single-protocol auto-rebalance vaults. One venue each.
- None offer cross-venue allocation, and none offer verifiable NAV.

Positioning: "Where Ember is Sui's Morpho, Floe is Sui's Enzyme-meets-Yearn — the verifiable,
multi-venue allocation layer — with provable NAV none of them offer, and structured products
on DeepBook as the flagship none of them have."

## Status (honest)
LIVE: factory vault (custody, O(1) NAV, fungible shares, capability gating, hot-potato receipt
safety, policy/fees/curator roles); full rebalancer engine (SVI surface validated vs live term
structure, Stratos, PTB composer); multiple automated rebalances on chain; PLP custody proven
non-custodial; @floe/sdk reading live NAV. Custody model verified against live testnet ABI.

NEXT (per BUILD_ORDER.md): VenueAdapter + Strategy interfaces; generalize custody to any
fungible receipt; Suilend adapter = multi-venue proof on chain; Nautilus attests multi-venue
NAV; second venue-mix vault; Walrus/Seal; Earn/Portfolio/Deploy/Allocate app; backtest.

GAPS (deliberate): geometric delta proxy not exact BS greeks; Nautilus PCR verification stubbed
until enclave deploys; NAVI/Cetus/Volo adapters are roadmap (the interface supports them).
$500M-TVL "industry standard" is the vision; the hackathon proves the layer + provable NAV +
multi-venue allocation on chain — what makes that future credible, not a number asserted.

## Custody language (canonical — do not overclaim)
HEADLINE: "Floe is the only Sui vault where the curator can never withdraw your funds — and
where the majority of assets are redeemable with no operator at all."
PRECISE: curator-non-custodial with progressive custody minimization. Curator (CuratorCap +
ExecCap) has ZERO withdrawal authority over principal, enforced on-chain. Fungible-receipt
positions (PLP, and Suilend/NAVI/Volo receipts) are non-custodial — vault holds the coin,
redeems with no privileged key. Residual fund-movement = one attested operator key that
becomes a hardware enclave (no human) at Nautilus. Custody only DECREASES.
DO NOT SAY: "non-custodial" (unqualified), "trustless", "decentralized custody".
DO SAY: "curator-non-custodial", "progressively keyless", "majority non-custodial today".

## Agentic layer (Tier 3 — built, live, on-thesis)
Every vault can be operated by an autonomous agent holding an attenuated ExecCap — the same
execution authority a human rebalancer holds, narrowed by an on-chain Mandate (expiry,
max_cycles, revocable), attributed to the issuing curator. The contract re-evaluates the
mandate on every action; with Nautilus, verifies fresh attestation per action. The
agent-authority control plane the agentic-enterprise industry is bolting onto OAuth, Floe has
natively — because on Sui a capability IS a first-class object. Agents pay fees like any vault
(capped 3%/20%, 10% protocol cut, skew to the 15% attested tier). Demo artifact: "Floe Agent
Alpha" — a directory vault operated by an autonomous agent under an attenuated, attested,
revocable mandate.

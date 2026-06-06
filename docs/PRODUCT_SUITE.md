# Floe — Product Suite & Naming Spec

> Positioning artifact for the frontend + submission. Every name maps to something REAL
> (shipped or in the build queue). Honest scope throughout — no over-claim.

## The layer (umbrella)
**Floe — the Verifiable Asset Management layer for Sui.**
A peer primitive to Walrus (verifiable data), Nautilus (verifiable compute), and DeepBook
(liquidity). Floe is the verifiable-valuation layer: vaults whose NAV is cryptographically
proven, not reported. Everything below composes on it.

Industry parallel: Floe is to Sui what Enzyme is to EVM — a vault-infrastructure layer —
but with hardware-attested NAV as the moat Enzyme doesn't have.

## Product lines (all real; named befitting an operating company)

### 1. Floe Vaults  (issuance + curation core — parallels Enzyme Onyx + Blue)
The deploy-a-vault / curate-a-strategy surface.
- Tokenized SHARE (composable Sui coin)
- ATTESTED NAV (our edge: provable, not Chainlink-reported)
- Async deposit/redeem queues (ERC-7540-style) + hybrid instant-when-liquid withdrawal
- Fee models: mgmt / perf / high-watermark / protocol split
- Role-based access: owner governs / curator configures / agent executes / guardian halts
- Policy guardrails (oracle allowlist, exposure caps, leverage bounds, stratum toggles)
Tagline: "Provable NAV, not reported."

### 2. Floe Stratos  (the flagship strategy — a named structured product)
The structured premium-harvesting vault on DeepBook Predict.
- Range-ladder positions (vertical ranges) + PLP supply for base yield + Margin delta-hedge
- Valued via the SVI vol surface, NAV hardware-attested
- HONEST SCOPE: premium-harvesting with defined-payoff economics on Predict's BINARY +
  RANGE primitives. Economically analogous to covered-call premium harvest — NOT vanilla
  options (Predict is binary-only; we never claim calls/puts).
Tagline: "Premium harvesting on DeepBook Predict, with NAV you can verify."

### 3. The primitives — named as products others build on (the "infra not app" proof)

**Floe Attest** — the attestation primitive (floe_nav).
Verifiable valuation as a service: any vault/app can prove its NAV, volatility, collateral
value, or risk state via a Nautilus enclave + on-chain verification. Reusable beyond Floe
(intents: NAV / vol / collateral / risk). Parallel to Walrus/Nautilus as a composable primitive.

**Floe Index** — the attested volatility feed (floe_vol + enclave signing — [P2]).
A verifiable vol number the Sui ecosystem can compose against (kills "stale SVI / feeder lag").

**Floe Guard** — provable safety (circuit breaker + guardian + attested risk — [P1]).
NAV that can't be inflated (divergence guard), halts that can't be faked (guardian), risk
posture you can verify cryptographically (attested PLP risk), not a dashboard you must trust.

### 4. Floe SDK — the developer surface
TypeScript SDK binding every capability (the "your sandbox" parallel to Onyx's SDK/API).
Standing `pnpm sdk:verify` guarantees it never drifts from the live contracts.

## Naming notes
- "Stratos" — stratosphere / layered altitude; fits the Crystalline Blue ice brand.
- "Attest / Index / Guard" — read like things a developer imports; instantly legible to
  judges and new users.
- The suite shows breadth (operating-company surface, loss-correction #2) WITHOUT new
  contract work — layers 1-2 are shipped; the primitives are the build queue (P1/P2 + done
  attestation). This advances the 70% (UX/real-world/vision) score, not the 20% technical.

## What we NEVER name or claim
- No "covered call / cash-secured put / options vault" — Predict has no vanilla options.
  Floe Stratos is a premium-harvester on binary + ranges, full stop.

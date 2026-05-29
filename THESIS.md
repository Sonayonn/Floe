# Floe — Canonical Positioning

> This is the single source of truth for how Floe is described everywhere:
> landing page, README, demo script, DeepSurge submission, Discord posts.
> Do not improvise new taglines. Consistency is the point.

## Hero (the 10-second version)
**Floe — the only DeFi vault with cryptographically provable NAV.**
Attested by hardware, audited on-chain, impossible anywhere but Sui.

## Sub-line (the platform framing)
The structured-products layer for DeepBook Predict — one vault today,
every strategy tomorrow.

## Problem framing (the opening beat)
On-chain options are a $100M market waiting for infrastructure.
(Echoes Sui Foundation's own "$100M Opportunity" thesis — we are building
the narrative they published.)

## The three lessons this positioning encodes
1. POSITIONING — "the only" / "the layer" = category-definer, not participant.
   Platform, not feature. One reference strategy on an extensible framework.
2. ECOSYSTEM-HERO — "impossible anywhere but Sui" makes the host's stack the
   reason Floe exists. Every integration is framed as the sponsor enabling Floe.
3. SURFACE — "cryptographically provable NAV" reads as a company with a real
   moat, not a hackathon submission. Backed by: live deployment, backtest
   performance number, test suite, on-chain audit trail, company-grade site.

## The repeatable platform sentence (use verbatim, often)
"Floe ships one reference strategy, but it's an extensible framework — the same
TEE-attested, Walrus-audited rails let any builder deploy straddles, iron
condors, or basis trades on DeepBook's shared liquidity."

## The moat sentence (the uncopyable claim)
"Most vaults ask you to trust their numbers. Floe proves them: every NAV update
is computed inside a Nautilus TEE and verified on-chain before it's accepted."

## Competitive frame (from market research, May 2026)
There IS a "vault infrastructure" category — "Onchain Capital Allocator," ~$10B,
one of DeFi's fastest-growing. Incumbents:
- Enzyme (EVM): $147M TVL, 4k+ vaults, "vault-as-a-service," Hedgeweek 2025
  Blockchain Tech of the Year. Pushing Onyx (modular vault tokenization layer).
- Sommelier (EVM): strategist-driven cross-chain vaults.
- Lagoon ($285M), IPOR Fusion ($124M): modular vault frameworks (ERC-7540).

THE GAP ACROSS ALL OF THEM: NAV is self-reported. They run strategy logic on a
centralized server, post results on-chain, and ask users to TRUST the numbers.
The infrastructure exists; the verifiability does not.

FLOE'S WIN: TEE-attested NAV via Nautilus. The contract verifies the enclave
attestation before accepting a NAV update — cryptographic proof the number came
from the authorized strategy, not a manager fudging it. Structurally impossible
on EVM/Solana; only Sui's Nautilus closes this gap.

ONE-LINER: "What Enzyme is to Ethereum, Floe is to DeepBook — the vault
infrastructure layer — except Floe's NAV is cryptographically provable, which
Enzyme's structurally can't be."

ARCHITECTURE VALIDATION: the EVM vault-infra winners use a foundational-vault +
higher-level-strategy-composition pattern. Floe's engine/strategy split is the
same pattern, arrived at independently. We're not novel in structure — we're
novel in proof.

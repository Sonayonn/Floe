# Floe — Master Roadmap Status (living doc, reconciled at every phase)

Floe = the **Verifiable Asset Management layer** for Sui: an isolated vault that
allocates across Sui yield venues and proves its NAV with hardware attestation.
Flagship strategy = DeFi Option Vault (Stratos) on DeepBook Predict.

## DONE & PROVEN ON CHAIN
- **P0/P1**: factory vault, policy-gated rebalance (tx 3Z1Xdh4S), mark_position, withdraw-with-positions.
- **P2 (custody)**: PLP non-custodial PROVEN (tx HnQvMr3N). Custody model verified vs live DeepBook ABI
  (2-tier owner+TradeCap). "Curator-non-custodial with progressive custody minimization."
- **P3 SDK core**: 3a read helpers (live NAV read), 3b share-module publish via coin_registry (PROVEN),
  3c FloeVault.deploy full orchestration (PROVEN — 2nd vault live), 3d uniform VenueModule interface
  + DeepBook reference impl (PROVEN — value() $12.92 via interface).
- **Revenue model**: 3-tier (curator fee / protocol 10% cut / attested-NAV 15% premium) — in contract.
- **Two live vaults** in registry (Stratos ref + SDK-deployed demo).

## IN FLIGHT (current)
- **Nautilus attestation (the MOAT — "verifiable")**:
  - Tier 1: ed25519_verify signed-NAV path (register_attester + update_nav_attested). [BUILDING NOW]
  - Tier 2: Mysten enclave pkg 0x3b009f95 (register_enclave/verify_signature, PCR-anchored). [NEXT]
  - Replaces the STUB: update_plp_price currently ignores attestation; register_enclave doesn't verify PCR.

## DEFERRED — MUST NOT LOSE (explicit backlog)
1. **Comprehensive SDK pass** (the layer's product) — surface attested NAV + venues + deploy + registry
   + treasury into a coherent "build your vault on Floe" SDK + developer usage guide. AFTER attestation.
2. **Cetus live position** — CetusModule complete + verified; blocked on testnet version-guard quirk
   (checked_package_version code 10). Integration-ready. Flip live if version-binding resolved. (KNOWN_GAPS)
3. **3e agent caps** — authorize_agent/revoke_agent contract fns (struct fields exist) + agent SDK module.
4. **store_position/take_position** — in-vault NFT custody for Cetus (dynamic_object_field), mirrors store_plp.
5. **Phase 3.5** — generalize store_plp -> store_receipt<R> for any fungible receipt (LST/cToken venues).
6. **Real delta hedge** — currently geometric proxy (labeled v1); wire live Spot/Margin orders (uses DEEP),
   after BM TradeCap custody (mint_trade_cap -> store in vault).
7. **BM TradeCap custody** — provision_trade_cap (deferred to hedge wiring per verified 2-tier ABI).
8. **Venue expansion backlog** — Tier A: Haedal/SpringSui/AlphaFi (LST, Archetype 1, SUI-native, easiest)
   -> Tier B: Bucket/AlphaLend/Scallop (lending receipts) -> Tier C: Turbos/FlowX/Momentum (CLMM, Archetype 2).
   Opportunistic, not critical path.
9. **Walrus** — audit trail: write rebalance/NAV snapshots as blobs, index blob IDs on vault (append-only).
10. **Seal** — curator strategy-param privacy (encrypt StrategyConfig, rebalancer-only decrypt).
11. **App / frontend** — Earn directory + Portfolio + Deploy + Allocate views; venue-allocation breakdown;
    SVI Surface Studio; Crystalline Blue palette; Walrus Sites mirror.
12. **Backtest** — synthetic APY from a real test run for the demo.
13. **Final doc reconciliation** — update WHAT_IS_FLOE / THESIS / ARCHITECTURE_LAYER to shipped reality.
14. **3-min demo video + DeepSurge submission.**

## STACK TOUCHED (target 7+): Sui L1, Move, DeepBook (Spot/Margin/Predict), Cetus, Nautilus, Walrus, Seal
   = 8 components. (DeepBook live, Cetus integration-ready, Nautilus in flight, Walrus/Seal deferred.)

## CUT ORDER (if time runs short; never cut the first two)
NEVER CUT: provable/attested NAV (the moat); the multi-venue interface proof.
Cut from the bottom: Python SDK -> deeper Cetus -> backtest baselines -> Walrus/Seal polish -> 2nd-vault polish.

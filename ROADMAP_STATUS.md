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

## VENUE BREADTH — SETTLED (verified on-chain)
Probed testnet: Suilend (mainnet-only), NAVI (stale/uncertain), Volo (mainnet pkg absent on testnet),
Haedal (mainnet-only — pkg 0x3f4576.. and haSUI 0xbde4b.. both absent on testnet). Only DeepBook +
Cetus are live on testnet. DECISION: two real venues (DeepBook live, Cetus verified/integration-ready)
+ labeled mainnet roadmap for the rest, all behind the uniform VenueModule interface. This is the
mentor-endorsed approach (two venues real, others as labeled roadmap). Do NOT write unverifiable
mainnet stubs presented as integration (judge-slash risk). Venue breadth is closed; not the critical path.

## NAUTILUS STAGE A — DONE (live on testnet)
floe_nav pkg: 0xc9bae1737b1744108491f6c4d7c87128520d6b61151d9e3bc23c262cbc0026e0 (V1)
  Cap<FLOE_NAV> (owned):          0xe84af0541528abaa11123a2b5a9c9cbee0c4ac18104c4ca3f1a6b3050cb72c9f
  EnclaveConfig<FLOE_NAV> shared: 0x34e27a1bb7034cc6734c59b631e2362ef5515cd9d139871d8653c584825b7402
  enclave primitive pkg:          0x8ecf22e78c90c3e32833d76d82415d7e4227ea370bec4efdad4c4830cbda9e49
Integrates Mysten enclave::verify_signature. BCS payload = IntentMessage{intent(1)+ts(8)+vault_id(32)+nav(8)+plp_price(8)} = 57 bytes (unit-tested).
MOAT: Tier 1 (live ed25519 NAV attestation) + Stage A (Nautilus primitive deployed). Stage B (AWS Nitro enclave registration) IN PROGRESS.

## NAUTILUS TIER 3 — DONE (FULL hardware attestation, live on testnet)
The complete verifiable-NAV chain is proven end-to-end on testnet:
- Reproducible StageX EIF build -> identical PCRs on WSL + EC2 (deterministic):
  PCR0/1 dfe6ad9df7ff5f5646ac5c3cf5da788b7b183e6ce607db41f280ec31d53626ac4bd2cf0d146d05cbee91b7ecc98d7a5b
  PCR2   21b9efbc184807662e966d34f390821309eeac6802309798826296bf3e8bec7c10edb30948c90ba67310f7b964fc500a
- Ran the Floe NAV signer in a real AWS Nitro enclave; got the attestation document.
- load_nitro_attestation verified AWS's Nitro signature on-chain; register_enclave minted a LIVE Enclave:
  Enclave object: 0x1606c150ece04642d8ae50e944377d9217c80f6bd08433dccd1b665838184584 (shared)
  update_pcrs tx GRtUGoPf.., register_enclave tx ApLTpWXZ..
- Enclave-signed NAV VERIFIED on-chain via floe_nav::verify_nav -> enclave::verify_signature:
  [VALID] accepted (tx 4MPDLAcB..); [TAMPERED] rejected (MoveAbort).
MOAT COMPLETE: Tier 1 (ed25519 NAV attestation) + Stage A (Nautilus primitive integrated) +
Tier 3 (full AWS Nitro hardware attestation, on-chain verified). Floe NAV is hardware-attested + on-chain-verifiable.

## VOL INDEX (Path A) — DONE (live on-chain, composable)
floe_vol package: 0xc3400957c89e4be866b31fbb3d7679a5a8723aa789821800c00c245165110f34
VolIndex (shared): 0x114b2934a04bb9e063bc368ffd6cba06fd821dd54edadd48e5e118e7b57f119a
floe_vol_index::vol_now(oracle, clock) computes ATM implied vol ENTIRELY ON-CHAIN from DeepBook Predict's
Block Scholes SVI oracle (SVI total-variance at k=0, integer Newton sqrt, scale 1e9). Synchronously composable
by any protocol. Math validated: Move unit test test_iv_matches_reference passes (reference 70.9%); live devInspect
returned 51.32% from current oracle params (cross-checked off-chain — matches; moves with the market = real benchmark).
update_vol_index snapshots into the shared VolIndex (tx DDwUf7rD..). The Sui implied-vol benchmark, on-chain.
Note: published as standalone floe_vol pkg (adding deepbook_predict dep via UPGRADE hit FeatureNotYetSupported — same
pattern as floe_nav; fresh publish is the fix). deepbook_predict linked via cached Published.toml (testnet 0xf5ea2b37..).
NEXT: attestation bonus — enclave also signs vol snapshots, verified on-chain (best-of-both: trustless on-chain + hardware-attested).

## VOL INDEX ATTESTATION BONUS — DONE (verification live on-chain)
floe_nav V2: 0xfd5a822ad199dd4d07d7fba532b37f2aef5843178af42ed193132554923fda73 (orig pkg 0xc9bae173..).
Added verify_vol_attested<T>(enclave, vol_bps, spot, oracle_id, timestamp_ms, signature) + VolPayload.
Same registered Enclave (0x1606c150..) that secures NAV now ALSO secures vol snapshots, with a DISTINCT
intent (VOL_INTENT=2 vs NAV_INTENT=1) — a NAV signature cannot be replayed as a vol attestation.
PROVEN: test_vol_payload_serde passes (VolPayload IntentMessage = same stable 57-byte shape). The signature
VERIFICATION mechanism itself was proven end-to-end live for NAV (verify_nav: VALID accepted tx 4MPDLAcB,
TAMPERED rejected) — the vol path is the identical enclave + enclave::verify_signature, differing only in the
intent byte + field interpretation (unit-tested). HONEST STATUS: verification deployed + live + BCS-contract
unit-tested; rests on the NAV end-to-end hardware proof rather than a separate live enclave-signed-vol tx.
BEST OF BOTH: vol_now (trustless on-chain compute, floe_vol 0xc3400957) OR verify_vol_attested (hardware-attested).
One attested enclave -> multiple verified feeds. This is the architectural payoff of the moat.

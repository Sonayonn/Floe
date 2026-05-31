# Floe — Build Order

> The verifiable, options-native vault layer for Sui.
> Every line of code serves at least one of: make it a layer, make NAV provable,
> make it options-native. Every phase yields a demo artifact a judge can see.

## What changed from "vault" to "layer" (contract v3)
v2 was a single standalone vault. v3 makes it a factory-deployable, curator-owned,
policy-constrained, fee-bearing primitive. The hard-won parts survive intact:
receipt/custody mechanics, O(1) NAV, capability gating, Stratum logic, the proven
live rebalance. We extend; we don't rewrite.

Open design fork (resolve in Phase 1): per-vault share tokens. Sui can't mint a new
Coin type per vault dynamically. (A) shares tracked per-vault as balances/objects —
works now, demoable, not a fungible Coin; (B) fungible per-vault Coin shares (Abyss
aToken-style composability), heavier. Recommendation: ship (A), design for (B) later.

## What we absorb (mapped)
- Ember (permissionless curator vaults, real seed) -> factory + curator + registry; visible seed
- Enzyme (policy + fees + SDK) -> PolicyConfig + FeeConfig; @floe/sdk
- Lagoon (role separation, Earn/Portfolio/Deploy IA, curator-keyed directory) -> roles; app IA
- Fusion ("modular infra across venues", deploy/earn duality) -> positioning; dual-persona app
- Abyss (composable auto-compounding receipt tokens) -> share interface designed for composability
- Cetus/Volo (one-click autopilot UX) -> deposit flow

## What we beat (no competitor on any chain has these)
1. Options / structured products on Predict — Floe is first on Sui
2. Provable, TEE-attested NAV — everyone else self-reports/pool-accounts
3. Spot + Margin + Predict composition — deepest stack usage

## Phases

### Phase 0 — DONE
v2 vault live; full engine; one real automated rebalance on chain
(tx 3UhuZj6gesg9d5u4X8pP3tnYUk4FUPSwHEHK7736oqGf — PLP supply + 1σ range mint, atomic PTB).

### Phase 1 — Platform primitive (contract v3)  ✅ DONE (factory vault live, policy-gated rebalance proven: tx 3Z1Xdh4S...)
Goal: factory-deployable, curator-owned, policy-constrained, fee-bearing vault.
- Role separation: owner (governance) / curator (sets policy+strategy+fees, earns) / rebalancer (enclave)
- PolicyConfig (enforced in authorize_range/authorize_hedge): allowed_oracles, max_position_size,
  max_leverage_bps, enabled_strata, plp_floor_bps
- FeeConfig: management_fee_bps, performance_fee_bps, fee_recipient, high_water_mark
- strategy_config_blob: vector<u8> (Seal blob ref, wired Phase 6)
- VaultFactory: permissionless deploy_vault(...)
- VaultRegistry: shared object, lists {vault_id, curator, asset, name, strategy_kind}
- Resolve share-token A/B fork
Demo: factory deploys a vault; registry lists it; policy aborts an out-of-bounds position.

### Phase 2 — Per-vault manager provisioning
Each vault gets its own PredictManager (+ BalanceManager). SDK orchestrates
(create managers -> deploy vault referencing them). Scripted, repeatable.

### Phase 3 — @floe/sdk (builder wedge)
FloeVault.deploy({curator, asset, policy, fees, strategy}); export Strategy interface;
read helpers (listVaults/getNAV/getHistory). Deploy a working attested vault in ~20 lines.
(Stretch) Python wrapper.

### Phase 4 — Second vault via SDK (the proof)
A different curator deploys a different strategy via @floe/sdk (e.g. Conservative
wide-band, or Yield-Only PLP). Kills "narrow single app." Two live vaults in the directory.

### Phase 5 — Walrus (audit trail, layer-wide)
Every rebalance writes a snapshot blob; vault indexes blob ids; frontend reconstructs
history. record_walrus_blob exists — wire into rebalancer. Every vault inherits it.

### Phase 6 — Seal (curator alpha privacy, layer-wide)
Strategy params Seal-encrypted, stored on Walrus, decryptable only by the registered
enclave. SDK encrypts client-side. Private alpha AND provable execution.

### Phase 7 — Nautilus (provable NAV — the moat)
Enclave runs rebalancer; NAV/rebalance carry attestation; contract verifies vs registered
PCR. Marlin Oyster. One attested rebalance proves it. Every vault inherits attested NAV.

### Phase 8 — App: Earn / Portfolio / Deploy
- Earn: vault directory (Vault/Curator/TVL/APR/Strategy, filterable)
- Portfolio: user positions across vaults
- Deploy: curator flow (policy/fees/strategy -> deploy via SDK in-browser)
- Vault detail: NAV chart (Walrus), Greeks, attestation badge, position card
- SVI Surface Studio: live 4-expiry vol surface + 1σ band (the "impossible anywhere but Sui" visual)
- One-click deposit; Crystalline Blue; Vercel + Walrus Sites

### Phase 9 — Backtest (traction substitute)
Pure decide() over historical surface -> equity curve, APY, vs naked-PLP/naked-range
baselines. Per-strategy. Headline number on each vault page.

### Phase 10 — Positioning, docs, demo, submission
WHAT_IS_FLOE.md canonical; landing positioning; docs site (SDK ref, Strategy guide,
deploy walkthrough); Powered-by-Sui-Stack wall; 3-min demo; DeepSurge submission.

## Stack components (8, all load-bearing)
Sui L1 + Move + DeepBook(Spot+Margin+Predict) + Walrus + Seal + Nautilus.

## Sequencing logic
Contract first (all depends on factory/policy). SDK before 2nd vault. Walrus->Seal->Nautilus
chain (Seal blob on Walrus; Nautilus decrypts Seal). App after integrations (real attested
data to render). Backtest + positioning last. Demo artifact at every phase boundary.

## Cut order if time runs short (provable NAV is NEVER cut — it is the thesis)
Python SDK -> second-vault polish -> backtest baselines -> (never) Nautilus provable NAV.

## AGENT LAYER (Tier 3) — folded into the phases, not a separate track
Decision: ONE attenuated execution-authority capability (ExecCap). Agents hold a mandated
(attenuated) instance; rebalancer holds the full instance. Grounded in capability-security
attenuation + 2025-26 agent-delegation convergence (Entrust/WSO2/Tenuo). See V3_ARCHITECTURE.md.

Where it lands:
- Phase 1 (contract v3): ExecCap + Mandate + authorize_agent/revoke_agent + AgentRegistry
  built INTO the capability model from the start (not bolted on). Attenuation is structural.
- Phase 3 (@floe/sdk): SDK supports deploying a vault operated by an agent (issue ExecCap
  with mandate); agent-side helper to run the rebalance loop under a mandate.
- Phase 4 (proof vaults): 4a human-curator 2nd vault; 4b AGENT-curator vault ("Floe Agent
  Alpha") — autonomous agent, LLM-authored Strategy, attenuated/attested/revocable mandate,
  live in the directory. The reach proof.
- Phase 7 (Nautilus): per-action attestation fuses with per-action mandate re-evaluation —
  the agent's authority is continuously re-verified, the industry-prescribed model, native.
- Phase 8 (app): AgentRegistry surfaces agent operators in the directory; "Agent" badge +
  the 20-sec demo beat on the agent vault detail page.

NOT a what-next. Built, live, shown on Floe. Bounded so it strengthens (not muddles) the
DeepBook structured-products thesis: the layer is general enough that agents build on it too.

## Note (Phase 3 SDK): adopt coin_registry::new_currency_with_otw for templated share modules
The reference vault's share module uses the (deprecated-but-working) coin::create_currency
for speed on the critical path. When the SDK templates+publishes a share module per vault
(Phase 3), switch the template to coin_registry::new_currency_with_otw + finalize_registration
(two-step publish). The SDK already orchestrates multi-step deploy, so it's the right owner
of the finalize step. Modern API = proper Currency-registry metadata per vault.

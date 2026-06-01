# Floe — Build Order (v2: the verifiable allocation LAYER for Sui)

> Floe is the verifiable, curated vault LAYER that allocates across Sui's fragmented
> yield venues and PROVES its NAV. Not "another vault" — the allocation-and-verification
> layer Sui lacks. DeepBook Predict structured-products is the FLAGSHIP strategy; the
> layer is venue-agnostic by design (Suilend, NAVI, Cetus, Volo, DeepBook).
>
> Every line serves one of: make it a LAYER, make NAV PROVABLE, make it allocate across VENUES.

## THE BOTTLENECK FLOE FIXES (researched 2026)
Sui has the venues (Suilend $745M, NAVI $723M, Cetus/Turbos LP, Volo/Haedal staking,
DeepBook) but NO verifiable allocation layer. Users are told to "stake 40-50%, LP 30%,
rotate 20%, track yourself" — forced to be their own portfolio managers across a dozen
self-reporting apps. Developers must integrate every venue + build their own accounting/
rebalancer/share-token/risk. Post-Cetus-exploit ($260M, May 2025) the market wants ISOLATED
vaults with VERIFIABLE backing — no Sui vault offers it. Floe = that missing layer.

## THE CORE ARCHITECTURAL ABSTRACTION (what makes the layer real)
Research reduced every Sui yield venue to THREE integration archetypes. Floe's vault holds
positions as dynamic fields on its UID (already PROVEN with PLP) and values them into NAV.
Multi-venue = generalizing that proven primitive.

ARCHETYPE 1 — Fungible yield-bearing receipt coin (the dominant, easy case):
  - Suilend: depositLiquidityAndGetCTokens -> Coin<CToken<P,T>>; value = ctokens × exchangeRate
  - NAVI: deposit -> nToken receipt; Volo/Haedal: stake -> vSUI/haSUI; DeepBook PLP (DONE)
  - Pattern = EXACTLY what store_plp already does. Vault holds Balance<R>, values from venue
    reserve state, redeems permissionlessly. ~$1.5B+ TVL covered by ONE adapter pattern.
ARCHETYPE 2 — NFT position (the hard case):
  - Cetus CLMM: open_position -> Position NFT; value via liquidity(nft) + pool tick/price math;
    remove_liquidity/close_position to exit. Vault holds the NFT as a dynamic field object.
ARCHETYPE 3 — Manager/account position (what we have):
  - DeepBook Predict ranges inside PredictManager; valued via SVI oracle; owner-gated redeem.

VenueAdapter interface (the layer's spine):
  deploy(coin: Coin<Q>) -> Position        // enter the venue
  value(position) -> u64                    // in vault quote asset Q (feeds NAV)
  redeem(position, amount) -> Coin<Q>       // exit
NAV = idle + Σ adapter.value(position_i)  -- and THIS sum is what Nautilus attests.
Strategy decides WHERE to allocate; VenueAdapter knows HOW. Both are SDK-level interfaces +
on-chain custody/valuation. This is Yearn-v3/Morpho "multi-strategy in one vault" — but with
PROVABLE NAV and ISOLATED per-vault objects. No Sui protocol has this.

## WHAT WE ABSORB (mapped, updated)
- Enzyme (Onyx/Myso/Blue product surface; SDK; policy+fees) -> @floe/sdk; actor/use-case IA
- Yearn v3 / Morpho (multi-strategy-in-one-vault, curator allocation) -> VenueAdapter layer
- Lagoon (role separation, Earn/Portfolio/Deploy IA) -> roles; app IA
- Abyss (composable receipt tokens) -> per-vault fungible shares (DONE)
- Cetus/Volo (one-click autopilot UX) -> deposit flow
- Summer.fi "yield market map" (fragmentation framing) -> the pitch + the allocation UI

## WHAT WE BEAT (no competitor on Sui — and the NAV proof beats every chain)
1. Verifiable allocation LAYER across venues — Sui has none
2. Provable, TEE-attested NAV spanning all venues — everyone self-reports
3. Options/structured products on DeepBook Predict — Floe is first on Sui (flagship strategy)
4. Isolated per-vault objects with verifiable backing — the post-Cetus-exploit ask

## STATUS (done)
- Phase 0, Phase 1 (factory vault, policy-gated rebalance), Phase 2 (custody model verified;
  PLP non-custodial PROVEN tx HnQvMr3N; BM TradeCap deferred to hedge).
- Phase 3a (@floe/sdk scaffold + read helpers; live NAV read $15.02 / share $1.001).

## PHASES (redesigned from here)

### Phase 3 — @floe/sdk + the VENUE + STRATEGY abstractions  [IN PROGRESS]
- 3a DONE scaffold + read helpers (FloeClient, FloeVault/Registry/Treasury, price-freshness)
- 3b share-module template via coin_registry::new_currency_with_otw (VERIFIED live; 2-step)
- 3c FloeVault.deploy orchestration (= 2nd-vault proof early)
- 3d VenueAdapter + Strategy interfaces (THE multi-venue spine):
    * export interface VenueAdapter { deploy/value/redeem } + interface Strategy { decide() }
    * refactor the existing PLP+range+hedge engine to implement these as the DeepBook adapter
    * Strategy.decide() returns venue-targeted allocation actions
- 3e v3.1 agent caps upgrade (authorize_agent/revoke_agent) + agent SDK module

### Phase 3.5 — GENERALIZE CUSTODY/VALUATION to any fungible receipt (the layer core)
Function-only contract upgrade.
- store_plp/take_plp/plp_balance -> generic store_receipt<R>/take_receipt<R>/receipt_value<R>
- NAV computation -> idle + Σ receipt_values + marks (multi-venue NAV)
- Vault gains a venue-position registry (which receipts/NFTs it holds, per venue)
Demo: the contract custodies + values a Suilend cToken the same way it does PLP.

### Phase 4 — SUILEND ADAPTER (the multi-venue PROOF on chain)
Build the Suilend VenueAdapter (Archetype 1, easiest, $745M venue).
- engine adapter: suilend deposit/redeem PTBs via @suilend SDK (verify LIVE ABI first)
- value cToken from on-chain reserve state (ctokens × exchangeRate)
- one live rebalance allocating across DeepBook PLP + Suilend in ONE vault
Demo: ONE vault, NAV spanning DeepBook + Suilend, proven on chain. THE layer thesis, shown.
(Single most important new artifact. NEVER cut.)

### Phase 5 — NAUTILUS (provable NAV — the moat, now spanning venues)
Enclave runs rebalancer + computes multi-venue NAV and signs it; Move verifies vs PCR.
Same attestation now proves NAV across DeepBook + Suilend. One attested multi-venue NAV = moat.

### Phase 6 — SECOND VENUE-AGNOSTIC VAULT via SDK (the generality proof)
Different curator, different allocation: e.g. "Conservative Yield" = Suilend + Volo only,
vs flagship "Stratos" = DeepBook Predict + hedge. Two vaults, different venue mixes, same
layer, same provable NAV. (4b: agent-curator vault if time.)

### Phase 7 — Walrus (audit trail, layer-wide)
Every rebalance writes a snapshot blob (incl. per-venue allocation); vault indexes blob ids;
frontend reconstructs history. Every vault inherits it.

### Phase 8 — Seal (curator alpha privacy, layer-wide)
Strategy/allocation params Seal-encrypted on Walrus, decryptable only by the registered enclave.

### Phase 9 — App: Earn / Portfolio / Deploy / Allocate
- Earn: vault directory (Vault/Curator/TVL/APR/Venues/Strategy, filterable)
- Vault detail: NAV chart (Walrus), VENUE ALLOCATION breakdown, attestation badge, per-venue positions
- Portfolio: user positions across vaults
- Deploy: curator flow (pick venues + policy + fees -> deploy via SDK in-browser)
- Allocate view: "you no longer have to be your own portfolio manager" — one vault, many venues, one provable NAV
- SVI Surface Studio (flagship visual); one-click deposit; Crystalline Blue; Walrus Sites

### Phase 10 — Backtest + Positioning + docs + demo + submission
Equity curve vs naked-PLP / naked-Suilend / manual-rotation baselines. Landing = "the
verifiable allocation layer for Sui yield"; docs (SDK ref, VenueAdapter guide, Strategy guide,
deploy walkthrough); Powered-by-Sui-Stack wall; 3-min demo; DeepSurge submission.

## STACK (9, all load-bearing)
Sui L1 + Move + DeepBook(Spot+Margin+Predict) + Suilend + Walrus + Seal + Nautilus
(+ Volo/NAVI/Cetus as roadmap adapters via the same interface).

## SEQUENCING LOGIC
SDK + abstractions (3) -> generalize custody (3.5) -> Suilend adapter = multi-venue proof (4)
-> Nautilus attests multi-venue NAV (5) -> 2nd venue-mix vault (6) -> Walrus -> Seal -> app
-> backtest/submission. Multi-venue PROOF (Phase 4) lands BEFORE Nautilus so attested NAV
demonstrably spans venues.

## CUT ORDER if time runs short (NEVER cut: provable NAV; multi-venue proof)
Python SDK -> 2nd-vault-mix polish -> backtest baselines -> Cetus(NFT) adapter -> Walrus/Seal
polish. NEVER cut: Nautilus provable NAV; the Suilend multi-venue proof (Phase 4).

## DISCIPLINE NOTE
We do NOT need ALL venues. We need: the VenueAdapter abstraction (real, in SDK + contract),
the DeepBook flagship strategy (done), and ONE additional venue (Suilend) PROVEN on chain in
a multi-venue vault. That triad proves "verifiable allocation layer across venues" is real
infra. NAVI/Cetus/Volo are roadmap adapters the seam already supports.

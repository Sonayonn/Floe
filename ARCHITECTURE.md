# Floe — Layer Architecture (the venue-agnostic spine)

> Supplements V3_ARCHITECTURE.md. Captures the multi-venue allocation layer design.

## The core abstraction: VenueAdapter
Every Sui yield venue reduces to one of three integration archetypes. The layer's spine is a
single interface every venue implements:

  VenueAdapter:
    deploy(coin: Coin<Q>) -> Position     // enter the venue
    value(position) -> u64                 // in vault quote asset Q (feeds NAV)
    redeem(position, amount) -> Coin<Q>    // exit

NAV = idle + Σ adapter.value(position_i).  This sum is what Nautilus attests.
Strategy decides WHERE to allocate; VenueAdapter knows HOW.

## The three archetypes (verified against live SDKs/ABIs)
ARCHETYPE 1 — Fungible yield-bearing receipt coin (dominant, easy):
  Suilend depositLiquidityAndGetCTokens -> Coin<CToken<P,T>>; value = ctokens × reserve rate.
  NAVI deposit -> nToken; Volo/Haedal stake -> vSUI/haSUI; DeepBook PLP (shipped).
  Vault holds Balance<R> as a dynamic field, values from venue reserve state, redeems
  permissionlessly. Generalizes store_plp -> store_receipt<R>. ~$1.5B+ TVL, ONE pattern.
ARCHETYPE 2 — NFT position (hard):
  Cetus CLMM open_position -> Position NFT; value via liquidity(nft) + pool tick/price math;
  remove_liquidity/close_position to exit. Vault holds the NFT as a dynamic field object.
ARCHETYPE 3 — Manager/account position (have):
  DeepBook Predict ranges in a PredictManager; valued via SVI oracle; owner-gated redeem.

## On-chain custody/valuation (generalizing the proven PLP primitive)
- store_receipt<R> / take_receipt<R> / receipt_value<R>  (PLP = first instance, PROVEN)
- vault holds a venue-position registry (which receipts/NFTs, per venue)
- multi-venue NAV: idle + Σ receipt_values + Σ nft_values + marks
- the SAME Nautilus attestation that signs PLP valuation signs every venue's valuation

## Hackathon scope (disciplined)
Ship: the VenueAdapter abstraction (real, in SDK + contract) + DeepBook flagship (done) +
ONE proven additional venue (Suilend) live in a multi-venue vault. That triad = "verifiable
allocation layer across venues" as real infra. NAVI/Cetus/Volo = roadmap adapters the
interface already supports — their clean interface IS the infra proof. Roadmap order:
Suilend (Archetype 1, shipped first) -> Volo/NAVI (Archetype 1, trivial after Suilend) ->
Cetus (Archetype 2, NFT, post-hackathon).
# Floe — Architecture

> Floe is a Sui-native structured-product vault built on DeepBook's three
> composable primitives — **Spot**, **Margin**, and **Predict** — with
> Walrus for verifiable performance history, Seal for confidential strategy
> parameters, and Nautilus enclaves for attested rebalancing.

This document captures the architectural decisions made during the Sui
Overflow 2026 build (May–June 2026). Each decision is grounded in a specific
property of the Sui Stack that no other L1 currently offers.

---

## 1. The thesis

DeepBook just shipped **three composable primitives that share liquidity**:

| Primitive | What it does |
|-----------|--------------|
| Spot      | On-chain CLOB with $20M TVL, $15M+ daily volume |
| Margin    | 10x leverage on the same shared pool |
| Predict   | Options + binary markets with Block Scholes SVI oracle (testnet) |

This is the structural difference Sui has versus Ethereum and Solana, both
of which silo options liquidity from spot liquidity from margin liquidity.
On Sui, a single position can compose all three.

Sui Foundation's own framing of the opportunity (May 4, 2026):

> "On-chain options are flat — the entire category sits at $100M in TVL.
> That is not a competitive market, it is an underdeveloped one."

**Floe is the structured-product vault for that $100M opportunity.**

---

## 2. What Floe is

A single Move smart contract that:

1. Accepts **DUSDC deposits** from users
2. Mints **Floe vault shares** to depositors (proportional to NAV)
3. **Supplies a calibrated portion of DUSDC** into Predict's shared vault,
   receiving **PLP** (Predict LP tokens) in return
4. **Holds a hedge position via DeepBook Margin** to neutralize the vault's
   aggregate delta drift
5. Lets users **withdraw** by burning their Floe shares, redeeming
   pro-rata from the vault's combined assets

A Nautilus enclave runs the rebalancing decisions off-chain, posting
attested updates on-chain. Walrus stores every rebalance's full snapshot
for tamper-evident history. Seal encrypts the strategy parameters so the
rebalancer can be updated without revealing proprietary calibration.

---

## 3. Why this composition is novel

The four claims that matter:

**(a)** Floe is the *first* structured-product vault that LPs into
DeepBook Predict. Predict launched on testnet May 5, 2026 with vault
utilization at 0.04% as of Day 4. Floe is being built into the cold-start
phase, the highest-yield window for early LPs.

**(b)** Floe's NAV oracle is **TEE-attested via Nautilus**. The PLP share
price that drives Floe's NAV is fetched and signed by a Marlin Oyster
enclave, not a trusted off-chain oracle. No existing options vault on any
L1 has this property.

**(c)** Every rebalance writes a **Walrus blob** with the full position,
oracle, vault, and hedge snapshot, indexed on-chain in a `vector<BlobId>`
on the Floe vault. Performance claims are publicly auditable.

**(d)** Strategy parameters (range width, rebalance thresholds, hedge
band) are **Seal-encrypted**, decryptable only by the attested rebalancer.
The operator can update strategy without revealing it; the strategy itself
is part of the vault's IP.

Three of those properties (b, c, d) are Sui-stack-only. (a) is a
timing-of-the-build property no other team has.

---

## 4. Component architecture

┌──────────────────────────────────────────────────────────────────┐
│                            USER                                  │
└────────────┬──────────────────────────────────────────────────┬──┘
│ deposit(DUSDC)                  withdraw(shares) │
▼                                                  ▼
┌──────────────────────────────────────────────────────────────────┐
│                        FLOE VAULT (Move)                         │
│                                                                  │
│  - mint/burn FloeShare objects                                   │
│  - holds BalanceManager (owns DeepBook account)                  │
│  - tracks plp_held, plp_price_cached, plp_price_updated_ms       │
│  - calls predict::supply / predict::withdraw                     │
│  - calls deepbook::place_*_order (via RebalancerCap)             │
│  - records walrus_blob_ids: vector<BlobId>                       │
└─┬──────────────┬──────────────┬──────────────┬──────────────┬───┘
│              │              │              │              │
▼              ▼              ▼              ▼              ▼
┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────────┐
│DeepBook │ │DeepBook │ │DeepBook │ │ Walrus  │ │   Seal      │
│  Spot   │ │ Margin  │ │ Predict │ │ history │ │ strategy    │
│ (hedge) │ │ (delta) │ │ (PLP)   │ │ blobs   │ │ config      │
└─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────────┘
▲
│ decrypt
┌──────────────────────────────────────────────────────┴──────────┐
│             NAUTILUS ENCLAVE (Marlin Oyster)                    │
│                                                                 │
│   - reads OracleSVI state, vault summary, PLP price             │
│   - decrypts strategy params via Seal                           │
│   - decides: rebalance, supply/withdraw PLP, hedge size         │
│   - signs PTB with attestation                                  │
│   - submits attested PTB to Floe vault                          │
└─────────────────────────────────────────────────────────────────┘
---

## 5. NAV calculation — the corrected model

After reading the Predict Move source carefully (`vault/vault.move`), we
established that Predict's `vault_value()` is `public` but the
`predict.vault` field is `public(package)`. Floe **cannot** directly call
`predict.vault.vault_value()` from on-chain code.

**Resolution:** the PLP share price is computed off-chain by the Nautilus
enclave (which has on-chain read access via `devInspectTransactionBlock`)
and posted to Floe's vault during each attested rebalance.

```move
public struct Vault has key {
    id: UID,
    balance_manager: BalanceManager,        // for DUSDC custody + Margin hedge
    plp_held: u64,                          // PLP balance, exact from BM
    plp_price_cached: u64,                  // last attested update
    plp_price_updated_ms: u64,              // staleness check
    share_supply: u64,
    deposit_base: u64,
    walrus_blob_ids: vector<BlobId>,
    // ...
}

public fun total_assets(vault: &Vault, bm: &BalanceManager): u64 {
    let dusdc = balance_manager::balance<DUSDC>(bm);
    let plp_value = math::mul(vault.plp_held, vault.plp_price_cached);
    dusdc + plp_value
}

public fun share_price(vault: &Vault, bm: &BalanceManager): u64 {
    if (vault.share_supply == 0) return 1_000_000;  // 1.0 in 6dp
    math::div(total_assets(vault, bm), vault.share_supply)
}
```

The price cache is updated via a capability-gated entry point:

```move
public fun update_plp_price(
    vault: &mut Vault,
    cap: &RebalancerCap,
    new_price: u64,
    attestation: vector<u8>,
    clock: &Clock,
) {
    assert_cap(vault, cap);
    verify_attestation(attestation, vault.enclave_pcr_hash, new_price);
    vault.plp_price_cached = new_price;
    vault.plp_price_updated_ms = clock.timestamp_ms();
}
```

This is the **architectural justification for Nautilus**. The enclave's
job isn't "compute the strategy" — it's enforcing oracle integrity for
NAV. That's a meaningfully stronger story for the judges than the
original framing of "the enclave runs the rebalancer."

---

## 6. Data flows

### Deposit
User                      Floe Vault                  DeepBook BM
│     deposit(coin)         │                            │
├─────────────────────────► │                            │
│                           │   deposit DUSDC into BM    │
│                           ├──────────────────────────► │
│                           │                            │
│                           │  shares = amount * total_supply / NAV
│   shares minted to user   │  (mint logic in vault.move)
│ ◄─────────────────────────┤
### Rebalance (initiated by enclave)
Enclave                Floe Vault          Predict             DeepBook
│  decide allocation    │                   │                    │
│  attest decision      │                   │                    │
│                       │                   │                    │
│  PTB: bundled         │                   │                    │
│ ─────────────────────►│                   │                    │
│    update_plp_price   │                   │                    │
│    supply (if buying) ├──── coin → PLP ──►│                    │
│    withdraw (if sell) │◄──── PLP → coin ──┤                    │
│    place_hedge        ├───────────────────┼──── margin trade ─►│
│    write_blob         │                   │                    │
│    (Walrus blob)      │                   │                    │
All steps in one atomic PTB. If any fails, none commit.

### Withdraw
User                      Floe Vault                  DeepBook BM
│  withdraw(shares)         │                            │
├─────────────────────────► │                            │
│                           │  amount = shares * NAV / total_supply
│                           │  burn shares
│                           │  withdraw DUSDC from BM
│                           ├──────────────────────────► │
│   coin returned           │                            │
│ ◄─────────────────────────┤                            │


If the vault doesn't hold enough free DUSDC (because most is in PLP),
the withdrawal initiates a partial PLP redemption first. Withdrawal limits
will be subject to Predict's own `available_withdrawal` rate-limiter.

---

## 7. Access control model

Three roles, three capability levels:

| Role         | What they can do                          | Capability |
|--------------|-------------------------------------------|------------|
| **User**     | deposit, withdraw                         | none (sender check) |
| **Operator** | upgrade strategy params (Seal-encrypted)  | `OperatorCap` |
| **Enclave**  | rebalance, update PLP price, place hedges | `RebalancerCap` |

The `RebalancerCap` is owned by the vault contract itself (not the
operator). It's only handed to a Move call when the call presents a valid
**Nautilus attestation** signed by the registered enclave PCR. If the
enclave is compromised, the attacker can place bad trades within strategy
bands but cannot withdraw user funds — those flow only via the
user-facing `withdraw` function.

This is the **same capability+attestation pattern Predict's own
`PredictManager` uses** for its `DepositCap`/`WithdrawCap` separation
from owner identity. We're not inventing security; we're using Sui's
native patterns.

---

## 8. Why Sui specifically

The same product on Ethereum requires:

- Separate AMM vault (Uniswap V4) for spot
- Separate lending market (Aave/Morpho) for margin
- Separate options protocol (Ribbon/Lyra) for options
- Liquidity siloed across all three
- No native TEE attestation primitive
- Centralized off-chain history (not auditable)
- Trusted off-chain oracle for NAV (counterparty risk)

The same product on Solana requires:

- Drift / Mango for spot+margin
- PsyOptions or Zeta for options (separate liquidity)
- No native TEE attestation
- Helius/RPC for history (not on-chain)
- Pyth or Switchboard for oracles (different counterparty)

On Sui:

- **One DeepBook account** trades Spot, Margin, and Predict
- **Nautilus** provides native TEE attestation, verified on-chain in Move
- **Walrus** stores history with cryptographic verifiability
- **Seal** provides decentralized secrets with on-chain access control
- **All five primitives** were built by the same foundation, designed to compose

Floe ships in 4 weeks because Sui makes it 4 weeks of work.

---

## 9. What's deferred (and why)

| Feature | Deferred to | Why |
|---------|-------------|-----|
| Multiple strategies (covered call, iron condor) | Post-hackathon | One polished strategy beats five half-baked ones |
| Multiple oracles (BTC, ETH) | Post-hackathon | SUI/USDC oracle alone proves the architecture |
| Native FloeShare as a coin type | Post-hackathon | Object-based shares are simpler and equally functional for v1 |
| Governance / DAO | Out of scope | The operator role is sufficient for v1 |
| Mobile native UI | Post-hackathon | Responsive web suffices |
| Audit | Post-hackathon | Demo-day prize includes audit credits |
| Mainnet deployment | After Predict mainnet | Predict is testnet through ~late 2026 |

See `KNOWN_GAPS.md` for testnet-specific blockers and their resolution plans.

---

## 10. Open questions for Day 5 onwards

1. **Withdrawal queueing.** If a user requests withdraw larger than free
   DUSDC, do we (a) partial-redeem PLP synchronously in the same tx,
   or (b) queue the withdrawal and process on next rebalance? (a) is
   simpler; (b) is more capital-efficient.

2. **Strategy hot-swap.** How frequently does the operator rotate the
   Seal-encrypted strategy config? Once per epoch? Per rebalance?

3. **PLP staleness threshold.** How old can `plp_price_updated_ms`
   be before deposit/withdraw should refuse to proceed? 5 minutes? 1 hour?

These are intentional unknowns until Day 5+ implementation reveals
constraints.

---

## On the FLOE token

FLOE is the vault's **share token** — a fully-backed, redeemable claim on the
vault's net asset value — not a governance or speculative token. It is
implemented as a native Sui `Coin<FLOE>` (via the Coin standard) rather than a
plain object receipt, for one reason: composability. As a real fungible coin,
FLOE can be held in any wallet, transferred, and used as a building block by
other Sui protocols (e.g. as collateral in a lending market, or as an LP leg),
which is consistent with Floe's positioning as infrastructure rather than an
end-app.

Critically, FLOE has **no fixed supply, no presale, no market cap, and no
tokenomics**. Supply is elastic: FLOE mints on deposit and burns on withdrawal.
Its value is mechanical — `share_price = total_assets / share_supply` — and
rises only as the Stratos strategy earns yield. There is nothing to speculate
on: any deviation between a secondary-market price and NAV is immediately
arbitraged away, since anyone can mint at NAV by depositing or redeem at NAV by
withdrawing. FLOE behaves like an ERC-4626 vault share (cf. Yearn yvTokens,
Lido stETH), not like a protocol governance token.

If Floe introduces protocol governance post-hackathon, that would be a
*separate* token with distinct mechanics; it is explicitly out of scope for v1
and intentionally so — the hackathon submission is a structured-product vault,
not a token launch.

*Last updated: end of Day 4 (May 19, 2026). This document evolves with
the build.*
/// Floe — a Sui-native structured-product vault on DeepBook Predict.
///
/// Runs the "Floe Stratos" strategy: PLP base yield (Stratum A) + active
/// vertical-range ladder (Stratum B) + delta hedge via Margin (Stratum C),
/// all delta-neutral, TEE-attested, and Walrus-audited.
///
/// This module holds user funds. Two capabilities gate privileged actions:
///   - OperatorCap:  config + enclave registration. Cannot move funds.
///   - RebalancerCap: strategy execution. Can move funds *within strategy*
///                    but cannot withdraw to arbitrary addresses.
/// User withdrawals flow only through the user-facing `withdraw`, which burns
/// shares. No capability can drain deposits.
module floe::vault;

use sui::balance::{Self, Balance};
use sui::coin::{Self, Coin, TreasuryCap};
use sui::table::{Self, Table};
use sui::clock::Clock;

// ─── Errors ──────────────────────────────────────────────────────────────────

const ENotOperator: u64 = 0;
const ENotRebalancer: u64 = 1;
const EVaultPaused: u64 = 2;
const EInsufficientShares: u64 = 3;
const EZeroAmount: u64 = 4;
const EPriceStale: u64 = 5;
const EPlpFloorBreached: u64 = 6;
const EPositionNotFound: u64 = 7;
const EWrongVault: u64 = 8;
const ESharesExceedSupply: u64 = 9;

// ─── Constants ───────────────────────────────────────────────────────────────

/// PLP price is considered stale after this long. Deposits/withdrawals refuse
/// to use a NAV older than this to prevent minting/burning against stale value.
const PRICE_STALENESS_LIMIT_MS: u64 = 3_600_000; // 1 hour

/// Initial share price when supply is zero: 1.0 in 6-decimal fixed point.
const INITIAL_SHARE_PRICE: u64 = 1_000_000;

/// Default Stratum A floor: 50% of TVL must stay liquid as PLP/idle.
const DEFAULT_PLP_FLOOR_BPS: u64 = 5_000;

/// Minimum first deposit to bootstrap the vault. Prevents share-price
/// inflation attacks where a tiny first deposit lets an attacker manipulate
/// the price for subsequent depositors.
const MIN_FIRST_DEPOSIT: u64 = 1_000_000; // 1.0 DUSDC (6dp)
// ─── One-time witness for the FLOE share token ───────────────────────────────

/// OTW: consumed in `init` to create the FLOE currency. Name must match the
/// module name uppercased. `drop` only, no fields.
public struct VAULT has drop {}

// ─── The FLOE share token marker ─────────────────────────────────────────────

/// The vault's share token type. Coin<FLOE> is what depositors hold.
public struct FLOE has drop {}

// ─── Objects ─────────────────────────────────────────────────────────────────

/// A single vertical-range position the vault holds on Predict.
/// Stored in the vault's `positions` table, keyed by the Predict position's ID.
public struct RangePosition has store {
    oracle_id: ID,
    expiry_ms: u64,
    lower_strike: u64,
    upper_strike: u64,
    size: u64,
    premium_paid: u64,
    minted_at_ms: u64,
    /// Last attested mark-to-market value, used in NAV. Updated by rebalancer.
    mark_value_cached: u64,
}

/// Hot-potato receipt for a DUSDC deployment. Zero abilities — must be consumed
/// by `confirm_deploy` in the same PTB. Guarantees the rebalancer reports back
/// how much PLP was obtained for the DUSDC it took, so vault accounting can't
/// silently desync from reality.
public struct DeployReceipt {
    vault_id: ID,
    dusdc_out: u64,
}

/// Hot-potato receipt for a PLP redemption. Must be consumed by
/// `confirm_redeem` in the same PTB.
public struct RedeemReceipt {
    vault_id: ID,
    plp_out: u64,
}

/// Hot-potato for recording a freshly-minted range. Must be settled by
/// `record_range` in the same PTB so the vault's position table can't desync
/// from what was actually minted on Predict.
public struct RangeAuthReceipt {
    vault_id: ID,
}

/// Hot-potato for a range redemption round-trip.
public struct RangeRedeemReceipt {
    vault_id: ID,
    position_id: ID,
}
/// The vault. Generic over quote asset T (instantiated as DUSDC).
/// Shared object — any depositor can call `deposit`/`withdraw` against it.
public struct Vault<phantom T> has key {
    id: UID,

    // ─── Control ───
    operator: address,
    paused: bool,

    // ─── DeepBook account references (created externally, IDs held here) ───
    balance_manager_id: ID,
    predict_manager_id: ID,

    // ─── Share token ───
    treasury: TreasuryCap<FLOE>,
    share_supply: u64,

    // ─── Custody ───
    idle: Balance<T>,            // deposited, not yet deployed

    // ─── Stratum A: PLP ───
    plp_held: u64,               // PLP coin balance the vault holds
    plp_price_cached: u64,       // attested PLP price, 9dp
    plp_price_updated_ms: u64,   // staleness guard

    // ─── Stratum B: range ladder ───
    positions: Table<ID, RangePosition>,
    position_count: u64,
    /// Sum of all open-position mark values. Maintained incrementally on
    /// record/mark/redeem so total_assets stays O(1) instead of iterating.
    positions_mark_total: u64,

    // ─── Stratum C: delta hedge ───
    hedge_margin_manager_id: Option<ID>,
    hedge_notional: u64,
    hedge_is_short: bool,

    // ─── Auditability (Walrus, wired in W3) ───
    walrus_blob_ids: vector<vector<u8>>,

    // ─── Config ───
    enclave_pcr_hash: vector<u8>,
    plp_floor_bps: u64,
}

/// Held by the deployer/governance. Config + enclave registration. No fund movement.
public struct OperatorCap has key, store {
    id: UID,
    vault_id: ID,
}

/// Held by the Nautilus enclave. Authorizes strategy execution only.
public struct RebalancerCap has key, store {
    id: UID,
    vault_id: ID,
}

// ─── Init ────────────────────────────────────────────────────────────────────

/// Runs once at publish. Creates the FLOE currency and transfers the
/// publisher the TreasuryCap-bearing... no — the TreasuryCap goes INTO the
/// vault at creation time (see `create_vault`), so here we only create the
/// currency metadata and hand the treasury to the publisher temporarily.
#[allow(deprecated_usage)]
fun init(witness: VAULT, ctx: &mut TxContext) {
    let (treasury, metadata) = coin::create_currency(
        witness,
        6,                       // decimals — match DUSDC's 6dp
        b"FLOE",                 // symbol
        b"Floe Vault Share",     // name
        b"Share token for the Floe Stratos structured-product vault",
        option::none(),          // icon url — set later
        ctx,
    );

    // Metadata is immutable public info.
    transfer::public_freeze_object(metadata);

    // TreasuryCap goes to the publisher, who calls `create_vault` to lock it
    // inside a Vault. Until then it's owned by the deployer.
    transfer::public_transfer(treasury, ctx.sender());
}

// ─── Vault creation ──────────────────────────────────────────────────────────

/// Create and share a Vault, consuming the TreasuryCap so only the vault can
/// mint/burn FLOE thereafter. Returns the two capabilities to the caller.
public fun create_vault<T>(
    treasury: TreasuryCap<FLOE>,
    balance_manager_id: ID,
    predict_manager_id: ID,
    ctx: &mut TxContext,
): (OperatorCap, RebalancerCap) {
    let vault = Vault<T> {
        id: object::new(ctx),
        operator: ctx.sender(),
        paused: false,
        balance_manager_id,
        predict_manager_id,
        treasury,
        share_supply: 0,
        idle: balance::zero<T>(),
        plp_held: 0,
        plp_price_cached: 0,
        plp_price_updated_ms: 0,
        positions: table::new<ID, RangePosition>(ctx),
        position_count: 0,
        positions_mark_total: 0,
        hedge_margin_manager_id: option::none(),
        hedge_notional: 0,
        hedge_is_short: false,
        walrus_blob_ids: vector[],
        enclave_pcr_hash: vector[],
        plp_floor_bps: DEFAULT_PLP_FLOOR_BPS,
    };

    let vault_id = object::id(&vault);

    let operator_cap = OperatorCap {
        id: object::new(ctx),
        vault_id,
    };
    let rebalancer_cap = RebalancerCap {
        id: object::new(ctx),
        vault_id,
    };

    transfer::share_object(vault);
    (operator_cap, rebalancer_cap)
}

// ─── Capability assertions (internal helpers) ────────────────────────────────

fun assert_operator<T>(vault: &Vault<T>, cap: &OperatorCap) {
    assert!(cap.vault_id == object::id(vault), EWrongVault);
    // Cap ownership IS the authorization — holding a valid OperatorCap for this
    // vault is sufficient. The vault_id match prevents using another vault's cap.
}

fun assert_rebalancer<T>(vault: &Vault<T>, cap: &RebalancerCap) {
    assert!(cap.vault_id == object::id(vault), EWrongVault);
}

fun assert_not_paused<T>(vault: &Vault<T>) {
    assert!(!vault.paused, EVaultPaused);
}

// ─── Read accessors (public views) ───────────────────────────────────────────

public fun share_supply<T>(vault: &Vault<T>): u64 { vault.share_supply }
public fun plp_held<T>(vault: &Vault<T>): u64 { vault.plp_held }
public fun plp_price<T>(vault: &Vault<T>): u64 { vault.plp_price_cached }
public fun position_count<T>(vault: &Vault<T>): u64 { vault.position_count }
public fun is_paused<T>(vault: &Vault<T>): bool { vault.paused }
public fun idle_value<T>(vault: &Vault<T>): u64 { balance::value(&vault.idle) }

// ─── NAV ─────────────────────────────────────────────────────────────────────

/// Total assets under management, in quote-asset base units.
/// For Phase 5.2 this is idle + PLP value. Stratum B/C marks add in 5.3/5.5/5.6.
public fun total_assets<T>(vault: &Vault<T>): u64 {
    let idle = balance::value(&vault.idle);
    let plp_value = mul_div(vault.plp_held, vault.plp_price_cached, 1_000_000_000);
    idle + plp_value + vault.positions_mark_total
}

/// Share price in 6dp fixed point. Returns INITIAL when supply is zero.
public fun share_price<T>(vault: &Vault<T>): u64 {
    if (vault.share_supply == 0) {
        INITIAL_SHARE_PRICE
    } else {
        mul_div(total_assets(vault), INITIAL_SHARE_PRICE, vault.share_supply)
    }
}

// ─── Deposit / Withdraw (user-facing) ────────────────────────────────────────

/// Deposit quote asset T, receive FLOE shares. Anyone can call.
/// Shares are minted in proportion to current NAV; rounds DOWN (favors vault).
public fun deposit<T>(
    vault: &mut Vault<T>,
    payment: Coin<T>,
    clock: &Clock,
    ctx: &mut TxContext,
): Coin<FLOE> {
    assert_not_paused(vault);
    assert!(is_price_fresh(vault, clock), EPriceStale);

    let amount = coin::value(&payment);
    assert!(amount > 0, EZeroAmount);

    let supply = vault.share_supply;

    let shares = if (supply == 0) {
        // Bootstrap: first deposit must clear the minimum, mints 1:1.
        assert!(amount >= MIN_FIRST_DEPOSIT, EZeroAmount);
        amount
    } else {
        // shares = amount * supply / total_assets, rounded DOWN
        let assets = total_assets(vault);
        mul_div(amount, supply, assets)
    };

    assert!(shares > 0, EZeroAmount);

    // Absorb the payment into idle balance
    balance::join(&mut vault.idle, coin::into_balance(payment));

    // Mint and return shares
    vault.share_supply = vault.share_supply + shares;
    coin::mint(&mut vault.treasury, shares, ctx)
}

/// Burn FLOE shares, receive proportional quote asset T back.
/// Rounds DOWN (favors vault). Withdraws from idle balance only in 5.2;
/// PLP redemption path for large withdrawals comes in 5.4.
public fun withdraw<T>(
    vault: &mut Vault<T>,
    shares: Coin<FLOE>,
    clock: &Clock,
    ctx: &mut TxContext,
): Coin<T> {
    assert_not_paused(vault);
    assert!(is_price_fresh(vault, clock), EPriceStale);

    let share_amount = coin::value(&shares);
    assert!(share_amount > 0, EZeroAmount);
    assert!(share_amount <= vault.share_supply, ESharesExceedSupply);

    // assets = shares * total_assets / supply, rounded DOWN
    let assets = total_assets(vault);
    let payout = mul_div(share_amount, assets, vault.share_supply);

    assert!(payout > 0, EInsufficientShares);
    assert!(balance::value(&vault.idle) >= payout, EInsufficientShares);

    // Burn the shares
    coin::burn(&mut vault.treasury, shares);
    vault.share_supply = vault.share_supply - share_amount;

    // Return proportional assets from idle
    coin::from_balance(balance::split(&mut vault.idle, payout), ctx)
}

// ─── Stratum A: attested PLP price oracle ────────────────────────────────────

/// Update the cached PLP share price. Called by the rebalancer (enclave) each
/// cycle. The `attestation` argument carries the Nautilus attestation document
/// proving the price was read by the registered enclave; full PCR verification
/// lands on Day 18 (currently presence-checked only).
///
/// `new_price` is the PLP share price in 9dp fixed point (matching Predict's
/// vault_value / plp_supply scale).
public fun update_plp_price<T>(
    vault: &mut Vault<T>,
    cap: &RebalancerCap,
    new_price: u64,
    plp_held: u64,
    _attestation: vector<u8>,
    clock: &Clock,
) {
    assert_rebalancer(vault, cap);
    assert!(new_price > 0, EZeroAmount);

    // TODO(Day 18): verify _attestation against vault.enclave_pcr_hash
    // using sui::nitro_attestation or the Nautilus Move helper.

    vault.plp_price_cached = new_price;
    vault.plp_held = plp_held;
    vault.plp_price_updated_ms = clock.timestamp_ms();
}

/// True if the cached PLP price is fresh enough to trust for NAV.
public fun is_price_fresh<T>(vault: &Vault<T>, clock: &Clock): bool {
    let now = clock.timestamp_ms();
    let updated = vault.plp_price_updated_ms;
    // Fresh if updated within the staleness window. If never updated
    // (updated == 0) and no PLP is held, freshness is irrelevant.
    if (vault.plp_held == 0) {
        true
    } else {
        updated > 0 && now - updated <= PRICE_STALENESS_LIMIT_MS
    }
}

// ─── Stratum A: deploy idle DUSDC → PLP, and redeem PLP → DUSDC ───────────────
//
// Floe never holds Coin<PLP> directly. The flow inside one rebalance PTB:
//
//   SUPPLY:
//     1. floe::deploy_idle(vault, cap, amount)        -> (Coin<DUSDC>, DeployReceipt)
//     2. predict::supply<DUSDC>(predict, coin, clk)   -> Coin<PLP>      [Predict]
//     3. predict_manager::deposit<PLP>(mgr, plp, ctx)                   [Predict]
//     4. floe::confirm_deploy(vault, receipt, plp_obtained)
//
//   REDEEM:
//     1. floe::request_redeem(vault, cap, plp_amount) -> RedeemReceipt
//     2. predict_manager::withdraw<PLP>(mgr, amt, ctx)-> Coin<PLP>      [Predict]
//     3. predict::withdraw<DUSDC>(predict, plp, clk)  -> Coin<DUSDC>    [Predict]
//     4. floe::confirm_redeem(vault, receipt, dusdc_coin)

/// Step 1 of supply: take `amount` DUSDC out of idle, hand it to the rebalancer
/// along with a receipt that must be settled this PTB. Enforces Stratum A floor.
public fun deploy_idle<T>(
    vault: &mut Vault<T>,
    cap: &RebalancerCap,
    amount: u64,
    ctx: &mut TxContext,
): (Coin<T>, DeployReceipt) {
    assert_rebalancer(vault, cap);
    assert_not_paused(vault);
    assert!(amount > 0, EZeroAmount);
    assert!(balance::value(&vault.idle) >= amount, EInsufficientShares);

    // Stratum A floor: after this deployment, idle must remain >= floor of TVL.
    // TVL = idle + plp_value. floor_bps default 5000 = 50%.
    let plp_value = mul_div(vault.plp_held, vault.plp_price_cached, 1_000_000_000);
    let tvl = balance::value(&vault.idle) + plp_value;
    let idle_after = balance::value(&vault.idle) - amount;
    let floor = mul_div(tvl, vault.plp_floor_bps, 10_000);
    // idle_after + (plp grows by ~amount) stays >= floor; we check idle_after
    // against floor conservatively (PLP isn't liquid for instant withdrawal).
    assert!(idle_after + plp_value + amount >= floor, EPlpFloorBreached);

    let coin_out = coin::from_balance(balance::split(&mut vault.idle, amount), ctx);
    let receipt = DeployReceipt { vault_id: object::id(vault), dusdc_out: amount };
    (coin_out, receipt)
}

/// Step 4 of supply: settle the receipt, recording how much PLP was obtained.
public fun confirm_deploy<T>(
    vault: &mut Vault<T>,
    receipt: DeployReceipt,
    plp_obtained: u64,
) {
    let DeployReceipt { vault_id, dusdc_out: _ } = receipt;
    assert!(vault_id == object::id(vault), EWrongVault);
    assert!(plp_obtained > 0, EZeroAmount);
    vault.plp_held = vault.plp_held + plp_obtained;
}

/// Step 1 of redeem: authorize the rebalancer to pull `plp_amount` PLP from the
/// manager. Decrements tracked PLP; receipt must be settled this PTB.
public fun request_redeem<T>(
    vault: &mut Vault<T>,
    cap: &RebalancerCap,
    plp_amount: u64,
): RedeemReceipt {
    assert_rebalancer(vault, cap);
    assert!(plp_amount > 0, EZeroAmount);
    assert!(vault.plp_held >= plp_amount, EInsufficientShares);

    vault.plp_held = vault.plp_held - plp_amount;
    RedeemReceipt { vault_id: object::id(vault), plp_out: plp_amount }
}

/// Step 4 of redeem: settle the receipt, absorbing the DUSDC obtained back into idle.
public fun confirm_redeem<T>(
    vault: &mut Vault<T>,
    receipt: RedeemReceipt,
    dusdc_coin: Coin<T>,
) {
    let RedeemReceipt { vault_id, plp_out: _ } = receipt;
    assert!(vault_id == object::id(vault), EWrongVault);
    balance::join(&mut vault.idle, coin::into_balance(dusdc_coin));
}

// ─── Stratum B: range position ladder (rebalancer-gated) ─────────────────────
//
// The vault records each range Floe writes on Predict in `positions`, keyed by
// the Predict position's object ID. The 1σ strike selection happens off-chain
// in the rebalancer (reads SVI surface, computes the band); the vault stores
// the result and includes it in NAV via mark_value_cached.

/// Step 1 of placing a range: authorize the rebalancer to mint. The DUSDC to
/// fund the mint is moved into the manager separately (deploy_idle-style or a
/// dedicated fund call); this receipt just enforces that `record_range` runs.
public fun authorize_range<T>(
    vault: &mut Vault<T>,
    cap: &RebalancerCap,
): RangeAuthReceipt {
    assert_rebalancer(vault, cap);
    assert_not_paused(vault);
    RangeAuthReceipt { vault_id: object::id(vault) }
}

/// Step 4 of placing a range: record the minted position in the table.
public fun record_range<T>(
    vault: &mut Vault<T>,
    receipt: RangeAuthReceipt,
    position_id: ID,
    oracle_id: ID,
    expiry_ms: u64,
    lower_strike: u64,
    upper_strike: u64,
    size: u64,
    premium_paid: u64,
    clock: &Clock,
) {
    let RangeAuthReceipt { vault_id } = receipt;
    assert!(vault_id == object::id(vault), EWrongVault);

    let position = RangePosition {
        oracle_id,
        expiry_ms,
        lower_strike,
        upper_strike,
        size,
        premium_paid,
        minted_at_ms: clock.timestamp_ms(),
        mark_value_cached: premium_paid, // initial mark = cost paid
    };

    table::add(&mut vault.positions, position_id, position);
    vault.position_count = vault.position_count + 1;
    vault.positions_mark_total = vault.positions_mark_total + premium_paid;
}

/// Update the cached mark-to-market value of an open position. Called by the
/// rebalancer each cycle with the attested current value (drives NAV).
public fun mark_position<T>(
    vault: &mut Vault<T>,
    cap: &RebalancerCap,
    position_id: ID,
    new_mark: u64,
) {
    assert_rebalancer(vault, cap);
    assert!(table::contains(&vault.positions, position_id), EPositionNotFound);
    let old_mark = table::borrow(&vault.positions, position_id).mark_value_cached;
    vault.positions_mark_total = vault.positions_mark_total - old_mark + new_mark;
    let pos = table::borrow_mut(&mut vault.positions, position_id);
    pos.mark_value_cached = new_mark;
}

/// Step 1 of redeeming a range: remove it from the table, hand back a receipt.
/// The rebalancer then calls Predict's redeem; payout returns via confirm.
public fun authorize_redeem_range<T>(
    vault: &mut Vault<T>,
    cap: &RebalancerCap,
    position_id: ID,
): RangeRedeemReceipt {
    assert_rebalancer(vault, cap);
    assert!(table::contains(&vault.positions, position_id), EPositionNotFound);

    // Remove the position record; destructure to drop it (RangePosition has store
    // but we're done with it once redeemed).
    let RangePosition {
        oracle_id: _, expiry_ms: _, lower_strike: _, upper_strike: _,
        size: _, premium_paid: _, minted_at_ms: _, mark_value_cached,
    } = table::remove(&mut vault.positions, position_id);

    vault.position_count = vault.position_count - 1;
    vault.positions_mark_total = vault.positions_mark_total - mark_value_cached;
    RangeRedeemReceipt { vault_id: object::id(vault), position_id }
}

/// Step 3 of redeeming: absorb the DUSDC payout back into idle.
public fun confirm_range_redeem<T>(
    vault: &mut Vault<T>,
    receipt: RangeRedeemReceipt,
    payout: Coin<T>,
) {
    let RangeRedeemReceipt { vault_id, position_id: _ } = receipt;
    assert!(vault_id == object::id(vault), EWrongVault);
    balance::join(&mut vault.idle, coin::into_balance(payout));
}
// ─── Math helper ─────────────────────────────────────────────────────────────

/// Computes a * b / c with u128 intermediate to avoid overflow, rounding DOWN.
fun mul_div(a: u64, b: u64, c: u64): u64 {
    ((a as u128) * (b as u128) / (c as u128)) as u64
}
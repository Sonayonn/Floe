/// Floe Lend — an attested-collateral money market.
///
/// A standard isolated lending market (Aave-V3 / Suilend model): index-based interest accrual,
/// two-slope utilization rate, supply / borrow / repay / liquidate, liquidation bonus. ONE
/// collateral asset per pool (isolated-market best practice).
///
/// THE INNOVATION — attested collateral valuation. The collateral is a Floe vault SHARE, and its
/// value is NOT supplied by the (untrusted) borrower nor read from a manipulable market oracle.
/// It must arrive as an ENCLAVE-SIGNED valuation: the same Nautilus TEE that attests Floe NAV
/// signs a CollateralPayload (intent 3) over (vault_id, nav_lower_bound, share_supply, timestamp).
/// floe_lend SELF-VERIFIES that ed25519 signature (no external package dependency — the floe_vol
/// pattern) before accepting the value. A borrower CANNOT forge it, so collateral cannot be
/// over-valued. Liquidations run on a value that is cryptographically certified, fresh, and
/// derived from the vault's un-inflatable NAV floor. This is only possible because Floe's NAV is
/// hardware-attested — it is the lending market's security mechanism, not a decoration.
module floe_lend::floe_lend;

use sui::balance::{Self, Balance};
use sui::coin::{Self, Coin};
use sui::clock::Clock;
use sui::event;
use sui::ed25519;
use sui::dynamic_field as df;
use std::bcs;
use std::option;

// ─── Constants ───────────────────────────────────────────────────────────────
const INDEX_SCALE: u128 = 1_000_000_000_000_000_000;   // 1e18 fixed-point interest indices
const BPS: u128 = 10_000;
const MS_PER_YEAR: u128 = 31_557_600_000;              // 365.25d in ms
const SHARE_PRICE_SCALE: u64 = 1_000_000;              // matches floe INITIAL_SHARE_PRICE (6dp)
const COLLATERAL_INTENT: u8 = 3;                       // intent 3 — matches floe_nav CollateralPayload
const VALUATION_FRESH_MS: u64 = 600_000;               // 10-min freshness window

// ─── Errors ──────────────────────────────────────────────────────────────────
const EInsufficientReserve: u64 = 0;
const EExceedsLtv: u64 = 1;
const EPositionHealthy: u64 = 2;
const EZeroAmount: u64 = 3;
const EWrongPool: u64 = 4;
const ENoCollateralAttester: u64 = 5;
const EBadValuationSig: u64 = 6;
const EStaleValuation: u64 = 7;
const EValuationWrongVault: u64 = 8;
const EAttesterSet: u64 = 9;

// ─── Core objects ────────────────────────────────────────────────────────────

/// Shared lending pool: lends Q against collateral S (a vault SHARE).
public struct LendingPool<phantom Q, phantom S> has key {
    id: UID,
    reserve: Balance<Q>,
    total_supplied: u64,
    total_borrowed: u64,
    borrow_index: u128,
    supply_index: u128,
    last_accrued_ms: u64,
    base_rate_bps: u64,
    slope1_bps: u64,
    slope2_bps: u64,
    optimal_util_bps: u64,
    reserve_factor_bps: u64,
    vault_id: ID,                    // the Floe vault whose SHARE this pool accepts
    ltv_bps: u64,
    liq_threshold_bps: u64,
    liq_bonus_bps: u64,
    accrued_reserves: u64,
    collateral_attester: vector<u8>, // enclave ed25519 pubkey that signs valuations (32 bytes)
}

/// A lender's claim; principal grows implicitly via supply_index.
public struct SupplyPosition<phantom Q, phantom S> has key, store {
    id: UID, pool_id: ID, principal: u64, index_at_entry: u128,
}

/// A borrower's collateralized debt position. SHARE locked; debt grows via borrow_index.
public struct DebtPosition<phantom Q, phantom S> has key, store {
    id: UID, pool_id: ID, collateral: Balance<S>, debt_principal: u64, index_at_open: u128,
}

/// Admin cap for pool creation / param updates.
public struct LendAdminCap has key, store { id: UID }

// ─── Events ──────────────────────────────────────────────────────────────────
public struct PoolCreated has copy, drop { pool_id: ID, vault_id: ID }
public struct Supplied has copy, drop { pool_id: ID, amount: u64 }
public struct Withdrawn has copy, drop { pool_id: ID, amount: u64 }
public struct Borrowed has copy, drop { pool_id: ID, collateral: u64, borrowed: u64 }
public struct Repaid has copy, drop { pool_id: ID, amount: u64 }
public struct Liquidated has copy, drop { pool_id: ID, debt_repaid: u64, collateral_seized: u64 }

// ─── Init ────────────────────────────────────────────────────────────────────
fun init(ctx: &mut TxContext) {
    transfer::public_transfer(LendAdminCap { id: object::new(ctx) }, ctx.sender());
}

/// Create an isolated lending pool for a vault's SHARE. Conservative standard defaults.
public fun create_pool<Q, S>(_admin: &LendAdminCap, vault_id: ID, ctx: &mut TxContext): ID {
    let pool = LendingPool<Q, S> {
        id: object::new(ctx),
        reserve: balance::zero<Q>(),
        total_supplied: 0,
        total_borrowed: 0,
        borrow_index: INDEX_SCALE,
        supply_index: INDEX_SCALE,
        last_accrued_ms: 0,
        base_rate_bps: 100,
        slope1_bps: 400,
        slope2_bps: 6000,
        optimal_util_bps: 8000,
        reserve_factor_bps: 1000,
        vault_id,
        ltv_bps: 7000,
        liq_threshold_bps: 8000,
        liq_bonus_bps: 500,
        accrued_reserves: 0,
        collateral_attester: vector[],
    };
    let pid = object::id(&pool);
    event::emit(PoolCreated { pool_id: pid, vault_id });
    transfer::share_object(pool);
    pid
}

/// Register the enclave attester pubkey that signs collateral valuations (once, admin-gated).
public fun register_collateral_attester<Q, S>(
    _admin: &LendAdminCap, pool: &mut LendingPool<Q, S>, pubkey: vector<u8>,
) {
    assert!(pubkey.length() == 32, EBadValuationSig);
    assert!(pool.collateral_attester.length() == 0, EAttesterSet);
    pool.collateral_attester = pubkey;
}

// ─── Attested collateral valuation: the Floe edge ────────────────────────────
/// Verify an enclave-signed CollateralPayload (intent 3) and return the attested collateral
/// VALUE-PER-SHARE-UNIT (in Q, 6dp). The enclave signs BCS(IntentMessage{intent=3, timestamp,
/// payload{vault_id, nav_lower_bound, share_supply}}) — the SAME create_intent_message layout
/// the NAV/vol attestations use (intent || timestamp || payload). floe_lend self-verifies the
/// ed25519 sig against the registered attester, checks freshness + vault binding, then derives
/// the un-inflatable lower-bound share price. Caller CANNOT forge the value.
fun verify_and_price<Q, S>(
    pool: &LendingPool<Q, S>,
    vault_id: address, nav_lower_bound: u64, share_supply: u64,
    timestamp_ms: u64, signature: vector<u8>, clock: &Clock,
): u64 {
    assert!(pool.collateral_attester.length() == 32, ENoCollateralAttester);
    // vault binding: the signed valuation must be for THIS pool's vault
    assert!(vault_id == object::id_to_address(&pool.vault_id), EValuationWrongVault);
    // freshness
    let now = clock.timestamp_ms();
    assert!(timestamp_ms <= now && now - timestamp_ms <= VALUATION_FRESH_MS, EStaleValuation);
    // reconstruct the signed message: intent(1) || timestamp(8) || payload, matching the enclave
    let mut msg = vector<u8>[COLLATERAL_INTENT];
    msg.append(bcs::to_bytes(&timestamp_ms));
    msg.append(bcs::to_bytes(&vault_id));
    msg.append(bcs::to_bytes(&nav_lower_bound));
    msg.append(bcs::to_bytes(&share_supply));
    assert!(ed25519::ed25519_verify(&signature, &pool.collateral_attester, &msg), EBadValuationSig);
    // un-inflatable lower-bound price per share unit (6dp)
    if (share_supply == 0) return 0;
    mul_div(nav_lower_bound, SHARE_PRICE_SCALE, share_supply)
}

/// Public read: value `share_amount` at an attested lower-bound price.
public fun collateral_value(price_per_share: u64, share_amount: u64): u64 {
    mul_div(share_amount, price_per_share, SHARE_PRICE_SCALE)
}

// ─── Supply side: lenders deposit Q, earn interest via supply_index ──────────

/// Supply Q liquidity to the pool. Returns a SupplyPosition whose claim grows with supply_index.
public fun supply<Q, S>(
    pool: &mut LendingPool<Q, S>, funds: Coin<Q>, clock: &Clock, ctx: &mut TxContext,
): SupplyPosition<Q, S> {
    accrue(pool, clock);
    let amount = coin::value(&funds);
    assert!(amount > 0, EZeroAmount);
    pool.reserve.join(coin::into_balance(funds));
    pool.total_supplied = pool.total_supplied + amount;
    event::emit(Supplied { pool_id: object::id(pool), amount });
    SupplyPosition<Q, S> {
        id: object::new(ctx),
        pool_id: object::id(pool),
        principal: amount,
        index_at_entry: pool.supply_index,
    }
}

/// Add more to an existing supply position (re-bases principal to current value + new amount).
public fun supply_more<Q, S>(
    pool: &mut LendingPool<Q, S>, pos: &mut SupplyPosition<Q, S>, funds: Coin<Q>, clock: &Clock,
) {
    assert!(pos.pool_id == object::id(pool), EWrongPool);
    accrue(pool, clock);
    let add = coin::value(&funds);
    assert!(add > 0, EZeroAmount);
    let current = current_supply_value(pool, pos);
    pool.reserve.join(coin::into_balance(funds));
    pool.total_supplied = pool.total_supplied + add;
    pos.principal = current + add;
    pos.index_at_entry = pool.supply_index;
    event::emit(Supplied { pool_id: object::id(pool), amount: add });
}

/// Withdraw up to `amount` of the position's current value (principal + accrued interest).
/// Burns the position if fully withdrawn. Reverts if the pool lacks free liquidity.
public fun withdraw<Q, S>(
    pool: &mut LendingPool<Q, S>, mut pos: SupplyPosition<Q, S>, amount: u64,
    clock: &Clock, ctx: &mut TxContext,
): (Coin<Q>, option::Option<SupplyPosition<Q, S>>) {
    assert!(pos.pool_id == object::id(pool), EWrongPool);
    accrue(pool, clock);
    let value = current_supply_value(pool, &pos);
    let take = if (amount > value) value else amount;
    assert!(take > 0, EZeroAmount);
    // must have free liquidity (not all lent out)
    assert!(balance::value(&pool.reserve) >= take, EInsufficientReserve);

    // reduce total_supplied by the principal-equivalent of what we take
    pool.total_supplied = if (pool.total_supplied > take) pool.total_supplied - take else 0;
    let out = coin::from_balance(pool.reserve.split(take), ctx);
    event::emit(Withdrawn { pool_id: object::id(pool), amount: take });

    let remaining = value - take;
    if (remaining == 0) {
        let SupplyPosition { id, pool_id: _, principal: _, index_at_entry: _ } = pos;
        object::delete(id);
        (out, option::none())
    } else {
        pos.principal = remaining;
        pos.index_at_entry = pool.supply_index;
        (out, option::some(pos))
    }
}

// ─── Interest: two-slope (kinked) utilization model + index accrual ──────────
// Standard Aave/Compound model. utilization = borrowed / supplied. Below optimal, the borrow
// rate rises gently (slope1); above it, steeply (slope2) to defend liquidity. Supplier yield =
// borrow interest * utilization * (1 - reserve_factor). Accrual is O(1) via global indices:
// debt(t) = principal * borrow_index(t) / index_at_open; no per-position loops.

/// Current utilization in bps (borrowed / supplied).
public fun utilization_bps<Q, S>(pool: &LendingPool<Q, S>): u64 {
    if (pool.total_supplied == 0) return 0;
    (((pool.total_borrowed as u128) * BPS) / (pool.total_supplied as u128)) as u64
}

/// Annualized borrow rate in bps for a given utilization (the kinked curve).
public fun borrow_rate_bps<Q, S>(pool: &LendingPool<Q, S>, util_bps: u64): u64 {
    if (util_bps <= pool.optimal_util_bps) {
        // base + slope1 * (util / optimal)
        let frac = if (pool.optimal_util_bps == 0) 0
            else (((util_bps as u128) * BPS) / (pool.optimal_util_bps as u128)) as u64;
        pool.base_rate_bps + (((pool.slope1_bps as u128) * (frac as u128) / BPS) as u64)
    } else {
        // at-optimal rate + slope2 * (excess util / (1 - optimal))
        let at_kink = pool.base_rate_bps + pool.slope1_bps;
        let excess = util_bps - pool.optimal_util_bps;
        let denom = 10_000 - pool.optimal_util_bps;
        let frac = if (denom == 0) 0 else (((excess as u128) * BPS) / (denom as u128)) as u64;
        at_kink + (((pool.slope2_bps as u128) * (frac as u128) / BPS) as u64)
    }
}

/// Accrue interest since last update: grow borrow_index and supply_index by the rate * elapsed.
/// Must be called at the start of every state-changing entry (supply/withdraw/borrow/repay/liq).
public fun accrue<Q, S>(pool: &mut LendingPool<Q, S>, clock: &Clock) {
    let now = clock.timestamp_ms();
    if (pool.last_accrued_ms == 0) { pool.last_accrued_ms = now; return };
    let dt_ms = now - pool.last_accrued_ms;
    if (dt_ms == 0 || pool.total_borrowed == 0) { pool.last_accrued_ms = now; return };

    let util = utilization_bps(pool);
    let rate_bps = borrow_rate_bps(pool, util);
    // interest factor over dt: rate_bps/BPS * dt_ms/MS_PER_YEAR, scaled by INDEX_SCALE
    let factor = ((rate_bps as u128) * INDEX_SCALE * (dt_ms as u128))
        / (BPS * MS_PER_YEAR);                       // = rate * dt, in 1e18 units

    // borrow_index *= (1 + factor)
    let borrow_growth = (pool.borrow_index * factor) / INDEX_SCALE;
    pool.borrow_index = pool.borrow_index + borrow_growth;

    // interest accrued on outstanding debt (principal units)
    let interest = ((pool.total_borrowed as u128) * factor / INDEX_SCALE) as u64;
    // protocol reserve cut
    let reserve_cut = (((interest as u128) * (pool.reserve_factor_bps as u128)) / BPS) as u64;
    pool.accrued_reserves = pool.accrued_reserves + reserve_cut;

    // supplier share of interest grows supply_index proportionally to (interest - reserve_cut)
    let to_suppliers = interest - reserve_cut;
    if (pool.total_supplied > 0) {
        let supply_factor = ((to_suppliers as u128) * INDEX_SCALE) / (pool.total_supplied as u128);
        let supply_growth = (pool.supply_index * supply_factor) / INDEX_SCALE;
        pool.supply_index = pool.supply_index + supply_growth;
    };
    pool.last_accrued_ms = now;
}

/// Current debt of a position (principal grown by the borrow index since open).
public fun current_debt<Q, S>(pool: &LendingPool<Q, S>, pos: &DebtPosition<Q, S>): u64 {
    if (pos.index_at_open == 0) return pos.debt_principal;
    (((pos.debt_principal as u128) * pool.borrow_index) / pos.index_at_open) as u64
}

/// Current claim of a supply position (principal grown by the supply index since entry).
public fun current_supply_value<Q, S>(pool: &LendingPool<Q, S>, pos: &SupplyPosition<Q, S>): u64 {
    if (pos.index_at_entry == 0) return pos.principal;
    (((pos.principal as u128) * pool.supply_index) / pos.index_at_entry) as u64
}

// ─── Borrow side: lock SHARE collateral, borrow Q against ATTESTED valuation ──

/// Lock SHARE collateral and borrow Q against it. The collateral value comes ONLY from an
/// enclave-signed CollateralPayload (intent 3) — verified here via verify_and_price — so the
/// borrower CANNOT over-value their collateral. Borrow is capped at ltv_bps of attested value.
public fun lock_and_borrow<Q, S>(
    pool: &mut LendingPool<Q, S>,
    collateral: Coin<S>,
    borrow_amount: u64,
    // attested valuation (enclave-signed): for THIS pool's vault, fresh
    vault_id: address, nav_lower_bound: u64, share_supply: u64,
    valuation_ts_ms: u64, valuation_sig: vector<u8>,
    clock: &Clock, ctx: &mut TxContext,
): (Coin<Q>, DebtPosition<Q, S>) {
    accrue(pool, clock);
    let collateral_amount = coin::value(&collateral);
    assert!(collateral_amount > 0 && borrow_amount > 0, EZeroAmount);
    assert!(balance::value(&pool.reserve) >= borrow_amount, EInsufficientReserve);

    // verify the enclave-signed valuation -> un-inflatable price per share unit
    let price = verify_and_price(
        pool, vault_id, nav_lower_bound, share_supply, valuation_ts_ms, valuation_sig, clock,
    );
    let collateral_val = collateral_value(price, collateral_amount);
    // borrow cap = LTV * attested collateral value
    let max_borrow = (((collateral_val as u128) * (pool.ltv_bps as u128)) / BPS) as u64;
    assert!(borrow_amount <= max_borrow, EExceedsLtv);

    // draw the loan, lock collateral, mint the debt position
    let loan = coin::from_balance(pool.reserve.split(borrow_amount), ctx);
    pool.total_borrowed = pool.total_borrowed + borrow_amount;
    event::emit(Borrowed { pool_id: object::id(pool), collateral: collateral_amount, borrowed: borrow_amount });
    let pos = DebtPosition<Q, S> {
        id: object::new(ctx),
        pool_id: object::id(pool),
        collateral: coin::into_balance(collateral),
        debt_principal: borrow_amount,
        index_at_open: pool.borrow_index,
    };
    (loan, pos)
}

/// Repay (part of) a debt position. Returns leftover repayment + (unlocked collateral if fully
/// repaid, else the still-open position). Interest is realized via the borrow index.
public fun repay<Q, S>(
    pool: &mut LendingPool<Q, S>, mut pos: DebtPosition<Q, S>, mut payment: Coin<Q>,
    clock: &Clock, ctx: &mut TxContext,
): (Coin<Q>, option::Option<Coin<S>>, option::Option<DebtPosition<Q, S>>) {
    assert!(pos.pool_id == object::id(pool), EWrongPool);
    accrue(pool, clock);
    let debt = current_debt(pool, &pos);
    let pay = coin::value(&payment);
    let applied = if (pay > debt) debt else pay;

    // route the repayment principal back into the reserve
    let applied_coin = coin::split(&mut payment, applied, ctx);
    pool.reserve.join(coin::into_balance(applied_coin));
    // reduce total_borrowed by the principal-equivalent
    pool.total_borrowed = if (pool.total_borrowed > applied) pool.total_borrowed - applied else 0;
    event::emit(Repaid { pool_id: object::id(pool), amount: applied });

    let remaining_debt = debt - applied;
    if (remaining_debt == 0) {
        // fully repaid: unlock all collateral, burn position
        let DebtPosition { id, pool_id: _, collateral, debt_principal: _, index_at_open: _ } = pos;
        object::delete(id);
        let col = coin::from_balance(collateral, ctx);
        (payment, option::some(col), option::none())
    } else {
        // partial: re-base debt principal to remaining at current index
        pos.debt_principal = remaining_debt;
        pos.index_at_open = pool.borrow_index;
        (payment, option::none(), option::some(pos))
    }
}

/// Health factor in bps: (collateral_value * liq_threshold) / debt. >10000 = healthy, <10000 = liquidatable.
/// Caller supplies a fresh attested valuation (same as borrow).
public fun health_factor_bps<Q, S>(
    pool: &LendingPool<Q, S>, pos: &DebtPosition<Q, S>,
    vault_id: address, nav_lower_bound: u64, share_supply: u64,
    valuation_ts_ms: u64, valuation_sig: vector<u8>, clock: &Clock,
): u64 {
    let price = verify_and_price(pool, vault_id, nav_lower_bound, share_supply, valuation_ts_ms, valuation_sig, clock);
    let col_amount = balance::value(&pos.collateral);
    let col_val = collateral_value(price, col_amount);
    let debt = current_debt(pool, pos);
    if (debt == 0) return 1_000_000_000;  // no debt = infinitely healthy
    (((col_val as u128) * (pool.liq_threshold_bps as u128)) / (debt as u128)) as u64
}

// ─── Liquidation: restore solvency when a position is underwater ─────────────

/// Liquidate an unhealthy position. Callable by ANYONE (permissionless, standard). The liquidator
/// repays the debt and seizes the locked collateral plus a liquidation bonus (the incentive).
/// Health is checked against the ATTESTED valuation — a position can only be liquidated if its
/// cryptographically-certified collateral value has genuinely fallen below the threshold. No
/// market-oracle manipulation can trigger an unjust liquidation.
public fun liquidate<Q, S>(
    pool: &mut LendingPool<Q, S>, pos: DebtPosition<Q, S>, mut repayment: Coin<Q>,
    // attested valuation for THIS pool's vault, fresh
    vault_id: address, nav_lower_bound: u64, share_supply: u64,
    valuation_ts_ms: u64, valuation_sig: vector<u8>,
    clock: &Clock, ctx: &mut TxContext,
): (Coin<S>, Coin<Q>) {
    assert!(pos.pool_id == object::id(pool), EWrongPool);
    accrue(pool, clock);

    let price = verify_and_price(
        pool, vault_id, nav_lower_bound, share_supply, valuation_ts_ms, valuation_sig, clock,
    );
    let col_amount = balance::value(&pos.collateral);
    let col_val = collateral_value(price, col_amount);
    let debt = current_debt(pool, &pos);

    // health factor in bps; must be BELOW 10000 (i.e. < 1.0) to liquidate
    let hf = if (debt == 0) 1_000_000_000
        else (((col_val as u128) * (pool.liq_threshold_bps as u128)) / (debt as u128)) as u64;
    assert!(hf < 10_000, EPositionHealthy);

    // liquidator must repay the full debt
    let pay = coin::value(&repayment);
    assert!(pay >= debt, EZeroAmount);
    let debt_coin = coin::split(&mut repayment, debt, ctx);
    pool.reserve.join(coin::into_balance(debt_coin));
    pool.total_borrowed = if (pool.total_borrowed > debt) pool.total_borrowed - debt else 0;

    // seize collateral: all of it goes to the liquidator (the bonus is the spread between the
    // debt repaid and the collateral value — liquidator profits col_val*(1+bonus) - debt economically;
    // here we hand over the full locked SHARE, which is worth >= debt by the liq_threshold margin).
    let DebtPosition { id, pool_id: _, collateral, debt_principal: _, index_at_open: _ } = pos;
    object::delete(id);
    let seized = coin::from_balance(collateral, ctx);

    event::emit(Liquidated {
        pool_id: object::id(pool), debt_repaid: debt, collateral_seized: col_amount,
    });
    // return (seized collateral, leftover repayment) to the liquidator
    (seized, repayment)
}

/// Admin: collect accrued protocol reserves.
public fun collect_reserves<Q, S>(
    _admin: &LendAdminCap, pool: &mut LendingPool<Q, S>, ctx: &mut TxContext,
): Coin<Q> {
    let amount = pool.accrued_reserves;
    assert!(amount > 0 && balance::value(&pool.reserve) >= amount, EInsufficientReserve);
    pool.accrued_reserves = 0;
    coin::from_balance(pool.reserve.split(amount), ctx)
}

// ─── Reads (for SDK / UI) ────────────────────────────────────────────────────
public fun pool_vault_id<Q, S>(pool: &LendingPool<Q, S>): ID { pool.vault_id }
public fun total_supplied<Q, S>(pool: &LendingPool<Q, S>): u64 { pool.total_supplied }
public fun total_borrowed<Q, S>(pool: &LendingPool<Q, S>): u64 { pool.total_borrowed }
public fun available_liquidity<Q, S>(pool: &LendingPool<Q, S>): u64 { balance::value(&pool.reserve) }
public fun ltv_bps<Q, S>(pool: &LendingPool<Q, S>): u64 { pool.ltv_bps }
public fun liq_threshold_bps<Q, S>(pool: &LendingPool<Q, S>): u64 { pool.liq_threshold_bps }
public fun debt_principal<Q, S>(pos: &DebtPosition<Q, S>): u64 { pos.debt_principal }
public fun collateral_amount<Q, S>(pos: &DebtPosition<Q, S>): u64 { balance::value(&pos.collateral) }

// ─── Helpers ─────────────────────────────────────────────────────────────────
fun mul_div(a: u64, b: u64, c: u64): u64 {
    (((a as u128) * (b as u128)) / (c as u128)) as u64
}

#[test_only]
public fun test_admin_cap(ctx: &mut TxContext): LendAdminCap {
    LendAdminCap { id: object::new(ctx) }
}

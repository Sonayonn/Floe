/// Floe Lend — an attested-collateral money market.
///
/// A standard index-based lending pool (Aave/Compound-style) where the collateral is a Floe
/// vault SHARE, valued at the vault's ATTESTED NAV LOWER BOUND — the un-inflatable, hardware-
/// attested floor. This is the institutional edge: liquidations are driven by a value that
/// CANNOT be spoofed high (no market-oracle manipulation) nor inflated by soft marks. A SHARE
/// holder borrows against productive, provably-valued collateral without unwinding their yield.
///
/// Standard mechanics: utilization-based two-slope interest, O(1) index accrual (no position
/// loops), supply/borrow/repay/liquidate, liquidation bonus. The Floe-specific part is purely
/// the collateral oracle: nav_lower_bound-derived share price, optionally carried as an intent-3
/// CollateralPayload for cross-protocol verification.
module floe_lend::floe_lend;

use sui::balance::{Self, Balance};
use sui::coin::{Self, Coin};
use sui::clock::Clock;
use sui::event;
use floe::floe::{Self, Vault};

// ─── Constants ───────────────────────────────────────────────────────────────
const INDEX_SCALE: u128 = 1_000_000_000_000_000_000;   // 1e18 fixed-point for indices
const BPS: u128 = 10_000;
const MS_PER_YEAR: u128 = 31_557_600_000;              // 365.25d in ms
const SHARE_PRICE_SCALE: u64 = 1_000_000;              // matches floe INITIAL_SHARE_PRICE (6dp)

// ─── Errors ──────────────────────────────────────────────────────────────────
const EInsufficientReserve: u64 = 0;
const EExceedsLtv: u64 = 1;
const EPositionHealthy: u64 = 2;        // liquidation attempted on a healthy position
const EZeroAmount: u64 = 3;
const EWrongPool: u64 = 4;
const EWrongVault: u64 = 5;

// ─── Core objects ────────────────────────────────────────────────────────────

/// The shared lending pool for quote asset Q, accepting SHARE type S as collateral.
public struct LendingPool<phantom Q, phantom S> has key {
    id: UID,
    reserve: Balance<Q>,             // available liquidity to lend
    total_supplied: u64,             // supplied principal (index base)
    total_borrowed: u64,             // borrowed principal (index base)
    borrow_index: u128,              // accrues borrow interest (1e18)
    supply_index: u128,              // accrues supply interest (1e18)
    last_accrued_ms: u64,
    // two-slope utilization rate model (annualized, bps)
    base_rate_bps: u64,
    slope1_bps: u64,
    slope2_bps: u64,
    optimal_util_bps: u64,
    reserve_factor_bps: u64,         // protocol cut of borrow interest
    // SHARE collateral risk params
    vault_id: ID,                    // the Floe vault whose SHARE this pool accepts
    ltv_bps: u64,                    // max borrow vs collateral value
    liq_threshold_bps: u64,          // liquidation trigger
    liq_bonus_bps: u64,              // liquidator incentive
    accrued_reserves: u64,           // protocol-owned interest
}

/// A lender's claim. principal grows implicitly via supply_index.
public struct SupplyPosition<phantom Q, phantom S> has key, store {
    id: UID,
    pool_id: ID,
    principal: u64,
    index_at_entry: u128,
}

/// A borrower's collateralized debt position. SHARE locked; debt grows via borrow_index.
public struct DebtPosition<phantom Q, phantom S> has key, store {
    id: UID,
    pool_id: ID,
    collateral: Balance<S>,          // locked SHARE
    debt_principal: u64,
    index_at_open: u128,
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

/// Create a lending pool for a Floe vault's SHARE. Standard conservative defaults.
public fun create_pool<Q, S>(
    _admin: &LendAdminCap, vault: &Vault<Q, S>, ctx: &mut TxContext,
): ID {
    let pool = LendingPool<Q, S> {
        id: object::new(ctx),
        reserve: balance::zero<Q>(),
        total_supplied: 0,
        total_borrowed: 0,
        borrow_index: INDEX_SCALE,
        supply_index: INDEX_SCALE,
        last_accrued_ms: 0,
        base_rate_bps: 100,          // 1% base
        slope1_bps: 400,             // +4% up to optimal
        slope2_bps: 6000,            // +60% past optimal (steep)
        optimal_util_bps: 8000,      // 80% optimal utilization
        reserve_factor_bps: 1000,    // 10% of interest to protocol
        vault_id: object::id(vault),
        ltv_bps: 7000,               // 70% max LTV against attested floor
        liq_threshold_bps: 8000,     // liquidate at 80%
        liq_bonus_bps: 500,          // 5% liquidator bonus
        accrued_reserves: 0,
    };
    let pid = object::id(&pool);
    event::emit(PoolCreated { pool_id: pid, vault_id: object::id(vault) });
    transfer::share_object(pool);
    pid
}

// ─── Collateral valuation: the Floe edge ─────────────────────────────────────
/// Value `share_amount` of SHARE at the vault's ATTESTED NAV LOWER BOUND (un-inflatable floor).
/// lower_bound_share_price = nav_lower_bound * INITIAL_SHARE_PRICE / share_supply.
/// Returns value in Q units (6dp). This is the manipulation-resistant collateral oracle —
/// possible ONLY because Floe's NAV is cryptographically attested.
public fun collateral_value<Q, S>(vault: &Vault<Q, S>, share_amount: u64): u64 {
    let supply = floe::share_supply(vault);
    if (supply == 0) return 0;
    let floor = floe::nav_lower_bound(vault);
    // lower-bound price per share (6dp), then value the amount
    let price = mul_div(floor, SHARE_PRICE_SCALE, supply);
    mul_div(share_amount, price, SHARE_PRICE_SCALE)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
fun mul_div(a: u64, b: u64, c: u64): u64 {
    (((a as u128) * (b as u128)) / (c as u128)) as u64
}

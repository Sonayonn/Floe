/// Floe — the verifiable, options-native vault LAYER for Sui.
///
/// v3: factory-deployable, curator-owned, policy-constrained, fee-bearing vaults,
/// generic over quote asset Q and per-vault share Coin S. Provable NAV (Nautilus),
/// audited history (Walrus), private alpha (Seal) are layer guarantees every vault
/// inherits. Agents operate vaults via attenuated ExecCaps (v3.1).
///
/// Capabilities (attenuation model):
///   OwnerCap   — governance: pause, register enclave. No fund movement.
///   CuratorCap — configures the vault: policy, fees, strategy blob; (v3.1) agents.
///   ExecCap    — execution authority. Full when mandate=None (rebalancer/enclave);
///                attenuated when mandate=Some (agent, narrowed + revocable, v3.1).
module floe::floe;

use sui::balance::{Self, Balance};
use sui::coin::{Self, Coin, TreasuryCap};
use sui::table::{Self, Table};
use sui::clock::Clock;

// ─── Errors ──────────────────────────────────────────────────────────────────
const EVaultPaused: u64 = 2;
const EInsufficientShares: u64 = 3;
const EZeroAmount: u64 = 4;
const EPriceStale: u64 = 5;
const EPlpFloorBreached: u64 = 6;
const EPositionNotFound: u64 = 7;
const EWrongVault: u64 = 8;
const ESharesExceedSupply: u64 = 9;
// v3 policy errors
const EOracleNotAllowed: u64 = 10;
const EPositionTooLarge: u64 = 11;
const EExposureExceeded: u64 = 12;
const EStratumDisabled: u64 = 13;
const ELeverageExceeded: u64 = 14;
// v3.1 mandate errors (reserved)
const EMandateExpired: u64 = 15;
const EMandateRevoked: u64 = 16;
const EMandateCyclesExhausted: u64 = 17;

// ─── Constants ───────────────────────────────────────────────────────────────
const PRICE_STALENESS_LIMIT_MS: u64 = 3_600_000;
const INITIAL_SHARE_PRICE: u64 = 1_000_000;       // 1.0 in 6dp
const DEFAULT_PLP_FLOOR_BPS: u64 = 5_000;
const MIN_FIRST_DEPOSIT: u64 = 1_000_000;
const MS_PER_YEAR: u64 = 31_557_600_000;          // 365.25 days
const BPS_DENOM: u64 = 10_000;
const PLP_PRICE_SCALE: u64 = 1_000_000_000;       // 9dp

// Stratum bitmask for PolicyConfig.enabled_strata
const STRATUM_PLP: u8 = 1;
const STRATUM_RANGE: u8 = 2;
const STRATUM_HEDGE: u8 = 4;

// ─── Position + hot-potato receipts ──────────────────────────────────────────
public struct RangePosition has store {
    oracle_id: ID,
    expiry_ms: u64,
    lower_strike: u64,
    upper_strike: u64,
    size: u64,
    premium_paid: u64,
    minted_at_ms: u64,
    mark_value_cached: u64,
}

public struct DeployReceipt { vault_id: ID, dusdc_out: u64 }
public struct RedeemReceipt { vault_id: ID, plp_out: u64 }
public struct RangeAuthReceipt { vault_id: ID, funded: u64 }
public struct RangeRedeemReceipt { vault_id: ID, position_id: ID }
public struct HedgeReceipt { vault_id: ID }

// ─── Policy + fees (curator-set, contract-enforced) ──────────────────────────
public struct PolicyConfig has store, copy, drop {
    allowed_oracles: vector<ID>,
    max_position_size: u64,
    max_total_exposure: u64,
    max_leverage_bps: u64,
    enabled_strata: u8,
    plp_floor_bps: u64,
}

public struct FeeConfig has store, copy, drop {
    management_fee_bps: u64,
    performance_fee_bps: u64,
    fee_recipient: address,
    high_water_mark: u64,   // peak share_price seen (6dp)
    last_accrued_ms: u64,
}

// ─── Agent mandate (attenuation; issued in v3.1) ─────────────────────────────
public struct Mandate has store, drop {
    agent_id: ID,
    authorized_by: address,
    expiry_ms: u64,
    max_cycles: u64,
    cycles_used: u64,
    revoked: bool,
}

// ─── The vault ───────────────────────────────────────────────────────────────
/// Generic over quote asset Q and per-vault share Coin S.
public struct Vault<phantom Q, phantom S> has key {
    id: UID,
    owner: address,
    curator: address,
    paused: bool,
    balance_manager_id: ID,
    predict_manager_id: ID,
    share_treasury: TreasuryCap<S>,
    share_supply: u64,
    idle: Balance<Q>,
    plp_held: u64,
    plp_price_cached: u64,
    plp_price_updated_ms: u64,
    positions: Table<ID, RangePosition>,
    position_count: u64,
    positions_mark_total: u64,
    hedge_margin_manager_id: Option<ID>,
    hedge_notional: u64,
    hedge_is_short: bool,
    walrus_blob_ids: vector<vector<u8>>,
    enclave_pcr_hash: vector<u8>,
    policy: PolicyConfig,
    fees: FeeConfig,
    strategy_config_blob: vector<u8>,
}

// ─── Capabilities ────────────────────────────────────────────────────────────
public struct OwnerCap has key, store { id: UID, vault_id: ID }
public struct CuratorCap has key, store { id: UID, vault_id: ID }
public struct ExecCap has key, store { id: UID, vault_id: ID, mandate: Option<Mandate> }

// ─── Registry (layer directory) ──────────────────────────────────────────────
public struct VaultInfo has store, copy, drop {
    vault_id: ID,
    curator: address,
    name: vector<u8>,
    strategy_kind: vector<u8>,
}
public struct VaultRegistry has key { id: UID, vaults: vector<VaultInfo> }

// ─── Init: create the shared registry once at publish ────────────────────────
fun init(ctx: &mut TxContext) {
    transfer::share_object(VaultRegistry { id: object::new(ctx), vaults: vector[] });
}

// ─── Config constructors (used by SDK / CLI to build policy + fees) ──────────
public fun new_policy(
    allowed_oracles: vector<ID>,
    max_position_size: u64,
    max_total_exposure: u64,
    max_leverage_bps: u64,
    enabled_strata: u8,
    plp_floor_bps: u64,
): PolicyConfig {
    PolicyConfig {
        allowed_oracles, max_position_size, max_total_exposure,
        max_leverage_bps, enabled_strata, plp_floor_bps,
    }
}

public fun new_fees(
    management_fee_bps: u64,
    performance_fee_bps: u64,
    fee_recipient: address,
): FeeConfig {
    FeeConfig {
        management_fee_bps, performance_fee_bps, fee_recipient,
        high_water_mark: INITIAL_SHARE_PRICE, last_accrued_ms: 0,
    }
}

/// Default policy: all strata on, generous caps. Curators tighten as needed.
public fun default_policy(allowed_oracles: vector<ID>): PolicyConfig {
    PolicyConfig {
        allowed_oracles,
        max_position_size: 18_446_744_073_709_551_615, // u64 max = uncapped
        max_total_exposure: 18_446_744_073_709_551_615,
        max_leverage_bps: 30_000,                       // 3x
        enabled_strata: STRATUM_PLP | STRATUM_RANGE | STRATUM_HEDGE,
        plp_floor_bps: DEFAULT_PLP_FLOOR_BPS,
    }
}

// ─── Factory: permissionless vault deployment ────────────────────────────────
/// Deploy a curator-owned vault. The caller supplies a freshly-published share
/// TreasuryCap<S> (per-vault share Coin) and the provisioned DeepBook managers.
/// Shares the vault, appends to the registry, returns Owner+Curator caps and
/// transfers a full-authority ExecCap (rebalancer seat) to the curator.
public fun deploy_vault<Q, S>(
    registry: &mut VaultRegistry,
    share_treasury: TreasuryCap<S>,
    balance_manager_id: ID,
    predict_manager_id: ID,
    policy: PolicyConfig,
    fees: FeeConfig,
    name: vector<u8>,
    strategy_kind: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
): (OwnerCap, CuratorCap) {
    let curator = ctx.sender();

    let mut fees = fees;
    fees.high_water_mark = INITIAL_SHARE_PRICE;
    fees.last_accrued_ms = clock.timestamp_ms();

    let vault = Vault<Q, S> {
        id: object::new(ctx),
        owner: curator,
        curator,
        paused: false,
        balance_manager_id,
        predict_manager_id,
        share_treasury,
        share_supply: 0,
        idle: balance::zero<Q>(),
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
        policy,
        fees,
        strategy_config_blob: vector[],
    };

    let vault_id = object::id(&vault);
    let owner_cap = OwnerCap { id: object::new(ctx), vault_id };
    let curator_cap = CuratorCap { id: object::new(ctx), vault_id };
    let exec_cap = ExecCap { id: object::new(ctx), vault_id, mandate: option::none() };

    registry.vaults.push_back(VaultInfo { vault_id, curator, name, strategy_kind });

    transfer::public_transfer(exec_cap, curator);
    transfer::share_object(vault);
    (owner_cap, curator_cap)
}

// ─── Cap assertions ──────────────────────────────────────────────────────────
fun assert_owner<Q, S>(vault: &Vault<Q, S>, cap: &OwnerCap) {
    assert!(cap.vault_id == object::id(vault), EWrongVault);
}
fun assert_curator_cap<Q, S>(vault: &Vault<Q, S>, cap: &CuratorCap) {
    assert!(cap.vault_id == object::id(vault), EWrongVault);
}
fun assert_exec<Q, S>(vault: &Vault<Q, S>, cap: &ExecCap) {
    assert!(cap.vault_id == object::id(vault), EWrongVault);
    // v3.1: if mandate present, assert_mandate_live(cap) here.
}
fun assert_not_paused<Q, S>(vault: &Vault<Q, S>) {
    assert!(!vault.paused, EVaultPaused);
}

// ─── Read accessors ──────────────────────────────────────────────────────────
public fun share_supply<Q, S>(vault: &Vault<Q, S>): u64 { vault.share_supply }
public fun plp_held<Q, S>(vault: &Vault<Q, S>): u64 { vault.plp_held }
public fun plp_price<Q, S>(vault: &Vault<Q, S>): u64 { vault.plp_price_cached }
public fun position_count<Q, S>(vault: &Vault<Q, S>): u64 { vault.position_count }
public fun is_paused<Q, S>(vault: &Vault<Q, S>): bool { vault.paused }
public fun idle_value<Q, S>(vault: &Vault<Q, S>): u64 { balance::value(&vault.idle) }
public fun curator<Q, S>(vault: &Vault<Q, S>): address { vault.curator }
public fun owner<Q, S>(vault: &Vault<Q, S>): address { vault.owner }
public fun high_water_mark<Q, S>(vault: &Vault<Q, S>): u64 { vault.fees.high_water_mark }

// ─── NAV ─────────────────────────────────────────────────────────────────────
public fun total_assets<Q, S>(vault: &Vault<Q, S>): u64 {
    let idle = balance::value(&vault.idle);
    let plp_value = mul_div(vault.plp_held, vault.plp_price_cached, PLP_PRICE_SCALE);
    idle + plp_value + vault.positions_mark_total
}

public fun share_price<Q, S>(vault: &Vault<Q, S>): u64 {
    if (vault.share_supply == 0) {
        INITIAL_SHARE_PRICE
    } else {
        mul_div(total_assets(vault), INITIAL_SHARE_PRICE, vault.share_supply)
    }
}

public fun is_price_fresh<Q, S>(vault: &Vault<Q, S>, clock: &Clock): bool {
    let now = clock.timestamp_ms();
    if (vault.plp_held == 0) {
        true
    } else {
        vault.plp_price_updated_ms > 0
            && now - vault.plp_price_updated_ms <= PRICE_STALENESS_LIMIT_MS
    }
}

// ─── Math ────────────────────────────────────────────────────────────────────
fun mul_div(a: u64, b: u64, c: u64): u64 {
    ((a as u128) * (b as u128) / (c as u128)) as u64
}

// ─── Fees: accrue by minting shares (Lagoon/Enzyme model, HWM) ───────────────
//
// Management: annualized % of NAV, pro-rata by elapsed time.
// Performance: % of NAV gains above the high-water mark only (never double-charged).
// Both expressed in ASSETS, converted to shares once, minted to the recipient
// (dilution, never asset-skimming — preserves NAV per ERC-4626 best practice).
// Accrued before any share-price-dependent op so deposits/withdrawals price fairly.
fun accrue_fees<Q, S>(vault: &mut Vault<Q, S>, clock: &Clock, ctx: &mut TxContext) {
    let now = clock.timestamp_ms();
    let supply = vault.share_supply;
    if (supply == 0) {
        vault.fees.last_accrued_ms = now;
        return
    };

    let assets = total_assets(vault);
    if (assets == 0) {
        vault.fees.last_accrued_ms = now;
        return
    };

    // Management fee in assets: NAV * mgmt_bps * dt / (BPS * year)
    let dt = now - vault.fees.last_accrued_ms;
    let mgmt_assets = mul_div(
        mul_div(assets, vault.fees.management_fee_bps, BPS_DENOM),
        dt, MS_PER_YEAR,
    );

    // Performance fee in assets: only on price gain above HWM.
    let price = share_price(vault);
    let mut perf_assets = 0;
    if (price > vault.fees.high_water_mark) {
        let gain_per_share = price - vault.fees.high_water_mark;          // 6dp
        let profit_assets = mul_div(gain_per_share, supply, INITIAL_SHARE_PRICE);
        perf_assets = mul_div(profit_assets, vault.fees.performance_fee_bps, BPS_DENOM);
        vault.fees.high_water_mark = price;
    };

    let fee_assets = mgmt_assets + perf_assets;
    if (fee_assets > 0) {
        // Convert fee assets to shares at current ratio, then mint (dilution).
        let fee_shares = mul_div(fee_assets, supply, assets);
        if (fee_shares > 0) {
            let fee_coin = coin::mint(&mut vault.share_treasury, fee_shares, ctx);
            vault.share_supply = vault.share_supply + fee_shares;
            transfer::public_transfer(fee_coin, vault.fees.fee_recipient);
        };
    };
    vault.fees.last_accrued_ms = now;
}

// ─── Deposit / Withdraw (user-facing) ────────────────────────────────────────
/// Deposit quote asset Q, receive share Coin S in proportion to NAV. Anyone can call.
public fun deposit<Q, S>(
    vault: &mut Vault<Q, S>,
    payment: Coin<Q>,
    clock: &Clock,
    ctx: &mut TxContext,
): Coin<S> {
    assert_not_paused(vault);
    assert!(is_price_fresh(vault, clock), EPriceStale);
    accrue_fees(vault, clock, ctx); // crystallize fees before pricing this deposit

    let amount = coin::value(&payment);
    assert!(amount > 0, EZeroAmount);

    let supply = vault.share_supply;
    let shares = if (supply == 0) {
        assert!(amount >= MIN_FIRST_DEPOSIT, EZeroAmount); // bootstrap / inflation guard
        amount
    } else {
        mul_div(amount, supply, total_assets(vault))
    };
    assert!(shares > 0, EZeroAmount);

    balance::join(&mut vault.idle, coin::into_balance(payment));
    vault.share_supply = vault.share_supply + shares;
    coin::mint(&mut vault.share_treasury, shares, ctx)
}

/// Burn share Coin S, receive proportional Q from idle. Rounds DOWN (favors vault).
public fun withdraw<Q, S>(
    vault: &mut Vault<Q, S>,
    shares: Coin<S>,
    clock: &Clock,
    ctx: &mut TxContext,
): Coin<Q> {
    assert_not_paused(vault);
    assert!(is_price_fresh(vault, clock), EPriceStale);
    accrue_fees(vault, clock, ctx);

    let share_amount = coin::value(&shares);
    assert!(share_amount > 0, EZeroAmount);
    assert!(share_amount <= vault.share_supply, ESharesExceedSupply);

    let payout = mul_div(share_amount, total_assets(vault), vault.share_supply);
    assert!(payout > 0, EInsufficientShares);
    assert!(balance::value(&vault.idle) >= payout, EInsufficientShares);

    coin::burn(&mut vault.share_treasury, shares);
    vault.share_supply = vault.share_supply - share_amount;
    coin::from_balance(balance::split(&mut vault.idle, payout), ctx)
}

// ─── Test-only helpers ───────────────────────────────────────────────────────
#[test_only]
public struct TEST_SHARE has drop {}

#[test_only]
public fun test_new_share_treasury(ctx: &mut TxContext): TreasuryCap<TEST_SHARE> {
    coin::create_treasury_cap_for_testing<TEST_SHARE>(ctx)
}

#[test_only]
public fun test_total_assets<Q, S>(vault: &Vault<Q, S>): u64 { total_assets(vault) }

#[test_only]
public fun test_accrue_fees<Q, S>(vault: &mut Vault<Q, S>, clock: &Clock, ctx: &mut TxContext) {
    accrue_fees(vault, clock, ctx);
}

/// Inject quote directly into idle to simulate a NAV gain (test-only).
#[test_only]
public fun test_inject_gain<Q, S>(vault: &mut Vault<Q, S>, coin_in: Coin<Q>) {
    balance::join(&mut vault.idle, coin::into_balance(coin_in));
}

#[test_only]
public fun test_init_registry(ctx: &mut TxContext) {
    transfer::share_object(VaultRegistry { id: object::new(ctx), vaults: vector[] });
}

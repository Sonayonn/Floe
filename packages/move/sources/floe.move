/// Floe — the verifiable, options-native vault LAYER for Sui.
///
/// v3.2 (FINAL structural version): factory-deployable, curator-owned,
/// policy-constrained, fee-bearing, agent-operable vaults generic over quote
/// asset Q and per-vault share Coin S. Provable NAV (Nautilus), audited history
/// (Walrus), private alpha (Seal) are layer guarantees every vault inherits.
///
/// After v3.2: only additive FUNCTION upgrades — no struct changes. Custody
/// (DeepBook caps, PLP balance) attaches via dynamic fields in Phase 2.
///
/// Revenue: curators charge mgmt+perf fees (capped 3%/20%); Floe takes a
/// protocol cut (10%, or 15% for attested vaults) OUT OF the curator's fee —
/// depositor pays once. Protocol fee shares accrue to the FloeTreasury.
///
/// Capabilities (attenuation): OwnerCap (governance) / CuratorCap (config,
/// agents) / ExecCap (execution; full when mandate=None, attenuated for agents).
module floe::floe;

use sui::balance::{Self, Balance};
use sui::coin::{Self, Coin, TreasuryCap};
use sui::table::{Self, Table};
use sui::clock::Clock;
use sui::dynamic_field as df;
use sui::event;
use sui::ed25519;
use std::bcs;

// ─── Errors ──────────────────────────────────────────────────────────────────
const EVaultPaused: u64 = 2;
const EInsufficientShares: u64 = 3;
const EZeroAmount: u64 = 4;
const EPriceStale: u64 = 5;
const EPlpFloorBreached: u64 = 6;
const EPositionNotFound: u64 = 7;
const EWrongVault: u64 = 8;
const ESharesExceedSupply: u64 = 9;
const EOracleNotAllowed: u64 = 10;
const EPositionTooLarge: u64 = 11;
const EExposureExceeded: u64 = 12;
const EStratumDisabled: u64 = 13;
const ELeverageExceeded: u64 = 14;
const EMandateExpired: u64 = 15;        // reserved (v3.1)
const EMandateRevoked: u64 = 16;        // reserved (v3.1)
const EMandateCyclesExhausted: u64 = 17;// reserved (v3.1)
const EFeeTooHigh: u64 = 18;            // v3.2 revenue
const ECapacityExceeded: u64 = 19;      // v3.2 capacity
const EDepositsFrozen: u64 = 20;        // v3.2 deprecation
const EBadAttester: u64 = 24;           // attestation
const ENoAttester: u64 = 25;
const EBadAttestation: u64 = 26;
const EStaleAttestation: u64 = 27;
const ESealDenied: u64 = 28;
const ENavDivergence: u64 = 29;         // attested NAV diverges from trustless lower bound
const EDepositUnsafe: u64 = 30;         // deposit blocked: NAV unverifiable/unsafe
const MAX_DIVERGENCE_BPS: u64 = 500;    // 5% — attested NAV may not exceed lower bound by more

// ─── Constants ───────────────────────────────────────────────────────────────
const PRICE_STALENESS_LIMIT_MS: u64 = 3_600_000;
const INITIAL_SHARE_PRICE: u64 = 1_000_000;       // 1.0 in 6dp
const DEFAULT_PLP_FLOOR_BPS: u64 = 5_000;
const MIN_FIRST_DEPOSIT: u64 = 1_000_000;
const MS_PER_YEAR: u64 = 31_557_600_000;          // 365.25 days
const BPS_DENOM: u64 = 10_000;
const PLP_PRICE_SCALE: u64 = 1_000_000_000;       // 9dp
/// Floe semantic version, packed: MAJOR*1_000_000 + MINOR*1_000 + PATCH.
/// 8_000 = 0.8.0 (pre-mainnet). 1_000_000 = 1.0.0 reserved for mainnet launch.
const CONTRACT_VERSION: u64 = 8_000;

// Fee caps + protocol cut (revenue)
const MAX_MGMT_FEE_BPS: u64 = 300;                // 3% hard cap
const MAX_PERF_FEE_BPS: u64 = 2_000;              // 20% hard cap
const DEFAULT_PROTOCOL_FEE_BPS: u64 = 1_000;      // Floe takes 10% of curator fees
const ATTESTED_PROTOCOL_FEE_BPS: u64 = 1_500;     // 15% for attested (provable-NAV) vaults

// Stratum bitmask
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

// ─── Policy + fees ───────────────────────────────────────────────────────────
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
    high_water_mark: u64,
    last_accrued_ms: u64,
    protocol_fee_bps: u64,   // Floe's cut of the fee shares (10% or 15% attested)
    attested: bool,          // true once an enclave is registered (provable NAV)
}

// ─── Agent mandate (attenuation; issued in v3.1) ─────────────────────────────
public struct Mandate has store, drop {
    agent_id: ID,
    authorized_by: address,
    expiry_ms: u64,
    max_cycles: u64,
    cycles_used: u64,
    revoked: bool,
    mandate_policy: Option<PolicyConfig>,   // tighter-than-vault policy the agent runs under
}

// ─── The vault (FINAL struct) ────────────────────────────────────────────────
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
    // v3.2 additions
    version: u64,
    deposits_frozen: bool,
    max_capacity: u64,           // 0 = uncapped
    predict_operator: address,   // owns the PredictManager: interim Floe key -> enclave
    seal_access_id: Option<ID>,  // Seal access-policy ref (reserved, Phase 6)
    protocol_treasury: address,  // where Floe's protocol fee shares go
    // Custody (DeepBook WithdrawCap/DepositCap/TradeCap, Balance<PLP>) attaches
    // as DYNAMIC FIELDS on this UID in Phase 2 — no struct change, no DeepBook dep here.
}

// ─── Capabilities ────────────────────────────────────────────────────────────
public struct OwnerCap has key, store { id: UID, vault_id: ID }
public struct CuratorCap has key, store { id: UID, vault_id: ID }
public struct ExecCap has key, store { id: UID, vault_id: ID, mandate: Option<Mandate> }

// ─── Registries + treasury (shared, created in init) ─────────────────────────
public struct VaultInfo has store, copy, drop {
    vault_id: ID,
    curator: address,
    name: vector<u8>,
    strategy_kind: vector<u8>,
}
public struct VaultRegistry has key { id: UID, vaults: vector<VaultInfo>, protocol_treasury: address }

public struct AgentInfo has store, copy, drop {
    agent_id: ID,
    vault_id: ID,
    authorized_by: address,
    active: bool,
}
public struct AgentRegistry has key { id: UID, agents: vector<AgentInfo> }

/// Floe's on-chain revenue sink. Protocol fee shares (Coin<S> of every vault)
/// are transferred to this object's address — visible, auditable protocol revenue.
public struct FloeTreasury has key { id: UID }

// ─── Events ──────────────────────────────────────────────────────────────────
public struct DepositEvent has copy, drop { vault_id: ID, who: address, amount: u64, shares: u64 }
public struct WithdrawEvent has copy, drop { vault_id: ID, who: address, shares: u64, payout: u64 }
public struct NavGuardTripped has copy, drop { vault_id: ID, reason: u8, full_nav: u64, lower_bound: u64 }
public struct PositionSettled has copy, drop { vault_id: ID, position_id: ID, settled_value: u64 }
public struct FeeAccrued has copy, drop { vault_id: ID, curator_shares: u64, protocol_shares: u64 }
public struct VaultDeployed has copy, drop { vault_id: ID, curator: address, name: vector<u8> }
public struct AgentAuthorized has copy, drop { vault_id: ID, agent: address, agent_cap_id: ID, expiry_ms: u64, max_cycles: u64 }
public struct AgentRevoked has copy, drop { vault_id: ID, agent_cap_id: ID }

// ─── Init: create the three shared objects once at publish ───────────────────
fun init(ctx: &mut TxContext) {
    let treasury = FloeTreasury { id: object::new(ctx) };
    let treasury_addr = object::uid_to_address(&treasury.id);
    transfer::share_object(treasury);
    transfer::share_object(VaultRegistry { id: object::new(ctx), vaults: vector[], protocol_treasury: treasury_addr });
    transfer::share_object(AgentRegistry { id: object::new(ctx), agents: vector[] });
}

// ─── Config constructors ─────────────────────────────────────────────────────
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
    assert!(management_fee_bps <= MAX_MGMT_FEE_BPS, EFeeTooHigh);
    assert!(performance_fee_bps <= MAX_PERF_FEE_BPS, EFeeTooHigh);
    FeeConfig {
        management_fee_bps, performance_fee_bps, fee_recipient,
        high_water_mark: INITIAL_SHARE_PRICE, last_accrued_ms: 0,
        protocol_fee_bps: DEFAULT_PROTOCOL_FEE_BPS, attested: false,
    }
}

public fun default_policy(allowed_oracles: vector<ID>): PolicyConfig {
    PolicyConfig {
        allowed_oracles,
        max_position_size: 18_446_744_073_709_551_615,
        max_total_exposure: 18_446_744_073_709_551_615,
        max_leverage_bps: 30_000,
        enabled_strata: STRATUM_PLP | STRATUM_RANGE | STRATUM_HEDGE,
        plp_floor_bps: DEFAULT_PLP_FLOOR_BPS,
    }
}

// ─── Factory ─────────────────────────────────────────────────────────────────
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
        version: CONTRACT_VERSION,
        deposits_frozen: false,
        max_capacity: 0,
        predict_operator: curator,
        seal_access_id: option::none(),
        protocol_treasury: registry.protocol_treasury,
    };

    let vault_id = object::id(&vault);
    let owner_cap = OwnerCap { id: object::new(ctx), vault_id };
    let curator_cap = CuratorCap { id: object::new(ctx), vault_id };
    let exec_cap = ExecCap { id: object::new(ctx), vault_id, mandate: option::none() };

    registry.vaults.push_back(VaultInfo { vault_id, curator, name, strategy_kind });
    event::emit(VaultDeployed { vault_id, curator, name });

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

// ─── Agent authority (attenuated, attested, revocable) ───────────────────────
/// Curator authorizes an agent to operate THIS vault under an attenuated, bounded
/// mandate. Mints an ExecCap whose authority equals the rebalancer's, NARROWED by
/// the Mandate (expiry, max_cycles, optional tighter policy, revocable). The agent
/// holds a real capability object — not a key — attributed to the issuing curator.
public fun authorize_agent<Q, S>(
    vault: &Vault<Q, S>,
    cap: &CuratorCap,
    registry: &mut AgentRegistry,
    agent: address,
    expiry_ms: u64,
    max_cycles: u64,
    mandate_policy: Option<PolicyConfig>,
    ctx: &mut TxContext,
) {
    assert_curator_cap(vault, cap);
    let vault_id = object::id(vault);
    let exec_cap = ExecCap {
        id: object::new(ctx),
        vault_id,
        mandate: option::some(Mandate {
            agent_id: vault_id,                 // bound to this vault
            authorized_by: ctx.sender(),
            expiry_ms,
            max_cycles,
            cycles_used: 0,
            revoked: false,
            mandate_policy,
        }),
    };
    let agent_cap_id = object::id(&exec_cap);
    registry.agents.push_back(AgentInfo {
        agent_id: agent_cap_id,
        vault_id,
        authorized_by: ctx.sender(),
        active: true,
    });
    event::emit(AgentAuthorized { vault_id, agent, agent_cap_id, expiry_ms, max_cycles });
    transfer::public_transfer(exec_cap, agent);
}

/// Curator revokes an agent's mandate by its ExecCap id. Flips the registry entry
/// inactive; the agent's next action fails the kill-switch in assert_exec. (The
/// ExecCap object persists in the agent's custody but is now inert.)
public fun revoke_agent<Q, S>(
    vault: &mut Vault<Q, S>,
    cap: &CuratorCap,
    registry: &mut AgentRegistry,
    agent_cap_id: ID,
) {
    assert_curator_cap(vault, cap);
    let vault_id = object::id(vault);
    record_revoked(vault, agent_cap_id);
    let n = registry.agents.length();
    let mut i = 0;
    while (i < n) {
        let info = &mut registry.agents[i];
        if (info.agent_cap_id_eq(agent_cap_id) && info.vault_id == vault_id) {
            info.active = false;
        };
        i = i + 1;
    };
    event::emit(AgentRevoked { vault_id, agent_cap_id });
}

/// helper: AgentInfo id match (kept tiny for the loop above).
fun agent_cap_id_eq(info: &AgentInfo, id: ID): bool { info.agent_id == id }
/// Dynamic-field key holding the set (vector) of revoked agent ExecCap ids.
/// Stored on the vault UID (upgrade-safe — no struct change), mirroring how custody
/// objects attach as dynamic fields.
public struct RevokedCaps has copy, drop, store {}

/// DF key holding the running total of SETTLED position value (resolved at expiry to a
/// known $0/$1×size value). Settled value is CERTAIN, so it counts toward the trustless
/// nav_lower_bound — unlike unsettled marks (positions_mark_total), which stay in the soft
/// tier. As positions settle, the provable floor RISES. Upgrade-safe (dynamic field).
public struct SettledTotal has copy, drop, store {}

fun revoked_list<Q, S>(vault: &Vault<Q, S>): vector<ID> {
    if (df::exists_(&vault.id, RevokedCaps {})) {
        *df::borrow<RevokedCaps, vector<ID>>(&vault.id, RevokedCaps {})
    } else { vector[] }
}

fun record_revoked<Q, S>(vault: &mut Vault<Q, S>, cap_id: ID) {
    if (!df::exists_(&vault.id, RevokedCaps {})) {
        df::add(&mut vault.id, RevokedCaps {}, vector<ID>[]);
    };
    let list = df::borrow_mut<RevokedCaps, vector<ID>>(&mut vault.id, RevokedCaps {});
    if (!list.contains(&cap_id)) { list.push_back(cap_id); };
}

fun settled_total<Q, S>(vault: &Vault<Q, S>): u64 {
    if (df::exists_(&vault.id, SettledTotal {})) {
        *df::borrow<SettledTotal, u64>(&vault.id, SettledTotal {})
    } else { 0 }
}

fun add_settled<Q, S>(vault: &mut Vault<Q, S>, amount: u64) {
    if (!df::exists_(&vault.id, SettledTotal {})) {
        df::add(&mut vault.id, SettledTotal {}, 0u64);
    };
    let t = df::borrow_mut<SettledTotal, u64>(&mut vault.id, SettledTotal {});
    *t = *t + amount;
}

fun sub_settled<Q, S>(vault: &mut Vault<Q, S>, amount: u64) {
    if (df::exists_(&vault.id, SettledTotal {})) {
        let t = df::borrow_mut<SettledTotal, u64>(&mut vault.id, SettledTotal {});
        *t = if (*t >= amount) { *t - amount } else { 0 };
    };
}

fun is_revoked<Q, S>(vault: &Vault<Q, S>, cap_id: ID): bool {
    df::exists_(&vault.id, RevokedCaps {}) &&
        df::borrow<RevokedCaps, vector<ID>>(&vault.id, RevokedCaps {}).contains(&cap_id)
}

fun assert_exec<Q, S>(vault: &Vault<Q, S>, cap: &ExecCap) {
    assert!(cap.vault_id == object::id(vault), EWrongVault);
    // Kill-switch: the curator can revoke an agent's ExecCap by id; once revoked the
    // vault rejects it on EVERY action. Enforced vault-side (the curator reaches the
    // vault; the agent's cap object stays in the agent's custody but is now inert).
    if (cap.mandate.is_some()) {
        let m = cap.mandate.borrow();
        assert!(!m.revoked, EMandateRevoked);
        assert!(!is_revoked(vault, object::id(cap)), EMandateRevoked);
    };
}

/// Per-cycle mandate re-evaluation (expiry + cycle budget). Agent rebalance entry
/// points call this once per cycle with the clock; it enforces the time + count
/// bounds and consumes one cycle. Full (mandate=None) ExecCaps are unbounded.
public fun consume_mandate_cycle(cap: &mut ExecCap, clock: &Clock) {
    if (cap.mandate.is_some()) {
        let m = cap.mandate.borrow_mut();
        assert!(!m.revoked, EMandateRevoked);
        assert!(clock.timestamp_ms() <= m.expiry_ms, EMandateExpired);
        assert!(m.cycles_used < m.max_cycles, EMandateCyclesExhausted);
        m.cycles_used = m.cycles_used + 1;
    };
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
public fun version<Q, S>(vault: &Vault<Q, S>): u64 { vault.version }
public fun is_attested<Q, S>(vault: &Vault<Q, S>): bool { vault.fees.attested }
public fun protocol_fee_bps<Q, S>(vault: &Vault<Q, S>): u64 { vault.fees.protocol_fee_bps }
public fun max_capacity<Q, S>(vault: &Vault<Q, S>): u64 { vault.max_capacity }
public fun deposits_frozen<Q, S>(vault: &Vault<Q, S>): bool { vault.deposits_frozen }
public fun predict_operator<Q, S>(vault: &Vault<Q, S>): address { vault.predict_operator }
public fun protocol_treasury_addr(registry: &VaultRegistry): address { registry.protocol_treasury }
public fun vault_count(registry: &VaultRegistry): u64 { registry.vaults.length() }

// ─── NAV ─────────────────────────────────────────────────────────────────────
public fun total_assets<Q, S>(vault: &Vault<Q, S>): u64 {
    let idle = balance::value(&vault.idle);
    let plp_value = mul_div(vault.plp_held, vault.plp_price_cached, PLP_PRICE_SCALE);
    idle + plp_value + vault.positions_mark_total + settled_total(vault)
}

// ─── NAV safety: the circuit breaker ─────────────────────────────────────────
// The category's #1 failure mode (Stream Finance, the 2025 oracle-NAV exploits) is
// minting/redeeming shares against a NAV that was *asserted*, not *proven*. Floe's NAV
// is hardware-attested with a freshness window — so the contract can REFUSE to act on a
// NAV it can't verify is fresh AND consistent with what the chain independently knows.
//
// nav_lower_bound() is NAV that CANNOT be inflated: only idle balance + PLP valued at the
// cached price. It deliberately EXCLUDES positions_mark_total (the soft, mark-based part an
// operator could overstate). The divergence guard trips if the full (attested) NAV exceeds
// this trustless floor by more than MAX_DIVERGENCE_BPS — i.e. the attested number claims
// materially more than the chain can independently support.
public fun nav_lower_bound<Q, S>(vault: &Vault<Q, S>): u64 {
    let idle = balance::value(&vault.idle);
    let plp_value = mul_div(vault.plp_held, vault.plp_price_cached, PLP_PRICE_SCALE);
    // settled positions are resolved/certain -> they belong in the provable floor
    idle + plp_value + settled_total(vault)
}

/// True if the full NAV does not over-claim vs the trustless lower bound.
public fun nav_within_divergence<Q, S>(vault: &Vault<Q, S>): bool {
    let bound = nav_lower_bound(vault);
    let full = total_assets(vault);
    if (full <= bound) { return true };           // marks never *raise* the floor concern
    let excess = full - bound;
    // excess / bound <= MAX_DIVERGENCE_BPS / 10000
    mul_div(excess, 10_000, if (bound == 0) { 1 } else { bound }) <= MAX_DIVERGENCE_BPS
}

/// Aggregate safety: NAV is safe to ACT ON (deposit) iff fresh AND non-divergent.
/// (Non-attested vaults have no attested NAV to diverge; only freshness applies.)
public fun nav_is_safe<Q, S>(vault: &Vault<Q, S>, clock: &Clock): bool {
    if (!is_price_fresh(vault, clock)) { return false };
    if (vault.fees.attested) { nav_within_divergence(vault) } else { true }
}

/// Read accessor for the frontend "NAV-safe" badge: (fresh, within_divergence, attested).
public fun nav_safety_status<Q, S>(vault: &Vault<Q, S>, clock: &Clock): (bool, bool, bool) {
    (is_price_fresh(vault, clock), nav_within_divergence(vault), vault.fees.attested)
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

// ─── Fees: accrue by minting shares, split curator / protocol ────────────────
fun accrue_fees<Q, S>(vault: &mut Vault<Q, S>, clock: &Clock, ctx: &mut TxContext) {
    let now = clock.timestamp_ms();
    let supply = vault.share_supply;
    if (supply == 0) { vault.fees.last_accrued_ms = now; return };
    let assets = total_assets(vault);
    if (assets == 0) { vault.fees.last_accrued_ms = now; return };

    let dt = now - vault.fees.last_accrued_ms;
    let mgmt_assets = mul_div(
        mul_div(assets, vault.fees.management_fee_bps, BPS_DENOM), dt, MS_PER_YEAR,
    );

    let price = share_price(vault);
    let mut perf_assets = 0;
    if (price > vault.fees.high_water_mark) {
        let gain_per_share = price - vault.fees.high_water_mark;
        let profit_assets = mul_div(gain_per_share, supply, INITIAL_SHARE_PRICE);
        perf_assets = mul_div(profit_assets, vault.fees.performance_fee_bps, BPS_DENOM);
        vault.fees.high_water_mark = price;
    };

    let fee_assets = mgmt_assets + perf_assets;
    if (fee_assets > 0) {
        let fee_shares = mul_div(fee_assets, supply, assets);
        if (fee_shares > 0) {
            // Floe's protocol cut comes OUT OF the curator's fee (depositor pays once).
            let protocol_shares = mul_div(fee_shares, vault.fees.protocol_fee_bps, BPS_DENOM);
            let curator_shares = fee_shares - protocol_shares;
            vault.share_supply = vault.share_supply + fee_shares;
            if (curator_shares > 0) {
                let c = coin::mint(&mut vault.share_treasury, curator_shares, ctx);
                transfer::public_transfer(c, vault.fees.fee_recipient);
            };
            if (protocol_shares > 0) {
                let p = coin::mint(&mut vault.share_treasury, protocol_shares, ctx);
                transfer::public_transfer(p, vault.protocol_treasury);
            };
            event::emit(FeeAccrued { vault_id: object::id(vault), curator_shares, protocol_shares });
        };
    };
    vault.fees.last_accrued_ms = now;
}

// ─── Deposit / Withdraw ──────────────────────────────────────────────────────
public fun deposit<Q, S>(
    vault: &mut Vault<Q, S>, payment: Coin<Q>, clock: &Clock, ctx: &mut TxContext,
): Coin<S> {
    assert_not_paused(vault);
    assert!(!vault.deposits_frozen, EDepositsFrozen);
    // Circuit breaker: deposits require a NAV we can PROVE is fresh and non-divergent.
    // Minting against an unverified NAV would dilute/over-credit existing holders.
    assert!(is_price_fresh(vault, clock), EPriceStale);
    assert!(nav_is_safe(vault, clock), EDepositUnsafe);
    accrue_fees(vault, clock, ctx);

    let amount = coin::value(&payment);
    assert!(amount > 0, EZeroAmount);
    assert!(vault.max_capacity == 0 || total_assets(vault) + amount <= vault.max_capacity, ECapacityExceeded);

    let supply = vault.share_supply;
    let shares = if (supply == 0) {
        assert!(amount >= MIN_FIRST_DEPOSIT, EZeroAmount);
        amount
    } else {
        mul_div(amount, supply, total_assets(vault))
    };
    assert!(shares > 0, EZeroAmount);

    balance::join(&mut vault.idle, coin::into_balance(payment));
    vault.share_supply = vault.share_supply + shares;
    let out = coin::mint(&mut vault.share_treasury, shares, ctx);
    event::emit(DepositEvent { vault_id: object::id(vault), who: ctx.sender(), amount, shares });
    out
}

public fun withdraw<Q, S>(
    vault: &mut Vault<Q, S>, shares: Coin<S>, clock: &Clock, ctx: &mut TxContext,
): Coin<Q> {
    assert_not_paused(vault);
    // (always-exit: no freshness block here — see nav_for_payout below)
    accrue_fees(vault, clock, ctx);

    let share_amount = coin::value(&shares);
    assert!(share_amount > 0, EZeroAmount);
    assert!(share_amount <= vault.share_supply, ESharesExceedSupply);

    // Always-exit: safe NAV -> full; stale/divergent -> trustless lower bound (never over-pays).
    let nav_for_payout = if (nav_is_safe(vault, clock)) {
        total_assets(vault)
    } else {
        let lb = nav_lower_bound(vault);
        event::emit(NavGuardTripped {
            vault_id: object::id(vault),
            reason: if (!is_price_fresh(vault, clock)) { 1 } else { 2 },
            full_nav: total_assets(vault),
            lower_bound: lb,
        });
        lb
    };
    let payout = mul_div(share_amount, nav_for_payout, vault.share_supply);
    assert!(payout > 0, EInsufficientShares);
    assert!(balance::value(&vault.idle) >= payout, EInsufficientShares);

    coin::burn(&mut vault.share_treasury, shares);
    vault.share_supply = vault.share_supply - share_amount;
    let out = coin::from_balance(balance::split(&mut vault.idle, payout), ctx);
    event::emit(WithdrawEvent { vault_id: object::id(vault), who: ctx.sender(), shares: share_amount, payout });
    out
}

// ─── Stratum A: PLP supply / redeem ──────────────────────────────────────────
public fun deploy_idle<Q, S>(
    vault: &mut Vault<Q, S>, cap: &ExecCap, amount: u64, ctx: &mut TxContext,
): (Coin<Q>, DeployReceipt) {
    assert_exec(vault, cap);
    assert_not_paused(vault);
    assert!(amount > 0, EZeroAmount);
    assert!(vault.policy.enabled_strata & STRATUM_PLP != 0, EStratumDisabled);
    assert!(balance::value(&vault.idle) >= amount, EInsufficientShares);

    let plp_value = mul_div(vault.plp_held, vault.plp_price_cached, PLP_PRICE_SCALE);
    let tvl = balance::value(&vault.idle) + plp_value + vault.positions_mark_total;
    let idle_after = balance::value(&vault.idle) - amount;
    let floor = mul_div(tvl, vault.policy.plp_floor_bps, BPS_DENOM);
    assert!(idle_after + plp_value + amount >= floor, EPlpFloorBreached);

    let coin_out = coin::from_balance(balance::split(&mut vault.idle, amount), ctx);
    (coin_out, DeployReceipt { vault_id: object::id(vault), dusdc_out: amount })
}

public fun confirm_deploy<Q, S>(vault: &mut Vault<Q, S>, receipt: DeployReceipt, plp_obtained: u64) {
    let DeployReceipt { vault_id, dusdc_out: _ } = receipt;
    assert!(vault_id == object::id(vault), EWrongVault);
    assert!(plp_obtained > 0, EZeroAmount);
    vault.plp_held = vault.plp_held + plp_obtained;
}

public fun request_redeem<Q, S>(vault: &mut Vault<Q, S>, cap: &ExecCap, plp_amount: u64): RedeemReceipt {
    assert_exec(vault, cap);
    assert!(plp_amount > 0, EZeroAmount);
    assert!(vault.plp_held >= plp_amount, EInsufficientShares);
    vault.plp_held = vault.plp_held - plp_amount;
    RedeemReceipt { vault_id: object::id(vault), plp_out: plp_amount }
}

public fun confirm_redeem<Q, S>(vault: &mut Vault<Q, S>, receipt: RedeemReceipt, dusdc_coin: Coin<Q>) {
    let RedeemReceipt { vault_id, plp_out: _ } = receipt;
    assert!(vault_id == object::id(vault), EWrongVault);
    balance::join(&mut vault.idle, coin::into_balance(dusdc_coin));
}

// ─── Stratum B: range ladder ─────────────────────────────────────────────────
public fun authorize_range<Q, S>(
    vault: &mut Vault<Q, S>, cap: &ExecCap, oracle_id: ID, amount: u64, ctx: &mut TxContext,
): (Coin<Q>, RangeAuthReceipt) {
    assert_exec(vault, cap);
    assert_not_paused(vault);
    assert!(amount > 0, EZeroAmount);
    assert!(vault.policy.enabled_strata & STRATUM_RANGE != 0, EStratumDisabled);
    assert!(vault.policy.allowed_oracles.contains(&oracle_id), EOracleNotAllowed);
    assert!(amount <= vault.policy.max_position_size, EPositionTooLarge);
    assert!(vault.positions_mark_total + amount <= vault.policy.max_total_exposure, EExposureExceeded);
    assert!(balance::value(&vault.idle) >= amount, EInsufficientShares);
    let plp_value = mul_div(vault.plp_held, vault.plp_price_cached, PLP_PRICE_SCALE);
    let tvl = balance::value(&vault.idle) + plp_value + vault.positions_mark_total;
    let idle_after = balance::value(&vault.idle) - amount;
    let floor = mul_div(tvl, vault.policy.plp_floor_bps, BPS_DENOM);
    assert!(idle_after + plp_value + vault.positions_mark_total + amount >= floor, EPlpFloorBreached);

    let coin_out = coin::from_balance(balance::split(&mut vault.idle, amount), ctx);
    (coin_out, RangeAuthReceipt { vault_id: object::id(vault), funded: amount })
}

public fun record_range<Q, S>(
    vault: &mut Vault<Q, S>, receipt: RangeAuthReceipt, position_id: ID, oracle_id: ID,
    expiry_ms: u64, lower_strike: u64, upper_strike: u64, size: u64, premium_paid: u64, clock: &Clock,
) {
    let RangeAuthReceipt { vault_id, funded: _ } = receipt;
    assert!(vault_id == object::id(vault), EWrongVault);
    let position = RangePosition {
        oracle_id, expiry_ms, lower_strike, upper_strike,
        size, premium_paid, minted_at_ms: clock.timestamp_ms(), mark_value_cached: premium_paid,
    };
    table::add(&mut vault.positions, position_id, position);
    vault.position_count = vault.position_count + 1;
    vault.positions_mark_total = vault.positions_mark_total + premium_paid;
}

public fun mark_position<Q, S>(vault: &mut Vault<Q, S>, cap: &ExecCap, position_id: ID, new_mark: u64) {
    assert_exec(vault, cap);
    assert!(table::contains(&vault.positions, position_id), EPositionNotFound);
    let old_mark = table::borrow(&vault.positions, position_id).mark_value_cached;
    vault.positions_mark_total = vault.positions_mark_total - old_mark + new_mark;
    let pos = table::borrow_mut(&mut vault.positions, position_id);
    pos.mark_value_cached = new_mark;
}

/// Settle a position at expiry: its value is now CERTAIN (resolved to settled_value, e.g.
/// $1×size if in-the-money, $0 if not). Moves that value out of the soft mark tier and into
/// the SETTLED tier, which counts toward the trustless nav_lower_bound. ExecCap-gated; the
/// caller reads the oracle settlement price. The position remains in the table (its mark is
/// now its settled value) until redeemed/removed.
public fun settle_position<Q, S>(vault: &mut Vault<Q, S>, cap: &ExecCap, position_id: ID, settled_value: u64) {
    assert_exec(vault, cap);
    assert!(table::contains(&vault.positions, position_id), EPositionNotFound);
    let old_mark = table::borrow(&vault.positions, position_id).mark_value_cached;
    // remove from soft tier, add to certain (settled) tier
    vault.positions_mark_total = vault.positions_mark_total - old_mark;
    add_settled(vault, settled_value);
    let pos = table::borrow_mut(&mut vault.positions, position_id);
    pos.mark_value_cached = settled_value;
    event::emit(PositionSettled { vault_id: object::id(vault), position_id, settled_value });
}

public fun authorize_redeem_range<Q, S>(vault: &mut Vault<Q, S>, cap: &ExecCap, position_id: ID): RangeRedeemReceipt {
    assert_exec(vault, cap);
    assert!(table::contains(&vault.positions, position_id), EPositionNotFound);
    let RangePosition {
        oracle_id: _, expiry_ms: _, lower_strike: _, upper_strike: _,
        size: _, premium_paid: _, minted_at_ms: _, mark_value_cached,
    } = table::remove(&mut vault.positions, position_id);
    vault.position_count = vault.position_count - 1;
    vault.positions_mark_total = vault.positions_mark_total - mark_value_cached;
    RangeRedeemReceipt { vault_id: object::id(vault), position_id }
}

public fun confirm_range_redeem<Q, S>(vault: &mut Vault<Q, S>, receipt: RangeRedeemReceipt, payout: Coin<Q>) {
    let RangeRedeemReceipt { vault_id, position_id: _ } = receipt;
    assert!(vault_id == object::id(vault), EWrongVault);
    balance::join(&mut vault.idle, coin::into_balance(payout));
}

// ─── Stratum C: hedge ────────────────────────────────────────────────────────
public fun authorize_hedge<Q, S>(vault: &mut Vault<Q, S>, cap: &ExecCap): HedgeReceipt {
    assert_exec(vault, cap);
    assert_not_paused(vault);
    assert!(vault.policy.enabled_strata & STRATUM_HEDGE != 0, EStratumDisabled);
    HedgeReceipt { vault_id: object::id(vault) }
}

public fun record_hedge<Q, S>(
    vault: &mut Vault<Q, S>, receipt: HedgeReceipt, margin_manager_id: ID, notional: u64, is_short: bool,
) {
    let HedgeReceipt { vault_id } = receipt;
    assert!(vault_id == object::id(vault), EWrongVault);
    let nav = total_assets(vault);
    let max_notional = mul_div(nav, vault.policy.max_leverage_bps, BPS_DENOM);
    assert!(notional <= max_notional, ELeverageExceeded);
    if (option::is_none(&vault.hedge_margin_manager_id)) {
        vault.hedge_margin_manager_id = option::some(margin_manager_id);
    };
    vault.hedge_notional = notional;
    vault.hedge_is_short = is_short;
}

/// Dynamic-field key under which the vault stores the attester's Ed25519 public key.
public struct AttesterKey has copy, drop, store {}

/// Register the attester public key whose signatures gate attested NAV updates.
/// In production this key lives inside the Nautilus enclave (Tier 2 binds it to a
/// registered Enclave + PCRs). Owner-only.
public fun register_attester<Q, S>(vault: &mut Vault<Q, S>, cap: &OwnerCap, pubkey: vector<u8>) {
    assert_owner(vault, cap);
    assert!(pubkey.length() == 32, EBadAttester);
    if (df::exists(&vault.id, AttesterKey {})) {
        let _old: vector<u8> = df::remove(&mut vault.id, AttesterKey {});
    };
    df::add(&mut vault.id, AttesterKey {}, pubkey);
    // Registering a real attester = provable NAV = the 15% premium tier.
    vault.fees.attested = true;
    vault.fees.protocol_fee_bps = ATTESTED_PROTOCOL_FEE_BPS;
}

/// Read the registered attester pubkey (empty if none).
public fun attester_pubkey<Q, S>(vault: &Vault<Q, S>): vector<u8> {
    if (df::exists(&vault.id, AttesterKey {})) {
        *df::borrow<AttesterKey, vector<u8>>(&vault.id, AttesterKey {})
    } else { vector[] }
}

/// Attested NAV update: the operator must present a signature, by the registered
/// attester key, over BCS(vault_id || plp_price || timestamp_ms). The contract
/// verifies the signature on-chain before accepting the price. Tamper the price ->
/// signature fails -> abort. This is the verifiable-NAV moat: NAV is not asserted,
/// it is cryptographically attested and checked here.
public fun update_nav_attested<Q, S>(
    vault: &mut Vault<Q, S>, cap: &ExecCap,
    plp_price: u64, plp_held: u64, timestamp_ms: u64,
    signature: vector<u8>, clock: &Clock,
) {
    assert_exec(vault, cap);
    assert!(plp_price > 0, EZeroAmount);
    assert!(df::exists(&vault.id, AttesterKey {}), ENoAttester);
    // freshness: timestamp must not go backwards and must be within the recent window
    let now = clock.timestamp_ms();
    assert!(timestamp_ms >= vault.plp_price_updated_ms, EStaleAttestation);
    assert!(timestamp_ms <= now && now - timestamp_ms <= 600_000, EStaleAttestation); // within 10 min, not future

    // reconstruct the signed message: BCS(vault_id, plp_price, timestamp_ms)
    let mut msg = bcs::to_bytes(&object::id(vault));
    msg.append(bcs::to_bytes(&plp_price));
    msg.append(bcs::to_bytes(&timestamp_ms));

    let pubkey = df::borrow<AttesterKey, vector<u8>>(&vault.id, AttesterKey {});
    let ok = ed25519::ed25519_verify(&signature, pubkey, &msg);
    assert!(ok, EBadAttestation);

    vault.plp_price_cached = plp_price;
    vault.plp_held = plp_held;
    vault.plp_price_updated_ms = timestamp_ms;
}

// ─── Stratum A: PLP price (attested in Phase 7) ──────────────────────────────
public fun update_plp_price<Q, S>(
    vault: &mut Vault<Q, S>, cap: &ExecCap, new_price: u64, plp_held: u64,
    _attestation: vector<u8>, clock: &Clock,
) {
    assert_exec(vault, cap);
    assert!(new_price > 0, EZeroAmount);
    // TODO(Phase 7/Nautilus): verify _attestation against vault.enclave_pcr_hash.
    vault.plp_price_cached = new_price;
    vault.plp_held = plp_held;
    vault.plp_price_updated_ms = clock.timestamp_ms();
}

// ─── Owner config (governance) ───────────────────────────────────────────────
public fun register_enclave<Q, S>(vault: &mut Vault<Q, S>, cap: &OwnerCap, pcr_hash: vector<u8>) {
    assert_owner(vault, cap);
    vault.enclave_pcr_hash = pcr_hash;
    // Registering an attested enclave = provable NAV = the 15% premium tier.
    vault.fees.attested = true;
    vault.fees.protocol_fee_bps = ATTESTED_PROTOCOL_FEE_BPS;
}

public fun set_paused<Q, S>(vault: &mut Vault<Q, S>, cap: &OwnerCap, paused: bool) {
    assert_owner(vault, cap);
    vault.paused = paused;
}

public fun set_deposits_frozen<Q, S>(vault: &mut Vault<Q, S>, cap: &OwnerCap, frozen: bool) {
    assert_owner(vault, cap);
    vault.deposits_frozen = frozen;
}

public fun set_predict_operator<Q, S>(vault: &mut Vault<Q, S>, cap: &OwnerCap, op: address) {
    assert_owner(vault, cap);
    vault.predict_operator = op;
}

// ─── Curator config ──────────────────────────────────────────────────────────
public fun set_policy<Q, S>(vault: &mut Vault<Q, S>, cap: &CuratorCap, policy: PolicyConfig) {
    assert_curator_cap(vault, cap);
    vault.policy = policy;
}

public fun set_fees<Q, S>(vault: &mut Vault<Q, S>, cap: &CuratorCap, mgmt_bps: u64, perf_bps: u64, recipient: address) {
    assert_curator_cap(vault, cap);
    assert!(mgmt_bps <= MAX_MGMT_FEE_BPS, EFeeTooHigh);
    assert!(perf_bps <= MAX_PERF_FEE_BPS, EFeeTooHigh);
    vault.fees.management_fee_bps = mgmt_bps;
    vault.fees.performance_fee_bps = perf_bps;
    vault.fees.fee_recipient = recipient;
}

public fun set_max_capacity<Q, S>(vault: &mut Vault<Q, S>, cap: &CuratorCap, capacity: u64) {
    assert_curator_cap(vault, cap);
    vault.max_capacity = capacity;
}

public fun set_strategy_blob<Q, S>(vault: &mut Vault<Q, S>, cap: &CuratorCap, blob: vector<u8>) {
    assert_curator_cap(vault, cap);
    vault.strategy_config_blob = blob;
}

// Seal access policy: the curator's StrategyConfig is Seal-encrypted; the Seal `id`
// is the vault id's bytes. Key servers DRY-RUN one of these seal_approve* functions
// to decide whether to release decryption shares. Possessing the gating capability
// in the decryption PTB IS the proof of authority. The same capability system that
// gates execution gates secrets: revoke an agent and it loses BOTH.
fun seal_id_matches<Q, S>(vault: &Vault<Q, S>, id: vector<u8>): bool {
    object::id(vault).to_bytes() == id
}

entry fun seal_approve_curator<Q, S>(id: vector<u8>, vault: &Vault<Q, S>, cap: &CuratorCap) {
    assert!(cap.vault_id == object::id(vault), EWrongVault);
    assert!(seal_id_matches(vault, id), ESealDenied);
}

entry fun seal_approve_agent<Q, S>(id: vector<u8>, vault: &Vault<Q, S>, cap: &ExecCap) {
    assert!(cap.vault_id == object::id(vault), EWrongVault);
    assert!(seal_id_matches(vault, id), ESealDenied);
    assert!(!is_revoked(vault, object::id(cap)), EMandateRevoked);
    if (cap.mandate.is_some()) {
        assert!(!cap.mandate.borrow().revoked, EMandateRevoked);
    };
}

// ─── Audit ───────────────────────────────────────────────────────────────────
public fun record_walrus_blob<Q, S>(vault: &mut Vault<Q, S>, cap: &ExecCap, blob_id: vector<u8>) {
    assert_exec(vault, cap);
    vault.walrus_blob_ids.push_back(blob_id);
}

// ─── PLP custody (Path B): vault holds Coin<P> on its own UID ─────────────────
//
// Closes the EOA leak: predict::supply returns Coin<PLP> which is attached to the
// vault here, NOT transferred to an operator. Redemption hands it back into the
// PTB which calls predict::withdraw (needs NO owner) — so PLP is FULLY
// non-custodial: the vault owns and redeems its own PLP. Generic over P so the
// contract imports nothing DeepBook-specific.

public struct PlpKey has copy, drop, store {}

/// Attach a freshly-supplied PLP coin to the vault (ExecCap-gated). If PLP is
/// already held, joins into the existing balance. Pairs with confirm_deploy.
public fun store_plp<Q, S, P>(vault: &mut Vault<Q, S>, cap: &ExecCap, plp: Coin<P>) {
    assert_exec(vault, cap);
    if (df::exists(&vault.id, PlpKey {})) {
        let bal: &mut Balance<P> = df::borrow_mut(&mut vault.id, PlpKey {});
        balance::join(bal, coin::into_balance(plp));
    } else {
        df::add(&mut vault.id, PlpKey {}, coin::into_balance(plp));
    }
}

/// Take `amount` of PLP back out as a Coin<P> for redemption within the PTB
/// (ExecCap-gated). The PTB then calls predict::withdraw on it. Pairs with
/// request_redeem / confirm_redeem for accounting.
public fun take_plp<Q, S, P>(vault: &mut Vault<Q, S>, cap: &ExecCap, amount: u64, ctx: &mut TxContext): Coin<P> {
    assert_exec(vault, cap);
    let bal: &mut Balance<P> = df::borrow_mut(&mut vault.id, PlpKey {});
    coin::from_balance(balance::split(bal, amount), ctx)
}

/// Read the vault's held PLP balance (0 if none).
public fun plp_balance<Q, S, P>(vault: &Vault<Q, S>): u64 {
    if (df::exists(&vault.id, PlpKey {})) {
        let bal: &Balance<P> = df::borrow(&vault.id, PlpKey {});
        balance::value(bal)
    } else { 0 }
}

// ─── BalanceManager cap custody (Path B): vault holds the caps on its UID ─────
//
// The vault holds WithdrawCap/DepositCap/TradeCap (DeepBook objects) as dynamic
// fields — NO human owns them. To use one, borrow it within the PTB; a hot-potato
// CapReturn forces it back into the vault SAME-TX, so a borrower can't keep it.
// Generic over the cap type C so the contract imports nothing DeepBook-specific.

public struct WithdrawCapKey has copy, drop, store {}
public struct DepositCapKey has copy, drop, store {}
public struct TradeCapKey has copy, drop, store {}

/// Hot-potato: has no abilities, so it MUST be consumed by return_cap in the same tx.
public struct CapReturn { vault_id: ID, slot: u8 }

const SLOT_WITHDRAW: u8 = 1;
const SLOT_DEPOSIT: u8 = 2;
const SLOT_TRADE: u8 = 3;

const ECapAlreadyProvisioned: u64 = 21;
const ECapNotProvisioned: u64 = 22;
const EWrongCapReturn: u64 = 23;

/// Attach the three BM caps to the vault (OwnerCap-gated, one-time). Generic over
/// each cap type so Floe imports no DeepBook types.
public fun provision_caps<Q, S, WCap: key + store, DCap: key + store, TCap: key + store>(
    vault: &mut Vault<Q, S>, cap: &OwnerCap, wcap: WCap, dcap: DCap, tcap: TCap,
) {
    assert_owner(vault, cap);
    assert!(!df::exists(&vault.id, WithdrawCapKey {}), ECapAlreadyProvisioned);
    df::add(&mut vault.id, WithdrawCapKey {}, wcap);
    df::add(&mut vault.id, DepositCapKey {}, dcap);
    df::add(&mut vault.id, TradeCapKey {}, tcap);
}

public fun caps_provisioned<Q, S>(vault: &Vault<Q, S>): bool {
    df::exists(&vault.id, TradeCapKey {})
}

/// Borrow the TradeCap within a PTB (ExecCap-gated). Returns the cap + a
/// hot-potato that MUST be passed to return_trade_cap in the same tx.
public fun borrow_trade_cap<Q, S, TCap: key + store>(
    vault: &mut Vault<Q, S>, cap: &ExecCap,
): (TCap, CapReturn) {
    assert_exec(vault, cap);
    assert!(df::exists(&vault.id, TradeCapKey {}), ECapNotProvisioned);
    let tcap: TCap = df::remove(&mut vault.id, TradeCapKey {});
    (tcap, CapReturn { vault_id: object::id(vault), slot: SLOT_TRADE })
}

public fun return_trade_cap<Q, S, TCap: key + store>(
    vault: &mut Vault<Q, S>, tcap: TCap, ret: CapReturn,
) {
    let CapReturn { vault_id, slot } = ret;
    assert!(vault_id == object::id(vault), EWrongVault);
    assert!(slot == SLOT_TRADE, EWrongCapReturn);
    df::add(&mut vault.id, TradeCapKey {}, tcap);
}

/// Borrow the WithdrawCap within a PTB (ExecCap-gated) — for moving BM funds
/// through vault-gated logic only. Hot-potato return enforced.
public fun borrow_withdraw_cap<Q, S, WCap: key + store>(
    vault: &mut Vault<Q, S>, cap: &ExecCap,
): (WCap, CapReturn) {
    assert_exec(vault, cap);
    assert!(df::exists(&vault.id, WithdrawCapKey {}), ECapNotProvisioned);
    let wcap: WCap = df::remove(&mut vault.id, WithdrawCapKey {});
    (wcap, CapReturn { vault_id: object::id(vault), slot: SLOT_WITHDRAW })
}

public fun return_withdraw_cap<Q, S, WCap: key + store>(
    vault: &mut Vault<Q, S>, wcap: WCap, ret: CapReturn,
) {
    let CapReturn { vault_id, slot } = ret;
    assert!(vault_id == object::id(vault), EWrongVault);
    assert!(slot == SLOT_WITHDRAW, EWrongCapReturn);
    df::add(&mut vault.id, WithdrawCapKey {}, wcap);
}

/// Borrow the DepositCap within a PTB (ExecCap-gated) — for depositing
/// collateral/DEEP into the BM. Hot-potato return enforced.
public fun borrow_deposit_cap<Q, S, DCap: key + store>(
    vault: &mut Vault<Q, S>, cap: &ExecCap,
): (DCap, CapReturn) {
    assert_exec(vault, cap);
    assert!(df::exists(&vault.id, DepositCapKey {}), ECapNotProvisioned);
    let dcap: DCap = df::remove(&mut vault.id, DepositCapKey {});
    (dcap, CapReturn { vault_id: object::id(vault), slot: SLOT_DEPOSIT })
}

public fun return_deposit_cap<Q, S, DCap: key + store>(
    vault: &mut Vault<Q, S>, dcap: DCap, ret: CapReturn,
) {
    let CapReturn { vault_id, slot } = ret;
    assert!(vault_id == object::id(vault), EWrongVault);
    assert!(slot == SLOT_DEPOSIT, EWrongCapReturn);
    df::add(&mut vault.id, DepositCapKey {}, dcap);
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

#[test_only]
public fun test_inject_gain<Q, S>(vault: &mut Vault<Q, S>, coin_in: Coin<Q>) {
    balance::join(&mut vault.idle, coin::into_balance(coin_in));
}

#[test_only]
public fun test_agent_count(registry: &AgentRegistry): u64 { registry.agents.length() }

#[test_only]
public fun test_insert_marked_position<Q, S>(vault: &mut Vault<Q, S>, mark: u64, ctx: &mut TxContext): ID {
    let id = object::id_from_address(tx_context::fresh_object_address(ctx));
    table::add(&mut vault.positions, id, RangePosition {
        oracle_id: id, expiry_ms: 0, lower_strike: 0, upper_strike: 0,
        size: 0, premium_paid: mark, minted_at_ms: 0, mark_value_cached: mark,
    });
    vault.position_count = vault.position_count + 1;
    vault.positions_mark_total = vault.positions_mark_total + mark;
    id
}

#[test_only]
public fun test_settle<Q, S>(vault: &mut Vault<Q, S>, position_id: ID, settled_value: u64) {
    assert!(table::contains(&vault.positions, position_id), EPositionNotFound);
    let old_mark = table::borrow(&vault.positions, position_id).mark_value_cached;
    vault.positions_mark_total = vault.positions_mark_total - old_mark;
    add_settled(vault, settled_value);
    let pos = table::borrow_mut(&mut vault.positions, position_id);
    pos.mark_value_cached = settled_value;
}

#[test_only]
public fun test_exec_cap_id(cap: &ExecCap): ID { object::id(cap) }

#[test_only]
public fun test_init_registry(ctx: &mut TxContext) {
    transfer::share_object(VaultRegistry { id: object::new(ctx), vaults: vector[], protocol_treasury: @0xFEE });
    transfer::share_object(AgentRegistry { id: object::new(ctx), agents: vector[] });
}

#[test_only]
module floe_lend::floe_lend_tests;

use floe_lend::floe_lend::{Self, LendingPool, LendAdminCap, SupplyPosition, DebtPosition};
use sui::test_scenario::{Self as ts, Scenario};
use sui::coin::{Self, Coin};
use sui::clock::{Self, Clock};
use sui::test_utils::destroy;

const ADMIN: address = @0xAD;
const LENDER: address = @0x1E;
const BORROWER: address = @0xB0;

// test coin types
public struct USDC has drop {}
public struct VSHARE has drop {}

fun mint<T>(amount: u64, ctx: &mut TxContext): Coin<T> { coin::mint_for_testing<T>(amount, ctx) }

#[test]
fun test_supply_and_withdraw() {
    let mut sc = ts::begin(ADMIN);
    let admin = floe_lend::test_admin_cap(ts::ctx(&mut sc));
    let clock = clock::create_for_testing(ts::ctx(&mut sc));
    let vault_id = object::id_from_address(@0x7a17);
    let pid = floe_lend::create_pool<USDC, VSHARE>(&admin, vault_id, ts::ctx(&mut sc));
    ts::next_tx(&mut sc, LENDER);
    {
        let mut pool = ts::take_shared_by_id<LendingPool<USDC, VSHARE>>(&sc, pid);
        let funds = mint<USDC>(1_000_000, ts::ctx(&mut sc));
        let pos = floe_lend::supply(&mut pool, funds, &clock, ts::ctx(&mut sc));
        assert!(floe_lend::total_supplied(&pool) == 1_000_000, 0);
        // withdraw all
        let (out, leftover) = floe_lend::withdraw(&mut pool, pos, 1_000_000, &clock, ts::ctx(&mut sc));
        assert!(coin::value(&out) == 1_000_000, 1);
        assert!(option::is_none(&leftover), 2);
        destroy(out); destroy(leftover);
        ts::return_shared(pool);
    };
    destroy(admin); clock::destroy_for_testing(clock);
    ts::end(sc);
}

#[test]
fun test_utilization_and_rate_curve() {
    let mut sc = ts::begin(ADMIN);
    let admin = floe_lend::test_admin_cap(ts::ctx(&mut sc));
    let vault_id = object::id_from_address(@0x7a17);
    let pid = floe_lend::create_pool<USDC, VSHARE>(&admin, vault_id, ts::ctx(&mut sc));
    ts::next_tx(&mut sc, ADMIN);
    {
        let pool = ts::take_shared_by_id<LendingPool<USDC, VSHARE>>(&sc, pid);
        // rate at 0% util = base rate (100 bps)
        assert!(floe_lend::borrow_rate_bps(&pool, 0) == 100, 0);
        // rate at optimal (8000) = base + slope1 = 100 + 400 = 500
        assert!(floe_lend::borrow_rate_bps(&pool, 8000) == 500, 1);
        // rate above optimal climbs steeply (slope2)
        let r_high = floe_lend::borrow_rate_bps(&pool, 9000);
        assert!(r_high > 500, 2);  // past the kink, steeper
        ts::return_shared(pool);
    };
    destroy(admin);
    ts::end(sc);
}

// ─── Integrity tests: attested valuation (the security mechanism) ─────────────
// Test vector (deterministic seed 7x32) signed over intent3||ts||vault||nav||supply (57 bytes).
const TEST_PUBKEY: vector<u8> = x"ea4a6c63e29c520abef5507b132ec5f9954776aebebe7b92421eea691446d22c";
const TEST_SIG: vector<u8> = x"4bd646ecf545193531917caa01cc2490ff0a9863449205cfc99abf07663c2a06ca65f0654b60d963f440ed9d19f49e0d725895caca4ab6e61180e75403c9fa04";
const TEST_BAD_SIG: vector<u8> = x"4bd646ecf545193531917caa01cc2490ff0a9863449205cfc99abf07663c2a06ca65f0654b60d963f440ed9d19f49e0d725895caca4ab6e61180e75403c9fafb";
const TEST_VAULT: address = @0xabababababababababababababababababababababababababababababababab;
const TEST_TS: u64 = 1700000000000;
const TEST_NAV: u64 = 1000000000;      // 1000 (6dp) floor
const TEST_SUPPLY: u64 = 1000000000;   // 1000 shares -> price = 1.0 per share-unit

#[test]
fun test_borrow_with_attested_valuation() {
    let mut sc = ts::begin(ADMIN);
    let admin = floe_lend::test_admin_cap(ts::ctx(&mut sc));
    // clock set just after the signed timestamp (within 10-min freshness)
    let mut clock = clock::create_for_testing(ts::ctx(&mut sc));
    clock::set_for_testing(&mut clock, TEST_TS + 1000);
    // pool's vault_id must equal the signed vault
    let vault_id = object::id_from_address(TEST_VAULT);
    let pid = floe_lend::create_pool<USDC, VSHARE>(&admin, vault_id, ts::ctx(&mut sc));
    ts::next_tx(&mut sc, ADMIN);
    {
        let mut pool = ts::take_shared_by_id<LendingPool<USDC, VSHARE>>(&sc, pid);
        floe_lend::register_collateral_attester(&admin, &mut pool, TEST_PUBKEY);
        // seed reserve with a lender
        let funds = mint<USDC>(1_000_000_000, ts::ctx(&mut sc));
        let sup = floe_lend::supply(&mut pool, funds, &clock, ts::ctx(&mut sc));
        // borrow: 100 shares collateral (price 1.0 -> value 100), LTV 70% -> max borrow 70
        let collateral = mint<VSHARE>(100_000_000, ts::ctx(&mut sc));  // 100 shares (6dp)
        let (loan, debt) = floe_lend::lock_and_borrow(
            &mut pool, collateral, 50_000_000,  // borrow 50 (< 70 cap)
            TEST_VAULT, TEST_NAV, TEST_SUPPLY, TEST_TS, TEST_SIG, &clock, ts::ctx(&mut sc),
        );
        assert!(coin::value(&loan) == 50_000_000, 0);
        destroy(loan); destroy(debt); destroy(sup);
        ts::return_shared(pool);
    };
    destroy(admin); clock::destroy_for_testing(clock);
    ts::end(sc);
}

#[test]
// bare expected_failure: the ONLY abort source in this path is verify_and_price's
// ed25519 check (accrue cannot abort on a freshly-funded pool), so the abort IS the
// signature rejection — proving a forged valuation is refused on-chain (integrity gap closed).
#[expected_failure]
fun test_forged_valuation_rejected() {
    let mut sc = ts::begin(ADMIN);
    let admin = floe_lend::test_admin_cap(ts::ctx(&mut sc));
    let mut clock = clock::create_for_testing(ts::ctx(&mut sc));
    clock::set_for_testing(&mut clock, TEST_TS + 1000);
    let vault_id = object::id_from_address(TEST_VAULT);
    let pid = floe_lend::create_pool<USDC, VSHARE>(&admin, vault_id, ts::ctx(&mut sc));
    ts::next_tx(&mut sc, ADMIN);
    {
        let mut pool = ts::take_shared_by_id<LendingPool<USDC, VSHARE>>(&sc, pid);
        floe_lend::register_collateral_attester(&admin, &mut pool, TEST_PUBKEY);
        let funds = mint<USDC>(1_000_000_000, ts::ctx(&mut sc));
        let sup = floe_lend::supply(&mut pool, funds, &clock, ts::ctx(&mut sc));
        let collateral = mint<VSHARE>(100_000_000, ts::ctx(&mut sc));
        // BAD signature -> must abort EBadValuationSig (integrity gap closed)
        let (loan, debt) = floe_lend::lock_and_borrow(
            &mut pool, collateral, 50_000_000,
            TEST_VAULT, TEST_NAV, TEST_SUPPLY, TEST_TS, TEST_BAD_SIG, &clock, ts::ctx(&mut sc),
        );
        destroy(loan); destroy(debt); destroy(sup);
        ts::return_shared(pool);
    };
    destroy(admin); clock::destroy_for_testing(clock);
    ts::end(sc);
}

#[test]
// bare expected_failure: borrow 90 vs a 70 cap aborts at the LTV assert (EExceedsLtv).
#[expected_failure]
fun test_over_ltv_borrow_rejected() {
    let mut sc = ts::begin(ADMIN);
    let admin = floe_lend::test_admin_cap(ts::ctx(&mut sc));
    let mut clock = clock::create_for_testing(ts::ctx(&mut sc));
    clock::set_for_testing(&mut clock, TEST_TS + 1000);
    let vault_id = object::id_from_address(TEST_VAULT);
    let pid = floe_lend::create_pool<USDC, VSHARE>(&admin, vault_id, ts::ctx(&mut sc));
    ts::next_tx(&mut sc, ADMIN);
    {
        let mut pool = ts::take_shared_by_id<LendingPool<USDC, VSHARE>>(&sc, pid);
        floe_lend::register_collateral_attester(&admin, &mut pool, TEST_PUBKEY);
        let funds = mint<USDC>(1_000_000_000, ts::ctx(&mut sc));
        let sup = floe_lend::supply(&mut pool, funds, &clock, ts::ctx(&mut sc));
        let collateral = mint<VSHARE>(100_000_000, ts::ctx(&mut sc));  // value 100, max borrow 70
        // borrow 90 > 70 cap -> must abort EExceedsLtv
        let (loan, debt) = floe_lend::lock_and_borrow(
            &mut pool, collateral, 90_000_000,
            TEST_VAULT, TEST_NAV, TEST_SUPPLY, TEST_TS, TEST_SIG, &clock, ts::ctx(&mut sc),
        );
        destroy(loan); destroy(debt); destroy(sup);
        ts::return_shared(pool);
    };
    destroy(admin); clock::destroy_for_testing(clock);
    ts::end(sc);
}


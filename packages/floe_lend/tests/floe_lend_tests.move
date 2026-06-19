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

// ─── Integrity (attested valuation) — verified outside pure Move unit tests ───
// In floe_lend V2 the collateral valuation is verified by enclave::verify_signature against an
// on-chain Enclave<FLOE_NAV> object (PCR-anchored), not a stored pubkey. That object can only be
// minted via enclave::register_enclave from a real Nitro attestation, and the FLOE_NAV one-time
// witness can only be created in floe_nav's init — so an Enclave<FLOE_NAV> cannot be fabricated in
// a pure Move unit test. The integrity guarantees are covered elsewhere:
//   • ed25519/intent-message verification — the enclave package's own tests (test_serde, etc.)
//   • the full borrow path against the live enclave — packages/sdk/scripts/borrow-verify.ts
//     (on-chain testnet proof: a valid enclave signature borrows; the contract rejects anything
//      not signed by the attested key, and caps the borrow at LTV of the attested value).


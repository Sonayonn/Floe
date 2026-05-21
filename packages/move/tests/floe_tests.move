#[test_only]
module floe::floe_tests;

use sui::test_scenario::{Self as ts, next_tx, ctx};
use std::unit_test::destroy;
use sui::coin::{Self, Coin};
use sui::clock;
use floe::vault::{Self, Vault, OperatorCap, RebalancerCap, FLOE};

// A stand-in quote asset for tests. Any type works since Vault is generic.
public struct TUSD has drop {}

const ADMIN: address = @0xA;
const USER: address = @0xB;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/// Spin up a vault with dummy manager IDs, return its caps. Vault is shared.
fun new_vault(scenario: &mut ts::Scenario): (OperatorCap, RebalancerCap) {
    let treasury = vault::test_new_treasury(ctx(scenario));
    // Dummy IDs for the BalanceManager / PredictManager references.
    let bm_id = object::id_from_address(@0x1111);
    let pm_id = object::id_from_address(@0x2222);
    vault::create_vault<TUSD>(treasury, bm_id, pm_id, ctx(scenario))
}

fun mint_tusd(amount: u64, scenario: &mut ts::Scenario): Coin<TUSD> {
    coin::mint_for_testing<TUSD>(amount, ctx(scenario))
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[test]
fun test_deposit_bootstrap() {
    let mut sc = ts::begin(ADMIN);
    let (op, reb) = new_vault(&mut sc);

    next_tx(&mut sc, USER);
    {
        let mut vault = ts::take_shared<Vault<TUSD>>(&sc);
        let clk = clock::create_for_testing(ctx(&mut sc));
        let payment = mint_tusd(10_000_000, &mut sc); // 10 TUSD

        let shares = vault::deposit(&mut vault, payment, &clk, ctx(&mut sc));
        // Bootstrap: 1:1, so 10 TUSD -> 10_000_000 shares
        assert!(coin::value(&shares) == 10_000_000, 0);
        assert!(vault::share_supply(&vault) == 10_000_000, 1);
        assert!(vault::test_total_assets(&vault) == 10_000_000, 2);

        destroy(shares);
        clock::destroy_for_testing(clk);
        ts::return_shared(vault);
    };

    destroy(op); destroy(reb);
    ts::end(sc);
}

#[test]
fun test_deposit_proportional() {
    let mut sc = ts::begin(ADMIN);
    let (op, reb) = new_vault(&mut sc);

    next_tx(&mut sc, USER);
    {
        let mut vault = ts::take_shared<Vault<TUSD>>(&sc);
        let clk = clock::create_for_testing(ctx(&mut sc));

        // First deposit 10 TUSD -> 10M shares
        let s1 = vault::deposit(&mut vault, mint_tusd(10_000_000, &mut sc), &clk, ctx(&mut sc));
        // Second deposit 5 TUSD -> NAV is 10M, supply 10M, so 5M shares
        let s2 = vault::deposit(&mut vault, mint_tusd(5_000_000, &mut sc), &clk, ctx(&mut sc));

        assert!(coin::value(&s2) == 5_000_000, 0);
        assert!(vault::share_supply(&vault) == 15_000_000, 1);

        destroy(s1); destroy(s2);
        clock::destroy_for_testing(clk);
        ts::return_shared(vault);
    };

    destroy(op); destroy(reb);
    ts::end(sc);
}

#[test]
fun test_withdraw_roundtrip() {
    let mut sc = ts::begin(ADMIN);
    let (op, reb) = new_vault(&mut sc);

    next_tx(&mut sc, USER);
    {
        let mut vault = ts::take_shared<Vault<TUSD>>(&sc);
        let clk = clock::create_for_testing(ctx(&mut sc));

        let shares = vault::deposit(&mut vault, mint_tusd(10_000_000, &mut sc), &clk, ctx(&mut sc));
        let returned = vault::withdraw(&mut vault, shares, &clk, ctx(&mut sc));

        // Full round-trip returns principal exactly (no other depositors)
        assert!(coin::value(&returned) == 10_000_000, 0);
        assert!(vault::share_supply(&vault) == 0, 1);

        destroy(returned);
        clock::destroy_for_testing(clk);
        ts::return_shared(vault);
    };

    destroy(op); destroy(reb);
    ts::end(sc);
}

#[test]
#[expected_failure(abort_code = vault::EZeroAmount)]
fun test_min_first_deposit_aborts() {
    let mut sc = ts::begin(ADMIN);
    let (op, reb) = new_vault(&mut sc);

    next_tx(&mut sc, USER);
    {
        let mut vault = ts::take_shared<Vault<TUSD>>(&sc);
        let clk = clock::create_for_testing(ctx(&mut sc));

        // Below MIN_FIRST_DEPOSIT (1_000_000) -> must abort
        let shares = vault::deposit(&mut vault, mint_tusd(500_000, &mut sc), &clk, ctx(&mut sc));

        destroy(shares);
        clock::destroy_for_testing(clk);
        ts::return_shared(vault);
    };

    destroy(op); destroy(reb);
    ts::end(sc);
}

#[test]
#[expected_failure(abort_code = vault::EVaultPaused)]
fun test_paused_blocks_deposit() {
    let mut sc = ts::begin(ADMIN);
    let (op, reb) = new_vault(&mut sc);

    next_tx(&mut sc, ADMIN);
    {
        let mut vault = ts::take_shared<Vault<TUSD>>(&sc);
        vault::set_paused(&mut vault, &op, true);
        ts::return_shared(vault);
    };

    next_tx(&mut sc, USER);
    {
        let mut vault = ts::take_shared<Vault<TUSD>>(&sc);
        let clk = clock::create_for_testing(ctx(&mut sc));
        let shares = vault::deposit(&mut vault, mint_tusd(10_000_000, &mut sc), &clk, ctx(&mut sc));
        destroy(shares);
        clock::destroy_for_testing(clk);
        ts::return_shared(vault);
    };

    destroy(op); destroy(reb);
    ts::end(sc);
}

#[test]
fun test_unpause_restores_deposit() {
    let mut sc = ts::begin(ADMIN);
    let (op, reb) = new_vault(&mut sc);

    next_tx(&mut sc, ADMIN);
    {
        let mut vault = ts::take_shared<Vault<TUSD>>(&sc);
        vault::set_paused(&mut vault, &op, true);
        vault::set_paused(&mut vault, &op, false);
        ts::return_shared(vault);
    };

    next_tx(&mut sc, USER);
    {
        let mut vault = ts::take_shared<Vault<TUSD>>(&sc);
        let clk = clock::create_for_testing(ctx(&mut sc));
        let shares = vault::deposit(&mut vault, mint_tusd(10_000_000, &mut sc), &clk, ctx(&mut sc));
        assert!(coin::value(&shares) == 10_000_000, 0);
        destroy(shares);
        clock::destroy_for_testing(clk);
        ts::return_shared(vault);
    };

    destroy(op); destroy(reb);
    ts::end(sc);
}

#[test]
fun test_set_floor_and_register_enclave() {
    let mut sc = ts::begin(ADMIN);
    let (op, reb) = new_vault(&mut sc);

    next_tx(&mut sc, ADMIN);
    {
        let mut vault = ts::take_shared<Vault<TUSD>>(&sc);
        vault::set_plp_floor(&mut vault, &op, 6_000);
        vault::register_enclave(&mut vault, &op, b"pcr-measurement-hash");
        ts::return_shared(vault);
    };

    destroy(op); destroy(reb);
    ts::end(sc);
}

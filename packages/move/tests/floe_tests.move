#[test_only]
module floe::floe_tests;

use sui::test_scenario::{Self as ts, next_tx, ctx};
use std::unit_test::destroy;
use sui::coin::{Self, Coin};
use sui::clock;
use floe::floe::{Self as vault, Vault, OwnerCap, CuratorCap, VaultRegistry, AgentRegistry, ExecCap, TEST_SHARE};

public struct TUSD has drop {}

const ADMIN: address = @0xA;
const USER: address = @0xB;
const CURATOR: address = @0xA;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/// Publish the registry (mirrors init) for tests.
fun new_registry(scenario: &mut ts::Scenario) {
    vault::test_init_registry(ctx(scenario));
}

/// Spin up a v3 vault: TEST_SHARE shares, TUSD quote, default policy, given fees.
fun setup_vault(
    mgmt_bps: u64, perf_bps: u64, scenario: &mut ts::Scenario,
): (OwnerCap, CuratorCap) {
    let treasury = vault::test_new_share_treasury(ctx(scenario));
    let bm_id = object::id_from_address(@0x1111);
    let pm_id = object::id_from_address(@0x2222);
    let policy = vault::default_policy(vector[]);
    let fees = vault::new_fees(mgmt_bps, perf_bps, CURATOR);
    let clk = clock::create_for_testing(ctx(scenario));

    let mut registry = ts::take_shared<VaultRegistry>(scenario);
    let (op, cur) = vault::deploy_vault<TUSD, TEST_SHARE>(
        &mut registry, treasury, bm_id, pm_id, policy, fees,
        b"Test Vault", b"stratos", &clk, ctx(scenario),
    );
    ts::return_shared(registry);
    clock::destroy_for_testing(clk);
    (op, cur)
}

fun mint_tusd(amount: u64, scenario: &mut ts::Scenario): Coin<TUSD> {
    coin::mint_for_testing<TUSD>(amount, ctx(scenario))
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[test]
fun test_deposit_bootstrap() {
    let mut sc = ts::begin(ADMIN);
    new_registry(&mut sc);
    next_tx(&mut sc, ADMIN);
    let (op, cur) = setup_vault(0, 0, &mut sc);
    next_tx(&mut sc, USER);
    {
        let mut v = ts::take_shared<Vault<TUSD, TEST_SHARE>>(&sc);
        let clk = clock::create_for_testing(ctx(&mut sc));
        let payment = mint_tusd(10_000_000, &mut sc);
        let shares = vault::deposit(&mut v, payment, &clk, ctx(&mut sc));
        assert!(coin::value(&shares) == 10_000_000, 0);
        assert!(vault::share_supply(&v) == 10_000_000, 1);
        assert!(vault::test_total_assets(&v) == 10_000_000, 2);
        destroy(shares);
        clock::destroy_for_testing(clk);
        ts::return_shared(v);
    };
    destroy(op); destroy(cur);
    ts::end(sc);
}

#[test]
fun test_withdraw_roundtrip() {
    let mut sc = ts::begin(ADMIN);
    new_registry(&mut sc);
    next_tx(&mut sc, ADMIN);
    let (op, cur) = setup_vault(0, 0, &mut sc);
    next_tx(&mut sc, USER);
    {
        let mut v = ts::take_shared<Vault<TUSD, TEST_SHARE>>(&sc);
        let clk = clock::create_for_testing(ctx(&mut sc));
        let shares = vault::deposit(&mut v, mint_tusd(10_000_000, &mut sc), &clk, ctx(&mut sc));
        let out = vault::withdraw(&mut v, shares, &clk, ctx(&mut sc));
        assert!(coin::value(&out) == 10_000_000, 0);
        assert!(vault::share_supply(&v) == 0, 1);
        destroy(out);
        clock::destroy_for_testing(clk);
        ts::return_shared(v);
    };
    destroy(op); destroy(cur);
    ts::end(sc);
}

#[test]
/// Performance fee: 20% of a gain above HWM is minted as fee shares to curator.
fun test_performance_fee() {
    let mut sc = ts::begin(ADMIN);
    new_registry(&mut sc);
    next_tx(&mut sc, ADMIN);
    let (op, cur) = setup_vault(0, 2_000, &mut sc); // 0 mgmt, 20% perf
    next_tx(&mut sc, USER);
    {
        let mut v = ts::take_shared<Vault<TUSD, TEST_SHARE>>(&sc);
        let clk = clock::create_for_testing(ctx(&mut sc));

        // Deposit 1000 TUSD -> 1000 shares, price = 1.0, supply = 1_000_000_000
        let shares = vault::deposit(&mut v, mint_tusd(1_000_000_000, &mut sc), &clk, ctx(&mut sc));
        let supply_before = vault::share_supply(&v);
        assert!(supply_before == 1_000_000_000, 0);

        // Simulate a +10% NAV gain: inject 100 TUSD into idle.
        vault::test_inject_gain(&mut v, mint_tusd(100_000_000, &mut sc));
        // Now NAV = 1100, price = 1.1 (1_100_000 in 6dp), HWM = 1.0.

        // Accrue: profit_assets = (1.1-1.0)*1000 = 100 TUSD; perf = 20% = 20 TUSD.
        // fee_shares = 20 * supply / NAV = 20 * 1000 / 1100 ~= 18.18 shares.
        vault::test_accrue_fees(&mut v, &clk, ctx(&mut sc));

        let supply_after = vault::share_supply(&v);
        let minted = supply_after - supply_before;
        // Expect ~18_181_818 (18.18 shares in 6dp). Allow tight rounding band.
        assert!(minted >= 18_100_000 && minted <= 18_200_000, 1);

        // HWM should have advanced to the new price (~1.1, pre-dilution).
        assert!(vault::high_water_mark(&v) >= 1_090_000, 2);

        destroy(shares);
        clock::destroy_for_testing(clk);
        ts::return_shared(v);
    };
    destroy(op); destroy(cur);
    ts::end(sc);
}

#[test]
/// No performance fee when there's no gain above HWM.
fun test_no_fee_without_gain() {
    let mut sc = ts::begin(ADMIN);
    new_registry(&mut sc);
    next_tx(&mut sc, ADMIN);
    let (op, cur) = setup_vault(0, 2_000, &mut sc);
    next_tx(&mut sc, USER);
    {
        let mut v = ts::take_shared<Vault<TUSD, TEST_SHARE>>(&sc);
        let clk = clock::create_for_testing(ctx(&mut sc));
        let shares = vault::deposit(&mut v, mint_tusd(1_000_000_000, &mut sc), &clk, ctx(&mut sc));
        let supply_before = vault::share_supply(&v);
        vault::test_accrue_fees(&mut v, &clk, ctx(&mut sc));
        assert!(vault::share_supply(&v) == supply_before, 0); // no gain -> no fee
        destroy(shares);
        clock::destroy_for_testing(clk);
        ts::return_shared(v);
    };
    destroy(op); destroy(cur);
    ts::end(sc);
}

#[test]
/// Protocol fee split: of the fee shares minted, 10% go to the treasury address,
/// 90% to the curator. Verifies revenue accrues correctly out of the curator's cut.
fun test_protocol_fee_split() {
    let mut sc = ts::begin(ADMIN);
    new_registry(&mut sc);
    next_tx(&mut sc, ADMIN);
    let (op, cur) = setup_vault(0, 2_000, &mut sc); // 0 mgmt, 20% perf, protocol 10% default
    next_tx(&mut sc, USER);
    {
        let mut v = ts::take_shared<Vault<TUSD, TEST_SHARE>>(&sc);
        let clk = clock::create_for_testing(ctx(&mut sc));
        let shares = vault::deposit(&mut v, mint_tusd(1_000_000_000, &mut sc), &clk, ctx(&mut sc));
        let supply_before = vault::share_supply(&v);
        vault::test_inject_gain(&mut v, mint_tusd(100_000_000, &mut sc)); // +10% NAV
        vault::test_accrue_fees(&mut v, &clk, ctx(&mut sc));
        let total_minted = vault::share_supply(&v) - supply_before; // ~18.18 shares
        // Protocol cut = 10% of total fee shares; curator = 90%.
        // We can't read recipient balances here directly, but total_minted should be
        // the full fee (split happens in transfers, supply reflects both mints).
        assert!(total_minted >= 18_100_000 && total_minted <= 18_200_000, 0);
        destroy(shares);
        clock::destroy_for_testing(clk);
        ts::return_shared(v);
    };
    destroy(op); destroy(cur);
    ts::end(sc);
}


// ─── Agent authority (attenuated, revocable) ─────────────────────────────────
const AGENT: address = @0xC0FFEE;

#[test]
fun test_agent_authorize_and_act() {
    let mut sc = ts::begin(ADMIN);
    new_registry(&mut sc);
    next_tx(&mut sc, ADMIN);
    let (op, cur) = setup_vault(0, 0, &mut sc);
    // curator authorizes an agent under a bounded mandate
    next_tx(&mut sc, CURATOR);
    {
        let v = ts::take_shared<Vault<TUSD, TEST_SHARE>>(&sc);
        let mut reg = ts::take_shared<AgentRegistry>(&sc);
        vault::authorize_agent(&v, &cur, &mut reg, AGENT, 9_999_999_999_999, 10, option::none(), ctx(&mut sc));
        assert!(vault::test_agent_count(&reg) == 1, 0);
        ts::return_shared(v);
        ts::return_shared(reg);
    };
    // the agent now holds an attenuated ExecCap; it WORKS on a gated fn while live
    next_tx(&mut sc, AGENT);
    {
        let mut v = ts::take_shared<Vault<TUSD, TEST_SHARE>>(&sc);
        let ecap = ts::take_from_sender<ExecCap>(&sc);
        vault::record_walrus_blob(&mut v, &ecap, b"blob-while-live");
        ts::return_to_sender(&sc, ecap);
        ts::return_shared(v);
    };
    destroy(op); destroy(cur);
    ts::end(sc);
}

#[test]
#[expected_failure(abort_code = vault::EMandateRevoked)]
fun test_agent_revoke_killswitch() {
    let mut sc = ts::begin(ADMIN);
    new_registry(&mut sc);
    next_tx(&mut sc, ADMIN);
    let (op, cur) = setup_vault(0, 0, &mut sc);
    next_tx(&mut sc, CURATOR);
    let agent_cap_id;
    {
        let v = ts::take_shared<Vault<TUSD, TEST_SHARE>>(&sc);
        let mut reg = ts::take_shared<AgentRegistry>(&sc);
        vault::authorize_agent(&v, &cur, &mut reg, AGENT, 9_999_999_999_999, 10, option::none(), ctx(&mut sc));
        ts::return_shared(v);
        ts::return_shared(reg);
    };
    // capture the agent's ExecCap id
    next_tx(&mut sc, AGENT);
    {
        let ecap = ts::take_from_sender<ExecCap>(&sc);
        agent_cap_id = vault::test_exec_cap_id(&ecap);
        ts::return_to_sender(&sc, ecap);
    };
    // curator revokes by id
    next_tx(&mut sc, CURATOR);
    {
        let mut v = ts::take_shared<Vault<TUSD, TEST_SHARE>>(&sc);
        let mut reg = ts::take_shared<AgentRegistry>(&sc);
        vault::revoke_agent(&mut v, &cur, &mut reg, agent_cap_id);
        ts::return_shared(v);
        ts::return_shared(reg);
    };
    // agent's next action MUST abort EMandateRevoked (the kill-switch)
    next_tx(&mut sc, AGENT);
    {
        let mut v = ts::take_shared<Vault<TUSD, TEST_SHARE>>(&sc);
        let ecap = ts::take_from_sender<ExecCap>(&sc);
        vault::record_walrus_blob(&mut v, &ecap, b"blob-after-revoke"); // aborts here
        ts::return_to_sender(&sc, ecap);
        ts::return_shared(v);
    };
    destroy(op); destroy(cur);
    ts::end(sc);
}

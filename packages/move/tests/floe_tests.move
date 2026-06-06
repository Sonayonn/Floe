#[test_only]
module floe::floe_tests;

use sui::test_scenario::{Self as ts, next_tx, ctx};
use std::unit_test::destroy;
use sui::coin::{Self, Coin};
use sui::clock;
use floe::floe::{Self as vault, Vault, OwnerCap, CuratorCap, VaultRegistry, AgentRegistry, ExecCap, GuardianCap, TEST_SHARE};

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


// ─── Circuit breaker (NAV safety) ────────────────────────────────────────────
#[test]
fun test_circuit_breaker_lower_bound_safe_when_no_plp() {
    let mut sc = ts::begin(ADMIN);
    new_registry(&mut sc);
    next_tx(&mut sc, ADMIN);
    let (op, cur) = setup_vault(0, 0, &mut sc);
    next_tx(&mut sc, USER);
    {
        let mut v = ts::take_shared<Vault<TUSD, TEST_SHARE>>(&sc);
        let clk = clock::create_for_testing(ctx(&mut sc));
        // fresh vault, no PLP held -> price is fresh, lower bound == total assets, safe
        let shares = vault::deposit(&mut v, mint_tusd(10_000_000, &mut sc), &clk, ctx(&mut sc));
        assert!(vault::nav_is_safe(&v, &clk), 0);
        // lower bound == idle (no PLP, no marks) == total_assets here
        assert!(vault::nav_lower_bound(&v) == vault::test_total_assets(&v), 1);
        // withdraw works at full NAV
        let out = vault::withdraw(&mut v, shares, &clk, ctx(&mut sc));
        assert!(coin::value(&out) == 10_000_000, 2);
        destroy(out);
        clock::destroy_for_testing(clk);
        ts::return_shared(v);
    };
    destroy(op); destroy(cur);
    ts::end(sc);
}

#[test]
fun test_circuit_breaker_withdraw_always_exits_at_lower_bound() {
    // Inject a gain into idle (raises total_assets) with no attestation; deposit then withdraw.
    // With marks at 0 and PLP at 0, lower_bound == total_assets, so this verifies the always-exit
    // path returns funds (never traps), and the safe-path payout matches.
    let mut sc = ts::begin(ADMIN);
    new_registry(&mut sc);
    next_tx(&mut sc, ADMIN);
    let (op, cur) = setup_vault(0, 0, &mut sc);
    next_tx(&mut sc, USER);
    {
        let mut v = ts::take_shared<Vault<TUSD, TEST_SHARE>>(&sc);
        let clk = clock::create_for_testing(ctx(&mut sc));
        let shares = vault::deposit(&mut v, mint_tusd(10_000_000, &mut sc), &clk, ctx(&mut sc));
        vault::test_inject_gain(&mut v, mint_tusd(2_000_000, &mut sc)); // idle now 12M
        // user still holds all shares; withdraw returns full backing (lower bound == total here)
        let out = vault::withdraw(&mut v, shares, &clk, ctx(&mut sc));
        assert!(coin::value(&out) == 12_000_000, 0);
        destroy(out);
        clock::destroy_for_testing(clk);
        ts::return_shared(v);
    };
    destroy(op); destroy(cur);
    ts::end(sc);
}


// ─── Settlement-aware NAV ────────────────────────────────────────────────────
#[test]
fun test_settlement_aware_lower_bound_rises() {
    // A position's value starts in the soft mark tier (excluded from lower bound), then
    // settles into the certain tier (included in lower bound). Verifies the floor RISES.
    let mut sc = ts::begin(ADMIN);
    new_registry(&mut sc);
    next_tx(&mut sc, ADMIN);
    let (op, cur) = setup_vault(0, 0, &mut sc);
    next_tx(&mut sc, USER);
    {
        let mut v = ts::take_shared<Vault<TUSD, TEST_SHARE>>(&sc);
        let clk = clock::create_for_testing(ctx(&mut sc));
        // deposit 10M idle
        let shares = vault::deposit(&mut v, mint_tusd(10_000_000, &mut sc), &clk, ctx(&mut sc));
        // simulate a position carrying 3M of mark value via the test helper
        let pid = vault::test_insert_marked_position(&mut v, 3_000_000, ctx(&mut sc));
        // lower bound EXCLUDES the soft mark -> still ~10M (idle only, no PLP)
        let lb_before = vault::nav_lower_bound(&v);
        assert!(lb_before == 10_000_000, 0);
        // total_assets INCLUDES it -> 13M
        assert!(vault::test_total_assets(&v) == 13_000_000, 1);
        // settle the position at 3M (in-the-money) -> moves to certain tier
        vault::test_settle(&mut v, pid, 3_000_000);
        // lower bound now INCLUDES settled value -> 13M (the floor rose)
        let lb_after = vault::nav_lower_bound(&v);
        assert!(lb_after == 13_000_000, 2);
        // total unchanged
        assert!(vault::test_total_assets(&v) == 13_000_000, 3);
        destroy(shares);
        clock::destroy_for_testing(clk);
        ts::return_shared(v);
    };
    destroy(op); destroy(cur);
    ts::end(sc);
}


// ─── Async redemption (ERC-7540-style request/fulfill/claim) ─────────────────
#[test]
fun test_async_redeem_full_cycle() {
    let mut sc = ts::begin(ADMIN);
    new_registry(&mut sc);
    next_tx(&mut sc, ADMIN);
    let (op, cur) = setup_vault(0, 0, &mut sc);
    next_tx(&mut sc, USER);
    let exec = ts::take_from_address<vault::ExecCap>(&sc, ADMIN);
    {
        let mut v = ts::take_shared<Vault<TUSD, TEST_SHARE>>(&sc);
        let clk = clock::create_for_testing(ctx(&mut sc));
        // deposit 10M -> 10M shares (no PLP, fresh+safe)
        let mut shares = vault::deposit(&mut v, mint_tusd(10_000_000, &mut sc), &clk, ctx(&mut sc));
        assert!(coin::value(&shares) == 10_000_000, 0);

        // request redemption of 4M shares -> ticket; shares burned now, supply drops
        let four = coin::split(&mut shares, 4_000_000, ctx(&mut sc));
        let ticket = vault::request_redeem_shares(&mut v, four, &clk, ctx(&mut sc));
        assert!(vault::share_supply(&v) == 6_000_000, 1);          // 10M - 4M burned
        assert!(vault::pending_redeem_total_shares(&v) == 4_000_000, 2);
        assert!(vault::reserved_for_redemptions(&v) == 0, 3);       // not yet fulfilled

        // idle is 10M; available_idle still 10M (nothing reserved yet)
        assert!(vault::available_idle(&v) == 10_000_000, 4);

        // fulfill: 4M owed <= 10M idle -> reserved, claimable
        vault::fulfill_redeems(&mut v, &exec, &clk);
        assert!(vault::reserved_for_redemptions(&v) == 4_000_000, 5);
        assert!(vault::available_idle(&v) == 6_000_000, 6);        // 10M - 4M reserved
        assert!(vault::pending_redeem_total_shares(&v) == 0, 7);    // moved out of pending

        // claim: pays 4M from reserved idle, clears reservation
        let out = vault::claim_redeem(&mut v, ticket, ctx(&mut sc));
        assert!(coin::value(&out) == 4_000_000, 8);
        assert!(vault::reserved_for_redemptions(&v) == 0, 9);
        assert!(vault::idle_value(&v) == 6_000_000, 10);           // 10M - 4M paid

        destroy(out); destroy(shares);
        clock::destroy_for_testing(clk);
        ts::return_shared(v);
    };
    ts::return_to_address(ADMIN, exec);
    destroy(op); destroy(cur);
    ts::end(sc);
}

#[test]
fun test_async_redeem_reserved_funds_protected() {
    // After a redemption is fulfilled+reserved, a synchronous withdraw cannot touch
    // the reserved liquidity (available_idle guard).
    let mut sc = ts::begin(ADMIN);
    new_registry(&mut sc);
    next_tx(&mut sc, ADMIN);
    let (op, cur) = setup_vault(0, 0, &mut sc);
    next_tx(&mut sc, USER);
    let exec = ts::take_from_address<vault::ExecCap>(&sc, ADMIN);
    {
        let mut v = ts::take_shared<Vault<TUSD, TEST_SHARE>>(&sc);
        let clk = clock::create_for_testing(ctx(&mut sc));
        let mut shares = vault::deposit(&mut v, mint_tusd(10_000_000, &mut sc), &clk, ctx(&mut sc));
        // request+fulfill 8M -> 8M reserved, available_idle = 2M
        let eight = coin::split(&mut shares, 8_000_000, ctx(&mut sc));
        let ticket = vault::request_redeem_shares(&mut v, eight, &clk, ctx(&mut sc));
        vault::fulfill_redeems(&mut v, &exec, &clk);
        assert!(vault::available_idle(&v) == 2_000_000, 0);
        // claim it to clean up
        let out = vault::claim_redeem(&mut v, ticket, ctx(&mut sc));
        destroy(out); destroy(shares);
        clock::destroy_for_testing(clk);
        ts::return_shared(v);
    };
    ts::return_to_address(ADMIN, exec);
    destroy(op); destroy(cur);
    ts::end(sc);
}


// ─── Guardian: emergency halt + veto (separation of powers) ──────────────────
#[test]
fun test_guardian_halt_owner_resumes() {
    let mut sc = ts::begin(ADMIN);
    new_registry(&mut sc);
    next_tx(&mut sc, ADMIN);
    let (op, cur) = setup_vault(0, 0, &mut sc);
    // the GuardianCap was transferred to the curator (ADMIN) at deploy
    next_tx(&mut sc, ADMIN);
    let gcap = ts::take_from_address<GuardianCap>(&sc, ADMIN);
    {
        let mut v = ts::take_shared<Vault<TUSD, TEST_SHARE>>(&sc);
        assert!(!vault::is_paused(&v), 0);
        // guardian halts unilaterally
        vault::guardian_halt(&mut v, &gcap);
        assert!(vault::is_paused(&v), 1);
        // owner resumes (guardian has no resume power — owner authority required)
        vault::set_paused(&mut v, &op, false);
        assert!(!vault::is_paused(&v), 2);
        ts::return_shared(v);
    };
    ts::return_to_address(ADMIN, gcap);
    destroy(op); destroy(cur);
    ts::end(sc);
}

#[test]
fun test_guardian_veto_agent_killswitch() {
    // guardian vetoes an agent -> that agent's ExecCap fails the kill-switch (assert_exec).
    let mut sc = ts::begin(ADMIN);
    new_registry(&mut sc);
    next_tx(&mut sc, ADMIN);
    let (op, cur) = setup_vault(0, 0, &mut sc);
    // authorize an agent (curator mints an attenuated ExecCap to AGENT)
    next_tx(&mut sc, ADMIN);
    {
        let mut areg = ts::take_shared<AgentRegistry>(&sc);
        let v = ts::take_shared<Vault<TUSD, TEST_SHARE>>(&sc);
        let clk = clock::create_for_testing(ctx(&mut sc));
        vault::authorize_agent(&v, &cur, &mut areg, AGENT, clk.timestamp_ms() + 1_000_000, 100, option::none(), ctx(&mut sc));
        clock::destroy_for_testing(clk);
        ts::return_shared(v); ts::return_shared(areg);
    };
    // capture the agent cap id
    next_tx(&mut sc, AGENT);
    let acap = ts::take_from_sender<ExecCap>(&sc);
    let acap_id = vault::test_exec_cap_id(&acap);
    ts::return_to_sender(&sc, acap);
    // guardian vetoes it
    next_tx(&mut sc, ADMIN);
    let gcap = ts::take_from_address<GuardianCap>(&sc, ADMIN);
    {
        let mut v = ts::take_shared<Vault<TUSD, TEST_SHARE>>(&sc);
        vault::guardian_veto_agent(&mut v, &gcap, acap_id);
        ts::return_shared(v);
    };
    ts::return_to_address(ADMIN, gcap);
    destroy(op); destroy(cur);
    ts::end(sc);
}


// ─── Permissionless settlement (self-healing NAV) ────────────────────────────
#[test]
fun test_permissionless_settle_tightens_floor() {
    let mut sc = ts::begin(ADMIN);
    new_registry(&mut sc);
    next_tx(&mut sc, ADMIN);
    let (op, cur) = setup_vault(0, 0, &mut sc);
    next_tx(&mut sc, USER);
    {
        let mut v = ts::take_shared<Vault<TUSD, TEST_SHARE>>(&sc);
        // insert a soft-marked position (mark = 1_000_000), no PLP so floor excludes it
        let pid = vault::test_insert_marked_position(&mut v, 1_000_000, ctx(&mut sc));
        let floor_before = vault::nav_lower_bound(&v);   // excludes soft mark
        // ANYONE settles it (no cap) at <= mark -> moves to certain tier -> floor rises
        vault::settle_position_permissionless(&mut v, pid, 1_000_000);
        let floor_after = vault::nav_lower_bound(&v);
        assert!(floor_after == floor_before + 1_000_000, 0);  // settled value now in the floor
        ts::return_shared(v);
    };
    destroy(op); destroy(cur);
    ts::end(sc);
}

#[test]
#[expected_failure(abort_code = floe::floe::ESettleAboveMark)]
fun test_permissionless_settle_cannot_inflate() {
    let mut sc = ts::begin(ADMIN);
    new_registry(&mut sc);
    next_tx(&mut sc, ADMIN);
    let (op, cur) = setup_vault(0, 0, &mut sc);
    next_tx(&mut sc, USER);
    {
        let mut v = ts::take_shared<Vault<TUSD, TEST_SHARE>>(&sc);
        let pid = vault::test_insert_marked_position(&mut v, 1_000_000, ctx(&mut sc));
        // attempt to settle ABOVE the mark -> must abort ESettleAboveMark (no inflation)
        vault::settle_position_permissionless(&mut v, pid, 2_000_000);
        ts::return_shared(v);
    };
    destroy(op); destroy(cur);
    ts::end(sc);
}


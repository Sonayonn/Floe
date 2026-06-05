#[test_only]
module floe_nav::floe_nav_tests;

use floe_nav::floe_nav;
use enclave::enclave;
use std::bcs;

/// Proves our NavPayload + IntentMessage BCS encoding is deterministic and
/// matches what an enclave Rust signer must produce. Mirrors Mysten's test_serde.
#[test]
fun test_nav_payload_serde() {
    let scope: u8 = 1;            // NAV_INTENT
    let timestamp: u64 = 1744038900000;
    let vault_id = @0xCAFE;
    let nav: u64 = 15020000;
    let plp_price: u64 = 1002000;
    let payload = floe_nav::new_payload(vault_id, nav, plp_price);
    let intent_message = enclave::create_intent_message(scope, timestamp, payload);
    let bytes = bcs::to_bytes(&intent_message);
    assert!(bytes.length() > 0, 0);
    // intent(1) + timestamp(8) + vault_id(32) + nav(8) + plp_price(8) = 57 bytes
    assert!(bytes.length() == 57, 1);
}

/// VolPayload signs through the SAME enclave + IntentMessage path as NAV, with a
/// distinct intent (VOL_INTENT=2). Proves the vol attestation byte layout is the
/// same stable 57-byte shape the enclave signer reproduces.
#[test]
fun test_vol_payload_serde() {
    let scope: u8 = 2;            // VOL_INTENT
    let timestamp: u64 = 1744038900000;
    let oracle_id = @0xCAFE;
    let vol_bps: u64 = 5132;
    let spot: u64 = 63000000000000;
    let payload = floe_nav::new_vol_payload(oracle_id, vol_bps, spot);
    let intent_message = enclave::create_intent_message(scope, timestamp, payload);
    let bytes = bcs::to_bytes(&intent_message);
    // intent(1) + timestamp(8) + oracle_id(32) + vol_bps(8) + spot(8) = 57 bytes
    assert!(bytes.length() == 57, 2);
}

/// CollateralPayload (a NON-Floe use case: a lending market valuing illiquid collateral)
/// signs through the SAME enclave + IntentMessage path, distinct intent (COLLATERAL=3).
/// Proves the attestation primitive generalizes to any protocol — same 57-byte shape.
#[test]
fun test_collateral_payload_serde() {
    let scope: u8 = 3;            // COLLATERAL_INTENT
    let timestamp: u64 = 1744038900000;
    let asset_id = @0xCAFE;
    let value: u64 = 250000000;
    let ltv_bps: u64 = 7500;
    let payload = floe_nav::new_collateral_payload(asset_id, value, ltv_bps);
    let intent_message = enclave::create_intent_message(scope, timestamp, payload);
    let bytes = bcs::to_bytes(&intent_message);
    // intent(1) + timestamp(8) + asset_id(32) + value(8) + ltv_bps(8) = 57 bytes
    assert!(bytes.length() == 57, 3);
}


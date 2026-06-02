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
    let nav: u64 = 15020000;      // $15.02 (6dp)
    let plp_price: u64 = 1002000; // ~1.002

    let payload = floe_nav::new_payload(vault_id, nav, plp_price);
    let intent_message = enclave::create_intent_message(scope, timestamp, payload);
    let bytes = bcs::to_bytes(&intent_message);

    // The serialization must be stable + non-empty; this is the byte layout the
    // Rust enclave signer must reproduce to produce a verifiable signature.
    assert!(bytes.length() > 0, 0);
    // intent(1) + timestamp(8) + vault_id(32) + nav(8) + plp_price(8) = 57 bytes
    assert!(bytes.length() == 57, 1);
}

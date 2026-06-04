/// Floe NAV attestation via Nautilus.
///
/// Integrates Mysten's enclave primitive (move/enclave): a NAV update is accepted
/// only if it carries a signature, over the NAV payload, from a registered Nautilus
/// enclave whose PCR measurements are attested on-chain. This is the production
/// verification path — "NAV computed by hardware-attested code, verified on-chain."
///
/// Pattern follows Mysten's weather-example: an OTW + EnclaveConfig (PCRs) created at
/// init, and verify via enclave::verify_signature over a BCS payload that must match
/// the enclave's Rust signer field-for-field.
module floe_nav::floe_nav;

use enclave::enclave::{Self, Enclave};
use std::string;

/// One-time witness for this dApp's enclave config.
public struct FLOE_NAV has drop {}

/// The NAV payload the enclave signs. MUST match the Rust signer struct (BCS).
public struct NavPayload has copy, drop {
    vault_id: address,
    nav: u64,
    plp_price: u64,
}

/// The VOL payload the enclave signs (same 57-byte BCS shape as NavPayload:
/// address + u64 + u64). One attested enclave secures multiple verified feeds.
public struct VolPayload has copy, drop {
    oracle_id: address,
    vol_bps: u64,
    spot: u64,
}
/// Intent byte (domain separator) for NAV attestations.
const NAV_INTENT: u8 = 1;
/// Intent byte for VOL attestations (distinct domain separator).
const VOL_INTENT: u8 = 2;

const EBadEnclaveSig: u64 = 0;

fun init(otw: FLOE_NAV, ctx: &mut TxContext) {
    let cap = enclave::new_cap(otw, ctx);
    enclave::create_enclave_config(
        &cap,
        string::utf8(b"Floe NAV Attestor"),
        vector[], // PCR0 — set via update_pcrs after enclave build
        vector[], // PCR1
        vector[], // PCR2
        ctx,
    );
    transfer::public_transfer(cap, ctx.sender());
}

/// Verify an enclave-signed NAV. Aborts (EBadEnclaveSig) if the signature does not
/// verify against the registered enclave. Returns the verified (nav, plp_price).
public fun verify_nav<T>(
    enclave: &Enclave<T>,
    nav: u64,
    plp_price: u64,
    vault_id: address,
    timestamp_ms: u64,
    signature: vector<u8>,
): (u64, u64) {
    let payload = NavPayload { vault_id, nav, plp_price };
    let ok = enclave::verify_signature<T, NavPayload>(
        enclave, NAV_INTENT, timestamp_ms, payload, &signature,
    );
    assert!(ok, EBadEnclaveSig);
    (nav, plp_price)
}

/// Helper for constructing the payload (used by tests + off-chain to match BCS).
public fun new_payload(vault_id: address, nav: u64, plp_price: u64): NavPayload {
    NavPayload { vault_id, nav, plp_price }
}

/// Verify an enclave-signed VOLATILITY snapshot. Same registered enclave, distinct
/// intent (VOL_INTENT=2) so a NAV signature can never be replayed as a vol signature.
/// Returns the verified (vol_bps, spot). This is the attested counterpart to
/// floe_vol_index::vol_now (the trustless on-chain compute) — best of both:
/// any protocol can either compute vol on-chain OR consume a hardware-attested snapshot.
public fun verify_vol_attested<T>(
    enclave: &Enclave<T>,
    vol_bps: u64,
    spot: u64,
    oracle_id: address,
    timestamp_ms: u64,
    signature: vector<u8>,
): (u64, u64) {
    let payload = VolPayload { oracle_id, vol_bps, spot };
    let ok = enclave::verify_signature<T, VolPayload>(
        enclave, VOL_INTENT, timestamp_ms, payload, &signature,
    );
    assert!(ok, EBadEnclaveSig);
    (vol_bps, spot)
}

public fun new_vol_payload(oracle_id: address, vol_bps: u64, spot: u64): VolPayload {
    VolPayload { oracle_id, vol_bps, spot }
}

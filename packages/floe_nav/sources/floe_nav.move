/// Floe Verifiable Valuation — a reusable Sui attestation primitive.
///
/// Register a Nautilus enclave once (its PCR measurements attested on-chain); then
/// attest ANY typed value computed by that hardware-attested code, and verify the
/// signature on-chain before acting on it. Each value type is a typed payload with a
/// DISTINCT intent byte, so a signature for one kind can never be replayed as another.
///
/// This is infrastructure, not a vault feature: any protocol with hard-to-value
/// positions (a vault's NAV, a vol index, a lending market's illiquid collateral) can
/// use the same primitive. Floe is its FIRST consumer.
///
/// Reference instances below:
///   - NavPayload        (intent 1) — a vault's net asset value          [Floe's flagship use]
///   - VolPayload        (intent 2) — an on-chain implied-vol index
///   - CollateralPayload (intent 3) — illiquid collateral valuation       [a 3rd-party use case]
///   - RiskPayload       (intent 4) — a vault's attested PLP/risk posture  [provable 'is PLP safe?']
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
const COLLATERAL_INTENT: u8 = 3;  // 3rd-party use case: illiquid collateral valuation
const RISK_INTENT: u8 = 4;        // attested PLP/vault risk posture (answers 'is PLP safe?')

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

// ─── Reference consumer #3: illiquid collateral valuation (a NON-Floe use case) ──
// Demonstrates the primitive generalizes: a lending market could attest the value of
// hard-to-price collateral the same way Floe attests NAV. Same 57-byte BCS shape
// (address + u64 + u64); distinct intent (3) prevents cross-payload signature replay.
public struct CollateralPayload has copy, drop {
    asset_id: address,
    value: u64,
    ltv_bps: u64,
}

public fun verify_collateral_attested<T>(
    enclave: &Enclave<T>,
    value: u64,
    ltv_bps: u64,
    asset_id: address,
    timestamp_ms: u64,
    signature: vector<u8>,
): (u64, u64) {
    let payload = CollateralPayload { asset_id, value, ltv_bps };
    let ok = enclave::verify_signature<T, CollateralPayload>(
        enclave, COLLATERAL_INTENT, timestamp_ms, payload, &signature,
    );
    assert!(ok, EBadEnclaveSig);
    (value, ltv_bps)
}

// ─── Reference consumer #4: attested PLP/vault risk posture (Floe Guard) ──────
// The problem the category cares about: "is PLP safe?" gates serious LP TVL. A dashboard
// DISPLAYS risk; this PROVES it. The enclave signs the vault's risk state — utilization,
// largest single exposure, and modeled worst-case drawdown — so an outside LP can verify
// the vault's risk posture is within attested bounds cryptographically, not on trust.
public struct RiskPayload has copy, drop {
    subject_id: address,           // the vault being risk-attested
    utilization_bps: u64,          // % of vault value deployed (vs idle)
    max_exposure_bps: u64,         // largest single-oracle/position exposure
    worst_case_drawdown_bps: u64,  // modeled worst-case loss (e.g. ±5sigma)
}

public fun new_risk_payload(subject_id: address, utilization_bps: u64, max_exposure_bps: u64, worst_case_drawdown_bps: u64): RiskPayload {
    RiskPayload { subject_id, utilization_bps, max_exposure_bps, worst_case_drawdown_bps }
}

public fun verify_risk_attested<T>(
    enclave: &Enclave<T>,
    utilization_bps: u64,
    max_exposure_bps: u64,
    worst_case_drawdown_bps: u64,
    subject_id: address,
    timestamp_ms: u64,
    signature: vector<u8>,
): (u64, u64, u64) {
    let payload = RiskPayload { subject_id, utilization_bps, max_exposure_bps, worst_case_drawdown_bps };
    let ok = enclave::verify_signature<T, RiskPayload>(
        enclave, RISK_INTENT, timestamp_ms, payload, &signature,
    );
    assert!(ok, EBadEnclaveSig);
    (utilization_bps, max_exposure_bps, worst_case_drawdown_bps)
}

public fun new_collateral_payload(asset_id: address, value: u64, ltv_bps: u64): CollateralPayload {
    CollateralPayload { asset_id, value, ltv_bps }
}

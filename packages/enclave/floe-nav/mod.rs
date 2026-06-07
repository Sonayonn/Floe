// Floe NAV attestation enclave app.
// The enclave signs a NAV payload so Floe's Move contract can verify, on-chain,
// that the NAV was attested by code running in this enclave (PCRs registered).
// Payload BCS layout MUST match floe_nav.move: IntentMessage{intent(1)+ts(8)+payload}
// where NavPayload = vault_id(address,32) + nav(u64,8) + plp_price(u64,8) = 57 bytes total.

use crate::common::IntentMessage;
use crate::common::{to_signed_response, ProcessDataRequest, ProcessedDataResponse};
use crate::AppState;
use crate::EnclaveError;
use axum::extract::State;
use axum::Json;
use serde::{Deserialize, Serialize};
use serde_repr::{Deserialize_repr, Serialize_repr};
use std::sync::Arc;

/// Intent scope for Floe NAV attestation. MUST equal NAV_INTENT (1) in floe_nav.move.
#[derive(Serialize_repr, Deserialize_repr, Debug)]
#[repr(u8)]
pub enum IntentScope {
    Nav = 1,
    Vol = 2,
    Risk = 4,
}

/// The signed NAV payload. Field order + types MUST match NavPayload in floe_nav.move.
/// vault_id is a 32-byte Sui address; serde as [u8; 32] gives the raw 32 bytes BCS,
/// matching Move's `address` (32 raw bytes).
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NavPayload {
    pub vault_id: [u8; 32],
    pub nav: u64,
    pub plp_price: u64,
}

/// Request the rebalancer sends to the enclave: the NAV components it computed
/// from on-chain state (PLP holdings * oracle price, etc.). The enclave attests them.
#[derive(Debug, Serialize, Deserialize)]
pub struct NavRequest {
    pub vault_id: [u8; 32],
    pub nav: u64,
    pub plp_price: u64,
}

// ─── Vol payload (intent 2) — matches floe_nav.move VolPayload ────────────────
// VolPayload = oracle_id(address,32) + vol_bps(u64,8) + spot(u64,8) = 57 bytes.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VolPayload {
    pub oracle_id: [u8; 32],
    pub vol_bps: u64,
    pub spot: u64,
}
#[derive(Debug, Serialize, Deserialize)]
pub struct VolRequest {
    pub oracle_id: [u8; 32],
    pub vol_bps: u64,
    pub spot: u64,
}

// ─── Risk payload (intent 4) — matches floe_nav.move RiskPayload ──────────────
// RiskPayload = subject_id(address,32) + utilization_bps(8) + max_exposure_bps(8)
//             + worst_case_drawdown_bps(8) = 65 bytes.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RiskPayload {
    pub subject_id: [u8; 32],
    pub utilization_bps: u64,
    pub max_exposure_bps: u64,
    pub worst_case_drawdown_bps: u64,
}
#[derive(Debug, Serialize, Deserialize)]
pub struct RiskRequest {
    pub subject_id: [u8; 32],
    pub utilization_bps: u64,
    pub max_exposure_bps: u64,
    pub worst_case_drawdown_bps: u64,
}

pub async fn process_data(
    State(state): State<Arc<AppState>>,
    Json(request): Json<ProcessDataRequest<NavRequest>>,
) -> Result<Json<ProcessedDataResponse<IntentMessage<NavPayload>>>, EnclaveError> {
    let r = request.payload;
    if r.nav == 0 || r.plp_price == 0 {
        return Err(EnclaveError::GenericError("NAV/price must be non-zero".to_string()));
    }
    let timestamp_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| EnclaveError::GenericError(format!("clock: {e}")))?
        .as_millis() as u64;

    Ok(Json(to_signed_response(
        &state.eph_kp,
        NavPayload { vault_id: r.vault_id, nav: r.nav, plp_price: r.plp_price },
        timestamp_ms,
        IntentScope::Nav as u8,
    )))
}

/// Attest a volatility reading (intent 2). The rebalancer computes vol_bps + spot from the
/// on-chain SVI oracle; the enclave signs it so floe_vol/floe_nav can verify on-chain.
pub async fn sign_vol(
    State(state): State<Arc<AppState>>,
    Json(request): Json<ProcessDataRequest<VolRequest>>,
) -> Result<Json<ProcessedDataResponse<IntentMessage<VolPayload>>>, EnclaveError> {
    let r = request.payload;
    if r.vol_bps == 0 || r.spot == 0 {
        return Err(EnclaveError::GenericError("vol/spot must be non-zero".to_string()));
    }
    let timestamp_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| EnclaveError::GenericError(format!("clock: {e}")))?
        .as_millis() as u64;
    Ok(Json(to_signed_response(
        &state.eph_kp,
        VolPayload { oracle_id: r.oracle_id, vol_bps: r.vol_bps, spot: r.spot },
        timestamp_ms,
        IntentScope::Vol as u8,
    )))
}

/// Attest a vault's risk posture (intent 4) — utilization, max exposure, worst-case drawdown.
/// The cryptographic answer to "is PLP safe?": an LP can verify the risk bounds on-chain.
pub async fn sign_risk(
    State(state): State<Arc<AppState>>,
    Json(request): Json<ProcessDataRequest<RiskRequest>>,
) -> Result<Json<ProcessedDataResponse<IntentMessage<RiskPayload>>>, EnclaveError> {
    let r = request.payload;
    let timestamp_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| EnclaveError::GenericError(format!("clock: {e}")))?
        .as_millis() as u64;
    Ok(Json(to_signed_response(
        &state.eph_kp,
        RiskPayload {
            subject_id: r.subject_id,
            utilization_bps: r.utilization_bps,
            max_exposure_bps: r.max_exposure_bps,
            worst_case_drawdown_bps: r.worst_case_drawdown_bps,
        },
        timestamp_ms,
        IntentScope::Risk as u8,
    )))
}


// ─── Tier-1 heartbeat: sign the BARE message floe-core's update_nav_attested expects ───
// On-chain it verifies ed25519 over BCS(vault_id) || BCS(plp_price) || BCS(timestamp_ms)
// — NO intent envelope. So we sign the raw concatenation directly with the enclave key.
// The enclave's pubkey becomes the vault's registered attester => NAV heartbeat is hardware-attested.
#[derive(Debug, Serialize, Deserialize)]
pub struct HeartbeatRequest {
    pub vault_id: [u8; 32],
    pub plp_price: u64,
    pub plp_held: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct HeartbeatResponse {
    pub vault_id: [u8; 32],
    pub plp_price: u64,
    pub plp_held: u64,
    pub timestamp_ms: u64,
    pub signature: String,   // hex, plain ed25519 over the bare message
    pub pubkey: String,      // hex enclave pubkey -> register as attester
}

pub async fn sign_heartbeat(
    State(state): State<Arc<AppState>>,
    Json(request): Json<ProcessDataRequest<HeartbeatRequest>>,
) -> Result<Json<HeartbeatResponse>, EnclaveError> {
    use fastcrypto::encoding::{Encoding, Hex};
    use fastcrypto::traits::{Signer, KeyPair};
    let r = request.payload;
    if r.plp_price == 0 {
        return Err(EnclaveError::GenericError("plp_price must be non-zero".to_string()));
    }
    let timestamp_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| EnclaveError::GenericError(format!("clock: {e}")))?
        .as_millis() as u64;
    // Build the EXACT bytes floe-core reconstructs: BCS(vault_id) || BCS(plp_price) || BCS(timestamp_ms).
    // vault_id is a Sui address (32 raw bytes); bcs of [u8;32] = the 32 bytes verbatim.
    let mut msg = bcs::to_bytes(&r.vault_id).expect("bcs vault_id");
    msg.extend(bcs::to_bytes(&r.plp_price).expect("bcs plp_price"));
    msg.extend(bcs::to_bytes(&timestamp_ms).expect("bcs timestamp"));
    let sig = state.eph_kp.sign(&msg);
    let pubkey = state.eph_kp.public();
    Ok(Json(HeartbeatResponse {
        vault_id: r.vault_id,
        plp_price: r.plp_price,
        plp_held: r.plp_held,
        timestamp_ms,
        signature: Hex::encode(sig),
        pubkey: Hex::encode(pubkey.as_ref()),
    }))
}

#[cfg(test)]
mod test {
    use super::*;
    use crate::common::IntentMessage;

    #[test]
    fn test_serde() {
        // MUST be consistent with test_nav_payload_serde in floe_nav.move (57 bytes).
        let payload = NavPayload {
            vault_id: [0u8; 32],   // placeholder; layout is what matters
            nav: 15020000,
            plp_price: 1002000,
        };
        let timestamp = 1744038900000u64;
        let intent_msg = IntentMessage::new(payload, timestamp, IntentScope::Nav as u8);
        let bytes = bcs::to_bytes(&intent_msg).expect("serialize");
        // intent(1) + timestamp(8) + vault_id(32) + nav(8) + plp_price(8) = 57
        assert_eq!(bytes.len(), 57, "BCS layout must be 57 bytes to match Move");
        // intent byte is 1 (Nav)
        assert_eq!(bytes[0], 1u8);
    }

    #[test]
    fn test_heartbeat_msg_layout() {
        // The Tier-1 heartbeat message MUST be BCS(vault_id)||BCS(plp_price)||BCS(timestamp_ms)
        // = 32 + 8 + 8 = 48 bytes, NO intent envelope. Must match floe::update_nav_attested's
        // msg reconstruction byte-for-byte or ed25519_verify fails on-chain.
        let vault_id = [7u8; 32];
        let plp_price: u64 = 1002000;
        let timestamp_ms: u64 = 1744038900000;
        let mut msg = bcs::to_bytes(&vault_id).unwrap();
        msg.extend(bcs::to_bytes(&plp_price).unwrap());
        msg.extend(bcs::to_bytes(&timestamp_ms).unwrap());
        assert_eq!(msg.len(), 48, "heartbeat msg must be 48 bytes (32+8+8), no intent byte");
        // first 32 bytes are the raw vault_id (no length prefix for [u8;32])
        assert_eq!(&msg[0..32], &vault_id);
    }

}
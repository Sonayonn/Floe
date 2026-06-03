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
}

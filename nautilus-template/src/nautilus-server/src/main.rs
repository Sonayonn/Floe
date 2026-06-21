// Copyright (c), Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

use anyhow::Result;
use axum::{extract::State, routing::get, routing::post, Router};
use fastcrypto::{ed25519::Ed25519KeyPair, traits::KeyPair};
use nautilus_server::app::process_data;
#[cfg(feature = "floe-nav")]
use nautilus_server::app::sign_heartbeat;
#[cfg(feature = "floe-nav")]
use nautilus_server::app::sign_vol;
#[cfg(feature = "floe-nav")]
use nautilus_server::app::sign_risk;
#[cfg(feature = "floe-nav")]
use nautilus_server::app::sign_collateral;
use nautilus_server::common::{get_attestation, health_check};
use nautilus_server::AppState;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tracing::info;

#[tokio::main]
async fn main() -> Result<()> {
    // floe-nav: recover a STABLE signing key sealed under KMS (same pubkey across reboots → no on-chain
    // churn) ONLY when KMS is configured (FLOE_KMS_KEY_ID set). Without KMS — or to sidestep it for a
    // manually-attested demo — fall back to an EPHEMERAL per-boot key: attest-all re-registers it on
    // every vault each boot, so the chain trusts it with no sealing. Other builds always go ephemeral.
    #[cfg(feature = "floe-nav")]
    let (eph_kp, sealed_ciphertext) = if std::env::var("FLOE_KMS_KEY_ID").is_ok() {
        nautilus_server::sealed_key::load_or_init().await?
    } else {
        tracing::warn!("floe-nav: FLOE_KMS_KEY_ID unset → EPHEMERAL signing key (re-run attest-all after each boot)");
        (Ed25519KeyPair::generate(&mut rand::thread_rng()), None)
    };
    #[cfg(not(feature = "floe-nav"))]
    let eph_kp = Ed25519KeyPair::generate(&mut rand::thread_rng());
    #[cfg(not(feature = "floe-nav"))]
    let sealed_ciphertext: Option<String> = None;

    // This API_KEY value can be stored with secret-manager. To do that, follow the prompt `sh configure_enclave.sh`
    // Answer `y` to `Do you want to use a secret?` and finish. Otherwise, uncomment this code to use a hardcoded value.
    // let api_key = "045a27812dbe456392913223221306".to_string();
    #[cfg(not(any(feature = "seal-example", feature = "floe-nav")))]
    let api_key = std::env::var("API_KEY").expect("API_KEY must be set");

    // NOTE: if built with `seal-example` flag the `process_data` does not use this api_key from AppState, instead
    // it uses SEAL_API_KEY initialized with two phase bootstrap. Modify this as needed for your application.
    #[cfg(any(feature = "seal-example", feature = "floe-nav"))]
    let api_key = String::new();

    let state = Arc::new(AppState { eph_kp, api_key, sealed_ciphertext });

    // Spawn host-only init server if seal-example feature is enabled
    #[cfg(feature = "seal-example")]
    {
        nautilus_server::app::spawn_host_init_server(state.clone()).await?;
    }

    // Define your own restricted CORS policy here if needed.
    let cors = CorsLayer::new().allow_methods(Any).allow_headers(Any);

    let app = Router::new()
        .route("/", get(ping))
        .route("/get_attestation", get(get_attestation))
        .route("/process_data", post(process_data))
        .route("/sign_heartbeat", post(sign_heartbeat))
        .route("/sign_vol", post(sign_vol))
        .route("/sign_risk", post(sign_risk))
        .route("/sign_collateral", post(sign_collateral))
        // floe-nav first-boot capture: the host (enclave-up.sh) fetches the KMS-sealed seed
        // ciphertext here and persists it — production-mode safe, no enclave console/debug. Returns
        // empty on recovery boots. The blob is KMS-encrypted (only this PCR0 can decrypt), so it is
        // safe to expose on the on-box vsock channel.
        .route("/sealed_ciphertext", get(get_sealed_ciphertext))
        .route("/health_check", get(health_check))
        .with_state(state)
        .layer(cors);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await?;
    info!("listening on {}", listener.local_addr().unwrap());
    axum::serve(listener, app.into_make_service())
        .await
        .map_err(|e| anyhow::anyhow!("Server error: {e}"))
}

async fn ping() -> &'static str {
    "Pong!"
}

/// First-boot capture: return the KMS-sealed seed ciphertext (empty on recovery boots). enclave-up.sh
/// polls this on the on-box vsock:3000 and persists the value so the next boot recovers the same key —
/// no enclave console/debug mode needed.
async fn get_sealed_ciphertext(State(state): State<Arc<AppState>>) -> String {
    state.sealed_ciphertext.clone().unwrap_or_default()
}

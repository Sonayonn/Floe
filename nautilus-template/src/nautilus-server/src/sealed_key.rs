// Floe — STABLE enclave signing key via KMS envelope sealing.
//
// DRAFT (floe-nav). NOT compile-tested here (needs the enclave toolchain + a real KMS key). It uses the
// AWS-standard `kmstool_enclave_cli` for the attestation-gated KMS calls — far safer than hand-rolling
// KMS-over-vsock TLS + SigV4 + CMS-recipient decryption in Rust.
//
// WHY: today main.rs does `Ed25519KeyPair::generate(rng)` — a NEW random key every boot, so the on-chain
// Enclave<FLOE_NAV> object + per-vault attesters churn on every restart. This makes the key STABLE:
//   • first boot ever : generate a 32-byte seed IN the enclave → KMS-Encrypt it → emit the ciphertext for
//                       the host to persist (the seed itself never leaves the enclave in plaintext).
//   • every later boot: host hands the ciphertext back → KMS-Decrypt (gated by PCR0 via the attestation
//                       doc) → same seed → same keypair → same pubkey forever.
//
// The ciphertext blob is passed host↔enclave over the existing vsock bootstrap (see scripts/boot/enclave-up.sh
// and run.sh): the host writes it to SEALED_BLOB_PATH inside the enclave before this runs; on first boot we
// write the new ciphertext there for the host to read back and persist to /etc/floe/enclave-sealed-key.json.
//
// REQUIRES in the .eif: the `kmstool_enclave_cli` binary (aws/aws-nitro-enclaves-sdk-c) + a vsock-proxy on
// the parent to the regional KMS endpoint (enclave-up.sh starts it on port 8101).
//
// ENV (set in the enclave's run.sh):
//   FLOE_KMS_KEY_ID   the KMS key ARN/id whose policy releases Decrypt only to our PCR0
//   AWS_REGION        e.g. us-east-1  (MUST match the EC2 instance / KMS / Secrets Manager region)
//   FLOE_KMS_PROXY_PORT  vsock-proxy port the enclave reaches KMS on (default 8101)

use anyhow::{anyhow, Context, Result};
use fastcrypto::ed25519::{Ed25519KeyPair, Ed25519PrivateKey};
use fastcrypto::traits::{KeyPair, ToFromBytes};
use std::path::Path;
use std::process::Stdio;
use tokio::process::Command;

const SEALED_BLOB_PATH: &str = "/sealed_key.b64"; // host writes the ciphertext here pre-launch; we read-back on 1st boot
const KMSTOOL: &str = "/usr/bin/kmstool_enclave_cli";

/// Recover the stable keypair: decrypt the sealed seed if present, else mint + seal on first boot.
pub async fn load_or_init() -> Result<Ed25519KeyPair> {
    let key_id = std::env::var("FLOE_KMS_KEY_ID").context("FLOE_KMS_KEY_ID must be set for floe-nav")?;
    let region = std::env::var("AWS_REGION").unwrap_or_else(|_| "us-east-1".to_string());

    if Path::new(SEALED_BLOB_PATH).exists() {
        let ciphertext_b64 = tokio::fs::read_to_string(SEALED_BLOB_PATH).await?;
        let seed = kms_decrypt(&key_id, &region, ciphertext_b64.trim()).await
            .context("KMS decrypt of sealed enclave seed failed (check PCR0 key policy + vsock-proxy)")?;
        tracing::info!("sealed_key: recovered stable signing key from KMS");
        keypair_from_seed(&seed)
    } else {
        // First boot ever: mint a fresh 32-byte seed, seal it under KMS, persist the ciphertext.
        let mut seed = [0u8; 32];
        use rand::RngCore;
        rand::thread_rng().fill_bytes(&mut seed);
        let ciphertext_b64 = kms_encrypt(&key_id, &region, &seed).await
            .context("KMS encrypt of new enclave seed failed")?;
        tokio::fs::write(SEALED_BLOB_PATH, &ciphertext_b64).await?; // host reads back + persists to disk
        tracing::warn!("sealed_key: FIRST BOOT — new stable key sealed; operator must persist {SEALED_BLOB_PATH}");
        keypair_from_seed(&seed)
    }
}

fn keypair_from_seed(seed: &[u8]) -> Result<Ed25519KeyPair> {
    let sk = Ed25519PrivateKey::from_bytes(seed).map_err(|e| anyhow!("bad seed: {e}"))?;
    Ok(Ed25519KeyPair::from(sk))
}

/// Attestation-gated decrypt. kmstool builds the NSM attestation doc (embedding our ephemeral pubkey),
/// calls KMS Decrypt with it as Recipient, and returns the plaintext (KMS encrypted it to our key).
async fn kms_decrypt(key_id: &str, region: &str, ciphertext_b64: &str) -> Result<Vec<u8>> {
    let proxy_port = std::env::var("FLOE_KMS_PROXY_PORT").unwrap_or_else(|_| "8101".to_string());
    let out = Command::new(KMSTOOL)
        .args([
            "decrypt",
            "--region", region,
            "--proxy-port", &proxy_port,
            "--key-id", key_id,
            "--ciphertext", ciphertext_b64,
        ])
        .stdout(Stdio::piped())
        .output().await.context("spawning kmstool_enclave_cli decrypt")?;
    if !out.status.success() {
        return Err(anyhow!("kmstool decrypt: {}", String::from_utf8_lossy(&out.stderr)));
    }
    // kmstool prints `PLAINTEXT: <base64>`; take the base64 and decode to the raw 32-byte seed.
    let s = String::from_utf8(out.stdout)?;
    let b64 = s.rsplit("PLAINTEXT:").next().unwrap_or("").trim();
    base64_decode(b64)
}

/// Encrypt the seed under KMS (no attestation needed for encrypt). Returns base64 ciphertext.
async fn kms_encrypt(key_id: &str, region: &str, seed: &[u8]) -> Result<String> {
    let proxy_port = std::env::var("FLOE_KMS_PROXY_PORT").unwrap_or_else(|_| "8101".to_string());
    let out = Command::new(KMSTOOL)
        .args([
            "encrypt",
            "--region", region,
            "--proxy-port", &proxy_port,
            "--key-id", key_id,
            "--plaintext", &base64_encode(seed),
        ])
        .stdout(Stdio::piped())
        .output().await.context("spawning kmstool_enclave_cli encrypt")?;
    if !out.status.success() {
        return Err(anyhow!("kmstool encrypt: {}", String::from_utf8_lossy(&out.stderr)));
    }
    let s = String::from_utf8(out.stdout)?;
    Ok(s.rsplit("CIPHERTEXT:").next().unwrap_or("").trim().to_string())
}

// Minimal base64 (avoid a new dep; swap for the `base64` crate if preferred).
fn base64_encode(b: &[u8]) -> String { fastcrypto::encoding::Base64::encode(b) }
fn base64_decode(s: &str) -> Result<Vec<u8>> {
    use fastcrypto::encoding::{Base64, Encoding};
    Base64::decode(s).map_err(|e| anyhow!("base64: {e}"))
}

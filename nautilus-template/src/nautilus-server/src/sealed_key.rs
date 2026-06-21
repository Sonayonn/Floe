// Floe — STABLE enclave signing key via KMS, using the real `kmstool_enclave_cli`.
//
// WHY: a vanilla nautilus enclave does `Ed25519KeyPair::generate(rng)` — a NEW random key every boot, so
// the on-chain Enclave<FLOE_NAV> object + per-vault attesters churn on every restart. This makes the key
// STABLE so restarts are no-ops on-chain:
//   • first boot ever : ask KMS (via kmstool `genkey`, attestation-gated by PCR0) for a 32-byte AES-256 data
//                        key. KMS returns the PLAINTEXT seed (encrypted to our NSM ephemeral key, kmstool
//                        decrypts it inside the enclave) AND its CIPHERTEXT. We use the plaintext as the
//                        ed25519 seed and emit the ciphertext for the host to persist — the seed itself
//                        never leaves the enclave.
//   • every later boot: host hands the ciphertext back in FLOE_SEALED_CIPHERTEXT → kmstool `decrypt`
//                        (again PCR0-gated) → same 32 bytes → same keypair → same pubkey forever.
//
// kmstool_enclave_cli (aws/aws-nitro-enclaves-sdk-c) is DECRYPT-only for arbitrary ciphertext — there is no
// `encrypt` subcommand — which is exactly why first boot uses `genkey` (KMS GenerateDataKey) rather than
// minting a seed locally and trying to encrypt it. Confirmed subcommands/flags/output:
//   genkey  --region R --proxy-port P --aws-access-key-id .. --aws-secret-access-key .. --aws-session-token ..
//           --key-id KEY --key-spec AES-256                         → stdout: "CIPHERTEXT: <b64>\nPLAINTEXT: <b64>"
//   decrypt --region R --proxy-port P --aws-access-key-id .. --aws-secret-access-key .. --aws-session-token ..
//           --ciphertext <b64>                                       → stdout: "PLAINTEXT: <b64>"
// (decrypt omits --key-id for a symmetric CMK — the key id is embedded in the ciphertext, so we avoid the
//  paired --encryption-algorithm requirement.)
//
// REQUIRES in the .eif: the `kmstool_enclave_cli` binary at /usr/bin/kmstool_enclave_cli (baked by the
// Containerfile) + a vsock-proxy on the parent to the regional KMS endpoint (enclave-up.sh starts it on 8101).
//
// ENV (handed in over vsock:7777 by enclave-up.sh, exported by run.sh):
//   FLOE_KMS_KEY_ID         KMS key ARN/id whose policy releases GenerateDataKey/Decrypt only to our PCR0
//   AWS_REGION              e.g. us-east-1  (MUST match the EC2 instance / KMS region)
//   AWS_ACCESS_KEY_ID       \
//   AWS_SECRET_ACCESS_KEY    > short-lived instance-role creds (the enclave has no IMDS of its own)
//   AWS_SESSION_TOKEN       /
//   FLOE_SEALED_CIPHERTEXT  base64 sealed seed; ABSENT/empty ⇒ first boot ⇒ genkey + emit a new one
//   FLOE_KMS_PROXY_PORT     vsock-proxy port to KMS (default 8101, matches enclave-up.sh)

use anyhow::{anyhow, Context, Result};
use fastcrypto::ed25519::{Ed25519KeyPair, Ed25519PrivateKey};
use fastcrypto::traits::ToFromBytes;
use std::process::Stdio;
use tokio::process::Command;

const KMSTOOL: &str = "/usr/bin/kmstool_enclave_cli";

/// Recover the stable keypair: decrypt the sealed seed if the host handed one in, else mint + seal on
/// first boot and emit the ciphertext for the operator to persist.
pub async fn load_or_init() -> Result<Ed25519KeyPair> {
    let key_id = std::env::var("FLOE_KMS_KEY_ID").context("FLOE_KMS_KEY_ID must be set for floe-nav")?;
    let region = std::env::var("AWS_REGION").unwrap_or_else(|_| "us-east-1".to_string());
    let creds = AwsCreds::from_env().context("AWS instance-role creds must be passed into the enclave")?;

    let sealed = std::env::var("FLOE_SEALED_CIPHERTEXT").unwrap_or_default();
    let sealed = sealed.trim();

    if !sealed.is_empty() {
        let seed = kms_decrypt(&key_id, &region, &creds, sealed).await
            .context("kmstool decrypt of sealed enclave seed failed (check PCR0 key policy + vsock-proxy + creds)")?;
        tracing::info!("sealed_key: recovered stable signing key from KMS ({} bytes)", seed.len());
        keypair_from_seed(&seed)
    } else {
        // First boot ever: KMS GenerateDataKey gives us a fresh 32-byte seed AND its ciphertext.
        let (ciphertext_b64, seed) = kms_genkey(&key_id, &region, &creds).await
            .context("kmstool genkey of new enclave seed failed")?;
        // The ONLY copy of the ciphertext leaves here. The operator must persist it to
        // /etc/floe/enclave-sealed-key.json so enclave-up.sh hands it back as FLOE_SEALED_CIPHERTEXT next boot.
        tracing::warn!("sealed_key: FIRST BOOT — new stable key sealed. Persist this ciphertext on the host:");
        tracing::warn!("FLOE_SEALED_CIPHERTEXT={ciphertext_b64}");
        keypair_from_seed(&seed)
    }
}

struct AwsCreds {
    access_key_id: String,
    secret_access_key: String,
    session_token: String,
}

impl AwsCreds {
    fn from_env() -> Result<Self> {
        Ok(Self {
            access_key_id: std::env::var("AWS_ACCESS_KEY_ID").context("AWS_ACCESS_KEY_ID")?,
            secret_access_key: std::env::var("AWS_SECRET_ACCESS_KEY").context("AWS_SECRET_ACCESS_KEY")?,
            // Instance-role creds are always temporary, so a session token is expected.
            session_token: std::env::var("AWS_SESSION_TOKEN").context("AWS_SESSION_TOKEN")?,
        })
    }
    /// The credential flags shared by every kmstool subcommand.
    fn args(&self) -> Vec<String> {
        vec![
            "--aws-access-key-id".into(), self.access_key_id.clone(),
            "--aws-secret-access-key".into(), self.secret_access_key.clone(),
            "--aws-session-token".into(), self.session_token.clone(),
        ]
    }
}

fn proxy_port() -> String {
    std::env::var("FLOE_KMS_PROXY_PORT").unwrap_or_else(|_| "8101".to_string())
}

fn keypair_from_seed(seed: &[u8]) -> Result<Ed25519KeyPair> {
    if seed.len() != 32 {
        return Err(anyhow!("expected a 32-byte seed, got {}", seed.len()));
    }
    let sk = Ed25519PrivateKey::from_bytes(seed).map_err(|e| anyhow!("bad seed: {e}"))?;
    Ok(Ed25519KeyPair::from(sk))
}

/// First boot: KMS GenerateDataKey via kmstool `genkey`. Returns (ciphertext_b64, plaintext_seed_32B).
async fn kms_genkey(key_id: &str, region: &str, creds: &AwsCreds) -> Result<(String, Vec<u8>)> {
    let mut args: Vec<String> = vec!["genkey".into(), "--region".into(), region.into(),
        "--proxy-port".into(), proxy_port()];
    args.extend(creds.args());
    args.extend(["--key-id".into(), key_id.into(), "--key-spec".into(), "AES-256".into()]);
    let out = run_kmstool(&args).await?;
    let ciphertext_b64 = parse_field(&out, "CIPHERTEXT:")
        .ok_or_else(|| anyhow!("kmstool genkey: no CIPHERTEXT in output"))?;
    let plaintext_b64 = parse_field(&out, "PLAINTEXT:")
        .ok_or_else(|| anyhow!("kmstool genkey: no PLAINTEXT in output"))?;
    let seed = base64_decode(&plaintext_b64)?;
    Ok((ciphertext_b64, seed))
}

/// Later boots: attestation-gated decrypt of the persisted ciphertext. Returns the 32-byte seed.
async fn kms_decrypt(_key_id: &str, region: &str, creds: &AwsCreds, ciphertext_b64: &str) -> Result<Vec<u8>> {
    let mut args: Vec<String> = vec!["decrypt".into(), "--region".into(), region.into(),
        "--proxy-port".into(), proxy_port()];
    args.extend(creds.args());
    // Symmetric CMK: the key id is embedded in the ciphertext, so we omit --key-id (and thus the paired
    // --encryption-algorithm requirement). _key_id is kept in the signature for documentation/symmetry.
    args.extend(["--ciphertext".into(), ciphertext_b64.into()]);
    let out = run_kmstool(&args).await?;
    let plaintext_b64 = parse_field(&out, "PLAINTEXT:")
        .ok_or_else(|| anyhow!("kmstool decrypt: no PLAINTEXT in output"))?;
    base64_decode(&plaintext_b64)
}

async fn run_kmstool(args: &[String]) -> Result<String> {
    let out = Command::new(KMSTOOL)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output().await
        .with_context(|| format!("spawning {KMSTOOL} (is it baked into the .eif?)"))?;
    if !out.status.success() {
        return Err(anyhow!("kmstool {:?} failed: {}", args.first(), String::from_utf8_lossy(&out.stderr)));
    }
    Ok(String::from_utf8(out.stdout)?)
}

/// Pull the base64 value following a `PREFIX:` token, scanning line by line (output may interleave both
/// CIPHERTEXT: and PLAINTEXT: lines, in either order).
fn parse_field(stdout: &str, prefix: &str) -> Option<String> {
    for line in stdout.lines() {
        let line = line.trim();
        if let Some(rest) = line.strip_prefix(prefix) {
            return Some(rest.trim().to_string());
        }
    }
    None
}

fn base64_decode(s: &str) -> Result<Vec<u8>> {
    use fastcrypto::encoding::{Base64, Encoding};
    Base64::decode(s.trim()).map_err(|e| anyhow!("base64: {e}"))
}

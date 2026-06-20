# Floe boot automation — "restart the instance, attestation just happens"

Goal: you stop the EC2 instance to save billing; when you **Start** it again (AWS console), the enclave
relaunches and attestation resumes **automatically**, with **zero on-chain churn** and **no redeploy**.

## Why this works with a deployed frontend (e.g. www.floe.network) and no Elastic IP

The browser never talks to the enclave. The keeper signs **inside** the enclave (localhost/vsock) and
**pushes attested values on-chain**; the frontend reads + verifies them **from chain**. So:
- `www.floe.network` → Sui RPC (chain reads) + wallet (txs). Never the enclave.
- keeper (on the box) → enclave (localhost) + Sui RPC (outbound). Never inbound.

⇒ The enclave needs no public IP/DNS. A changing instance IP is irrelevant → **no Elastic IP, no cost
while stopped.** Caveat: while the box is *stopped*, the heartbeat pauses, so PLP-holding vaults' attested
NAV goes stale after 600s (`degraded-stale`: deposits pause, withdrawals still pay the floor; idle/lend/
settled vaults are unaffected). The site still renders the last on-chain state. A restart restores
freshness within one boot.

## The core piece: a STABLE, KMS-sealed enclave key

Today the enclave generates a **random** key every boot (`nautilus-server/src/main.rs:24`,
`Ed25519KeyPair::generate(&mut rand::thread_rng())`), and `enclave::register_enclave` creates a **new**
shared `Enclave<FLOE_NAV>` object each time. That means every reboot changes the pubkey AND the object id
— forcing a `constants.nav.enclave` change + web redeploy. Unacceptable for "just restart".

Fix: the enclave self-generates its key ONCE, **seals it under AWS KMS bound to its PCR0**, and on every
later boot **decrypts it back** — so the pubkey is stable forever and the key never leaves the enclave.

### Enclave change (`src/nautilus-server/src/main.rs`, floe-nav build)
Replace the unconditional random generate with seal/unseal:

```rust
// was: let eph_kp = Ed25519KeyPair::generate(&mut rand::thread_rng());
let eph_kp = match read_sealed_seed_over_vsock(7777) {            // blob handed in by enclave-up.sh
    Some(ciphertext) => {
        let seed = kms_decrypt_with_attestation(&ciphertext)?;     // KMS Decrypt, RecipientInfo = our att doc
        Ed25519KeyPair::from_seed(&seed)                           // deterministic → STABLE pubkey
    }
    None => {                                                      // first-ever boot: mint + seal
        let kp = Ed25519KeyPair::generate(&mut rand::thread_rng());
        let ct = kms_encrypt(kp.seed())?;                          // store ct in /etc/floe/enclave-sealed-key.json
        eprintln!("SEALED_KEY_CIPHERTEXT={}", base64(ct));         // operator copies this to the parent once
        kp
    }
};
```
- `kms_decrypt_with_attestation` calls KMS `Decrypt` over the vsock proxy (port 8101, started by
  `enclave-up.sh`) with the enclave's attestation document as `Recipient` — KMS returns the plaintext
  encrypted to the enclave's ephemeral public key, so only this PCR0 can read it.
- Needs crates: `aws-nitro-enclaves-nsm-api` (attestation), `aws-sdk-kms` (or raw KMS over the proxy).

### AWS setup (one-time, your hands)
1. **KMS key** (symmetric). Key policy: allow `kms:Decrypt`/`kms:Encrypt` to the instance role **only when**
   `kms:RecipientAttestation:PCR0` equals the enclave's PCR0. (This is the lock — only the right enclave decrypts.)
2. **Instance IAM role** with that KMS permission, attached to the EC2 instance.
3. The sealed ciphertext blob → `/etc/floe/enclave-sealed-key.json` on the parent (printed once on first boot).

## One-time re-anchor (after the stable key is live)
The new `.eif` has a new PCR0 and the stable key a new pubkey, so re-anchor ONCE:
1. Build the new `.eif`; note its PCR0.
2. `enclave::update_pcrs(config, cap, pcr0, pcr1, pcr2)` → bump the EnclaveConfig to the new PCR0.
3. `EXECUTE=1 npx tsx scripts/refresh-enclave.ts` → registers the stable `Enclave<FLOE_NAV>`; copy the new id.
4. Bump `constants.ts`: `nav.pcr0` = new PCR0, `nav.enclave` = new id. Rebuild/redeploy the web ONCE.
5. `npx tsx scripts/attest-all.ts` → re-register the stable pubkey on the 5 vaults.
After this, the pubkey + object id never change again → restarts are pure no-ops on-chain.

## AWS region + environment variables (confirmed)

**Region: `us-east-1`** — this is the default the harness expects, and what you should use for the KMS key,
Secrets Manager, and the EC2 instance (they must all be in the SAME region). It's set in three places, all
defaulting to `us-east-1`: `configure_enclave.sh` (AMI `ami-085ad6ae776d8f09c` is us-east-1), `enclave-up.sh`
(`Environment=AWS_REGION=us-east-1` in `floe-enclave.service`), and `sealed_key.rs` (`AWS_REGION` fallback).
To use another region, change all three + supply a Nitro-capable AMI for that region.

### `/etc/floe/keeper.env` — read by `boot-keeper.sh` (the on-box keeper). 0640, root:ec2-user.
```ini
SUI_PRIVATE_KEY=suiprivkey1...      # operator key: holds OwnerCap/ExecCap for the founder-held vaults ONLY (not treasury)
FLOE_ENCLAVE_URL=http://localhost:3000   # on-box socat proxy → enclave (NOT the public IP)
FLOE_PCR0=b4d532247e4750b239...     # the enclave's PCR0 label (matches constants.nav.pcr0 / EnclaveConfig)
```
Also required next to the scripts (gitignored — provision out-of-band): **`packages/sdk/scripts/.fresh-deployer.key`**
(line `secretKey=suiprivkey1...`). `attest-all` touches all 5 vaults and 2 (Range Ladder, Delta-Hedged) are
held by the "fresh" deployer, so the keeper needs both keys. (Production: consolidate all caps under one
operator key and drop the fresh file.)

### Enclave-side env (set in the enclave's `run.sh`, consumed by `sealed_key.rs`)
```ini
FLOE_KMS_KEY_ID=arn:aws:kms:us-east-1:<acct>:key/<id>   # policy releases Decrypt only to our PCR0
AWS_REGION=us-east-1
FLOE_KMS_PROXY_PORT=8101                                # vsock-proxy port enclave-up.sh starts to KMS
```

## Install the boot services (on the instance)
```bash
sudo cp /opt/floe/packages/sdk/scripts/boot/floe-enclave.service /etc/systemd/system/
sudo cp /opt/floe/packages/sdk/scripts/boot/floe-keeper.service  /etc/systemd/system/
sudo install -m0640 -g ec2-user /your/keeper.env /etc/floe/keeper.env   # SUI_PRIVATE_KEY(operator), FLOE_PCR0, FLOE_ENCLAVE_URL=http://localhost:3000
sudo systemctl daemon-reload
sudo systemctl enable --now floe-enclave.service floe-keeper.service
```
Adjust paths/region/CID/User in the unit files + `enclave-up.sh` to your box.

## Keys / standards
The keeper's `SUI_PRIVATE_KEY` is a **dedicated operator key holding only OwnerCap/ExecCap authority**
(Floe's cap model separates attestation from fund movement) — never a treasury key. Keep it in Secrets
Manager or a `0640` root-owned `/etc/floe/keeper.env`.

## Day-to-day
Stop the instance to save cost. **Start** it from the console → `floe-enclave` relaunches the enclave
(stable key) → `floe-keeper` waits, re-attests once, then heartbeats. No terminal, no redeploy.

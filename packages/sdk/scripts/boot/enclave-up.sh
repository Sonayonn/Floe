#!/usr/bin/env bash
# Launch the Floe Nitro enclave + expose it on-box. Invoked by floe-enclave.service on boot.
# Mirrors nautilus-template/{configure,expose}_enclave.sh but as a boot-time service, and provisions
# the KMS-sealed identity (so the enclave's signing key is STABLE across reboots — see README).
#
# vsock:7777 carries ONE JSON blob that run.sh turns into env vars (its existing contract). We put
# everything sealed_key.rs needs in it: the KMS key id, region, short-lived instance-role creds (the
# enclave has no IMDS of its own), and the persisted sealed ciphertext (empty on first boot). On first
# boot the enclave prints a fresh FLOE_SEALED_CIPHERTEXT to its console; we capture + persist it so the
# NEXT boot recovers the same key — no on-chain churn.
set -euo pipefail

EIF="${FLOE_EIF:-/opt/floe/nautilus-template/out/nitro.eif}"
CID="${FLOE_ENCLAVE_CID:-16}"
CPUS="${FLOE_ENCLAVE_CPUS:-2}"
MEM_MIB="${FLOE_ENCLAVE_MEM:-3072}"
REGION="${AWS_REGION:-us-east-1}"
SEALED="${FLOE_SEALED_KEY:-/etc/floe/enclave-sealed-key.json}"   # {"ciphertext":"<b64>"} — KMS-sealed seed
: "${FLOE_KMS_KEY_ID:?FLOE_KMS_KEY_ID must be set (KMS key ARN whose policy gates Decrypt to our PCR0) — set it in floe-enclave.service}"

# 1) fresh enclave (terminate any stale one first)
nitro-cli terminate-enclave --all 2>/dev/null || true
nitro-cli run-enclave --eif-path "$EIF" --cpu-count "$CPUS" --memory "$MEM_MIB" --enclave-cid "$CID"
DESC=$(nitro-cli describe-enclaves)
ECID=$(echo "$DESC" | jq -r '.[0].EnclaveCID')
EID=$(echo "$DESC" | jq -r '.[0].EnclaveID')
echo "[enclave-up] running, CID=$ECID EnclaveID=$EID"

# 2) KMS proxy so the enclave (no direct Internet) can call kms:GenerateDataKey/Decrypt with its
#    attestation doc. vsock-proxy forwards enclave vsock:8101 -> regional KMS endpoint.
pkill -f 'vsock-proxy 8101' 2>/dev/null || true
vsock-proxy 8101 "kms.${REGION}.amazonaws.com" 443 >/var/log/floe-vsock-kms.log 2>&1 &

# 3) On first boot (no persisted ciphertext yet), capture the one the enclave emits to its console and
#    persist it BEFORE we'd ever reboot. Best-effort background tail; harmless once the file exists.
if [ ! -s "$SEALED" ]; then
  echo "[enclave-up] first boot: watching console for the sealed ciphertext to persist -> $SEALED"
  mkdir -p "$(dirname "$SEALED")"
  (
    nitro-cli console --enclave-id "$EID" 2>/dev/null | while IFS= read -r line; do
      case "$line" in
        *FLOE_SEALED_CIPHERTEXT=*)
          ct="${line#*FLOE_SEALED_CIPHERTEXT=}"
          ct="${ct%$'\r'}"; ct="${ct%% *}"   # strip CR / any trailing field
          jq -n --arg ct "$ct" '{ciphertext:$ct}' > "$SEALED.tmp" && mv "$SEALED.tmp" "$SEALED"
          chmod 600 "$SEALED"
          echo "[enclave-up] captured + persisted sealed ciphertext (${#ct} b64 chars)"
          break ;;
      esac
    done
  ) &
fi

# 4) fetch short-lived instance-role creds (IMDSv2) — kmstool needs them passed in as flags.
IMDS_TOKEN=$(curl -sf -X PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 600" || true)
ROLE=$(curl -sf -H "X-aws-ec2-metadata-token: $IMDS_TOKEN" \
  "http://169.254.169.254/latest/meta-data/iam/security-credentials/" || true)
CREDS=$(curl -sf -H "X-aws-ec2-metadata-token: $IMDS_TOKEN" \
  "http://169.254.169.254/latest/meta-data/iam/security-credentials/${ROLE}" || true)
AKID=$(echo "$CREDS" | jq -r '.AccessKeyId // empty')
SAK=$(echo "$CREDS"  | jq -r '.SecretAccessKey // empty')
STOK=$(echo "$CREDS" | jq -r '.Token // empty')
[ -n "$AKID" ] || echo "[enclave-up] WARN: no instance-role creds from IMDS (role=$ROLE) — kmstool will fail"

# 5) hand the enclave its secrets over vsock:7777 (run.sh parses to env). Empty ciphertext => first boot.
CIPHERTEXT=""
[ -s "$SEALED" ] && CIPHERTEXT=$(jq -r '.ciphertext // empty' "$SEALED")
SECRETS=$(jq -n \
  --arg kid "$FLOE_KMS_KEY_ID" --arg region "$REGION" \
  --arg akid "$AKID" --arg sak "$SAK" --arg stok "$STOK" --arg ct "$CIPHERTEXT" \
  '{FLOE_KMS_KEY_ID:$kid, AWS_REGION:$region, AWS_ACCESS_KEY_ID:$akid, AWS_SECRET_ACCESS_KEY:$sak, AWS_SESSION_TOKEN:$stok, FLOE_SEALED_CIPHERTEXT:$ct}')
sleep 3
printf '%s' "$SECRETS" | socat - "VSOCK-CONNECT:$ECID:7777" || echo "[enclave-up] secrets handoff failed"

# 6) expose enclave HTTP (vsock:3000) as localhost:3000 for the on-box keeper.
pkill -f "VSOCK-CONNECT:.*:3000" 2>/dev/null || true
socat TCP4-LISTEN:3000,reuseaddr,fork "VSOCK-CONNECT:$ECID:3000" &
echo "[enclave-up] exposed on localhost:3000"

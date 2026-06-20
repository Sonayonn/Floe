#!/usr/bin/env bash
# Launch the Floe Nitro enclave + expose it on-box. Invoked by floe-enclave.service on boot.
# Mirrors nautilus-template/{configure,expose}_enclave.sh but as a boot-time service, and provisions
# the KMS-sealed identity (so the enclave's signing key is STABLE across reboots — see README).
set -euo pipefail

EIF="${FLOE_EIF:-/opt/floe/nautilus-template/out/nitro.eif}"
CID="${FLOE_ENCLAVE_CID:-16}"
CPUS="${FLOE_ENCLAVE_CPUS:-2}"
MEM_MIB="${FLOE_ENCLAVE_MEM:-3072}"
SEALED="${FLOE_SEALED_KEY:-/etc/floe/enclave-sealed-key.json}"   # KMS-encrypted seed blob + metadata

# 1) fresh enclave (terminate any stale one first)
nitro-cli terminate-enclave --all 2>/dev/null || true
nitro-cli run-enclave --eif-path "$EIF" --cpu-count "$CPUS" --memory "$MEM_MIB" --enclave-cid "$CID"
ECID=$(nitro-cli describe-enclaves | jq -r '.[0].EnclaveCID')
echo "[enclave-up] running, CID=$ECID"

# 2) KMS proxy so the enclave (no direct Internet) can call kms:Decrypt with its attestation doc.
#    vsock-proxy forwards enclave vsock:8101 -> KMS endpoint. Requires nitro-cli's vsock-proxy.
pkill -f 'vsock-proxy 8101' 2>/dev/null || true
vsock-proxy 8101 "kms.${AWS_REGION:-us-east-1}.amazonaws.com" 443 >/var/log/floe-vsock-kms.log 2>&1 &

# 3) hand the enclave its SEALED key blob over vsock:7777. The enclave calls KMS Decrypt
#    (attestation-gated by PCR0) to recover its stable signing seed — the key never leaves the enclave.
sleep 3
cat "$SEALED" | socat - "VSOCK-CONNECT:$ECID:7777" || echo "[enclave-up] sealed-key handoff failed"

# 4) expose enclave HTTP (vsock:3000) as localhost:3000 for the on-box keeper.
pkill -f "VSOCK-CONNECT:.*:3000" 2>/dev/null || true
socat TCP4-LISTEN:3000,reuseaddr,fork "VSOCK-CONNECT:$ECID:3000" &
echo "[enclave-up] exposed on localhost:3000"

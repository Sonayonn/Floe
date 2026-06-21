#!/usr/bin/env bash
# Launch the Floe Nitro enclave with an EPHEMERAL per-boot signing key (NO KMS sealing) and expose it on
# TCP 0.0.0.0:3000 so your laptop can attest it. Pairs with the floe-nav ephemeral fallback in main.rs
# (taken whenever FLOE_KMS_KEY_ID is unset). The enclave's run.sh still BLOCKS on the vsock:7777 secrets
# handoff, so we send an EMPTY blob to unblock it — with no FLOE_KMS_KEY_ID the enclave generates a fresh
# key each boot. Re-run attest-all.ts from your laptop after every (re)launch (the key changes per boot).
#
#   Usage:  sudo packages/sdk/scripts/boot/enclave-up-ephemeral.sh
#   Then (laptop): FLOE_ENCLAVE_URL=http://<this-box-public-ip>:3000 npx tsx scripts/attest-all.ts
set -euo pipefail

EIF="${FLOE_EIF:-/opt/floe/nautilus-template/out/nitro.eif}"
CID="${FLOE_ENCLAVE_CID:-16}"
CPUS="${FLOE_ENCLAVE_CPUS:-2}"
MEM_MIB="${FLOE_ENCLAVE_MEM:-3072}"

[ -s "$EIF" ] || { echo "[enclave-up] no .eif at $EIF — build it first: (cd nautilus-template && make ENCLAVE_APP=floe-nav)"; exit 1; }

# 1) fresh enclave (terminate any stale one first)
nitro-cli terminate-enclave --all 2>/dev/null || true
nitro-cli run-enclave --eif-path "$EIF" --cpu-count "$CPUS" --memory "$MEM_MIB" --enclave-cid "$CID"
ECID=$(nitro-cli describe-enclaves | jq -r '.[0].EnclaveCID')
echo "[enclave-up] running, CID=$ECID"

# 2) unblock run.sh's vsock:7777 wait with an EMPTY secrets blob (no FLOE_KMS_KEY_ID => ephemeral key).
sleep 3
printf '%s' '{}' | socat - "VSOCK-CONNECT:$ECID:7777" || echo "[enclave-up] WARN: secrets handoff failed"

# 3) expose enclave HTTP (vsock:3000) on TCP 0.0.0.0:3000 — laptop + on-box. Open the SG to your IP.
pkill -f "VSOCK-CONNECT:.*:3000" 2>/dev/null || true
socat TCP4-LISTEN:3000,reuseaddr,fork "VSOCK-CONNECT:$ECID:3000" &
echo "[enclave-up] exposed on 0.0.0.0:3000"

# 4) health
for _ in $(seq 1 20); do
  if curl -fsS -m 5 http://localhost:3000/health_check >/dev/null 2>&1; then
    echo "[enclave-up]   ✓ enclave UP on :3000"; exit 0
  fi
  sleep 3
done
echo "[enclave-up]   ✗ not serving — inspect: nitro-cli console --enclave-id \$(nitro-cli describe-enclaves | jq -r '.[0].EnclaveID')"
exit 1

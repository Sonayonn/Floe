#!/usr/bin/env bash
# Floe keeper — boot entrypoint, runs ON the EC2 parent (co-located with the Nitro enclave).
# Waits for the local enclave, re-attests once, then runs the heartbeat loop forever (systemd keeps
# it alive). With a STABLE (KMS-sealed) enclave key, the on-chain Enclave<FLOE_NAV> object and the
# per-vault attesters don't change across reboots, so this is idempotent — no constants churn.
#
# Env (from /etc/floe/keeper.env — load via Secrets Manager or a 0600 root-owned file):
#   SUI_PRIVATE_KEY     operator key (OwnerCap/ExecCap authority only — NOT a treasury key)
#   FLOE_ENCLAVE_URL    http://localhost:3000   (on-box socat proxy → enclave vsock)
#   FLOE_PCR0           the enclave's PCR0 label
set -euo pipefail

REPO="${FLOE_REPO:-/opt/floe}"
ENV_FILE="${FLOE_KEEPER_ENV:-/etc/floe/keeper.env}"
cd "$REPO/packages/sdk"
set -a; . "$ENV_FILE"; set +a
: "${FLOE_ENCLAVE_URL:=http://localhost:3000}"

echo "[boot-keeper] waiting for enclave at $FLOE_ENCLAVE_URL ..."
for _ in $(seq 1 60); do
  if curl -sf -m 5 "$FLOE_ENCLAVE_URL/get_attestation" >/dev/null 2>&1; then echo "[boot-keeper] enclave up"; break; fi
  sleep 3
done

# One-shot: refresh per-vault attesters + push fresh NAV + vol snapshot. Tolerate transient failure.
# NOTE: if PCR0 or the enclave key ever changes (e.g. a new .eif), run refresh-enclave.ts manually
# and re-point constants.nav.enclave — a stable KMS-sealed key is exactly what makes that "never".
npx tsx scripts/attest-all.ts || echo "[boot-keeper] attest-all failed — continuing to heartbeat"

# Long-running: keep PLP-holding vaults fresh within the 600s window. systemd restarts on exit.
exec npx tsx scripts/heartbeat.ts

#!/usr/bin/env bash
# One-time enclave re-anchor, fully sequenced. Run AFTER rebuilding the .eif (new PCR0) the first time
# the stable KMS-sealed key is introduced (or any time the enclave binary / key changes). Idempotent
# steps; pauses between the on-chain registration and the source edit so you can update constants.ts +
# redeploy the web, then continue. See scripts/boot/README.md.
#
#   set -a; . ../../scripts/.env; set +a
#   PCR0=<hex from `nitro-cli describe-eif`> [PCR1=<hex>] [PCR2=<hex>] \
#   FLOE_ENCLAVE_URL=http://localhost:3000 ./scripts/boot/re-anchor.sh
set -euo pipefail

: "${PCR0:?PCR0 required — the new PCR0 hex from the rebuilt .eif build log}"
: "${SUI_PRIVATE_KEY:?SUI_PRIVATE_KEY required (operator key)}"
: "${FLOE_ENCLAVE_URL:?FLOE_ENCLAVE_URL required (e.g. http://localhost:3000) — refresh-enclave + attest-all need it}"

SDK="$(cd "$(dirname "$0")/../.." && pwd)"   # packages/sdk
cd "$SDK"

echo "== [1/4] update-pcrs (EXECUTE) — re-anchor EnclaveConfig to the rebuilt .eif =="
PCR0="$PCR0" PCR1="${PCR1:-}" PCR2="${PCR2:-}" EXECUTE=1 npx tsx scripts/boot/update-pcrs.ts

echo ""
echo "== [2/4] refresh-enclave (EXECUTE) — register the new Enclave<FLOE_NAV> object =="
EXECUTE=1 npx tsx scripts/refresh-enclave.ts

cat <<MSG

== [3/4] MANUAL — edit constants + redeploy web, THEN press ENTER ==
  1) packages/sdk/src/constants.ts  →  nav.pcr0    = "$PCR0"
  2) packages/sdk/src/constants.ts  →  nav.enclave = "<NEW Enclave id printed just above>"
  3) redeploy the web (Vercel/Walrus) so the frontend reads the new enclave id
Press ENTER to continue to attest-all  (Ctrl-C to abort) ...
MSG
read -r _

echo "== [4/4] attest-all (EXECUTE) — re-register the 5 vaults to the new key =="
FLOE_PCR0="$PCR0" npx tsx scripts/attest-all.ts

echo ""
echo "✓ Re-anchor complete. The enclave identity is now fixed — restarts are churn-free from here."

#!/usr/bin/env bash
# Restore on-chain attestation after the enclave (re)boots — the Option-1 runbook.
# Registers the enclave's new ephemeral pubkey + pushes a fresh NAV to every vault (so PLP-holding
# vaults like Stratos pass floe::deposit's freshness check), then loops a heartbeat to keep them fresh.
#
# This is all that's needed to RESTORE DEPOSITS — it's raw-pubkey, so the enclave's PCR0 / build does
# not matter here. (Borrow additionally needs refresh-enclave.ts; run that separately if demoing borrow.)
#
# Usage:  scripts/restore-attestation.sh http://<new-ec2-ip>:3000
set -euo pipefail

URL="${1:?usage: scripts/restore-attestation.sh http://<ec2-ip>:3000}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "→ health check: $URL/health_check"
if curl -fsS --max-time 8 "$URL/health_check" >/dev/null; then
  echo "  ✓ enclave is UP"
else
  echo "  ✗ enclave UNREACHABLE at $URL — start it on the box + open TCP 3000, then retry."
  exit 1
fi

# founder key + RPC for the on-chain txns
set -a; . scripts/.env; set +a

echo "→ attest-all: register new pubkey + push fresh signed NAV to all vaults"
( cd packages/sdk && FLOE_ENCLAVE_URL="$URL" npx tsx scripts/attest-all.ts )

echo "→ point the web app's borrow proxy at the live enclave (.env.local)"
if grep -q '^FLOE_ENCLAVE_URL=' packages/web/.env.local 2>/dev/null; then
  sed -i.bak "s#^FLOE_ENCLAVE_URL=.*#FLOE_ENCLAVE_URL=$URL#" packages/web/.env.local && rm -f packages/web/.env.local.bak
  echo "  ✓ updated packages/web/.env.local (restart next dev / redeploy Vercel to pick it up)"
fi

echo "→ starting heartbeat (keeps PLP vaults fresh; 5-min interval, window is 10 min)"
( cd packages/sdk && FLOE_ENCLAVE_URL="$URL" INTERVAL_MS=300000 nohup npx tsx scripts/heartbeat.ts > /tmp/floe-heartbeat.log 2>&1 & echo "  heartbeat pid $! → tail -f /tmp/floe-heartbeat.log" )

echo ""
echo "✓ Done. PLP vaults (incl. Stratos) should now accept deposits. Keep this heartbeat running through the demo."

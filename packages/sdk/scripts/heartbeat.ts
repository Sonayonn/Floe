/**
 * Keep PLP-holding vaults' attested NAV fresh. Idle vaults (plp_held = 0) are fresh by
 * construction and need no heartbeat, so this only touches vaults actually holding PLP
 * (currently just Floe Stratos). Run as a loop (cron / pm2) AFTER attest-all.ts has
 * registered the current enclave key.
 *
 *   The contract's freshness window is 600s; we refresh every 5 min with a safety margin.
 *
 *   set -a; . ../../scripts/.env; set +a
 *   FLOE_ENCLAVE_URL=http://<ec2-ip>:3000 INTERVAL_MS=300000 node scripts/heartbeat.ts
 */
import { Transaction } from "@mysten/sui/transactions";
import {
  A, DUSDC, clientFor, addrFor, hexBytes, resolveCap, signHeartbeat, readVaultPlp, VAULTS,
} from "./lib-attest.ts";

const INTERVAL_MS = Number(process.env.INTERVAL_MS ?? 300_000);

async function refreshOnce() {
  const ts = new Date().toISOString();
  for (const v of VAULTS) {
    const { plpHeld, plpPrice } = await readVaultPlp(v.vaultId);
    if (plpHeld === 0n) continue; // idle → already fresh, skip
    try {
      const client = clientFor(v.holder);
      const execCap = await resolveCap(client, addrFor(v.holder), "ExecCap", v.vaultId);
      const hb = await signHeartbeat(v.vaultId, plpPrice > 0n ? plpPrice : 1_000_000n, plpHeld);
      const tx = new Transaction();
      tx.moveCall({
        target: `${A.package}::floe::update_nav_attested`, typeArguments: [DUSDC, v.sType],
        arguments: [
          tx.object(v.vaultId), tx.object(execCap),
          tx.pure.u64(BigInt(hb.plp_price)), tx.pure.u64(BigInt(hb.plp_held)), tx.pure.u64(BigInt(hb.timestamp_ms)),
          tx.pure.vector("u8", hexBytes(hb.signature)), tx.object(A.clock),
        ],
      });
      const r = await client.sui.signAndExecuteTransaction({ signer: client.signer!, transaction: tx, options: { showEffects: true } });
      if (r.effects?.status?.status !== "success") throw new Error(r.effects?.status?.error ?? "tx failed");
      console.log(`[${ts}] ${v.name}: refreshed (plp_held ${plpHeld}) ${r.digest}`);
    } catch (e) {
      console.error(`[${ts}] ${v.name}: ${(e as Error).message}`);
    }
  }
}

console.log(`heartbeat loop every ${INTERVAL_MS / 1000}s — refreshing PLP-holding vaults only.`);
await refreshOnce();
setInterval(refreshOnce, INTERVAL_MS);

/**
 * One-shot: re-register the (freshly-booted) enclave key everywhere it's trusted and
 * flip every vault to "verified" — run once each time the enclave is spun up.
 *
 *   For each of the 5 vaults (one PTB, signed by the vault's cap holder):
 *     register_attester(pubkey) → register_enclave(pcr0, sets attested) → update_nav_attested(sig)
 *   Then: lend collateral attester (borrow) + attested vol oracle (vol freshness).
 *
 * Idle vaults (plp_held = 0) are "fresh" by construction, so this single pass makes them
 * verified for good; PLP-holding vaults (Stratos) stay fresh via heartbeat.ts afterward.
 *
 *   set -a; . ../../scripts/.env; set +a
 *   FLOE_ENCLAVE_URL=http://<ec2-ip>:3000 node scripts/attest-all.ts
 */
import { writeFileSync } from "node:fs";
import { Transaction } from "@mysten/sui/transactions";
import { FloeClient, Vol } from "../src/index.ts";
import {
  A, DUSDC, ENCLAVE, PCR0, VAULTS, clientFor, addrFor, floeFounder,
  hexBytes, resolveCap, signHeartbeat, readVaultPlp, type VaultRef,
} from "./lib-attest.ts";

async function exec(client: FloeClient, tx: Transaction, label: string) {
  const r = await client.sui.signAndExecuteTransaction({ signer: client.signer!, transaction: tx, options: { showEffects: true } });
  if (r.effects?.status?.status !== "success") throw new Error(`${label} failed: ${r.effects?.status?.error}`);
  await client.sui.waitForTransaction({ digest: r.digest });
  return r.digest;
}

/** register_attester → register_enclave → update_nav_attested, one atomic PTB per vault. */
async function attestVault(v: VaultRef, pubkey: string): Promise<{ digest: string; plpHeld: bigint }> {
  const client = clientFor(v.holder);
  const owner = addrFor(v.holder);
  const { plpHeld, plpPrice } = await readVaultPlp(v.vaultId);
  const usePrice = plpPrice > 0n ? plpPrice : 1_000_000n; // enclave + contract require plp_price > 0
  const hb = await signHeartbeat(v.vaultId, usePrice, plpHeld);

  const [ownerCap, execCap] = await Promise.all([
    resolveCap(client, owner, "OwnerCap", v.vaultId),
    resolveCap(client, owner, "ExecCap", v.vaultId),
  ]);

  const tx = new Transaction();
  const targs = [DUSDC, v.sType];
  tx.moveCall({ target: `${A.package}::floe::register_attester`, typeArguments: targs,
    arguments: [tx.object(v.vaultId), tx.object(ownerCap), tx.pure.vector("u8", hexBytes(hb.pubkey))] });
  tx.moveCall({ target: `${A.package}::floe::register_enclave`, typeArguments: targs,
    arguments: [tx.object(v.vaultId), tx.object(ownerCap), tx.pure.vector("u8", hexBytes(PCR0))] });
  tx.moveCall({ target: `${A.package}::floe::update_nav_attested`, typeArguments: targs,
    arguments: [
      tx.object(v.vaultId), tx.object(execCap),
      tx.pure.u64(BigInt(hb.plp_price)), tx.pure.u64(BigInt(hb.plp_held)), tx.pure.u64(BigInt(hb.timestamp_ms)),
      tx.pure.vector("u8", hexBytes(hb.signature)), tx.object(A.clock),
    ] });
  const digest = await exec(client, tx, `attest ${v.name}`);
  return { digest, plpHeld };
}

// ── Probe the enclave + capture its current pubkey ──
const probe = await signHeartbeat(VAULTS[0].vaultId, 1_000_000n, 0n);
const pubkey = probe.pubkey;
console.log(`Enclave reachable at ${ENCLAVE} — attester pubkey ${pubkey}`);
console.log(`PCR0 (label): ${PCR0}\n`);

const out: Record<string, string> = {};

// ── 1) Vaults → verified ──
for (const v of VAULTS) {
  process.stdout.write(`▶ ${v.name.padEnd(18)} `);
  const { digest, plpHeld } = await attestVault(v, pubkey);
  out[v.name] = digest;
  console.log(`✓ attested (plp_held ${plpHeld}) ${digest}`);
}

// ── 2) Floe Lend (V2): nothing to register per boot. Collateral valuations verify against the
// on-chain Enclave<FLOE_NAV> object via enclave::verify_signature — refresh that object's key
// instead (scripts/refresh-enclave.ts), which simultaneously serves NAV-proof + lend + vol.

// ── 3) Attested vol oracle (intent 2) — refresh index, sign it, register + submit ──
try {
  await Vol.updateVolIndex(floeFounder); // populate VolIndex.{vol_bps,spot} from the live SVI oracle
  const cur = await Vol.currentVol(floeFounder);
  const r = await fetch(`${ENCLAVE}/sign_vol`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ payload: { oracle_id: hexBytes(A.predict.btcOracle), vol_bps: Number(cur.volBps), spot: Number(cur.spot) } }),
  });
  if (!r.ok) throw new Error(`sign_vol ${r.status}: ${await r.text()}`);
  const vj: any = await r.json(); // { response: { timestamp_ms, data }, signature }
  await Vol.registerVolAttester(floeFounder, { pubkeyHex: pubkey });
  const d = await Vol.updateVolAttested(floeFounder, {
    oracleId: A.predict.btcOracle, volBps: cur.volBps, spot: cur.spot,
    timestampMs: BigInt(vj.response.timestamp_ms), signatureHex: vj.signature,
  });
  out["vol:attested"] = d;
  console.log(`✓ attested vol pushed (vol_bps ${cur.volBps}, spot ${cur.spot}) ${d}`);
} catch (e) {
  console.warn(`⚠ attested vol: ${(e as Error).message}`);
}

writeFileSync(new URL("./attest-all-result.json", import.meta.url), JSON.stringify({ at: new Date().toISOString(), enclaveUrl: ENCLAVE, pubkey, pcr0: PCR0, digests: out }, null, 2));
console.log("\n✓ done — all 5 vaults attested. Artifact: packages/sdk/scripts/attest-all-result.json");
console.log("  Idle vaults stay verified; run heartbeat.ts to keep any PLP-holding vault fresh.");
console.log(`\n⚠ Also refresh the Enclave<FLOE_NAV> object to this boot's key (lend + NAV-proof): pubkey ${pubkey}`);

/**
 * Create + seed the Stratos lending pool on the V2 (PCR-anchored) floe_lend package.
 *   tx1: create_pool<DUSDC, SHARE>(adminCap, stratosVaultId)  → new shared LendingPool
 *   tx2: supply SUPPLY_AMOUNT dUSDC into the pool reserve
 * Prints the new pool id (copy into constants.ts lend.refPool) + artifact.
 *
 *   set -a; . ../../scripts/.env; set +a; npx tsx scripts/lend-setup.ts
 */
import { writeFileSync } from "node:fs";
import { Transaction } from "@mysten/sui/transactions";
import { FloeLend } from "../src/index.ts";
import { A, DUSDC, floeFounder, addrFor } from "./lib-attest.ts";

const SHARE = A.refVaultSType;
const STRATOS_VAULT = "0xea33fe41c7512a1a36be417b0ce400ada0db0d9fe54f2ade75662aaef987de2e";
const SUPPLY_AMOUNT = 1_000_000n; // 1.0 dUSDC of lending liquidity
const me = addrFor("founder");
const sui = floeFounder.sui;

async function exec(tx: Transaction, label: string) {
  const r = await sui.signAndExecuteTransaction({
    signer: floeFounder.signer!, transaction: tx,
    options: { showEffects: true, showObjectChanges: true },
  });
  if (r.effects?.status?.status !== "success") throw new Error(`${label} failed: ${r.effects?.status?.error}`);
  await sui.waitForTransaction({ digest: r.digest });
  return r;
}

// ── 1) create the pool ──
const r1 = await exec(FloeLend.createPool(floeFounder, A.lend.adminCap, STRATOS_VAULT, DUSDC, SHARE), "create_pool");
const poolChange = (r1.objectChanges ?? []).find(
  (c: any) => c.type === "created" && /::floe_lend::LendingPool</.test(c.objectType || ""),
) as any;
if (!poolChange) throw new Error("LendingPool not found in objectChanges");
const poolId: string = poolChange.objectId;
console.log(`✓ pool created ${poolId} (${r1.digest})`);

// ── 2) supply dUSDC liquidity ──
const coins = await sui.getCoins({ owner: me, coinType: DUSDC });
if (coins.data.length === 0) throw new Error("no dUSDC coins");
const total = coins.data.reduce((s, c) => s + BigInt(c.balance), 0n);
if (total < SUPPLY_AMOUNT) throw new Error(`insufficient dUSDC: have ${total}, need ${SUPPLY_AMOUNT}`);

const tx2 = new Transaction();
const primary = tx2.object(coins.data[0].coinObjectId);
if (coins.data.length > 1) tx2.mergeCoins(primary, coins.data.slice(1).map((c) => tx2.object(c.coinObjectId)));
const [part] = tx2.splitCoins(primary, [tx2.pure.u64(SUPPLY_AMOUNT)]);
const pos = tx2.moveCall({
  target: `${A.lend.package}::floe_lend::supply`,
  typeArguments: [DUSDC, SHARE],
  arguments: [tx2.object(poolId), part, tx2.object(A.clock)],
});
tx2.transferObjects([pos], me);
const r2 = await exec(tx2, "supply");
console.log(`✓ supplied ${Number(SUPPLY_AMOUNT) / 1e6} dUSDC (${r2.digest})`);

writeFileSync(new URL("./lend-setup-result.json", import.meta.url), JSON.stringify({
  at: new Date().toISOString(), pool: poolId, vault: STRATOS_VAULT,
  supplied: SUPPLY_AMOUNT.toString(), createDigest: r1.digest, supplyDigest: r2.digest,
}, null, 2));
console.log(`\n⚠ Set constants.ts lend.refPool = "${poolId}"`);

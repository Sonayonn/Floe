/**
 * Top up the live Floe Lend reserve (constants.ts lend.refPool) with more dUSDC supply.
 * Same `floe_lend::supply` path as lend-setup.ts step 2, but against the EXISTING pool —
 * deepens lendable liquidity so the attested-collateral money market has real depth.
 *
 *   set -a; . ../../scripts/.env; set +a
 *   AMOUNT=110000000 npx tsx scripts/lend-topup.ts     # 110 dUSDC (6dp); EXECUTE defaults on
 */
import { writeFileSync } from "node:fs";
import { Transaction } from "@mysten/sui/transactions";
import { A, DUSDC, floeFounder, addrFor } from "./lib-attest.ts";

const SHARE = A.refVaultSType;
const POOL = A.lend.refPool;
const AMOUNT = BigInt(process.env.AMOUNT ?? "110000000"); // default 110 dUSDC
const me = addrFor("founder");
const sui = floeFounder.sui;

const coins = await sui.getCoins({ owner: me, coinType: DUSDC });
const total = coins.data.reduce((s, c) => s + BigInt(c.balance), 0n);
if (total < AMOUNT) throw new Error(`insufficient dUSDC: have ${total}, need ${AMOUNT}`);

const tx = new Transaction();
const primary = tx.object(coins.data[0].coinObjectId);
if (coins.data.length > 1) tx.mergeCoins(primary, coins.data.slice(1).map((c) => tx.object(c.coinObjectId)));
const [part] = tx.splitCoins(primary, [tx.pure.u64(AMOUNT)]);
const pos = tx.moveCall({
  target: `${A.lend.package}::floe_lend::supply`,
  typeArguments: [DUSDC, SHARE],
  arguments: [tx.object(POOL), part, tx.object(A.clock)],
});
tx.transferObjects([pos], me);

const r = await sui.signAndExecuteTransaction({ signer: floeFounder.signer!, transaction: tx, options: { showEffects: true } });
if (r.effects?.status?.status !== "success") throw new Error(`supply failed: ${r.effects?.status?.error}`);
await sui.waitForTransaction({ digest: r.digest });
console.log(`✓ supplied ${Number(AMOUNT) / 1e6} dUSDC into refPool ${POOL.slice(0, 10)}… (${r.digest})`);

const o: any = await sui.getObject({ id: POOL, options: { showContent: true } });
const f = o.data?.content?.fields ?? {};
console.log(`  pool now: supplied ${Number(f.total_supplied) / 1e6} | borrowed ${Number(f.total_borrowed) / 1e6} | reserve(cash) ${Number(f.reserve) / 1e6}`);
writeFileSync(new URL("./lend-topup-result.json", import.meta.url), JSON.stringify({
  at: new Date().toISOString(), pool: POOL, supplied: AMOUNT.toString(), digest: r.digest,
  totalSupplied: f.total_supplied, totalBorrowed: f.total_borrowed, reserve: f.reserve,
}, null, 2));

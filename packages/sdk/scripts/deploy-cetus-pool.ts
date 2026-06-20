/**
 * Create a Cetus CLMM pool that CONTAINS dUSDC — the prerequisite deploy-cetus.ts is missing
 * (it deploys into a pool, it doesn't make one; the cetus-config sample is USDT/CETUS, no dUSDC).
 *
 * Pairs SUI/dUSDC (the only two assets the founder holds). Type-sorted ordering: A = SUI (0x2…),
 * B = dUSDC (0xe9504…). Seeds a two-sided position at price tick 0 (range ±tickSpacing): fixes the
 * dUSDC (B) side at AMOUNT_B, the contract pulls the matching SUI (~0.05 SUI for 50 dUSDC at ±60).
 * create_pool_with_liquidity REFUNDS unused coin inputs, so the SUI cap is just an upper bound.
 *
 *   set -a; . ../../scripts/.env; set +a
 *   AMOUNT_B=50000000 npx tsx scripts/deploy-cetus-pool.ts          # dry-run (default)
 *   AMOUNT_B=50000000 EXECUTE=1 npx tsx scripts/deploy-cetus-pool.ts # send
 */
import { writeFileSync } from "node:fs";
import { Transaction } from "@mysten/sui/transactions";
import { CetusModule } from "../src/venues/cetus.ts";
import { CETUS_TESTNET as C } from "../src/venues/cetus-config.ts";
import { DUSDC, floeFounder, addrFor } from "./lib-attest.ts";

const SUI_TYPE = "0x2::sui::SUI";
const EXECUTE = process.env.EXECUTE === "1";
const AMOUNT_B = BigInt(process.env.AMOUNT_B ?? "50000000");          // 50 dUSDC (6dp), the fixed side
const SUI_CAP = BigInt(process.env.SUI_CAP ?? "1000000000");         // 1 SUI max into the pool (rest refunded)
const TICK_SPACING = Number(process.env.TICK_SPACING ?? "60");
const INIT_SQRT_PRICE = BigInt(process.env.INIT_SQRT_PRICE ?? (1n << 64n).toString()); // tick 0 → price 1.0 (X64)

// Type-sorted: SUI (A) < dUSDC (B). dUSDC is the fixed side (B), so fixAmountA = false.
const COIN_A = SUI_TYPE, COIN_B = DUSDC;
const me = addrFor("founder");
const sui = floeFounder.sui;

const tx = new Transaction();
// coinA: split SUI_CAP off gas (refund returns the unused remainder)
const [coinA] = tx.splitCoins(tx.gas, [tx.pure.u64(SUI_CAP)]);
// coinB: exactly AMOUNT_B dUSDC, merged from the founder's dUSDC coins
const dusdc = await sui.getCoins({ owner: me, coinType: DUSDC });
const haveB = dusdc.data.reduce((s, c) => s + BigInt(c.balance), 0n);
if (haveB < AMOUNT_B) throw new Error(`insufficient dUSDC: have ${haveB}, need ${AMOUNT_B}`);
const primaryB = tx.object(dusdc.data[0].coinObjectId);
if (dusdc.data.length > 1) tx.mergeCoins(primaryB, dusdc.data.slice(1).map((c) => tx.object(c.coinObjectId)));
const [coinB] = tx.splitCoins(primaryB, [tx.pure.u64(AMOUNT_B)]);

CetusModule.createPoolWithLiquidity(tx, {
  coinTypeA: COIN_A, coinTypeB: COIN_B,
  tickSpacing: TICK_SPACING, initSqrtPrice: INIT_SQRT_PRICE,
  tickLower: -TICK_SPACING, tickUpper: TICK_SPACING,
  coinA, coinB, amountA: SUI_CAP, amountB: AMOUNT_B,
  fixAmountA: false,               // fix the dUSDC (B) side
  recipient: me,
});
tx.setSender(me);

if (!EXECUTE) {
  const built = await tx.build({ client: sui });
  const dr = await sui.dryRunTransactionBlock({ transactionBlock: built });
  const bc = (dr.balanceChanges ?? []).map((b) => `${b.coinType.split("::").pop()}:${b.amount}`).join("  ");
  console.log(`[dry-run] ${dr.effects.status.status}${dr.effects.status.error ? " — " + dr.effects.status.error : ""}`);
  console.log(`  balance changes: ${bc}`);
} else {
  const r = await sui.signAndExecuteTransaction({ signer: floeFounder.signer!, transaction: tx, options: { showEffects: true, showObjectChanges: true } });
  const ok = r.effects?.status?.status;
  console.log(`[exec] ${ok}${ok !== "success" ? " — " + r.effects?.status?.error : ""}  ${r.digest}`);
  if (ok !== "success") process.exit(1);
  await sui.waitForTransaction({ digest: r.digest });
  const pool = (r.objectChanges ?? []).find((c: any) => c.type === "created" && /::pool::Pool</.test(c.objectType || "")) as any;
  const position = (r.objectChanges ?? []).find((c: any) => c.type === "created" && /::position::Position$/.test(c.objectType || "")) as any;
  console.log(`  poolId:     ${pool?.objectId}`);
  console.log(`  positionId: ${position?.objectId}`);
  writeFileSync(new URL("./deploy-cetus-pool-result.json", import.meta.url), JSON.stringify({
    at: new Date().toISOString(), digest: r.digest,
    poolId: pool?.objectId, positionId: position?.objectId,
    coinTypeA: COIN_A, coinTypeB: COIN_B, tickSpacing: TICK_SPACING, amountB: AMOUNT_B.toString(),
  }, null, 2));
  console.log(`\n⚠ Add this poolId to cetus-config / use as POOL_ID for deploy-cetus.ts (COIN_A=SUI COIN_B=dUSDC Q_IS_A=0).`);
}

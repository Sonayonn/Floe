/**
 * E2E proof: attested-collateral borrow on the V2 (PCR-anchored) floe_lend.
 *   1. fetchSignedValuation — read Stratos NAV floor + share supply, enclave signs intent-3
 *   2. lock_and_borrow — lock SHARE collateral, borrow dUSDC; the contract verifies the
 *      enclave sig against the on-chain Enclave<FLOE_NAV> object. No registered pubkey.
 *
 *   set -a; . ../../scripts/.env; set +a; FLOE_ENCLAVE_URL=http://<ip>:3000 npx tsx scripts/borrow-verify.ts
 */
import { FloeLend } from "../src/index.ts";
import { A, DUSDC, ENCLAVE, floeFounder, addrFor } from "./lib-attest.ts";

const SHARE = A.refVaultSType;
const STRATOS_VAULT = "0xea33fe41c7512a1a36be417b0ce400ada0db0d9fe54f2ade75662aaef987de2e";
const POOL = A.lend.refPool;
const COLLATERAL = 2_000_000n; // lock 2 SHARE
const BORROW = 300_000n;       // borrow 0.3 dUSDC
const me = addrFor("founder");
const sui = floeFounder.sui;

// 1) attested valuation from the live enclave
const v = await FloeLend.fetchSignedValuation(floeFounder, STRATOS_VAULT, DUSDC, SHARE, ENCLAVE);
console.log(`valuation: navFloor=${v.navLowerBound} shareSupply=${v.shareSupply} ts=${v.timestampMs} sig=${v.signature.length}B`);

// pick a SHARE coin to lock
const shares = await sui.getCoins({ owner: me, coinType: SHARE });
const total = shares.data.reduce((s, c) => s + BigInt(c.balance), 0n);
if (total < COLLATERAL) throw new Error(`insufficient SHARE: have ${total}, need ${COLLATERAL}`);
const shareCoin = shares.data[0].coinObjectId;

// 2) lock_and_borrow (verifies against Enclave<FLOE_NAV> a.nav.enclave)
const tx = FloeLend.lockAndBorrow(floeFounder, POOL, shareCoin, BORROW, v, DUSDC, SHARE, me, COLLATERAL);
const r = await sui.signAndExecuteTransaction({
  signer: floeFounder.signer!, transaction: tx,
  options: { showEffects: true, showObjectChanges: true, showBalanceChanges: true },
});
if (r.effects?.status?.status !== "success") throw new Error(`lock_and_borrow failed: ${r.effects?.status?.error}`);
await sui.waitForTransaction({ digest: r.digest });
console.log(`✓ BORROW SUCCESS — ${r.digest}`);
for (const c of (r.objectChanges ?? []) as any[]) {
  if (c.type === "created" && /DebtPosition/.test(c.objectType || "")) console.log(`  DebtPosition ${c.objectId}`);
}
const ps = await FloeLend.poolState(floeFounder, POOL, DUSDC, SHARE);
console.log(`  pool: supplied=${ps.totalSupplied} borrowed=${ps.totalBorrowed} avail=${ps.availableLiquidity} util=${ps.utilizationBps}bps`);

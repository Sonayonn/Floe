/**
 * E2E proof: attested-collateral borrow with NO enclave round-trip — the browser-grade path.
 *   1. (no /sign_collateral call) — collateral is valued by the contract reading the vault's
 *      ATTESTED nav_lower_bound + share_supply on-chain, kept fresh by the NAV heartbeat.
 *   2. lock_and_borrow_from_vault — lock SHARE, borrow dUSDC, passing ONLY the vault object.
 *      The contract asserts is_price_fresh + values collateral at the un-inflatable NAV floor.
 *
 * Run AFTER scripts/upgrade-lend.ts (adds *_from_vault) and bumping constants.lend.package.
 *   set -a; . ../../scripts/.env; set +a; npx tsx scripts/borrow-verify-vault.ts
 */
import { FloeLend } from "../src/index.ts";
import { A, DUSDC, floeFounder, addrFor } from "./lib-attest.ts";

const SHARE = A.refVaultSType;
const STRATOS_VAULT = "0xea33fe41c7512a1a36be417b0ce400ada0db0d9fe54f2ade75662aaef987de2e";
const POOL = A.lend.refPool;
const COLLATERAL = 2_000_000n; // lock 2 SHARE
const BORROW = 300_000n;       // borrow 0.3 dUSDC
const me = addrFor("founder");
const sui = floeFounder.sui;

// pick a SHARE coin to lock
const shares = await sui.getCoins({ owner: me, coinType: SHARE });
const total = shares.data.reduce((s, c) => s + BigInt(c.balance), 0n);
if (total < COLLATERAL) throw new Error(`insufficient SHARE: have ${total}, need ${COLLATERAL}`);
const shareCoin = shares.data[0].coinObjectId;

// borrow against the vault's attested NAV floor — no enclave, no SignedValuation
const tx = FloeLend.lockAndBorrowFromVault(
  floeFounder, POOL, STRATOS_VAULT, shareCoin, BORROW, DUSDC, SHARE, me, COLLATERAL,
);
const r = await sui.signAndExecuteTransaction({
  signer: floeFounder.signer!, transaction: tx,
  options: { showEffects: true, showObjectChanges: true, showBalanceChanges: true },
});
if (r.effects?.status?.status !== "success") throw new Error(`lock_and_borrow_from_vault failed: ${r.effects?.status?.error}`);
await sui.waitForTransaction({ digest: r.digest });
console.log(`✓ BORROW SUCCESS (vault-read, no enclave) — ${r.digest}`);

let position = "";
for (const c of (r.objectChanges ?? []) as any[]) {
  if (c.type === "created" && /DebtPosition/.test(c.objectType || "")) {
    position = c.objectId;
    console.log(`  DebtPosition ${c.objectId}`);
  }
}
const ps = await FloeLend.poolState(floeFounder, POOL, DUSDC, SHARE);
console.log(`  pool: supplied=${ps.totalSupplied} borrowed=${ps.totalBorrowed} avail=${ps.availableLiquidity} util=${ps.utilizationBps}bps`);
if (position) {
  const hf = await FloeLend.healthFactorFromVault(floeFounder, POOL, position, STRATOS_VAULT, DUSDC, SHARE);
  console.log(`  health factor (vault-read): ${hf}bps  (>10000 = healthy)`);
}

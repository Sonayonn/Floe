/**
 * Bump vault NAV: founder deposits fresh dUSDC across all 5 registry vaults (raises AUM/idle NAV).
 * Same permissionless `floe::deposit` path as seed-deposits.ts, one atomic PTB, but tops up the
 * ALREADY-SEEDED live vaults. Run BEFORE attest-all.ts so the signed NAV snapshot captures it.
 *
 *   set -a; . ../../scripts/.env; set +a; npx tsx scripts/deposit-bump.ts
 */
import { writeFileSync } from "node:fs";
import { Transaction } from "@mysten/sui/transactions";
import { A, DUSDC, floeFounder, addrFor, VAULTS } from "./lib-attest.ts";

// per-vault top-up (6dp dUSDC) — total 240 dUSDC
const AMOUNTS: Record<string, bigint> = {
  "Floe Stratos":     40_000_000n,
  "Floe Multi-Venue": 80_000_000n,
  "Floe Reserve":     50_000_000n,
  "Range Ladder":     40_000_000n,
  "Delta-Hedged":     30_000_000n,
};
const me = addrFor("founder");
const sui = floeFounder.sui;
const PKG = A.package;

const seeds = VAULTS.map((v) => ({ ...v, amount: AMOUNTS[v.name] ?? 0n })).filter((s) => s.amount > 0n);
const need = seeds.reduce((s, v) => s + v.amount, 0n);

const coins = await sui.getCoins({ owner: me, coinType: DUSDC });
const total = coins.data.reduce((s, c) => s + BigInt(c.balance), 0n);
if (total < need) throw new Error(`insufficient dUSDC: have ${total}, need ${need}`);

const tx = new Transaction();
const primary = tx.object(coins.data[0].coinObjectId);
if (coins.data.length > 1) tx.mergeCoins(primary, coins.data.slice(1).map((c) => tx.object(c.coinObjectId)));
const parts = tx.splitCoins(primary, seeds.map((s) => tx.pure.u64(s.amount)));
seeds.forEach((s, i) => {
  const shares = tx.moveCall({
    target: `${PKG}::floe::deposit`, typeArguments: [DUSDC, s.sType],
    arguments: [tx.object(s.vaultId), parts[i], tx.object(A.clock)],
  });
  tx.transferObjects([shares], me);
});

console.log(`Depositing ${Number(need) / 1e6} dUSDC across ${seeds.length} vaults…`);
const r = await sui.signAndExecuteTransaction({ signer: floeFounder.signer!, transaction: tx, options: { showEffects: true } });
if (r.effects?.status?.status !== "success") throw new Error(`deposit failed: ${JSON.stringify(r.effects?.status)}`);
await sui.waitForTransaction({ digest: r.digest });
console.log(`✓ deposited (digest ${r.digest})\n`);

const navs: Record<string, number> = {};
for (const s of seeds) {
  const o: any = await sui.getObject({ id: s.vaultId, options: { showContent: true } });
  const f = o.data?.content?.fields ?? {};
  const idle = Number(f.idle ?? 0) / 1e6;
  navs[s.name] = idle;
  console.log(`  ${s.name.padEnd(18)} idle ${idle.toFixed(2)} dUSDC | shares ${(Number(f.share_supply ?? 0) / 1e6).toFixed(2)}`);
}
writeFileSync(new URL("./deposit-bump-result.json", import.meta.url), JSON.stringify({
  at: new Date().toISOString(), digest: r.digest,
  deposits: seeds.map((s) => ({ name: s.name, vaultId: s.vaultId, dusdc: Number(s.amount) / 1e6 })), navs,
}, null, 2));

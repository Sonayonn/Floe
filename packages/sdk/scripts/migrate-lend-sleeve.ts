/**
 * One-shot migration: move the Multi-Venue vault's existing lend SupplyPosition out of the generic
 * Cetus sleeve slot (soft mark, EXCLUDED from nav_lower_bound) into the new V12 dedicated lend slot
 * (HARD value, INCLUDED in the floor). One atomic PTB, ExecCap-gated:
 *
 *   take_cetus_position<dUSDC,S,SupplyPosition>(vault, execCap) -> pos   // remove from soft bucket
 *   store_lend_position<dUSDC,S,SupplyPosition>(vault, execCap, pos, value)  // into hard floor bucket
 *
 *   set -a; . ../../scripts/.env; set +a; npx tsx scripts/migrate-lend-sleeve.ts
 */
import { Transaction } from "@mysten/sui/transactions";
import { A, DUSDC, floeFounder, addrFor, resolveCap, VAULTS } from "./lib-attest.ts";

const VALUE = BigInt(process.env.VALUE ?? "30000000"); // current sleeve value (30 dUSDC)
const SHARE = A.refVaultSType;
const SUPPLY_POSITION = `${A.lend.package}::floe_lend::SupplyPosition<${DUSDC}, ${SHARE}>`;

const v = VAULTS.find((x) => x.name === "Floe Multi-Venue")!;
const sender = addrFor(v.holder);
const sui = floeFounder.sui;
const execCap = await resolveCap(floeFounder, sender, "ExecCap", v.vaultId);

const tx = new Transaction();
const [pos] = tx.moveCall({
  target: `${A.package}::floe::take_cetus_position`, typeArguments: [DUSDC, v.sType, SUPPLY_POSITION],
  arguments: [tx.object(v.vaultId), tx.object(execCap)],
});
tx.moveCall({
  target: `${A.package}::floe::store_lend_position`, typeArguments: [DUSDC, v.sType, SUPPLY_POSITION],
  arguments: [tx.object(v.vaultId), tx.object(execCap), pos, tx.pure.u64(VALUE)],
});
tx.setSender(sender);

const r = await sui.signAndExecuteTransaction({ signer: floeFounder.signer!, transaction: tx, options: { showEffects: true } });
const ok = r.effects?.status?.status;
console.log(`[migrate] ${ok}${ok !== "success" ? " — " + r.effects?.status?.error : ""}  ${r.digest}`);
if (ok !== "success") process.exit(1);
await sui.waitForTransaction({ digest: r.digest });
console.log(`✓ lend sleeve (${Number(VALUE) / 1e6} dUSDC) moved into the hard floor bucket — now counts in nav_lower_bound.`);

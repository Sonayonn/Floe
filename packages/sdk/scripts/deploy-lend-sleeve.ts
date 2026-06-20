/**
 * Multi-venue proof: give the Floe Multi-Venue vault a SECOND venue sleeve — a floe_lend supply
 * position — alongside its existing PLP (DeepBook Predict) sleeve. One atomic PTB, ExecCap-gated:
 *
 *   deploy_idle(vault, execCap, amount)            -> (Coin<dUSDC>, DeployReceipt)
 *   floe_lend::supply<dUSDC,SHARE>(refPool, coin)  -> SupplyPosition         (key+store, index-valued)
 *   confirm_deploy_cetus<dUSDC,S,SupplyPosition>(vault, execCap, receipt, pos, amount)  // in-vault custody
 *
 * The vault custodies the SupplyPosition in its generic position slot (store_cetus_position is generic
 * over `Pos: key+store` — not Cetus-specific) and marks it at `amount` (NAV conserved: what left idle
 * reappears as the sleeve's marked value). Cetus pool creation is blocked for our coin_registry-native
 * dUSDC (no CoinMetadata); floe_lend is the live, dUSDC-native second venue. See memory notes.
 *
 *   set -a; . ../../scripts/.env; set +a
 *   AMOUNT=30000000 npx tsx scripts/deploy-lend-sleeve.ts        # dry-run (default)
 *   AMOUNT=30000000 EXECUTE=1 npx tsx scripts/deploy-lend-sleeve.ts
 */
import { Transaction } from "@mysten/sui/transactions";
import { A, DUSDC, floeFounder, addrFor, resolveCap, VAULTS } from "./lib-attest.ts";

const EXECUTE = process.env.EXECUTE === "1";
const AMOUNT = BigInt(process.env.AMOUNT ?? "30000000"); // 30 dUSDC (6dp)

const SHARE = A.refVaultSType;                                   // lend pool's SHARE type arg (Stratos)
const POOL = A.lend.refPool;                                     // LendingPool<dUSDC, SHARE>
const SUPPLY_POSITION = `${A.lend.package}::floe_lend::SupplyPosition<${DUSDC}, ${SHARE}>`;

const v = VAULTS.find((x) => x.name === "Floe Multi-Venue");
if (!v) throw new Error("Floe Multi-Venue vault not found");
const sender = addrFor(v.holder);
const sui = floeFounder.sui;

const execCap = await resolveCap(floeFounder, sender, "ExecCap", v.vaultId);

const tx = new Transaction();
const [coin, receipt] = tx.moveCall({
  target: `${A.package}::floe::deploy_idle`, typeArguments: [DUSDC, v.sType],
  arguments: [tx.object(v.vaultId), tx.object(execCap), tx.pure.u64(AMOUNT)],
});
const [pos] = tx.moveCall({
  target: `${A.lend.package}::floe_lend::supply`, typeArguments: [DUSDC, SHARE],
  arguments: [tx.object(POOL), coin, tx.object(A.clock)],
});
tx.moveCall({
  target: `${A.package}::floe::confirm_deploy_cetus`, typeArguments: [DUSDC, v.sType, SUPPLY_POSITION],
  arguments: [tx.object(v.vaultId), tx.object(execCap), receipt, pos, tx.pure.u64(AMOUNT)],
});
tx.setSender(sender);

if (!EXECUTE) {
  const built = await tx.build({ client: sui });
  const dr = await sui.dryRunTransactionBlock({ transactionBlock: built });
  const bc = (dr.balanceChanges ?? []).map((b) => `${b.coinType.split("::").pop()}:${b.amount}`).join("  ");
  console.log(`[dry-run] ${dr.effects.status.status}${dr.effects.status.error ? " — " + dr.effects.status.error : ""}`);
  console.log(`  balance changes: ${bc || "(none — moved internally)"}`);
} else {
  const r = await sui.signAndExecuteTransaction({ signer: floeFounder.signer!, transaction: tx, options: { showEffects: true } });
  const ok = r.effects?.status?.status;
  console.log(`[exec] ${ok}${ok !== "success" ? " — " + r.effects?.status?.error : ""}  ${r.digest}`);
  if (ok !== "success") process.exit(1);
  await sui.waitForTransaction({ digest: r.digest });
  console.log(`✓ Multi-Venue vault now holds a floe_lend sleeve of ${Number(AMOUNT) / 1e6} dUSDC (+ its PLP sleeve).`);
}

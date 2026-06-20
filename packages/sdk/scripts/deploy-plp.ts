/**
 * Deploy idle dUSDC -> PLP for the 4 registry vaults that are sitting 100% idle.
 *
 * This is the *same* 4-call PTB the rebalancer's supply_plp action composes
 * (engine/ptb.ts) and the one the UI "Deploy" button will sign, run here once
 * per vault by the cap holder:
 *
 *   deploy_idle(vault, execCap, amount) -> (Coin<Q>, DeployReceipt)
 *   predict::supply<Q>(predict, coin, clock) -> Coin<PLP>
 *   store_plp<Q,S,PLP>(vault, execCap, plp)       // custody stays IN the vault
 *   confirm_deploy(vault, receipt, amount)
 *
 * PLP supply is oracle-independent (Stratum A base yield), so the expired BTC
 * SVI oracle does not block it. DRY-RUN by default; EXECUTE=1 to send.
 *
 *   set -a; . ../../scripts/.env; set +a
 *   FLOE_ENCLAVE_URL=http://localhost:9999 AMOUNT=1000000 node scripts/deploy-plp.ts        # dry-run
 *   FLOE_ENCLAVE_URL=http://localhost:9999 EXECUTE=1 AMOUNT=1000000 node scripts/deploy-plp.ts
 */
import { Transaction } from "@mysten/sui/transactions";
import { A, DUSDC, clientFor, addrFor, resolveCap, VAULTS } from "./lib-attest.ts";

const PREDICT_PKG = "0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138";
const PREDICT_OBJ = "0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a";
const PLP = `${PREDICT_PKG}::plp::PLP`;
const CLOCK = A.clock;
const EXECUTE = process.env.EXECUTE === "1";
const AMOUNT = BigInt(process.env.AMOUNT ?? "1000000"); // default 1 dUSDC (6dp)

// The 4 idle vaults (Stratos already holds PLP — skip it).
const TARGETS = VAULTS.filter((v) => v.name !== "Floe Stratos");

for (const v of TARGETS) {
  const client = clientFor(v.holder);
  const sender = addrFor(v.holder);
  try {
    const execCap = await resolveCap(client, sender, "ExecCap", v.vaultId);
    const tx = new Transaction();
    const TS = [DUSDC, v.sType];
    const TS_PLP = [DUSDC, v.sType, PLP];
    const [coin, receipt] = tx.moveCall({
      target: `${A.package}::floe::deploy_idle`, typeArguments: TS,
      arguments: [tx.object(v.vaultId), tx.object(execCap), tx.pure.u64(AMOUNT)],
    });
    const [plp] = tx.moveCall({
      target: `${PREDICT_PKG}::predict::supply`, typeArguments: [DUSDC],
      arguments: [tx.object(PREDICT_OBJ), coin, tx.object(CLOCK)],
    });
    tx.moveCall({
      target: `${A.package}::floe::store_plp`, typeArguments: TS_PLP,
      arguments: [tx.object(v.vaultId), tx.object(execCap), plp],
    });
    tx.moveCall({
      target: `${A.package}::floe::confirm_deploy`, typeArguments: TS,
      arguments: [tx.object(v.vaultId), receipt, tx.pure.u64(AMOUNT)],
    });
    tx.setSender(sender);

    if (!EXECUTE) {
      const built = await tx.build({ client: client.sui });
      const dr = await client.sui.dryRunTransactionBlock({ transactionBlock: built });
      const bc = (dr.balanceChanges ?? []).map((b) => `${b.coinType.split("::").pop()}:${b.amount}`).join(" ");
      console.log(`[dry-run] ${v.name.padEnd(16)} ${dr.effects.status.status}${dr.effects.status.error ? " — " + dr.effects.status.error : ""}  ${bc}`);
    } else {
      const r = await client.sui.signAndExecuteTransaction({
        signer: client.signer!, transaction: tx, options: { showEffects: true },
      });
      const ok = r.effects?.status?.status;
      console.log(`[exec] ${v.name.padEnd(16)} ${ok}${ok !== "success" ? " — " + r.effects?.status?.error : ""}  ${r.digest}`);
      if (ok === "success") await client.sui.waitForTransaction({ digest: r.digest });
    }
  } catch (e) {
    console.log(`[err] ${v.name.padEnd(16)} ${(e as Error).message}`);
  }
}

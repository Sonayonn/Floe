/**
 * Upgrade the floe_lend package to add the VAULT-READ borrow path (lock_and_borrow_from_vault,
 * liquidate_from_vault, health_factor_from_vault_bps) — a COMPATIBLE upgrade (only new functions +
 * a new `floe` dependency; no existing struct/function changed, so existing pools keep working).
 *
 * Mirrors upgrade-floe.ts: builds the bytecode offline (the local sui CLI is too old to submit on
 * testnet protocol), then runs authorize_upgrade -> upgrade -> commit_upgrade via @mysten/sui.
 *
 *   set -a; . ../../scripts/.env; set +a; npx tsx scripts/upgrade-lend.ts
 *
 * AFTER it prints the new package id:
 *   1) constants.ts → lend.package = <new id>   (module stays 'floe_lend'; pools/upgradeCap unchanged)
 *   2) rebuild/redeploy the web so the frontend calls *_from_vault on the new package
 *   3) prove it: npx tsx scripts/borrow-verify-vault.ts
 */
import { execSync } from "node:child_process";
import { Transaction, UpgradePolicy } from "@mysten/sui/transactions";
import { A, floeFounder, addrFor } from "./lib-attest.ts";

const UPGRADE_CAP = A.lend.upgradeCap; // 0x3c5edadf… — floe_lend UpgradeCap (founder-held)
const CURRENT_PKG = A.lend.package;    // 0xf6369fc6… — the deployed floe_lend (V2, PCR-anchored)
const MOVE_DIR = new URL("../../floe_lend", import.meta.url).pathname;

const out = execSync("sui move build --dump-bytecode-as-base64", { cwd: MOVE_DIR, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
const { modules, dependencies, digest } = JSON.parse(out);
console.log(`built floe_lend: ${modules.length} module(s), ${dependencies.length} deps, digest ${digest.length}B`);

const me = addrFor("founder");
const sui = floeFounder.sui;

const tx = new Transaction();
const cap = tx.object(UPGRADE_CAP);
const ticket = tx.moveCall({
  target: "0x2::package::authorize_upgrade",
  arguments: [cap, tx.pure.u8(UpgradePolicy.COMPATIBLE), tx.pure.vector("u8", digest)],
});
const receipt = tx.upgrade({ modules, dependencies, package: CURRENT_PKG, ticket });
tx.moveCall({ target: "0x2::package::commit_upgrade", arguments: [cap, receipt] });
tx.setSender(me);
tx.setGasBudget(2_000_000_000n);

const r = await sui.signAndExecuteTransaction({
  signer: floeFounder.signer!, transaction: tx,
  options: { showEffects: true, showObjectChanges: true },
});
const ok = r.effects?.status?.status;
console.log(`[upgrade] ${ok}${ok !== "success" ? " — " + r.effects?.status?.error : ""}  ${r.digest}`);
if (ok !== "success") process.exit(1);
await sui.waitForTransaction({ digest: r.digest });
const pub = (r.objectChanges ?? []).find((c: any) => c.type === "published") as any;
console.log(`\n✓ NEW floe_lend PACKAGE: ${pub?.packageId}`);
console.log(`⚠ Bump constants.ts  lend.package  to this id (supersedes ${CURRENT_PKG}); module + pools + upgradeCap are unchanged.`);

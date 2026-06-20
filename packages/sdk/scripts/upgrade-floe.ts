/**
 * Upgrade the floe package programmatically (the local sui CLI 1.73.0 is too old for testnet
 * protocol v126 — it panics on submit). Builds the bytecode offline, then submits the standard
 * authorize_upgrade -> upgrade -> commit_upgrade flow via @mysten/sui (JSON-RPC, version-agnostic).
 *
 *   set -a; . ../../scripts/.env; set +a; npx tsx scripts/upgrade-floe.ts
 */
import { execSync } from "node:child_process";
import { Transaction, UpgradePolicy } from "@mysten/sui/transactions";
import { A, floeFounder, addrFor } from "./lib-attest.ts";

const UPGRADE_CAP = "0x7a171ad8070516a29c3060acd095cdcd02f5fcbbffc548a48f68b91996d799b7";
const CURRENT_PKG = A.package; // 0x457cf2d2… (cap v13)
const MOVE_DIR = new URL("../../move", import.meta.url).pathname;

const out = execSync("sui move build --dump-bytecode-as-base64", { cwd: MOVE_DIR, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
const { modules, dependencies, digest } = JSON.parse(out);
console.log(`built: ${modules.length} module(s), ${dependencies.length} deps, digest ${digest.length}B`);

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
console.log(`\n✓ NEW PACKAGE: ${pub?.packageId}`);
console.log(`⚠ Bump FLOE_ADDRESSES.testnet.package in constants.ts to this id (supersedes ${CURRENT_PKG}).`);

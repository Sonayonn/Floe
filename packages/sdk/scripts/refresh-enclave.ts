/**
 * Register a fresh Enclave<FLOE_NAV> object from the running enclave's attestation document — the
 * on-chain anchor that lend collateral verification + NAV-proof + attested-vol all check signatures
 * against (a.nav.enclave). This is the SDK port of nautilus-template/register_enclave.sh, which the
 * local sui CLI (1.73.0) can no longer run (testnet is on protocol v126 > the binary's max 125).
 *
 *   GET <enclave>/get_attestation -> hex Nitro attestation document
 *   0x2::nitro_attestation::load_nitro_attestation(doc_bytes, clock) -> NitroAttestationDocument
 *   <enclavePkg>::enclave::register_enclave<FLOE_NAV>(enclaveConfig, document)  -> shares a new Enclave<T>
 *
 * register_enclave CREATES A NEW shared Enclave object (new id) bound to the document's pubkey. With
 * an EPHEMERAL enclave key this must run every boot AND constants.nav.enclave must be re-pointed — which
 * is exactly why the boot design moves to a STABLE (KMS-sealed) key, so this runs ONCE and the id sticks.
 *
 *   set -a; . ../../scripts/.env; set +a
 *   npx tsx scripts/refresh-enclave.ts              # dry-run (default) — safe, no new object
 *   EXECUTE=1 npx tsx scripts/refresh-enclave.ts    # register (prints the NEW enclave id to set in constants)
 */
import { A, ENCLAVE, floeFounder, addrFor, hexBytes } from "./lib-attest.ts";
import { Transaction } from "@mysten/sui/transactions";

const N = A.nav;
const EXECUTE = process.env.EXECUTE === "1";
const sui = floeFounder.sui;
const me = addrFor("founder");

const res = await fetch(`${ENCLAVE}/get_attestation`);
if (!res.ok) throw new Error(`get_attestation ${res.status}: ${await res.text()}`);
const j: any = await res.json();
const attHex: string = j.attestation ?? j.attestation_hex ?? "";
if (!attHex) throw new Error(`enclave returned no attestation (keys: ${Object.keys(j)})`);
console.log(`fetched attestation (${attHex.length / 2} bytes) from ${ENCLAVE}`);

const tx = new Transaction();
const [doc] = tx.moveCall({
  target: "0x2::nitro_attestation::load_nitro_attestation",
  arguments: [tx.pure.vector("u8", hexBytes(attHex)), tx.object(A.clock)],
});
tx.moveCall({
  target: `${N.enclavePackage}::enclave::register_enclave`,
  typeArguments: [N.otwType],
  arguments: [tx.object(N.enclaveConfig), doc],
});
tx.setSender(me);

if (!EXECUTE) {
  const built = await tx.build({ client: sui });
  const dr = await sui.dryRunTransactionBlock({ transactionBlock: built });
  console.log(`[dry-run] ${dr.effects.status.status}${dr.effects.status.error ? " — " + dr.effects.status.error : ""}`);
  const created = (dr.objectChanges ?? []).filter((c: any) => c.type === "created" && /::enclave::Enclave</.test(c.objectType || ""));
  created.forEach((c: any) => console.log(`  would create Enclave: ${c.objectType}`));
  console.log("  (re-run with EXECUTE=1 to register; then set constants.ts nav.enclave to the new id)");
} else {
  const r = await sui.signAndExecuteTransaction({ signer: floeFounder.signer!, transaction: tx, options: { showEffects: true, showObjectChanges: true } });
  const ok = r.effects?.status?.status;
  console.log(`[exec] ${ok}${ok !== "success" ? " — " + r.effects?.status?.error : ""}  ${r.digest}`);
  if (ok !== "success") process.exit(1);
  await sui.waitForTransaction({ digest: r.digest });
  const enc = (r.objectChanges ?? []).find((c: any) => c.type === "created" && /::enclave::Enclave</.test(c.objectType || "")) as any;
  console.log(`\n✓ NEW Enclave<FLOE_NAV>: ${enc?.objectId}`);
  console.log(`⚠ Set constants.ts nav.enclave = "${enc?.objectId}" (supersedes ${N.enclave}).`);
}

/**
 * Re-anchor the EnclaveConfig<FLOE_NAV> to a rebuilt .eif's PCR measurements — step 1 of the one-time
 * re-anchor after the enclave changes (e.g. the KMS-sealed-key build). Calls enclave::update_pcrs via
 * the SDK (the local sui CLI 1.73 can't reach testnet protocol v126). Same pattern as refresh-enclave.ts:
 * idempotent, DRY-RUN by default, EXECUTE=1 to send.
 *
 *   enclave::update_pcrs<FLOE_NAV>(config: &mut EnclaveConfig, cap: &Cap, pcr0, pcr1, pcr2)  // bumps config.version
 *
 * PCR0 is required (from `nitro-cli describe-eif` / the build log). PCR1/PCR2 are optional — if omitted
 * they default to the config's CURRENT on-chain values (so you can re-anchor PCR0 alone if the kernel/app
 * PCRs are unchanged). If all three already match on-chain, it's a no-op.
 *
 *   set -a; . ../../scripts/.env; set +a            # only SUI_PRIVATE_KEY is needed (no enclave URL)
 *   PCR0=<hex> [PCR1=<hex>] [PCR2=<hex>] npx tsx scripts/boot/update-pcrs.ts            # dry-run
 *   PCR0=<hex> EXECUTE=1 npx tsx scripts/boot/update-pcrs.ts                            # send
 *
 * After it lands: run refresh-enclave.ts (EXECUTE=1) for the new Enclave object, then bump
 * constants.ts nav.pcr0 (+ nav.enclave) and run attest-all.ts. See scripts/boot/README.md.
 */
import { Transaction } from "@mysten/sui/transactions";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { fromHex } from "@mysten/sui/utils";
import { FloeClient } from "../../src/index.ts";
import { FLOE_ADDRESSES } from "../../src/constants.ts";

const N = FLOE_ADDRESSES.testnet.nav;
const EXECUTE = process.env.EXECUTE === "1";
const norm = (h?: string) => (h ?? "").replace(/^0x/, "").toLowerCase();
const hexBytes = (h: string) => Array.from(fromHex(norm(h)));
const bytesToHex = (b: number[]) => b.map((x) => x.toString(16).padStart(2, "0")).join("");

if (!process.env.SUI_PRIVATE_KEY) throw new Error("SUI_PRIVATE_KEY missing");
if (!process.env.PCR0) throw new Error("PCR0 missing — pass the new PCR0 hex from the rebuilt .eif build log");

const kp = Ed25519Keypair.fromSecretKey(decodeSuiPrivateKey(process.env.SUI_PRIVATE_KEY!).secretKey);
const floe = new FloeClient({ network: "testnet", signer: kp });
const me = kp.toSuiAddress();
const sui = floe.sui;

// current on-chain PCRs (for idempotency + PCR1/PCR2 defaults)
const o: any = await sui.getObject({ id: N.enclaveConfig, options: { showContent: true } });
const cur = o.data?.content?.fields?.pcrs?.fields;
if (!cur) throw new Error(`could not read pcrs from EnclaveConfig ${N.enclaveConfig}`);
const curHex = { pcr0: bytesToHex(cur.pos0), pcr1: bytesToHex(cur.pos1), pcr2: bytesToHex(cur.pos2) };
const version = o.data?.content?.fields?.version;

const target = {
  pcr0: norm(process.env.PCR0),
  pcr1: process.env.PCR1 ? norm(process.env.PCR1) : curHex.pcr1,
  pcr2: process.env.PCR2 ? norm(process.env.PCR2) : curHex.pcr2,
};
for (const [k, v] of Object.entries(target)) {
  if (v.length !== 96) throw new Error(`${k} must be 48 bytes / 96 hex chars (got ${v.length})`);
}

console.log(`EnclaveConfig ${N.enclaveConfig} (version ${version})`);
for (const k of ["pcr0", "pcr1", "pcr2"] as const) {
  const changed = curHex[k] !== target[k];
  console.log(`  ${k}: ${changed ? `CHANGE  ${curHex[k].slice(0, 12)}… → ${target[k].slice(0, 12)}…` : `same    ${curHex[k].slice(0, 12)}…`}`);
}

if (curHex.pcr0 === target.pcr0 && curHex.pcr1 === target.pcr1 && curHex.pcr2 === target.pcr2) {
  console.log("\n✓ Config already at these PCRs — nothing to do (idempotent).");
  process.exit(0);
}

const tx = new Transaction();
tx.moveCall({
  target: `${N.enclavePackage}::enclave::update_pcrs`,
  typeArguments: [N.otwType],
  arguments: [
    tx.object(N.enclaveConfig),
    tx.object(N.cap),
    tx.pure.vector("u8", hexBytes(target.pcr0)),
    tx.pure.vector("u8", hexBytes(target.pcr1)),
    tx.pure.vector("u8", hexBytes(target.pcr2)),
  ],
});
tx.setSender(me);

if (!EXECUTE) {
  const built = await tx.build({ client: sui });
  const dr = await sui.dryRunTransactionBlock({ transactionBlock: built });
  console.log(`\n[dry-run] ${dr.effects.status.status}${dr.effects.status.error ? " — " + dr.effects.status.error : ""}`);
  console.log("  (re-run with EXECUTE=1 to send)");
} else {
  const r = await sui.signAndExecuteTransaction({ signer: kp, transaction: tx, options: { showEffects: true } });
  const ok = r.effects?.status?.status;
  console.log(`\n[exec] ${ok}${ok !== "success" ? " — " + r.effects?.status?.error : ""}  ${r.digest}`);
  if (ok !== "success") process.exit(1);
  await sui.waitForTransaction({ digest: r.digest });
  console.log(`✓ PCRs updated (config version ${Number(version) + 1}).`);
  console.log("  Next: refresh-enclave.ts (EXECUTE=1) → bump constants.ts nav.pcr0/nav.enclave → attest-all.ts.");
}

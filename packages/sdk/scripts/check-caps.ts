/**
 * Show, per vault, which address currently holds the OwnerCap vs ExecCap — so you can confirm the
 * wallet you'll put in scripts/.env (re-anchor) holds BOTH before running re-anchor.sh.
 *   register_attester/register_enclave need OwnerCap; update_nav_attested needs ExecCap.
 *
 * Self-contained (no key files needed). Pass the addresses to check:
 *   npx tsx scripts/check-caps.ts <founder-addr> <operator-addr> <fresh-addr>
 * or set CHECK_ADDRS="0xfounder,0xoperator,0xfresh".
 */
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { FLOE_ADDRESSES } from "../src/constants.ts";

const ORIG = FLOE_ADDRESSES.testnet.packageOriginal; // OwnerCap/ExecCap origin: ${ORIG}::floe::*
const sui = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl("testnet") });

const VAULTS: { name: string; id: string }[] = [
  { name: "Floe Stratos",     id: "0xea33fe41c7512a1a36be417b0ce400ada0db0d9fe54f2ade75662aaef987de2e" },
  { name: "Floe Multi-Venue", id: "0x1ea69d68c9230470f107361c56763e3eed429f4b44de57ae73731c1f4bd6aabc" },
  { name: "Floe Reserve",     id: "0xa9e3b73d72c739216b4e8481149a42a91c1efe4edda21b09cada8376c5c68ea1" },
  { name: "Range Ladder",     id: "0x0edf9e5185eaa08d1602d61723b59d66431c0bf717c3ad257ada9fcbd4da005f" },
  { name: "Delta-Hedged",     id: "0x44ac091ac377bb4fc97e721d6fd507c0e7ed5e293df1aeb9a4cea718fb893df0" },
];

const addrs = (process.argv.slice(2).join(",") || process.env.CHECK_ADDRS || "")
  .split(",").map((s) => s.trim()).filter(Boolean);
if (addrs.length === 0) throw new Error("pass addresses: npx tsx scripts/check-caps.ts <addr> [<addr> ...]");
const short = (a: string) => `${a.slice(0, 8)}…${a.slice(-4)}`;

// vault_id -> { OwnerCap: owner, ExecCap: owner } across the checked addresses
const held = new Map<string, { OwnerCap?: string; ExecCap?: string }>();
for (const owner of addrs) {
  for (const suffix of ["OwnerCap", "ExecCap"] as const) {
    let cursor: string | null | undefined = null;
    for (;;) {
      const r: any = await sui.getOwnedObjects({
        owner, filter: { StructType: `${ORIG}::floe::${suffix}` }, options: { showContent: true }, cursor,
      });
      for (const o of r.data ?? []) {
        const vid = o.data?.content?.fields?.vault_id;
        if (!vid) continue;
        const e = held.get(vid) ?? {};
        e[suffix] = owner;
        held.set(vid, e);
      }
      if (!r.hasNextPage) break;
      cursor = r.nextCursor;
    }
  }
}

console.log(`Checking ${addrs.length} address(es): ${addrs.map(short).join(", ")}\n`);
let allBoth = true;
for (const v of VAULTS) {
  const e = held.get(v.id) ?? {};
  const oc = e.OwnerCap ? short(e.OwnerCap) : "❌ NOT in checked addrs";
  const ec = e.ExecCap ? short(e.ExecCap) : "❌ NOT in checked addrs";
  const same = e.OwnerCap && e.ExecCap && e.OwnerCap === e.ExecCap;
  if (!same) allBoth = false;
  console.log(`${v.name.padEnd(16)}  OwnerCap=${oc.padEnd(24)}  ExecCap=${ec.padEnd(24)}  ${same ? "✓ same wallet" : "⚠ split / missing"}`);
}
console.log(`\n${allBoth ? "✓ Every vault has BOTH caps under one of the checked wallets — re-anchor can sign."
  : "⚠ Some vault's OwnerCap+ExecCap are split or missing — re-anchor (attest-all) will fail until one wallet holds both per vault."}`);

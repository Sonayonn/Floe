/**
 * Shared keeper plumbing for the Floe enclave attestation flow.
 * Consumed by attest-all.ts (one-shot full registration) and heartbeat.ts (loop).
 *
 * The enclave generates an EPHEMERAL ed25519 key on every boot (main.rs:24), so its
 * signing pubkey changes each spin-up. attest-all re-registers that pubkey on every
 * vault/pool/oracle; heartbeat keeps PLP-holding vaults' valuations fresh.
 */
import { readFileSync } from "node:fs";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { fromHex } from "@mysten/sui/utils";
import { FloeClient } from "../src/index.ts";
import { FLOE_ADDRESSES } from "../src/constants.ts";

export const A = FLOE_ADDRESSES.testnet;
export const DUSDC = A.refVaultQType; // 0xe95040…::dusdc::DUSDC — quote of every live vault
export const ORIG = A.packageOriginal; // type-origin pkg: OwnerCap/ExecCap are `${ORIG}::floe::*`

export const ENCLAVE = (process.env.FLOE_ENCLAVE_URL ?? "").replace(/\/$/, "");
/** PCR0 stamped onto each vault by floe::register_enclave (label; sets attested=true). */
export const PCR0 = process.env.FLOE_PCR0 ?? A.nav.pcr0;

if (!process.env.SUI_PRIVATE_KEY) throw new Error("SUI_PRIVATE_KEY missing");

const founder = Ed25519Keypair.fromSecretKey(decodeSuiPrivateKey(process.env.SUI_PRIVATE_KEY!).secretKey);
// Fresh deployer key (curator of Range Ladder + Delta-Hedged) — from the gitignored key file.
function loadFresh(): Ed25519Keypair {
  const raw = readFileSync(new URL("./.fresh-deployer.key", import.meta.url), "utf8");
  const sk = raw.match(/secretKey=(\S+)/)?.[1];
  if (!sk) throw new Error(".fresh-deployer.key: secretKey= line not found");
  return Ed25519Keypair.fromSecretKey(decodeSuiPrivateKey(sk).secretKey);
}
const fresh = loadFresh();

export const floeFounder = new FloeClient({ network: "testnet", signer: founder });
export const floeFresh = new FloeClient({ network: "testnet", signer: fresh });
export const clientFor = (holder: Holder) => (holder === "fresh" ? floeFresh : floeFounder);
export const addrFor = (holder: Holder) => (holder === "fresh" ? fresh.toSuiAddress() : founder.toSuiAddress());

export type Holder = "founder" | "fresh";
export interface VaultRef { name: string; vaultId: string; sType: string; holder: Holder; }

/** The 5 registry vaults that read against the enclave. Quote = DUSDC for all. */
export const VAULTS: VaultRef[] = [
  { name: "Floe Stratos",     vaultId: "0xea33fe41c7512a1a36be417b0ce400ada0db0d9fe54f2ade75662aaef987de2e", sType: A.refVaultSType, holder: "founder" },
  { name: "Floe Multi-Venue", vaultId: "0x1ea69d68c9230470f107361c56763e3eed429f4b44de57ae73731c1f4bd6aabc", sType: "0x6aa8862e649327ba2f4ec8622be8d4d602ed8fffbf0dd632afa4c08498613e10::share::SHARE", holder: "founder" },
  { name: "Floe Reserve",     vaultId: "0xa9e3b73d72c739216b4e8481149a42a91c1efe4edda21b09cada8376c5c68ea1", sType: "0x9e93a58367e189fcb3131bbde65d727f7ece940cfb805f4dbae2ffcebddcefe6::share::SHARE", holder: "founder" },
  { name: "Range Ladder",     vaultId: "0x0edf9e5185eaa08d1602d61723b59d66431c0bf717c3ad257ada9fcbd4da005f", sType: "0xea7f151c447875f5886bd3d0943b4021f1e85edf4e9bd2a8dceab9e7a16a4fba::share::SHARE", holder: "fresh" },
  { name: "Delta-Hedged",     vaultId: "0x44ac091ac377bb4fc97e721d6fd507c0e7ed5e293df1aeb9a4cea718fb893df0", sType: "0x766e4ce2ef457e1475c602a5d893ccc7f577b1ed183fdfa971f3dfde83f65ca0::share::SHARE", holder: "fresh" },
];

export const hexBytes = (h: string) => Array.from(fromHex(h.replace(/^0x/, "")));

/**
 * Retry an IDEMPOTENT RPC read through a transient network blip. Sui fullnodes drop
 * sockets under load (UND_ERR_SOCKET / "other side closed"), and a single one must not
 * abort a multi-vault attest run after earlier vaults already landed. Only safe for reads —
 * never wrap a signAndExecute, which would risk double-submitting.
 */
export async function rpcRetry<T>(fn: () => Promise<T>, tries = 5): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e) {
      lastErr = e;
      const msg = String((e as any)?.message ?? e) + " " + String((e as any)?.cause?.code ?? "");
      const transient = /fetch failed|UND_ERR_SOCKET|other side closed|ECONNRESET|ETIMEDOUT|socket hang up|EAI_AGAIN|\b(429|502|503|504)\b/i.test(msg);
      if (!transient || i === tries - 1) throw e;
      await new Promise((r) => setTimeout(r, Math.min(500 * 2 ** i, 8000)));
    }
  }
  throw lastErr;
}

/** Resolve a vault's owned cap (OwnerCap/ExecCap) by paging the holder's objects and
 *  matching the cap's `vault_id` field. Caps keep type `${ORIG}::floe::<Suffix>` across upgrades. */
export async function resolveCap(client: FloeClient, owner: string, suffix: "OwnerCap" | "ExecCap", vaultId: string): Promise<string> {
  let cursor: string | null | undefined = null;
  for (;;) {
    const r: any = await rpcRetry(() => client.sui.getOwnedObjects({
      owner, filter: { StructType: `${ORIG}::floe::${suffix}` }, options: { showContent: true }, cursor,
    }));
    for (const o of r.data ?? []) {
      const f = o.data?.content?.fields;
      if (f?.vault_id === vaultId) return o.data.objectId as string;
    }
    if (!r.hasNextPage) break;
    cursor = r.nextCursor;
  }
  throw new Error(`${suffix} for vault ${vaultId.slice(0, 10)}… not found under ${owner.slice(0, 10)}…`);
}

export interface HeartbeatSig { plp_price: number; plp_held: number; timestamp_ms: number; signature: string; pubkey: string; }

/** Ask the enclave to sign a NAV heartbeat over BCS(vault_id ‖ plp_price ‖ timestamp_ms). */
export async function signHeartbeat(vaultId: string, plpPrice: bigint, plpHeld: bigint): Promise<HeartbeatSig> {
  const res = await fetch(`${ENCLAVE}/sign_heartbeat`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ payload: { vault_id: hexBytes(vaultId), plp_price: Number(plpPrice), plp_held: Number(plpHeld) } }),
  });
  if (!res.ok) throw new Error(`sign_heartbeat ${res.status}: ${await res.text()}`);
  return res.json() as Promise<HeartbeatSig>;
}

/** Read a vault's ACTUAL PLP custody (the PlpKey balance), not the `plp_held` counter — the
 *  on-chain counter can drift from real custody (it's set by the operator, unsigned). The PlpKey
 *  dynamic-field key is tagged with whichever package version was live when it was created, which
 *  varies across upgrades, so we enumerate and suffix-match rather than hardcode the address. */
export async function readPlpCustody(vaultId: string): Promise<bigint> {
  let cursor: string | null | undefined = null;
  for (;;) {
    const page: any = await rpcRetry(() => floeFounder.sui.getDynamicFields({ parentId: vaultId, cursor }));
    for (const fld of page.data ?? []) {
      if (String(fld.name?.type ?? "").endsWith("::floe::PlpKey")) {
        const obj: any = await rpcRetry(() => floeFounder.sui.getObject({ id: fld.objectId, options: { showContent: true } }));
        const val = obj.data?.content?.fields?.value;
        // Balance<PLP> surfaces as a bare u64 here; tolerate a nested { value } just in case.
        return BigInt(typeof val === "object" && val !== null ? (val.value ?? val.fields?.value ?? 0) : (val ?? 0));
      }
    }
    if (!page.hasNextPage) break;
    cursor = page.nextCursor;
  }
  return 0n; // no PLP custody → idle vault
}

/** Correct PLP price in 9dp (PLP_PRICE_SCALE), derived from the predict pool's own accounting:
 *  price = quote backing / PLP supply. This is the LP NAV-per-share the vault would redeem at;
 *  it is what `plp_price_cached` must hold so `current_nav` values PLP correctly. */
export async function plpPoolPrice(): Promise<bigint> {
  const o: any = await rpcRetry(() => floeFounder.sui.getObject({ id: A.predict.object, options: { showContent: true } }));
  const f = o.data?.content?.fields ?? {};
  const balance = BigInt(f.vault?.fields?.balance ?? 0);                              // dUSDC backing the pool
  const supply  = BigInt(f.treasury_cap?.fields?.total_supply?.fields?.value ?? 0);   // PLP in circulation
  if (supply === 0n) return 1_000_000_000n; // empty pool → par (1.0 @ 9dp)
  return (balance * 1_000_000_000n) / supply;                                         // 9dp price
}

/** Read a vault's live plp_held (REAL custody) + cached plp_price (drives idle-vs-PLP handling). */
export async function readVaultPlp(vaultId: string): Promise<{ plpHeld: bigint; plpPrice: bigint }> {
  const o: any = await rpcRetry(() => floeFounder.sui.getObject({ id: vaultId, options: { showContent: true } }));
  const f = o.data?.content?.fields ?? {};
  const plpHeld = await readPlpCustody(vaultId); // real PLP balance, not the drift-prone counter
  return { plpHeld, plpPrice: BigInt(f.plp_price_cached ?? 0) };
}

if (!ENCLAVE) throw new Error("FLOE_ENCLAVE_URL is not set — point it at the live enclave (e.g. http://<ec2-ip>:3000)");

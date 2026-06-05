/**
 * Walrus — Floe's tamper-evident audit trail.
 *
 * Every rebalance / NAV update writes a JSON snapshot to Walrus (decentralized blob
 * storage); the blob id is indexed ON-CHAIN on the vault (append-only). Anyone can
 * reconstruct the vault's full history from the on-chain blob list + the aggregator.
 * This is the "auditable performance" half of the moat — paired with Nautilus
 * attestation (the NAV is proven) and Seal (the strategy stays private).
 *
 * HTTP mode: PUT to a publisher (it pays storage on testnet), GET from an aggregator.
 */
import { Transaction } from '@mysten/sui/transactions';
import type { FloeClient } from '../client.ts';

const PUBLISHER = 'https://publisher.walrus-testnet.walrus.space';
const AGGREGATOR = 'https://aggregator.walrus-testnet.walrus.space';

/** A Floe rebalance/NAV snapshot — the canonical audit record. */
export interface FloeSnapshot {
  vaultId: string;
  nav: string;            // 6dp raw, as string (bigint-safe)
  sharePrice: string;
  plpHeld: string;
  plpPrice: string;
  positionsMarkTotal: string;
  volBps?: string;        // optional: the vol index at snapshot time
  attested?: boolean;
  timestampMs: number;
  txDigest?: string;      // the rebalance tx this snapshot accompanies
  // ── attested track record (the verifiable-performance proof) ──
  settledTotal?: string;        // certain/resolved value at snapshot time
  unsettledMarks?: string;      // soft mark tier at snapshot time
  pctCertain?: number;          // % of NAV provable at snapshot time
  navSignatureHex?: string;     // enclave signature over (nav, plpPrice, vaultId, ts) — the proof
  plpPriceAtSnapshot?: string;  // the attested plp_price (for re-verification)
}

export interface StoredBlob {
  blobId: string;
  /** the Sui Blob object id (if newlyCreated). */
  blobObjectId?: string;
  size: number;
}

/** Store a JSON snapshot on Walrus via the public testnet publisher (free). */
export async function storeSnapshot(snap: FloeSnapshot, epochs = 5): Promise<StoredBlob> {
  const body = JSON.stringify(snap);
  const res = await fetch(`${PUBLISHER}/v1/blobs?epochs=${epochs}`, {
    method: 'PUT', body,
  });
  if (!res.ok) throw new Error(`walrus publisher ${res.status}: ${await res.text()}`);
  const j: any = await res.json();
  const created = j.newlyCreated?.blobObject;
  const certified = j.alreadyCertified;
  if (created) return { blobId: created.blobId, blobObjectId: created.id, size: created.size };
  if (certified) return { blobId: certified.blobId, size: 0 };
  throw new Error('unexpected walrus response: ' + JSON.stringify(j).slice(0, 200));
}

/** Read a snapshot back from Walrus by blob id (via the aggregator). */
export async function readSnapshot(blobId: string): Promise<FloeSnapshot> {
  const res = await fetch(`${AGGREGATOR}/v1/blobs/${blobId}`);
  if (!res.ok) throw new Error(`walrus aggregator ${res.status} for ${blobId}`);
  return (await res.json()) as FloeSnapshot;
}

/** Index a blob id on-chain on the vault (append-only). Requires the ExecCap + signer. */
export async function recordBlob(
  floe: FloeClient,
  opts: { vaultId: string; execCap: string; blobId: string; types: [string, string] },
): Promise<string> {
  if (!floe.signer) throw new Error('recordBlob requires a signer');
  const a = floe.addresses;
  const tx = new Transaction();
  tx.moveCall({
    target: `${a.package}::${a.module}::record_walrus_blob`,
    typeArguments: opts.types,
    arguments: [
      tx.object(opts.vaultId),
      tx.object(opts.execCap),
      tx.pure.vector('u8', Array.from(new TextEncoder().encode(opts.blobId))),
    ],
  });
  const res = await floe.sui.signAndExecuteTransaction({
    signer: floe.signer, transaction: tx, options: { showEffects: true },
  });
  if (res.effects?.status?.status !== 'success') {
    throw new Error(`record_walrus_blob failed: ${res.effects?.status?.error}`);
  }
  return res.digest;
}

/** Read the on-chain blob-id list from the vault (decoded from bytes to strings). */
export async function listBlobIds(floe: FloeClient, vaultId: string): Promise<string[]> {
  const o = await floe.sui.getObject({ id: vaultId, options: { showContent: true } });
  const raw = ((o.data?.content as any)?.fields?.walrus_blob_ids ?? []) as number[][];
  return raw.map((bytes) => new TextDecoder().decode(new Uint8Array(bytes)));
}

/** Reconstruct the full vault history: on-chain blob ids → snapshots from Walrus. */
export async function reconstructHistory(floe: FloeClient, vaultId: string): Promise<FloeSnapshot[]> {
  const ids = await listBlobIds(floe, vaultId);
  const out: FloeSnapshot[] = [];
  for (const id of ids) {
    try { out.push(await readSnapshot(id)); } catch { /* skip unavailable */ }
  }
  return out;
}

export const WALRUS_TESTNET = { publisher: PUBLISHER, aggregator: AGGREGATOR };

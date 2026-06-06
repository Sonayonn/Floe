/**
 * Vol — the Floe on-chain implied-volatility index.
 *
 * floe_vol_index::vol_now computes ATM implied vol ENTIRELY ON-CHAIN from DeepBook
 * Predict's Block Scholes SVI oracle. Any protocol can read it synchronously. This
 * module surfaces: the live compute (volNow, via devInspect — no gas), the stored
 * snapshot (currentVol), and the snapshot action (updateVolIndex).
 */
import { Transaction } from '@mysten/sui/transactions';
import type { FloeClient } from '../client.ts';

const u64le = (bytes: number[]): bigint => {
  let v = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) v = (v << 8n) + BigInt(bytes[i]);
  return v;
};

/** Live ATM implied vol (basis points) computed on-chain from the SVI oracle.
 *  Read-only via devInspect — no gas, no signer required. Defaults to the BTC oracle. */
export async function volNow(floe: FloeClient, oracleId?: string): Promise<bigint> {
  const a = floe.addresses;
  const oracle = oracleId ?? a.predict.btcOracle;
  const tx = new Transaction();
  tx.moveCall({
    target: `${a.vol.package}::${a.vol.module}::vol_now`,
    arguments: [tx.object(oracle), tx.object(a.clock)],
  });
  const r = await floe.sui.devInspectTransactionBlock({
    transactionBlock: tx,
    sender: floe.address ?? '0x0000000000000000000000000000000000000000000000000000000000000000',
  });
  const rv = r.results?.[0]?.returnValues?.[0];
  if (!rv) throw new Error('vol_now returned no value');
  return u64le(rv[0] as number[]);
}

export interface VolSnapshot {
  volBps: bigint;
  spot: bigint;
  expiryMs: bigint;
  updatedMs: bigint;
  samples: bigint;
}

/** Read the stored VolIndex snapshot (the last update_vol_index). */
export async function currentVol(floe: FloeClient): Promise<VolSnapshot> {
  const o = await floe.sui.getObject({
    id: floe.addresses.vol.volIndex,
    options: { showContent: true },
  });
  const f = (o.data?.content as any)?.fields ?? {};
  return {
    volBps: BigInt(f.vol_bps ?? 0),
    spot: BigInt(f.spot ?? 0),
    expiryMs: BigInt(f.expiry_ms ?? 0),
    updatedMs: BigInt(f.updated_ms ?? 0),
    samples: BigInt(f.samples ?? 0),
  };
}

/** Snapshot the live vol into the shared VolIndex (requires a signer). */
export async function updateVolIndex(floe: FloeClient, oracleId?: string): Promise<string> {
  if (!floe.signer) throw new Error('updateVolIndex requires a signer');
  const a = floe.addresses;
  const oracle = oracleId ?? a.predict.btcOracle;
  const tx = new Transaction();
  tx.moveCall({
    target: `${a.vol.package}::${a.vol.module}::update_vol_index`,
    arguments: [tx.object(a.vol.volIndex), tx.object(oracle), tx.object(a.clock)],
  });
  const res = await floe.sui.signAndExecuteTransaction({
    signer: floe.signer, transaction: tx, options: { showEffects: true },
  });
  return res.digest;
}

/** Convenience: vol as a human percentage (e.g. 5132 bps -> 51.32). */
export const bpsToPercent = (bps: bigint): number => Number(bps) / 100;

// ─── Attested vol (Floe Index) ───────────────────────────────────────────────
import { fromHex } from '@mysten/sui/utils';

/** Register the enclave attester pubkey on the VolIndex (one-time, 32-byte ed25519 key). */
export async function registerVolAttester(
  floe: FloeClient, o: { pubkeyHex: string },
): Promise<string> {
  if (!floe.signer) throw new Error('registerVolAttester requires a signer');
  const a = floe.addresses;
  const tx = new Transaction();
  tx.moveCall({
    target: `${a.vol.package}::${a.vol.module}::register_vol_attester`,
    arguments: [tx.object(a.vol.volIndex), tx.pure.vector('u8', Array.from(fromHex(o.pubkeyHex.replace(/^0x/, ''))))],
  });
  const res = await floe.sui.signAndExecuteTransaction({ signer: floe.signer, transaction: tx, options: { showEffects: true } });
  if (res.effects?.status?.status !== 'success') throw new Error(`register_vol_attester failed: ${res.effects?.status?.error}`);
  return res.digest;
}

/** Submit an enclave-signed vol reading. Anyone may call; the contract verifies the signature
 *  against the registered key, binding vol to the on-chain oracle id + a freshness window. */
export async function updateVolAttested(
  floe: FloeClient,
  o: { oracleId: string; volBps: bigint; spot: bigint; timestampMs: bigint; signatureHex: string },
): Promise<string> {
  if (!floe.signer) throw new Error('updateVolAttested requires a signer');
  const a = floe.addresses;
  const tx = new Transaction();
  tx.moveCall({
    target: `${a.vol.package}::${a.vol.module}::update_vol_attested`,
    arguments: [
      tx.object(a.vol.volIndex),
      tx.pure.id(o.oracleId),
      tx.pure.u64(o.volBps),
      tx.pure.u64(o.spot),
      tx.pure.u64(o.timestampMs),
      tx.pure.vector('u8', Array.from(fromHex(o.signatureHex.replace(/^0x/, '')))),
      tx.object(a.clock),
    ],
  });
  const res = await floe.sui.signAndExecuteTransaction({ signer: floe.signer, transaction: tx, options: { showEffects: true } });
  if (res.effects?.status?.status !== 'success') throw new Error(`update_vol_attested failed: ${res.effects?.status?.error}`);
  return res.digest;
}

export interface AttestedVolReading {
  volBps: bigint; spot: bigint; oracleId: string; timestampMs: bigint; fresh: boolean;
}

/** Read the attested vol record (the VERIFIABLE vol number + freshness). devInspect, no gas. */
export async function attestedVol(floe: FloeClient): Promise<AttestedVolReading> {
  const a = floe.addresses;
  const tx = new Transaction();
  tx.moveCall({
    target: `${a.vol.package}::${a.vol.module}::attested_vol`,
    arguments: [tx.object(a.vol.volIndex), tx.object(a.clock)],
  });
  const r = await floe.sui.devInspectTransactionBlock({
    transactionBlock: tx,
    sender: floe.address ?? '0x0000000000000000000000000000000000000000000000000000000000000000',
  });
  const rv = r.results?.[0]?.returnValues;
  if (!rv || rv.length < 5) throw new Error('attested_vol returned no value (none registered yet?)');
  const u64 = (b: number[]): bigint => { let v = 0n; for (let i = b.length - 1; i >= 0; i--) v = (v << 8n) + BigInt(b[i]); return v; };
  const idHex = '0x' + (rv[2][0] as number[]).map(x => x.toString(16).padStart(2, '0')).join('');
  return {
    volBps: u64(rv[0][0] as number[]),
    spot: u64(rv[1][0] as number[]),
    oracleId: idHex,
    timestampMs: u64(rv[3][0] as number[]),
    fresh: (rv[4][0] as number[])[0] === 1,
  };
}

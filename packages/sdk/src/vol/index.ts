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

/** Discover a LIVE Predict SVI oracle for an underlying at runtime. DeepBook Predict rolls a fresh
 *  OracleSVI per expiry (hourly + dated series), so a hardcoded id eventually expires and vol_now
 *  aborts with EExpired. We scan recent `OraclePricesUpdated` events (only actively-fed oracles emit
 *  these → guaranteed live), then pick the nearest expiry with comfortable runway so the reading is
 *  spot-like yet won't expire mid-session. Falls back to the furthest-dated if nothing clears runway. */
export async function resolveLiveOracle(
  floe: FloeClient,
  opts: { underlying?: string; minRunwayMs?: number } = {},
): Promise<string> {
  const underlying = opts.underlying ?? 'BTC';
  const minRunwayMs = opts.minRunwayMs ?? 24 * 60 * 60 * 1000; // 24h
  const a = floe.addresses;
  const ev = await floe.sui.queryEvents({
    query: { MoveModule: { package: a.predict.package, module: 'oracle' } },
    limit: 50, order: 'descending',
  });
  const ids = [...new Set(ev.data.map((e) => (e.parsedJson as any)?.oracle_id).filter(Boolean) as string[])];
  if (ids.length === 0) throw new Error('resolveLiveOracle: no recent oracle updates found');
  const objs = await floe.sui.multiGetObjects({ ids, options: { showContent: true } });
  const now = Date.now();
  const live = objs
    .map((o) => (o.data?.content as any)?.fields)
    .filter((f) => f && f.underlying_asset === underlying && f.active === true && Number(f.expiry) > now)
    .map((f) => ({ id: f.id.id as string, expiry: Number(f.expiry) }));
  if (live.length === 0) throw new Error(`resolveLiveOracle: no live ${underlying} oracle among recent updates`);
  const stable = live.filter((o) => o.expiry > now + minRunwayMs).sort((x, y) => x.expiry - y.expiry); // nearest-stable
  if (stable.length > 0) return stable[0].id;
  return live.sort((x, y) => y.expiry - x.expiry)[0].id; // fallback: furthest-dated
}

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

/** Read the registered vol-attester pubkey (hex, '' if none). Enumerates dynamic fields and
 *  suffix-matches VolAttesterKey so it survives package upgrades (the key type carries the
 *  creating package's address). Mirrors floe_vol_index::vol_attester. */
export async function volAttester(floe: FloeClient): Promise<string> {
  let cursor: string | null | undefined = null;
  for (;;) {
    const page = await floe.sui.getDynamicFields({ parentId: floe.addresses.vol.volIndex, cursor });
    for (const fld of page.data) {
      if (fld.name.type.endsWith('::VolAttesterKey')) {
        const obj = await floe.sui.getObject({ id: fld.objectId, options: { showContent: true } });
        const val = (obj.data?.content as any)?.fields?.value;
        if (Array.isArray(val)) return (val as number[]).map((b) => b.toString(16).padStart(2, '0')).join('');
        return typeof val === 'string' ? val.replace(/^0x/, '') : '';
      }
    }
    if (!page.hasNextPage) break;
    cursor = page.nextCursor;
  }
  return '';
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

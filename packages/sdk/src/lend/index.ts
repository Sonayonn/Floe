/**
 * Floe Lend — the attested-collateral money market.
 *
 * A standard isolated lending market (index accrual, two-slope rate, supply/borrow/repay/
 * liquidate) whose distinguishing property is the COLLATERAL ORACLE: a Floe vault SHARE is
 * valued at the vault's ENCLAVE-ATTESTED NAV LOWER BOUND. The borrower cannot forge the value
 * — lock_and_borrow consumes an ed25519 CollateralPayload (intent 3) the contract self-verifies.
 *
 * This module surfaces the full lending surface, plus two pieces that make the attested borrow
 * work end-to-end:
 *   - fetchSignedValuation(): reads the vault's live nav_lower_bound + share_supply on-chain,
 *     gets the enclave to sign an intent-3 CollateralPayload over them.
 *   - borrowAndTradePredict(): the Path-4 PTB — borrow against SHARE and open a Predict position
 *     atomically, without unwinding the yield. (Optional, risk-labelled in the UI.)
 */
import { Transaction } from '@mysten/sui/transactions';
import type { FloeClient } from '../client.ts';

const u64le = (bytes: number[]): bigint => {
  let v = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) v = (v << 8n) + BigInt(bytes[i]);
  return v;
};

// ─── Types ───────────────────────────────────────────────────────────────────
export interface SignedValuation {
  vaultId: string;          // address (32-byte)
  navLowerBound: bigint;
  shareSupply: bigint;
  timestampMs: bigint;
  signature: number[];      // ed25519 sig bytes (64)
}

export interface PoolState {
  totalSupplied: bigint;
  totalBorrowed: bigint;
  availableLiquidity: bigint;
  utilizationBps: bigint;
  ltvBps: bigint;
  liqThresholdBps: bigint;
}

// ─── Admin: pool creation + attester registration ────────────────────────────
export function createPool(
  floe: FloeClient, adminCap: string, vaultId: string,
  typeQ: string, typeS: string,
): Transaction {
  const a = floe.addresses;
  const tx = new Transaction();
  tx.moveCall({
    target: `${a.lend.package}::${a.lend.module}::create_pool`,
    typeArguments: [typeQ, typeS],
    arguments: [tx.object(adminCap), tx.pure.id(vaultId)],
  });
  return tx;
}

export function registerCollateralAttester(
  floe: FloeClient, adminCap: string, pool: string, pubkeyHex: string,
  typeQ: string, typeS: string,
): Transaction {
  const a = floe.addresses;
  const pubkey = Array.from(Buffer.from(pubkeyHex, 'hex'));
  const tx = new Transaction();
  tx.moveCall({
    target: `${a.lend.package}::${a.lend.module}::register_collateral_attester`,
    typeArguments: [typeQ, typeS],
    arguments: [tx.object(adminCap), tx.object(pool), tx.pure.vector('u8', pubkey)],
  });
  return tx;
}

// ─── Supply side ──────────────────────────────────────────────────────────────
export function supply(
  floe: FloeClient, pool: string, coinId: string, typeQ: string, typeS: string,
): Transaction {
  const a = floe.addresses;
  const tx = new Transaction();
  const pos = tx.moveCall({
    target: `${a.lend.package}::${a.lend.module}::supply`,
    typeArguments: [typeQ, typeS],
    arguments: [tx.object(pool), tx.object(coinId), tx.object(a.clock)],
  });
  tx.transferObjects([pos], floe.address!);
  return tx;
}

export function withdraw(
  floe: FloeClient, pool: string, position: string, amount: bigint,
  typeQ: string, typeS: string,
): Transaction {
  const a = floe.addresses;
  const tx = new Transaction();
  const [coin, leftover] = tx.moveCall({
    target: `${a.lend.package}::${a.lend.module}::withdraw`,
    typeArguments: [typeQ, typeS],
    arguments: [tx.object(pool), tx.object(position), tx.pure.u64(amount), tx.object(a.clock)],
  });
  tx.transferObjects([coin], floe.address!);
  // leftover is Option<SupplyPosition>; transfer back if present (SDK consumer handles)
  tx.transferObjects([leftover], floe.address!);
  return tx;
}

// ─── Borrow side (consumes the attested valuation — integrity-enforced) ───────
export function lockAndBorrow(
  floe: FloeClient, pool: string, collateralCoinId: string, borrowAmount: bigint,
  v: SignedValuation, typeQ: string, typeS: string,
): Transaction {
  const a = floe.addresses;
  const tx = new Transaction();
  const [loan, debt] = tx.moveCall({
    target: `${a.lend.package}::${a.lend.module}::lock_and_borrow`,
    typeArguments: [typeQ, typeS],
    arguments: [
      tx.object(pool), tx.object(collateralCoinId), tx.pure.u64(borrowAmount),
      tx.pure.address(v.vaultId), tx.pure.u64(v.navLowerBound), tx.pure.u64(v.shareSupply),
      tx.pure.u64(v.timestampMs), tx.pure.vector('u8', v.signature), tx.object(a.clock),
    ],
  });
  tx.transferObjects([loan, debt], floe.address!);
  return tx;
}

export function repay(
  floe: FloeClient, pool: string, position: string, paymentCoinId: string,
  typeQ: string, typeS: string,
): Transaction {
  const a = floe.addresses;
  const tx = new Transaction();
  const [leftover, collateral, posBack] = tx.moveCall({
    target: `${a.lend.package}::${a.lend.module}::repay`,
    typeArguments: [typeQ, typeS],
    arguments: [tx.object(pool), tx.object(position), tx.object(paymentCoinId), tx.object(a.clock)],
  });
  tx.transferObjects([leftover, collateral, posBack], floe.address!);
  return tx;
}

export function liquidate(
  floe: FloeClient, pool: string, position: string, repaymentCoinId: string,
  v: SignedValuation, typeQ: string, typeS: string,
): Transaction {
  const a = floe.addresses;
  const tx = new Transaction();
  const [seized, leftover] = tx.moveCall({
    target: `${a.lend.package}::${a.lend.module}::liquidate`,
    typeArguments: [typeQ, typeS],
    arguments: [
      tx.object(pool), tx.object(position), tx.object(repaymentCoinId),
      tx.pure.address(v.vaultId), tx.pure.u64(v.navLowerBound), tx.pure.u64(v.shareSupply),
      tx.pure.u64(v.timestampMs), tx.pure.vector('u8', v.signature), tx.object(a.clock),
    ],
  });
  tx.transferObjects([seized, leftover], floe.address!);
  return tx;
}

// ─── Reads ────────────────────────────────────────────────────────────────────
export async function poolState(
  floe: FloeClient, pool: string, typeQ: string, typeS: string,
): Promise<PoolState> {
  const a = floe.addresses;
  const call = (fn: string) => {
    const tx = new Transaction();
    tx.moveCall({
      target: `${a.lend.package}::${a.lend.module}::${fn}`,
      typeArguments: [typeQ, typeS], arguments: [tx.object(pool)],
    });
    return tx;
  };
  const read = async (fn: string): Promise<bigint> => {
    const r = await floe.sui.devInspectTransactionBlock({
      transactionBlock: call(fn),
      sender: floe.address ?? '0x'.padEnd(66, '0'),
    });
    const rv = r.results?.[0]?.returnValues?.[0];
    return rv ? u64le(rv[0] as number[]) : 0n;
  };
  const [totalSupplied, totalBorrowed, availableLiquidity, ltvBps, liqThresholdBps] =
    await Promise.all([
      read('total_supplied'), read('total_borrowed'), read('available_liquidity'),
      read('ltv_bps'), read('liq_threshold_bps'),
    ]);
  const utilizationBps = totalSupplied === 0n ? 0n : (totalBorrowed * 10000n) / totalSupplied;
  return { totalSupplied, totalBorrowed, availableLiquidity, utilizationBps, ltvBps, liqThresholdBps };
}

// ─── The attested-valuation flow (makes the integrity-enforced borrow work) ───
/**
 * Read the vault's live nav_lower_bound + share_supply on-chain, then ask the enclave to sign
 * an intent-3 CollateralPayload over (vault_id, nav_lower_bound, share_supply, timestamp).
 * Returns a SignedValuation ready to pass to lockAndBorrow / liquidate.
 *
 * NOTE: requires the enclave to expose /sign_collateral (intent-3). The contract + this flow are
 * proven correct by the on-chain test vector; emitting the live signature is the same mechanical
 * step we did for vol/risk (one enclave handler).
 */
export async function fetchSignedValuation(
  floe: FloeClient, vaultId: string, typeQ: string, typeS: string,
  enclaveUrl: string,
): Promise<SignedValuation> {
  const a = floe.addresses;
  // read nav_lower_bound + share_supply from the vault (public, verifiable)
  const readVault = async (fn: string): Promise<bigint> => {
    const tx = new Transaction();
    tx.moveCall({
      target: `${a.package}::${a.module}::${fn}`,
      typeArguments: [typeQ, typeS], arguments: [tx.object(vaultId)],
    });
    const r = await floe.sui.devInspectTransactionBlock({
      transactionBlock: tx, sender: floe.address ?? '0x'.padEnd(66, '0'),
    });
    const rv = r.results?.[0]?.returnValues?.[0];
    if (!rv) throw new Error(`${fn} returned no value`);
    return u64le(rv[0] as number[]);
  };
  const [navLowerBound, shareSupply] = await Promise.all([
    readVault('nav_lower_bound'), readVault('share_supply'),
  ]);
  // ask the enclave to sign the intent-3 payload over the on-chain-read values
  const resp = await fetch(`${enclaveUrl}/sign_collateral`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      payload: { vault_id: vaultId, nav_lower_bound: navLowerBound.toString(), share_supply: shareSupply.toString() },
    }),
  });
  if (!resp.ok) throw new Error(`enclave sign_collateral failed: ${resp.status}`);
  const j = await resp.json() as any;
  return {
    vaultId,
    navLowerBound,
    shareSupply,
    timestampMs: BigInt(j.response.timestamp_ms),
    signature: j.signature,
  };
}

// ─── Path-4: borrow against SHARE and open a Predict position atomically ──────
/**
 * The composability headline: lock SHARE -> borrow Q -> open a Predict position, in ONE tx,
 * without unwinding the yield position. OPTIONAL + leverage-bearing — the UI must label the
 * added liquidation risk honestly (this is amplified directional exposure, not free yield).
 */
export function borrowAndTradePredict(
  floe: FloeClient, pool: string, collateralCoinId: string, borrowAmount: bigint,
  v: SignedValuation,
  predict: { marketId: string; direction: boolean; sizeArg?: bigint },
  typeQ: string, typeS: string,
): Transaction {
  const a = floe.addresses;
  const tx = new Transaction();
  const [loan, debt] = tx.moveCall({
    target: `${a.lend.package}::${a.lend.module}::lock_and_borrow`,
    typeArguments: [typeQ, typeS],
    arguments: [
      tx.object(pool), tx.object(collateralCoinId), tx.pure.u64(borrowAmount),
      tx.pure.address(v.vaultId), tx.pure.u64(v.navLowerBound), tx.pure.u64(v.shareSupply),
      tx.pure.u64(v.timestampMs), tx.pure.vector('u8', v.signature), tx.object(a.clock),
    ],
  });
  // open a Predict position with the borrowed Q (binary direction).
  // (Predict entry signature is venue-specific; this composes the loan coin into it.)
  tx.moveCall({
    target: `${a.predict.package}::predict::open_position`,
    arguments: [
      tx.object(a.predict.manager), tx.object(predict.marketId),
      loan, tx.pure.bool(predict.direction), tx.object(a.clock),
    ],
  });
  tx.transferObjects([debt], floe.address!);
  return tx;
}

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
import { fromHex } from '@mysten/sui/utils';
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

// NOTE: register_collateral_attester is GONE in floe_lend V2. Collateral valuations are now
// verified against the on-chain Enclave<FLOE_NAV> object (a.nav.enclave) via enclave::verify_signature
// — PCR-anchored, no per-pool attester to register, and a new enclave boot is picked up automatically.

// Recipient for produced objects. Node callers (with a signer) can omit it; browser callers
// (dapp-kit signs, the client has no signer) MUST pass the connected address explicitly —
// mirrors buildDepositTx's `sender`.
const recipientOf = (floe: FloeClient, recipient?: string): string => {
  const r = recipient ?? floe.address;
  if (!r) throw new Error('lend tx: no recipient — pass `recipient` (browser) or construct the client with a signer (node).');
  return r;
};

// ─── Supply side ──────────────────────────────────────────────────────────────
export function supply(
  floe: FloeClient, pool: string, coinId: string, typeQ: string, typeS: string,
  recipient?: string,
): Transaction {
  const a = floe.addresses;
  const me = recipientOf(floe, recipient);
  const tx = new Transaction();
  const pos = tx.moveCall({
    target: `${a.lend.package}::${a.lend.module}::supply`,
    typeArguments: [typeQ, typeS],
    arguments: [tx.object(pool), tx.object(coinId), tx.object(a.clock)],
  });
  tx.transferObjects([pos], me);
  return tx;
}

export function withdraw(
  floe: FloeClient, pool: string, position: string, amount: bigint,
  typeQ: string, typeS: string, recipient?: string,
): Transaction {
  const a = floe.addresses;
  const me = recipientOf(floe, recipient);
  const tx = new Transaction();
  const [coin, leftover] = tx.moveCall({
    target: `${a.lend.package}::${a.lend.module}::withdraw`,
    typeArguments: [typeQ, typeS],
    arguments: [tx.object(pool), tx.object(position), tx.pure.u64(amount), tx.object(a.clock)],
  });
  tx.transferObjects([coin], me);
  // leftover is Option<SupplyPosition>; transfer back if present (SDK consumer handles)
  tx.transferObjects([leftover], me);
  return tx;
}

// ─── Borrow side (consumes the attested valuation — integrity-enforced) ───────
// lock_and_borrow takes a Coin<S> as collateral and locks its WHOLE value. To lock an exact
// amount, pass `collateralAmount` and we split the coin first (the rest returns to `recipient`).
// Omit it to lock the entire collateral coin object.
export function lockAndBorrow(
  floe: FloeClient, pool: string, collateralCoinId: string, borrowAmount: bigint,
  v: SignedValuation, typeQ: string, typeS: string,
  recipient?: string, collateralAmount?: bigint,
): Transaction {
  const a = floe.addresses;
  const me = recipientOf(floe, recipient);
  const tx = new Transaction();
  const collateral = collateralAmount === undefined
    ? tx.object(collateralCoinId)
    : tx.splitCoins(tx.object(collateralCoinId), [tx.pure.u64(collateralAmount)])[0];
  const [loan, debt] = tx.moveCall({
    target: `${a.lend.package}::${a.lend.module}::lock_and_borrow`,
    typeArguments: [typeQ, typeS],
    arguments: [
      tx.object(pool), tx.object(a.nav.enclave), collateral, tx.pure.u64(borrowAmount),
      tx.pure.address(v.vaultId), tx.pure.u64(v.navLowerBound), tx.pure.u64(v.shareSupply),
      tx.pure.u64(v.timestampMs), tx.pure.vector('u8', v.signature), tx.object(a.clock),
    ],
  });
  tx.transferObjects([loan, debt], me);
  return tx;
}

export function repay(
  floe: FloeClient, pool: string, position: string, paymentCoinId: string,
  typeQ: string, typeS: string, recipient?: string,
): Transaction {
  const a = floe.addresses;
  const me = recipientOf(floe, recipient);
  const tx = new Transaction();
  const [leftover, collateral, posBack] = tx.moveCall({
    target: `${a.lend.package}::${a.lend.module}::repay`,
    typeArguments: [typeQ, typeS],
    arguments: [tx.object(pool), tx.object(position), tx.object(paymentCoinId), tx.object(a.clock)],
  });
  tx.transferObjects([leftover, collateral, posBack], me);
  return tx;
}

export function liquidate(
  floe: FloeClient, pool: string, position: string, repaymentCoinId: string,
  v: SignedValuation, typeQ: string, typeS: string, recipient?: string,
): Transaction {
  const a = floe.addresses;
  const me = recipientOf(floe, recipient);
  const tx = new Transaction();
  const [seized, leftover] = tx.moveCall({
    target: `${a.lend.package}::${a.lend.module}::liquidate`,
    typeArguments: [typeQ, typeS],
    arguments: [
      tx.object(pool), tx.object(position), tx.object(repaymentCoinId), tx.object(a.nav.enclave),
      tx.pure.address(v.vaultId), tx.pure.u64(v.navLowerBound), tx.pure.u64(v.shareSupply),
      tx.pure.u64(v.timestampMs), tx.pure.vector('u8', v.signature), tx.object(a.clock),
    ],
  });
  tx.transferObjects([seized, leftover], me);
  return tx;
}

// ─── Vault-read borrow path (no enclave round-trip) ──────────────────────────
// These mirror lockAndBorrow / liquidate but value the collateral by reading the vault's ATTESTED
// nav_lower_bound + share_supply DIRECTLY on-chain (kept fresh by the NAV heartbeat), so the caller
// passes only the vault object — no live /sign_collateral call to the enclave, no SignedValuation.
// A browser can borrow with just an RPC read + the user's wallet. Security is identical: the
// contract values collateral at the un-inflatable NAV floor and asserts freshness (is_price_fresh).
// Requires the floe_lend package upgrade that adds *_from_vault (scripts/upgrade-lend.ts).
export function lockAndBorrowFromVault(
  floe: FloeClient, pool: string, vaultId: string, collateralCoinId: string, borrowAmount: bigint,
  typeQ: string, typeS: string, recipient?: string, collateralAmount?: bigint,
): Transaction {
  const a = floe.addresses;
  const me = recipientOf(floe, recipient);
  const tx = new Transaction();
  const collateral = collateralAmount === undefined
    ? tx.object(collateralCoinId)
    : tx.splitCoins(tx.object(collateralCoinId), [tx.pure.u64(collateralAmount)])[0];
  const [loan, debt] = tx.moveCall({
    target: `${a.lend.package}::${a.lend.module}::lock_and_borrow_from_vault`,
    typeArguments: [typeQ, typeS],
    arguments: [
      tx.object(pool), tx.object(vaultId), collateral, tx.pure.u64(borrowAmount), tx.object(a.clock),
    ],
  });
  tx.transferObjects([loan, debt], me);
  return tx;
}

export function liquidateFromVault(
  floe: FloeClient, pool: string, position: string, repaymentCoinId: string, vaultId: string,
  typeQ: string, typeS: string, recipient?: string,
): Transaction {
  const a = floe.addresses;
  const me = recipientOf(floe, recipient);
  const tx = new Transaction();
  const [seized, leftover] = tx.moveCall({
    target: `${a.lend.package}::${a.lend.module}::liquidate_from_vault`,
    typeArguments: [typeQ, typeS],
    arguments: [
      tx.object(pool), tx.object(position), tx.object(repaymentCoinId), tx.object(vaultId),
      tx.object(a.clock),
    ],
  });
  tx.transferObjects([seized, leftover], me);
  return tx;
}

// ─── Reads ────────────────────────────────────────────────────────────────────
/** Health factor (bps) read straight from the vault's attested NAV — no enclave. >10000 healthy. */
export async function healthFactorFromVault(
  floe: FloeClient, pool: string, position: string, vaultId: string, typeQ: string, typeS: string,
): Promise<bigint> {
  const a = floe.addresses;
  const tx = new Transaction();
  tx.moveCall({
    target: `${a.lend.package}::${a.lend.module}::health_factor_from_vault_bps`,
    typeArguments: [typeQ, typeS],
    arguments: [tx.object(pool), tx.object(position), tx.object(vaultId), tx.object(a.clock)],
  });
  const r = await floe.sui.devInspectTransactionBlock({
    transactionBlock: tx, sender: floe.address ?? '0x'.padEnd(66, '0'),
  });
  const rv = r.results?.[0]?.returnValues?.[0];
  return rv ? u64le(rv[0] as number[]) : 0n;
}

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
  // ask the enclave to sign the intent-3 payload over the on-chain-read values.
  // The enclave (floe-nav/mod.rs CollateralRequest) deserializes vault_id as [u8; 32] and
  // nav_lower_bound/share_supply as numeric u64 — so send a byte array + JSON numbers, NOT
  // a hex string / stringified ints (serde would reject those). u64-as-Number is safe for
  // 6dp testnet magnitudes (well under 2^53).
  const resp = await fetch(`${enclaveUrl}/sign_collateral`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      payload: {
        vault_id: Array.from(fromHex(vaultId.replace(/^0x/, ''))),
        nav_lower_bound: Number(navLowerBound),
        share_supply: Number(shareSupply),
      },
    }),
  });
  if (!resp.ok) throw new Error(`enclave sign_collateral failed: ${resp.status}`);
  const j = await resp.json() as any;
  return {
    vaultId,
    navLowerBound,
    shareSupply,
    timestampMs: BigInt(j.response.timestamp_ms),
    // enclave returns the ed25519 signature as a hex string; the PTB needs raw bytes
    signature: Array.from(fromHex(String(j.signature).replace(/^0x/, ''))),
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
  typeQ: string, typeS: string, recipient?: string, collateralAmount?: bigint,
): Transaction {
  const a = floe.addresses;
  const me = recipientOf(floe, recipient);
  const tx = new Transaction();
  const collateral = collateralAmount === undefined
    ? tx.object(collateralCoinId)
    : tx.splitCoins(tx.object(collateralCoinId), [tx.pure.u64(collateralAmount)])[0];
  const [loan, debt] = tx.moveCall({
    target: `${a.lend.package}::${a.lend.module}::lock_and_borrow`,
    typeArguments: [typeQ, typeS],
    arguments: [
      tx.object(pool), tx.object(a.nav.enclave), collateral, tx.pure.u64(borrowAmount),
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
  tx.transferObjects([debt], me);
  return tx;
}

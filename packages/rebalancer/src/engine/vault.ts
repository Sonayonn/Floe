/**
 * Floe engine — typed wrappers for the vault contract's entries.
 *
 * One function per Move entry the rebalancer calls. Each appends a moveCall to
 * the given PTB and returns any hot-potato result the next call must consume.
 * The receipt pattern (deploy_idle -> DeployReceipt -> confirm_deploy) is what
 * makes fund movement safe: a coin can't leave the vault without a receipt
 * that forces the caller to account for the result in the same PTB.
 *
 * All fund-moving entries are gated by RebalancerCap (cannot withdraw to
 * arbitrary addresses — only execute strategy).
 */

import { Transaction, type TransactionObjectArgument } from '@mysten/sui/transactions';
import { FLOE, FLOE_SHARE_TYPE, PREDICT, SUI_SYSTEM } from '../config.ts';

const T = PREDICT.quoteType;     // Q = quote asset (DUSDC)
const S = FLOE_SHARE_TYPE;        // S = per-vault share Coin
const TS = [T, S];               // vault is Vault<Q,S>; entries need both type args
const P = PREDICT.plpType;        // P = PLP coin type
const TS_PLP = [T, S, P];          // PLP-generic entries need all three
const PKG = FLOE.packageId;
const MOD = FLOE.moduleName;

function target(fn: string) {
  return `${PKG}::${MOD}::${fn}` as const;
}

// shared refs used by almost every call
function vaultArg(tx: Transaction) { return tx.object(FLOE.vaultId); }
function capArg(tx: Transaction) { return tx.object(FLOE.execCapId); }
function clockArg(tx: Transaction) { return tx.object(SUI_SYSTEM.clock); }

// ─── PLP custody (Path B): vault holds Coin<PLP> on its own UID ───────────────
/** store_plp<Q,S,P>(vault, cap, plp) — attach supplied PLP to the vault (non-custodial). */
export function storePlp(tx: Transaction, plp: TransactionObjectArgument) {
  tx.moveCall({
    target: target('store_plp'), typeArguments: TS_PLP,
    arguments: [vaultArg(tx), capArg(tx), plp],
  });
}
/** take_plp<Q,S,P>(vault, cap, amount) -> Coin<P> — pull PLP back out within the PTB. */
export function takePlp(tx: Transaction, amount: bigint): TransactionObjectArgument {
  const [plp] = tx.moveCall({
    target: target('take_plp'), typeArguments: TS_PLP,
    arguments: [vaultArg(tx), capArg(tx), tx.pure.u64(amount)],
  });
  return plp;
}

// ─── Stratum A: PLP supply / redeem ──────────────────────────────────────────

/** update_plp_price(vault, cap, new_price, plp_held, attestation, clock) */
export function updatePlpPrice(tx: Transaction, newPrice: bigint, plpHeld: bigint, attestation: number[] = []) {
  tx.moveCall({
    target: target('update_plp_price'), typeArguments: TS,
    arguments: [vaultArg(tx), capArg(tx), tx.pure.u64(newPrice), tx.pure.u64(plpHeld),
      tx.pure.vector('u8', attestation), clockArg(tx)],
  });
}

/** deploy_idle -> (Coin<T>, DeployReceipt). Coin goes to Predict::supply. */
export function deployIdle(tx: Transaction, amount: bigint): [TransactionObjectArgument, TransactionObjectArgument] {
  const [coin, receipt] = tx.moveCall({
    target: target('deploy_idle'), typeArguments: TS,
    arguments: [vaultArg(tx), capArg(tx), tx.pure.u64(amount)],
  });
  return [coin, receipt];
}

/** confirm_deploy(vault, receipt, plp_obtained) */
export function confirmDeploy(tx: Transaction, receipt: TransactionObjectArgument, plpObtained: bigint) {
  tx.moveCall({
    target: target('confirm_deploy'), typeArguments: TS,
    arguments: [vaultArg(tx), receipt, tx.pure.u64(plpObtained)],
  });
}

/** request_redeem -> RedeemReceipt */
export function requestRedeem(tx: Transaction, plpAmount: bigint): TransactionObjectArgument {
  return tx.moveCall({
    target: target('request_redeem'), typeArguments: TS,
    arguments: [vaultArg(tx), capArg(tx), tx.pure.u64(plpAmount)],
  });
}

/** confirm_redeem(vault, receipt, dusdc_coin) */
export function confirmRedeem(tx: Transaction, receipt: TransactionObjectArgument, coin: TransactionObjectArgument) {
  tx.moveCall({
    target: target('confirm_redeem'), typeArguments: TS,
    arguments: [vaultArg(tx), receipt, coin],
  });
}

// ─── Stratum B: range ladder ─────────────────────────────────────────────────

/** authorize_range(vault, cap, oracle_id, amount, ctx) -> (Coin<Q>, RangeAuthReceipt) */
export function authorizeRange(tx: Transaction, oracleId: string, amount: bigint): [TransactionObjectArgument, TransactionObjectArgument] {
  const [coin, receipt] = tx.moveCall({
    target: target('authorize_range'), typeArguments: TS,
    arguments: [vaultArg(tx), capArg(tx), tx.pure.id(oracleId), tx.pure.u64(amount)],
  });
  return [coin, receipt];
}

/** record_range(vault, receipt, position_id, oracle_id, expiry, lo, hi, size, premium, clock) */
export function recordRange(tx: Transaction, receipt: TransactionObjectArgument, args: {
  positionId: string; oracleId: string; expiryMs: bigint;
  lowerStrike: bigint; upperStrike: bigint; size: bigint; premiumPaid: bigint;
}) {
  tx.moveCall({
    target: target('record_range'), typeArguments: TS,
    arguments: [vaultArg(tx), receipt,
      tx.pure.id(args.positionId), tx.pure.id(args.oracleId), tx.pure.u64(args.expiryMs),
      tx.pure.u64(args.lowerStrike), tx.pure.u64(args.upperStrike), tx.pure.u64(args.size),
      tx.pure.u64(args.premiumPaid), clockArg(tx)],
  });
}

/** mark_position(vault, cap, position_id, new_mark) */
export function markPosition(tx: Transaction, positionId: string, newMark: bigint) {
  tx.moveCall({
    target: target('mark_position'), typeArguments: TS,
    arguments: [vaultArg(tx), capArg(tx), tx.pure.id(positionId), tx.pure.u64(newMark)],
  });
}

/** authorize_redeem_range(vault, cap, position_id) -> RangeRedeemReceipt */
export function authorizeRedeemRange(tx: Transaction, positionId: string): TransactionObjectArgument {
  return tx.moveCall({
    target: target('authorize_redeem_range'), typeArguments: TS,
    arguments: [vaultArg(tx), capArg(tx), tx.pure.id(positionId)],
  });
}

/** confirm_range_redeem(vault, receipt, payout) */
export function confirmRangeRedeem(tx: Transaction, receipt: TransactionObjectArgument, payout: TransactionObjectArgument) {
  tx.moveCall({
    target: target('confirm_range_redeem'), typeArguments: TS,
    arguments: [vaultArg(tx), receipt, payout],
  });
}

// ─── Stratum C: hedge ────────────────────────────────────────────────────────

/** authorize_hedge -> HedgeReceipt */
export function authorizeHedge(tx: Transaction): TransactionObjectArgument {
  return tx.moveCall({
    target: target('authorize_hedge'), typeArguments: TS,
    arguments: [vaultArg(tx), capArg(tx)],
  });
}

/** record_hedge(vault, receipt, margin_manager_id, notional, is_short) */
export function recordHedge(tx: Transaction, receipt: TransactionObjectArgument, args: {
  marginManagerId: string; notional: bigint; isShort: boolean;
}) {
  tx.moveCall({
    target: target('record_hedge'), typeArguments: TS,
    arguments: [vaultArg(tx), receipt, tx.pure.id(args.marginManagerId),
      tx.pure.u64(args.notional), tx.pure.bool(args.isShort)],
  });
}

// ─── Audit ───────────────────────────────────────────────────────────────────

/** record_walrus_blob(vault, cap, blob_id) */
export function recordWalrusBlob(tx: Transaction, blobId: number[]) {
  tx.moveCall({
    target: target('record_walrus_blob'), typeArguments: TS,
    arguments: [vaultArg(tx), capArg(tx), tx.pure.vector('u8', blobId)],
  });
}

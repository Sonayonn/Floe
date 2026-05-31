/**
 * Floe engine — PTB composer.
 *
 * Turns a RebalanceAction (from any Strategy) into a fully-composed,
 * single-PTB, atomic transaction by stitching Floe's vault entries together
 * with the proven DeepBook Predict + Margin + Pyth calls. Every sub-call here
 * was proven on chain in Weeks 1–2; this file is assembly, not new risk.
 *
 * Design (Option A): RebalanceActions are SELF-CONTAINED instructions. The
 * engine never reads chain state to interpret an action — it just composes.
 * That keeps the platform seam honest: implement Strategy, return complete
 * actions, the engine does the rest.
 *
 * Funding model (Model A): PLP and range positions live inside the
 * PredictManager. deploy_idle hands us a Coin<T>; we deposit it into the
 * manager, then supply/mint from the manager's balance.
 *
 * Position addressing: Predict addresses range positions by RangeKey
 * (oracle, expiry, lower, upper) — deterministic, known before execution, no
 * event needed. Floe's vault keys its OWN position table by a deterministic ID
 * we derive from the same components (never passed to Predict).
 */

import { Transaction, type TransactionObjectArgument } from '@mysten/sui/transactions';
import type { RebalanceAction } from '../strategy/types.ts';
import type { Clients } from './deepbook-clients.ts';
import { PREDICT, DEEPBOOK, SUI_SYSTEM } from '../config.ts';
import { refreshPrices, FEEDS } from './pyth.ts';
import * as vault from './vault.ts';
import { derivePositionId } from './position-id.ts';

const DUSDC = PREDICT.quoteType;
const PREDICT_PKG = PREDICT.packageId;
const CLOCK = SUI_SYSTEM.clock;

// ─── Scaling helpers ─────────────────────────────────────────────────────────

/** 6-decimal quote scaling (DUSDC). human -> raw integer. */
function toRaw6(human: number): bigint {
  return BigInt(Math.round(human * 1e6));
}
/** 9-decimal oracle/strike scaling. human price -> raw integer. */
function toRaw9(human: number): bigint {
  return BigInt(Math.round(human * 1e9));
}

// ─── Raw Predict calls (SDK ships no Predict module; composed manually) ──────

/** predict::supply<T>(predict, coin, clock) -> Coin<PLP> */
function predictSupply(tx: Transaction, coin: TransactionObjectArgument): TransactionObjectArgument {
  const [plp] = tx.moveCall({
    target: `${PREDICT_PKG}::predict::supply`,
    typeArguments: [DUSDC],
    arguments: [tx.object(PREDICT.objectId), coin, tx.object(CLOCK)],
  });
  return plp;
}

/** predict::withdraw<T>(predict, plpCoin, clock) -> Coin<T> */
function predictWithdraw(tx: Transaction, plpCoin: TransactionObjectArgument): TransactionObjectArgument {
  const [coin] = tx.moveCall({
    target: `${PREDICT_PKG}::predict::withdraw`,
    typeArguments: [DUSDC],
    arguments: [tx.object(PREDICT.objectId), plpCoin, tx.object(CLOCK)],
  });
  return coin;
}

/** predict_manager::deposit<T>(manager, coin) */
function managerDeposit(tx: Transaction, coin: TransactionObjectArgument) {
  tx.moveCall({
    target: `${PREDICT_PKG}::predict_manager::deposit`,
    typeArguments: [DUSDC],
    arguments: [tx.object(PREDICT.managerId), coin],
  });
}

/** predict_manager::withdraw<T>(manager, amount, ctx) -> Coin<T> */
function managerWithdraw(tx: Transaction, amount6: bigint): TransactionObjectArgument {
  const [coin] = tx.moveCall({
    target: `${PREDICT_PKG}::predict_manager::withdraw`,
    typeArguments: [DUSDC],
    arguments: [tx.object(PREDICT.managerId), tx.pure.u64(amount6)],
  });
  return coin;
}

/** range_key::new(oracle, expiry, lower, upper) -> RangeKey */
function makeRangeKey(tx: Transaction, oracleId: string, expiryMs: bigint, lower9: bigint, upper9: bigint): TransactionObjectArgument {
  const [key] = tx.moveCall({
    target: `${PREDICT_PKG}::range_key::new`,
    arguments: [tx.pure.id(oracleId), tx.pure.u64(expiryMs), tx.pure.u64(lower9), tx.pure.u64(upper9)],
  });
  return key;
}

/** predict::mint_range<T>(predict, manager, oracle, rangeKey, size, clock) — returns nothing */
function predictMintRange(tx: Transaction, oracleId: string, rangeKey: TransactionObjectArgument, size6: bigint) {
  tx.moveCall({
    target: `${PREDICT_PKG}::predict::mint_range`,
    typeArguments: [DUSDC],
    arguments: [
      tx.object(PREDICT.objectId), tx.object(PREDICT.managerId), tx.object(oracleId),
      rangeKey, tx.pure.u64(size6), tx.object(CLOCK),
    ],
  });
}

/** predict::redeem_range<T>(predict, manager, oracle, rangeKey, size, clock) -> nothing; payout lands in manager */
function predictRedeemRange(tx: Transaction, oracleId: string, rangeKey: TransactionObjectArgument, size6: bigint) {
  tx.moveCall({
    target: `${PREDICT_PKG}::predict::redeem_range`,
    typeArguments: [DUSDC],
    arguments: [
      tx.object(PREDICT.objectId), tx.object(PREDICT.managerId), tx.object(oracleId),
      rangeKey, tx.pure.u64(size6), tx.object(CLOCK),
    ],
  });
}

// ─── Compose one action into the PTB ─────────────────────────────────────────

/**
 * Append the moveCalls for one action to `tx`. Async because hedge actions
 * fetch fresh Pyth data. Mutates the PTB; returns nothing.
 */
export async function composeAction(
  clients: Clients, tx: Transaction, action: RebalanceAction,
): Promise<void> {
  switch (action.kind) {
    // ── Stratum A: PLP supply ────────────────────────────────────────────────
    case 'supply_plp': {
      const amount6 = toRaw6(action.amount);
      const [coin, receipt] = vault.deployIdle(tx, amount6);
      const plp = predictSupply(tx, coin);
      // PLP coin is held by the rebalancer EOA; vault only tracks the quantity.
      tx.transferObjects([plp], tx.pure.address(clients.address));
      vault.confirmDeploy(tx, receipt, amount6);
      break;
    }

    // ── Stratum A: PLP redeem ────────────────────────────────────────────────
    case 'redeem_plp': {
      const plp6 = toRaw6(action.plpAmount);
      const receipt = vault.requestRedeem(tx, plp6);
      // Pull PLP out of the manager, withdraw to Coin<T>, hand back to vault.
      const plpCoin = managerWithdraw(tx, plp6);
      const coin = predictWithdraw(tx, plpCoin);
      vault.confirmRedeem(tx, receipt, coin);
      break;
    }

    // ── Stratum B: open a 1σ range ───────────────────────────────────────────
    case 'open_range': {
      const size6 = toRaw6(action.size);
      const lower9 = toRaw9(action.lowerStrike);
      const upper9 = toRaw9(action.upperStrike);
      const expiry = BigInt(action.expiryMs);

      // authorize_range now pulls the funding DUSDC from idle and returns it
      // with the receipt (enforces the Stratum A floor). One receipt, atomic.
      const [coin, receipt] = vault.authorizeRange(tx, action.oracleId, size6);

      // Fund the manager, then mint the range from its balance.
      managerDeposit(tx, coin);
      const key = makeRangeKey(tx, action.oracleId, expiry, lower9, upper9);
      predictMintRange(tx, action.oracleId, key, size6);

      // Record the position; premium == funded for a fresh mint, so NAV moves
      // idle -> positions_mark_total cleanly.
      const positionId = derivePositionId(action.oracleId, expiry, lower9, upper9);
      vault.recordRange(tx, receipt, {
        positionId,
        oracleId: action.oracleId, expiryMs: expiry,
        lowerStrike: lower9, upperStrike: upper9,
        size: size6, premiumPaid: size6,
      });
      break;
    }

    // ── Stratum B: close a range (self-contained: carries RangeKey fields) ───
    case 'close_range': {
      const lower9 = toRaw9(action.lowerStrike);
      const upper9 = toRaw9(action.upperStrike);
      const expiry = BigInt(action.expiryMs);

      const receipt = vault.authorizeRedeemRange(tx, action.positionId);

      // redeem_range addresses the position by RangeKey; payout lands in manager.
      const key = makeRangeKey(tx, action.oracleId, expiry, lower9, upper9);
      predictRedeemRange(tx, action.oracleId, key, 0n); // size 0 = full position

      // Pull the payout back out of the manager to a Coin<T> for the vault.
      const payout = managerWithdraw(tx, 0n); // 0 = withdraw available; reconciled
      vault.confirmRangeRedeem(tx, receipt, payout);
      break;
    }

    // ── Stratum C: open / adjust the delta hedge (proven: tx 6Rhb4P) ─────────
    case 'open_hedge': {
      const receipt = vault.authorizeHedge(tx);
      await refreshPrices(clients, tx, [FEEDS.suiUsd, FEEDS.dbusdcUsd]);
      const collateral = action.notional; // 1:1 collateral for v1
      clients.deepbook.marginManager.depositQuote({ managerKey: 'FLOE_HEDGE', amount: collateral })(tx);
      clients.deepbook.marginManager.borrowQuote('FLOE_HEDGE', action.notional)(tx);
      vault.recordHedge(tx, receipt, {
        marginManagerId: DEEPBOOK.marginManagerId,
        notional: toRaw6(action.notional), isShort: action.isShort,
      });
      break;
    }

    // ── Stratum C: unwind the hedge ──────────────────────────────────────────
    case 'close_hedge': {
      const receipt = vault.authorizeHedge(tx);
      await refreshPrices(clients, tx, [FEEDS.suiUsd, FEEDS.dbusdcUsd]);
      clients.deepbook.marginManager.repayQuote('FLOE_HEDGE')(tx);
      vault.recordHedge(tx, receipt, {
        marginManagerId: DEEPBOOK.marginManagerId, notional: 0n, isShort: false,
      });
      break;
    }

    case 'noop':
      break;
  }
}

/** Compose a full rebalance PTB from a list of actions. */
export async function composeRebalancePTB(
  clients: Clients, actions: RebalanceAction[],
): Promise<Transaction> {
  const tx = new Transaction();
  for (const action of actions) {
    await composeAction(clients, tx, action);
  }
  return tx;
}

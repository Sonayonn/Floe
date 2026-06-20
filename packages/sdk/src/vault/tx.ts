// Browser-safe Transaction builders for wallet signing (no in-process signer).
// dApps call these, then hand the Transaction to dapp-kit's useSignAndExecuteTransaction.
import { Transaction } from '@mysten/sui/transactions';
import type { FloeClient } from '../client.ts';
import { FLOE_ADDRESSES, type FloeNetwork } from '../constants.ts';
import { CETUS_TESTNET } from '../venues/cetus-config.ts';
import { encodeTickU32 } from '../venues/cetus.ts';

const CLOCK = '0x6';

export interface VaultTxBase {
  network?: FloeNetwork;
  vaultId: string;
  qType: string;   // quote/deposit asset type
  sType: string;   // share type
  sender: string;
}

/** Deposit: split `amount` from the user's quote coin, call deposit, return shares to sender. */
export function buildDepositTx(o: VaultTxBase & { paymentCoinId: string; amount: bigint }): Transaction {
  const a = FLOE_ADDRESSES[o.network ?? 'testnet'];
  const tx = new Transaction();
  const [pay] = tx.splitCoins(tx.object(o.paymentCoinId), [tx.pure.u64(o.amount)]);
  const shares = tx.moveCall({
    target: `${a.package}::${a.module}::deposit`,
    typeArguments: [o.qType, o.sType],
    arguments: [tx.object(o.vaultId), pay, tx.object(CLOCK)],
  });
  tx.transferObjects([shares], o.sender);
  return tx;
}

/**
 * Deploy idle → PLP (Stratum A base yield), the 4-call atomic PTB the rebalancer's
 * `supply_plp` action composes. Oracle-independent: works even when the SVI oracle
 * has expired. Requires the vault's ExecCap (held by the curator/operator) — so this
 * is the owner-triggered "activate my vault" action, never silent fund movement.
 *
 *   deploy_idle(vault, execCap, amount) -> (Coin<Q>, DeployReceipt)
 *   predict::supply<Q>(predict, coin, clock) -> Coin<PLP>   // mint LP from the global pool
 *   store_plp<Q,S,PLP>(vault, execCap, plp)                 // custody stays IN the vault
 *   confirm_deploy(vault, receipt, amount)
 */
export function buildDeployPlpTx(o: VaultTxBase & { execCapId: string; amount: bigint }): Transaction {
  const a = FLOE_ADDRESSES[o.network ?? 'testnet'];
  const p = a.predict;
  const tx = new Transaction();
  const [coin, receipt] = tx.moveCall({
    target: `${a.package}::${a.module}::deploy_idle`,
    typeArguments: [o.qType, o.sType],
    arguments: [tx.object(o.vaultId), tx.object(o.execCapId), tx.pure.u64(o.amount)],
  });
  const [plp] = tx.moveCall({
    target: `${p.package}::predict::supply`,
    typeArguments: [o.qType],
    arguments: [tx.object(p.object), coin, tx.object(CLOCK)],
  });
  tx.moveCall({
    target: `${a.package}::${a.module}::store_plp`,
    typeArguments: [o.qType, o.sType, p.plpType],
    arguments: [tx.object(o.vaultId), tx.object(o.execCapId), plp],
  });
  tx.moveCall({
    target: `${a.package}::${a.module}::confirm_deploy`,
    typeArguments: [o.qType, o.sType],
    arguments: [tx.object(o.vaultId), receipt, tx.pure.u64(o.amount)],
  });
  return tx;
}

/**
 * Deploy idle → a Cetus CLMM position custodied IN the vault (Archetype 2: Position NFT),
 * the multi-venue analogue of {@link buildDeployPlpTx}. ExecCap-gated — owner-triggered, never
 * silent fund movement.
 *
 * Opens a SINGLE-SIDED position: the tick range sits entirely on one side of the pool's current
 * price so the position is 100% the vault's quote asset Q — the other side owes 0, settled with a
 * zero coin. This conserves NAV: exactly the dUSDC that left idle becomes the position's marked
 * value, with no counter-asset funding required. `qIsA` says whether Q sorts as the pool's coin A
 * (type-string order); pick a range ABOVE current price when Q is A, BELOW when Q is B.
 *
 *   deploy_idle(vault, execCap, amount) -> (Coin<Q>, DeployReceipt)
 *   pool::open_position(config, pool, lower, upper) -> Position
 *   pool::add_liquidity_fix_coin(config, pool, position, amount, fix_a, clock) -> receipt
 *   pool::repay_add_liquidity(config, pool, Balance<A>, Balance<B>, receipt)   // Q + zero
 *   confirm_deploy_cetus<Q,S,Position>(vault, execCap, receipt, position, amount)  // custody + NAV
 */
export function buildDeployCetusTx(o: VaultTxBase & {
  execCapId: string;
  amount: bigint;
  poolId: string;
  coinTypeA: string;
  coinTypeB: string;
  positionType: string;   // the Cetus Position struct type (e.g. `${corePackageId}::position::Position`)
  tickLower: number;
  tickUpper: number;
  qIsA: boolean;          // true if Q === coinTypeA (single-sided range above price), else below
}): Transaction {
  const a = FLOE_ADDRESSES[o.network ?? 'testnet'];
  const C = CETUS_TESTNET;
  const ta = [o.coinTypeA, o.coinTypeB];
  const tx = new Transaction();

  // 1) pull idle Q out under the vault's floor protection
  const [qCoin, receipt] = tx.moveCall({
    target: `${a.package}::${a.module}::deploy_idle`,
    typeArguments: [o.qType, o.sType],
    arguments: [tx.object(o.vaultId), tx.object(o.execCapId), tx.pure.u64(o.amount)],
  });

  // 2) open the position + add liquidity fixing the Q side
  const position = tx.moveCall({
    target: `${C.publishedAt}::pool::open_position`,
    typeArguments: ta,
    arguments: [
      tx.object(C.globalConfigId), tx.object(o.poolId),
      tx.pure.u32(encodeTickU32(o.tickLower)), tx.pure.u32(encodeTickU32(o.tickUpper)),
    ],
  });
  const addReceipt = tx.moveCall({
    target: `${C.publishedAt}::pool::add_liquidity_fix_coin`,
    typeArguments: ta,
    arguments: [
      tx.object(C.globalConfigId), tx.object(o.poolId), position,
      tx.pure.u64(o.amount), tx.pure.bool(o.qIsA), tx.object(CLOCK),
    ],
  });

  // 3) settle: the fixed (Q) side is funded by qCoin; the other side owes 0 → a zero coin.
  const qBal = tx.moveCall({ target: '0x2::coin::into_balance', typeArguments: [o.qType], arguments: [qCoin] });
  const otherType = o.qIsA ? o.coinTypeB : o.coinTypeA;
  const zeroOther = tx.moveCall({ target: '0x2::balance::zero', typeArguments: [otherType] });
  const balA = o.qIsA ? qBal : zeroOther;
  const balB = o.qIsA ? zeroOther : qBal;
  tx.moveCall({
    target: `${C.publishedAt}::pool::repay_add_liquidity`,
    typeArguments: ta,
    arguments: [tx.object(C.globalConfigId), tx.object(o.poolId), balA, balB, addReceipt],
  });

  // 4) custody the Position NFT in the vault + record the sleeve value (= what left idle)
  tx.moveCall({
    target: `${a.package}::${a.module}::confirm_deploy_cetus`,
    typeArguments: [o.qType, o.sType, o.positionType],
    arguments: [tx.object(o.vaultId), tx.object(o.execCapId), receipt, position, tx.pure.u64(o.amount)],
  });
  return tx;
}

/**
 * Resolve the ExecCap the `owner` holds for `vaultId`, or null if they hold none.
 * ExecCaps keep type `${packageOriginal}::floe::ExecCap` across upgrades and carry
 * the `vault_id` they authorize. Drives whether to show the curator-only Deploy action.
 */
export async function resolveExecCap(floe: FloeClient, owner: string, vaultId: string): Promise<string | null> {
  const a = floe.addresses;
  let cursor: string | null | undefined = null;
  for (;;) {
    const r = await floe.sui.getOwnedObjects({
      owner,
      filter: { StructType: `${a.packageOriginal}::floe::ExecCap` },
      options: { showContent: true },
      cursor,
    });
    for (const o of r.data ?? []) {
      const fields = (o.data?.content as any)?.fields;
      if (fields?.vault_id === vaultId) return o.data!.objectId;
    }
    if (!r.hasNextPage) break;
    cursor = r.nextCursor;
  }
  return null;
}

/** Withdraw: split `shareAmount` from the user's share coin, call withdraw, return quote to sender. */
export function buildWithdrawTx(o: VaultTxBase & { shareCoinId: string; shareAmount: bigint }): Transaction {
  const a = FLOE_ADDRESSES[o.network ?? 'testnet'];
  const tx = new Transaction();
  const [shares] = tx.splitCoins(tx.object(o.shareCoinId), [tx.pure.u64(o.shareAmount)]);
  const out = tx.moveCall({
    target: `${a.package}::${a.module}::withdraw`,
    typeArguments: [o.qType, o.sType],
    arguments: [tx.object(o.vaultId), shares, tx.object(CLOCK)],
  });
  tx.transferObjects([out], o.sender);
  return tx;
}

// Browser-safe Transaction builders for wallet signing (no in-process signer).
// dApps call these, then hand the Transaction to dapp-kit's useSignAndExecuteTransaction.
import { Transaction } from '@mysten/sui/transactions';
import { FLOE_ADDRESSES, type FloeNetwork } from '../constants.ts';

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

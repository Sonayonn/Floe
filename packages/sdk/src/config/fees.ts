import { Transaction, type TransactionObjectArgument } from '@mysten/sui/transactions';
import type { FloeClient } from '../client.ts';

export const MAX_MGMT_BPS = 300;   // 3% — mirror contract cap
export const MAX_PERF_BPS = 2000;  // 20%

export interface FeesInput {
  managementBps: number;
  performanceBps: number;
  feeRecipient?: string;   // defaults to curator (signer)
}

/** Append floe::new_fees to the PTB, returning the FeeConfig argument. Enforces caps client-side. */
export function encodeFees(tx: Transaction, floe: FloeClient, f: FeesInput, defaultRecipient: string): TransactionObjectArgument {
  if (f.managementBps > MAX_MGMT_BPS) throw new Error(`managementBps ${f.managementBps} exceeds cap ${MAX_MGMT_BPS}`);
  if (f.performanceBps > MAX_PERF_BPS) throw new Error(`performanceBps ${f.performanceBps} exceeds cap ${MAX_PERF_BPS}`);
  return tx.moveCall({
    target: floe.target('new_fees'),
    arguments: [
      tx.pure.u64(BigInt(f.managementBps)),
      tx.pure.u64(BigInt(f.performanceBps)),
      tx.pure.address(f.feeRecipient ?? defaultRecipient),
    ],
  });
}

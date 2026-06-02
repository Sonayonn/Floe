import { Transaction, type TransactionObjectArgument } from '@mysten/sui/transactions';
import type { FloeClient } from '../client.ts';

/** Stratum bit flags (mirror the contract: PLP=1, RANGE=2, HEDGE=4). */
export const Stratum = { PLP: 1, RANGE: 2, HEDGE: 4 } as const;

export interface PolicyInput {
  allowedOracles: string[];
  maxPositionSize: bigint;     // 6dp (quote units)
  maxTotalExposure: bigint;    // 6dp
  maxLeverageBps: number;      // e.g. 30000 = 3x
  enabledStrata: number;       // bitmask of Stratum
  plpFloorBps: number;         // e.g. 5000 = 50%
}

/** Append floe::new_policy to the PTB, returning the PolicyConfig argument. */
export function encodePolicy(tx: Transaction, floe: FloeClient, p: PolicyInput): TransactionObjectArgument {
  return tx.moveCall({
    target: floe.target('new_policy'),
    arguments: [
      tx.makeMoveVec({ type: '0x2::object::ID', elements: p.allowedOracles.map((o) => tx.pure.id(o)) }),
      tx.pure.u64(p.maxPositionSize),
      tx.pure.u64(p.maxTotalExposure),
      tx.pure.u64(BigInt(p.maxLeverageBps)),
      tx.pure.u8(p.enabledStrata),
      tx.pure.u64(BigInt(p.plpFloorBps)),
    ],
  });
}

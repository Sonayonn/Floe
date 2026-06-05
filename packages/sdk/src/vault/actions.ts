import { Transaction } from '@mysten/sui/transactions';
import type { FloeClient } from '../client.ts';

/** Settle a resolved position: moves its value from the soft mark tier into the certain
 *  (settled) tier, which counts toward the trustless NAV floor. ExecCap-gated. */
export async function settlePosition(
  floe: FloeClient,
  o: { vaultId: string; execCap: string; positionId: string; settledValue: bigint; types: [string, string] },
): Promise<string> {
  if (!floe.signer) throw new Error('settlePosition requires a signer');
  const a = floe.addresses;
  const tx = new Transaction();
  tx.moveCall({
    target: `${a.package}::${a.module}::settle_position`,
    typeArguments: o.types,
    arguments: [tx.object(o.vaultId), tx.object(o.execCap), tx.pure.id(o.positionId), tx.pure.u64(o.settledValue)],
  });
  const res = await floe.sui.signAndExecuteTransaction({
    signer: floe.signer, transaction: tx, options: { showEffects: true },
  });
  if (res.effects?.status?.status !== 'success') throw new Error(`settle_position failed: ${res.effects?.status?.error}`);
  return res.digest;
}

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


/**
 * Async redemption — STEP 1: request. Splits `shares` from the user's share coin, burns them
 * (liability fixed at request-time safe NAV), and returns a RedeemTicket (transferred to sender).
 * Use this when a synchronous withdraw can't be served from available idle (or always, for a
 * notice-period exit). Returns { digest, ticketId }.
 */
export async function requestRedeem(
  floe: FloeClient,
  o: { vaultId: string; shareCoinId: string; shares: bigint; types: [string, string] },
): Promise<{ digest: string; ticketId: string | null }> {
  if (!floe.signer) throw new Error('requestRedeem requires a signer');
  const a = floe.addresses;
  const sender = floe.address!;
  const tx = new Transaction();
  const [toRedeem] = tx.splitCoins(tx.object(o.shareCoinId), [tx.pure.u64(o.shares)]);
  const ticket = tx.moveCall({
    target: `${a.package}::${a.module}::request_redeem_shares`,
    typeArguments: o.types,
    arguments: [tx.object(o.vaultId), toRedeem, tx.object('0x6')],
  });
  tx.transferObjects([ticket], sender);
  const res = await floe.sui.signAndExecuteTransaction({
    signer: floe.signer, transaction: tx, options: { showEffects: true, showObjectChanges: true },
  });
  if (res.effects?.status?.status !== 'success') throw new Error(`request_redeem_shares failed: ${res.effects?.status?.error}`);
  const created = res.objectChanges?.find(
    (c: any) => c.type === 'created' && typeof c.objectType === 'string' && c.objectType.endsWith('::RedeemTicket'),
  ) as any;
  return { digest: res.digest, ticketId: created?.objectId ?? null };
}

/**
 * Async redemption — STEP 2: fulfill (ExecCap). Marks pending requests claimable FIFO up to
 * available idle. The curator calls this after unwinding positions into idle.
 */
export async function fulfillRedeems(
  floe: FloeClient,
  o: { vaultId: string; execCap: string; types: [string, string] },
): Promise<string> {
  if (!floe.signer) throw new Error('fulfillRedeems requires a signer');
  const a = floe.addresses;
  const tx = new Transaction();
  tx.moveCall({
    target: `${a.package}::${a.module}::fulfill_redeems`,
    typeArguments: o.types,
    arguments: [tx.object(o.vaultId), tx.object(o.execCap), tx.object('0x6')],
  });
  const res = await floe.sui.signAndExecuteTransaction({
    signer: floe.signer, transaction: tx, options: { showEffects: true },
  });
  if (res.effects?.status?.status !== 'success') throw new Error(`fulfill_redeems failed: ${res.effects?.status?.error}`);
  return res.digest;
}

/**
 * Async redemption — STEP 3: claim. Burns the RedeemTicket, pays owed DUSDC from reserved idle
 * (transferred to sender). Requires the request to be fulfilled (claimable).
 */
export async function claimRedeem(
  floe: FloeClient,
  o: { vaultId: string; ticketId: string; types: [string, string] },
): Promise<string> {
  if (!floe.signer) throw new Error('claimRedeem requires a signer');
  const a = floe.addresses;
  const sender = floe.address!;
  const tx = new Transaction();
  const out = tx.moveCall({
    target: `${a.package}::${a.module}::claim_redeem`,
    typeArguments: o.types,
    arguments: [tx.object(o.vaultId), tx.object(o.ticketId)],
  });
  tx.transferObjects([out], sender);
  const res = await floe.sui.signAndExecuteTransaction({
    signer: floe.signer, transaction: tx, options: { showEffects: true },
  });
  if (res.effects?.status?.status !== 'success') throw new Error(`claim_redeem failed: ${res.effects?.status?.error}`);
  return res.digest;
}

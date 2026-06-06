import { Transaction } from '@mysten/sui/transactions';
import type { FloeClient } from '../client.ts';

/**
 * Self-healing settlement (P4) — PERMISSIONLESS. Anyone can call this to resolve a vault's
 * settled range position: it calls Predict's redeem_range (resolving the position inside the
 * shared PredictManager) and then marks the vault's accounting via settle_position_permissionless
 * (capped at the existing mark — cannot inflate NAV). No ExecCap required. Funds do not leave
 * the vault; this only keeps NAV current. The contract stays Predict-agnostic — the Predict call
 * lives here in the PTB, not in the Move package.
 */
export async function settleAndRecover(
  floe: FloeClient,
  o: {
    vaultId: string;
    positionId: string;
    oracleId: string;
    expiry: bigint;
    lowerStrike: bigint;
    higherStrike: bigint;
    redeemAmount: bigint;
    settledValue: bigint;       // must be <= the position's current mark (contract enforces)
    types: [string, string];
  },
): Promise<string> {
  if (!floe.signer) throw new Error('settleAndRecover requires a signer');
  const a = floe.addresses;
  const P = a.predict;
  const tx = new Transaction();

  // 1) build the RangeKey from the position's stored params (all public constructors)
  const rangeKey = tx.moveCall({
    target: `${P.package}::range_key::new`,
    arguments: [
      tx.pure.id(o.oracleId),
      tx.pure.u64(o.expiry),
      tx.pure.u64(o.lowerStrike),
      tx.pure.u64(o.higherStrike),
    ],
  });

  // 2) permissionlessly resolve the position inside the PredictManager
  tx.moveCall({
    target: `${P.package}::predict::redeem_range`,
    typeArguments: [o.types[0]], // quote asset Q (dUSDC)
    arguments: [
      tx.object(P.object),
      tx.object(P.manager),
      tx.object(P.btcOracle),
      rangeKey,
      tx.pure.u64(o.redeemAmount),
      tx.object('0x6'),
    ],
  });

  // 3) mark our accounting (capped, no cap required — self-healing)
  tx.moveCall({
    target: `${a.package}::${a.module}::settle_position_permissionless`,
    typeArguments: o.types,
    arguments: [tx.object(o.vaultId), tx.pure.id(o.positionId), tx.pure.u64(o.settledValue)],
  });

  const res = await floe.sui.signAndExecuteTransaction({ signer: floe.signer, transaction: tx, options: { showEffects: true } });
  if (res.effects?.status?.status !== 'success') throw new Error(`settleAndRecover failed: ${res.effects?.status?.error}`);
  return res.digest;
}

/**
 * Recover settled value into the vault's idle balance (R1) — ExecCap-gated (real funds move).
 * Non-custodial PLP redemption: request_redeem (decrement plp_held, get receipt) -> take_plp
 * (pull the Coin<PLP> from the vault's own custody) -> predict::withdraw (PLP -> dUSDC) ->
 * confirm_redeem (land dUSDC into idle). The PLP never leaves the vault's control except inside
 * this atomic PTB. Operator-gated because it moves real funds (unlike settleAndRecover).
 */
export async function recoverToIdle(
  floe: FloeClient,
  o: { vaultId: string; execCap: string; plpAmount: bigint; types: [string, string] },
): Promise<string> {
  if (!floe.signer) throw new Error('recoverToIdle requires a signer');
  const a = floe.addresses;
  const P = a.predict;
  const [Q, S] = o.types;
  const PLP = `${P.package}::plp::PLP`;
  const tx = new Transaction();

  // 1) request_redeem: decrement plp_held, get the RedeemReceipt (hot-potato)
  const receipt = tx.moveCall({
    target: `${a.package}::${a.module}::request_redeem`,
    typeArguments: [Q, S],
    arguments: [tx.object(o.vaultId), tx.object(o.execCap), tx.pure.u64(o.plpAmount)],
  });

  // 2) take_plp: pull the Coin<PLP> out of the vault's custody
  const plpCoin = tx.moveCall({
    target: `${a.package}::${a.module}::take_plp`,
    typeArguments: [Q, S, PLP],
    arguments: [tx.object(o.vaultId), tx.object(o.execCap), tx.pure.u64(o.plpAmount)],
  });

  // 3) predict::withdraw: PLP -> dUSDC
  const dusdc = tx.moveCall({
    target: `${P.package}::predict::withdraw`,
    typeArguments: [Q],
    arguments: [tx.object(P.object), plpCoin, tx.object('0x6')],
  });

  // 4) confirm_redeem: land dUSDC into idle (consumes the receipt)
  tx.moveCall({
    target: `${a.package}::${a.module}::confirm_redeem`,
    typeArguments: [Q, S],
    arguments: [tx.object(o.vaultId), receipt, dusdc],
  });

  const res = await floe.sui.signAndExecuteTransaction({ signer: floe.signer, transaction: tx, options: { showEffects: true } });
  if (res.effects?.status?.status !== 'success') throw new Error(`recoverToIdle failed: ${res.effects?.status?.error}`);
  return res.digest;
}

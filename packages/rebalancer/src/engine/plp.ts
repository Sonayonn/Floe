/**
 * PLP valuation — computes the Predict liquidity-pool price per PLP token from
 * on-chain state: price = vault.balance / treasury_cap.total_supply (9dp scale).
 *
 * This is the UNATTESTED half of provable NAV. In Phase 7 this exact computation
 * runs inside the Nautilus enclave and the result is attested on chain; here the
 * rebalancer computes and pushes it each cycle so the vault's NAV stays fresh
 * (is_price_fresh) and deposits/withdrawals price correctly.
 */
import type { SuiClient } from '@mysten/sui/client';
import { PREDICT } from '../config.ts';

const PLP_PRICE_SCALE = 1_000_000_000n; // 9dp, matches contract PLP_PRICE_SCALE

export interface PlpValuation {
  price9: bigint;     // PLP price, 9dp
  poolBalance: bigint;
  plpSupply: bigint;
}

export async function computePlpPrice(sui: SuiClient): Promise<PlpValuation> {
  const o = await sui.getObject({ id: PREDICT.objectId, options: { showContent: true } });
  const f = (o.data?.content as any)?.fields ?? {};
  const poolBalance = BigInt(f.vault?.fields?.balance ?? '0');
  const plpSupply = BigInt(f.treasury_cap?.fields?.total_supply?.fields?.value ?? '0');
  if (plpSupply === 0n) {
    // empty pool -> par
    return { price9: PLP_PRICE_SCALE, poolBalance, plpSupply };
  }
  const price9 = (poolBalance * PLP_PRICE_SCALE) / plpSupply;
  return { price9, poolBalance, plpSupply };
}

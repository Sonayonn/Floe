/**
 * Floe engine — Pyth price freshness.
 *
 * DeepBook Margin reads collateral/debt prices from PriceInfoObjects whose
 * freshness is checked on-chain (15s window). Before any margin op, the
 * rebalancer must post a fresh Pyth update for the pool's base+quote feeds
 * in the same PTB. This module wraps that, proven on testnet (tx 6Rhb4P).
 */

import { Transaction } from '@mysten/sui/transactions';
import type { Clients } from './deepbook-clients.ts';

/** Pyth price-feed IDs for the assets Floe touches (SDK testnet feeds). */
export const FEEDS = {
  suiUsd: '0x50c67b3fd225db8912a424dd4baed60ffdde625ed2feaaf283724f9608fea266',
  dbusdcUsd: '0x41f3625971ca2ed2263e78573fe5ce23e13d2558ed3f2e47ab0f84fb9e7ae722',
} as const;

/**
 * Append Pyth price-update commands to `tx` for the given feeds, making the
 * on-chain PriceInfoObjects fresh. Returns the PriceInfoObject IDs. Call this
 * immediately before a margin op in the same PTB.
 */
export async function refreshPrices(
  clients: Clients,
  tx: Transaction,
  feedIds: string[] = [FEEDS.suiUsd, FEEDS.dbusdcUsd],
): Promise<string[]> {
  const updateData = await clients.hermes.getPriceFeedsUpdateData(feedIds);
  return clients.pyth.updatePriceFeeds(tx, updateData, feedIds);
}

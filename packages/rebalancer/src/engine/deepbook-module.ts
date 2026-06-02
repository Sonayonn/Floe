/**
 * DeepBookModule — the REFERENCE VenueModule implementation.
 *
 * Wraps the proven Floe engine (Stratos decide + composeAction PTB composer +
 * PLP/positions valuation) behind the uniform VenueModule interface. ZERO
 * behavior change: this is the same on-chain rebalance, now flowing through the
 * formal layer interface so additional venues (Suilend, NAVI, Volo, Cetus) are
 * clean drop-in implementations of the same three verbs.
 */
import type { Transaction } from '@mysten/sui/transactions';
import type { VenueModule, VenueValuation } from '@floe/sdk';
import type { FloeClient } from '@floe/sdk';
import type { Clients } from './deepbook-clients.ts';
import type { MarketState, RebalanceAction } from '../strategy/types.ts';
import type { Strategy } from '../strategy/types.ts';
import { composeAction } from './ptb.ts';
import { computePlpPrice } from './plp.ts';
import { FLOE } from '../config.ts';

const PLP_PRICE_SCALE = 1_000_000_000n; // 9dp, matches contract + plp.ts

export class DeepBookModule
  implements VenueModule<MarketState, RebalanceAction, Clients>
{
  readonly venue = 'deepbook';
  readonly name: string;
  readonly description: string;
  private readonly strategy: Strategy;

  constructor(strategy: Strategy) {
    this.strategy = strategy;
    this.name = strategy.name;
    this.description = strategy.description;
  }

  /** decide = the strategy's pure decision over DeepBook market state. */
  decide(state: MarketState): RebalanceAction[] {
    return this.strategy.decide(state);
  }

  /** compose = the proven composeAction switch, unchanged. */
  async compose(clients: Clients, tx: Transaction, action: RebalanceAction): Promise<void> {
    await composeAction(clients, tx, action);
  }

  /** value = idle-PLP + open-position MTM read from chain (DeepBook's NAV share). */
  async value(floe: FloeClient, vaultId: string): Promise<VenueValuation> {
    const o = await floe.sui.getObject({ id: vaultId, options: { showContent: true } });
    const v: any = (o.data?.content as any)?.fields ?? {};
    const plpHeld = BigInt(v.plp_held ?? 0);
    const marks = BigInt(v.positions_mark_total ?? 0);

    // PLP value from live pool state (same math as the heartbeat).
    const { price9 } = await computePlpPrice(floe.sui as any);
    const plpValue = (plpHeld * price9) / PLP_PRICE_SCALE;

    return {
      venue: this.venue,
      valueRaw: plpValue + marks,
      parts: { plp: plpValue, positions: marks },
    };
  }
}

/**
 * DeepBookModule — the LIVE reference VenueModule (Archetype 3: manager position).
 *
 * DeepBook Predict is Floe's flagship venue: the vault holds PLP (Predict LP) and
 * vertical-range positions inside a PredictManager, valued via the SVI oracle. This
 * is the reference implementation of the uniform VenueModule interface — Cetus
 * (Archetype 2, NFT) implements the SAME interface. Two real venues, one seam.
 *
 * value() reuses the exact NAV valuation the contract + getVaultState use:
 * idle + PLP(held × cached price) + position marks, in quote-asset 6dp.
 */
import type { Transaction } from '@mysten/sui/transactions';
import type { FloeClient } from '../client.ts';
import type { VenueModule, VenueValuation } from './types.ts';
import { PLP_PRICE_SCALE } from '../constants.ts';
import { getVaultState } from '../vault/read.ts';

/** DeepBook venue actions are private to this module (per the interface contract). */
export type DeepBookAction =
  | { kind: 'supplyPlp'; amount: bigint }
  | { kind: 'withdrawPlp'; amount: bigint }
  | { kind: 'openRange'; lowerStrike: bigint; upperStrike: bigint; size: bigint; expiryMs: bigint }
  | { kind: 'hedge'; side: 'long' | 'short'; size: bigint };

export interface DeepBookState {
  /** target PLP floor (raw quote units) and current vault snapshot, supplied by the strategy. */
  vaultId: string;
}

export interface DeepBookCtx {
  floe: FloeClient;
  vaultId: string;
}

export const DeepBookModule: VenueModule<DeepBookState, DeepBookAction, DeepBookCtx> = {
  venue: 'deepbook',
  name: 'DeepBook Predict',
  description:
    'Flagship venue. Structured products on DeepBook Predict: PLP base yield + 1σ vertical-range ' +
    'ladder priced off the Block Scholes SVI oracle + Margin delta hedge. Archetype 3 (manager position).',

  // decide() is the strategy half; the live engine (rebalancer/engine/deepbook-module.ts) owns the
  // full Stratos logic. The SDK exposes the interface; a builder plugs their own decide() here.
  decide(_state: DeepBookState): DeepBookAction[] {
    return [];
  },

  // compose() appends a venue action's Move calls to a PTB. Wired to the contract's
  // capability-gated entry points by the engine; surfaced here for the interface.
  compose(_ctx: DeepBookCtx, _tx: Transaction, _action: DeepBookAction): void {
    // Reference: rebalancer/src/engine/ptb.ts composes supply/withdraw/range/hedge under ExecCap.
    // Left as the integration point for a custom strategy; the live engine provides the impl.
  },

  // value() — this venue's contribution to NAV. Reuses the proven on-chain valuation.
  async value(floe: FloeClient, vaultId: string): Promise<VenueValuation> {
    const s = await getVaultState(floe, vaultId);
    const plp = (s.plpHeld * s.plpPrice) / PLP_PRICE_SCALE;
    return {
      venue: 'deepbook',
      valueRaw: plp + s.positionsMarkTotal,
      parts: { plp, positions: s.positionsMarkTotal },
    };
  },
};

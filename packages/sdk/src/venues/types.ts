/**
 * VenueModule — the uniform interface every Floe yield venue implements.
 *
 * Modeled on Yearn v3's tokenized-strategy pattern: each venue is a standalone
 * unit with one standard interface, and the allocator vault speaks only that
 * interface — it never knows which protocol a module wraps. This is what makes
 * "Floe allocates across venues" a real, extensible seam rather than a slide.
 *
 *   decide()  — WHERE/what to allocate this cycle (the strategy half; pure)
 *   compose() — HOW to PTB-compose an action (curried, Sui-native, composable)
 *   value()   — this venue's contribution to NAV (read-side, feeds attested NAV)
 *
 * DeepBook is the reference implementation (PLP + ranges + hedge). Suilend, NAVI,
 * Volo, Cetus are additional implementations of the SAME interface.
 */
import type { Transaction } from '@mysten/sui/transactions';
import type { FloeClient } from '../client.ts';

/** Per-venue valuation contribution, in the vault's quote asset (6dp raw). */
export interface VenueValuation {
  venue: string;
  /** Total value this venue holds for the vault, in quote-asset raw units. */
  valueRaw: bigint;
  /** Optional breakdown for UI / snapshots (e.g. { plp: ..., positions: ... }). */
  parts?: Record<string, bigint>;
}

/**
 * The uniform venue interface. `State` and `Action` are the venue's own types —
 * a venue's actions are private to it (DeepBook's RebalanceAction is NOT a global
 * union; Suilend will have its own). The allocator only needs venue + the three
 * verbs. `Ctx` carries whatever execution context the module needs (clients/caps).
 */
export interface VenueModule<State = unknown, Action = unknown, Ctx = unknown> {
  /** Stable venue id: "deepbook" | "suilend" | "navi" | "volo" | "cetus". */
  readonly venue: string;
  readonly name: string;
  readonly description: string;

  /** Pure: given market+vault state, decide this venue's actions this cycle. */
  decide(state: State): Action[];

  /** Append one action's Move calls to the PTB (curried, Sui-native). */
  compose(ctx: Ctx, tx: Transaction, action: Action): Promise<void> | void;

  /** This venue's contribution to NAV (read-side). */
  value(floe: FloeClient, vaultId: string): Promise<VenueValuation>;
}

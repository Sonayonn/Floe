/**
 * Floe — the Strategy interface.
 *
 * This is the seam that makes Floe a platform rather than a single vault.
 * The engine (deepbook clients, PTB composer, vault accounting, Pyth, Walrus)
 * is strategy-agnostic: it calls `decide()` with the current market + vault
 * state and executes whatever actions come back. Floe ships ONE reference
 * strategy (Stratos), but any builder can implement this interface to deploy
 * straddles, iron condors, basis trades, etc. on the same attested,
 * Walrus-audited rails.
 *
 * If you are reading this to build your own Floe strategy: implement
 * `Strategy`, return `RebalanceAction[]` from `decide()`, and the engine
 * does the rest.
 */

// ─── Market + vault state the strategy sees each cycle ───────────────────────

/** A single point on the SVI volatility surface for one oracle/expiry. */
export interface SurfacePoint {
  oracleId: string;
  expiryMs: number;
  spot: number;        // underlying spot price (human units, e.g. USD)
  forward: number;     // forward price at expiry
  impliedVol: number;  // ATM implied vol (annualized), from SVI params
  // raw SVI params, for strategies that want the full smile
  svi: { a: number; b: number; rho: number; m: number; sigma: number };
}

/** An open range position the vault currently holds. */
export interface OpenPosition {
  positionId: string;
  oracleId: string;
  expiryMs: number;
  lowerStrike: number;
  upperStrike: number;
  size: number;
  premiumPaid: number;
  markValue: number;
}

/** Everything the strategy needs to make a decision this cycle. */
export interface MarketState {
  nowMs: number;
  surface: SurfacePoint[];        // live SVI surface across active expiries
  // vault state
  nav: number;                    // total assets (human units)
  idle: number;                   // un-deployed quote asset
  plpHeld: number;                // PLP units held
  plpPrice: number;               // attested PLP price
  openPositions: OpenPosition[];  // current Stratum B positions
  hedgeNotional: number;          // current Stratum C hedge size (signed by isShort)
  hedgeIsShort: boolean;
  plpFloorBps: number;            // Stratum A liquidity floor
}

// ─── Actions the strategy can request — a tagged union ───────────────────────
// The engine knows how to compose each of these into the rebalance PTB.

export type RebalanceAction =
  | { kind: 'supply_plp'; amount: number }                       // Stratum A: deploy idle -> PLP
  | { kind: 'redeem_plp'; plpAmount: number }                    // Stratum A: PLP -> idle
  | { kind: 'open_range'; oracleId: string; expiryMs: number;    // Stratum B: write a range
      lowerStrike: number; upperStrike: number; size: number }
  | { kind: 'close_range'; positionId: string;                   // Stratum B: redeem a range
      oracleId: string; expiryMs: number;
      lowerStrike: number; upperStrike: number }
  | { kind: 'open_hedge'; notional: number; isShort: boolean }   // Stratum C: open/adjust hedge
  | { kind: 'close_hedge' }                                      // Stratum C: unwind hedge
  | { kind: 'noop'; reason: string };                            // explicit "do nothing this cycle"

// ─── The interface every Floe strategy implements ───────────────────────────

export interface Strategy {
  /** Human-readable name, surfaced in logs / Walrus snapshots / the dashboard. */
  readonly name: string;

  /** Short description of what this strategy does. */
  readonly description: string;

  /**
   * Given current market + vault state, decide what to do this cycle.
   * Pure function: no side effects, no chain calls. The engine executes
   * the returned actions. This is what makes strategies hot-swappable and
   * backtestable — the same `decide()` runs over live data or historical data.
   */
  decide(state: MarketState): RebalanceAction[];
}

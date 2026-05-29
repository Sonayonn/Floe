/**
 * Floe Stratos — the reference strategy.
 *
 * Implements the Strategy interface. This is ONE strategy among many that
 * could run on Floe's engine; it is deliberately not privileged. A builder
 * writing a straddle or iron-condor strategy implements the same interface
 * and returns the same RebalanceAction[] — the engine runs it identically.
 * That interchangeability is what makes Floe a platform, not an app.
 *
 * Stratos = three coordinated strata:
 *   A. PLP base yield   — keep a floor of capital in Predict's LP vault.
 *   B. 1σ range ladder  — write vertical ranges at ~1σ off the live SVI surface.
 *   C. Delta hedge      — neutralize directional drift via DeepBook Margin.
 *
 * decide() is PURE: same code runs live and in backtest.
 */

import type {
  Strategy, MarketState, RebalanceAction, SurfacePoint, OpenPosition,
} from './types.ts';
import { oneSigmaRange } from '../oracle/svi.ts';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ─── Tunable strategy parameters (Week 3: Seal-encrypted on-chain) ───────────

export interface StratosParams {
  /** Fraction of NAV to keep in PLP as the base-yield floor (0..1). */
  plpTargetFraction: number;
  /** Target tenor for the active range, in days; pick the closest expiry. */
  targetTenorDays: number;
  /** Range half-width in sigmas (1 = ±1σ band). */
  rangeSigmas: number;
  /** Fraction of free (non-PLP) capital to allocate to a single range. */
  rangeCapitalFraction: number;
  /** Close a range when spot exits the inner X fraction of the band. */
  innerBandFraction: number;
  /** Close a range when it has <= this many days to expiry. */
  minDaysToExpiry: number;
  /** Open/adjust hedge when |net delta| (as fraction of NAV) exceeds this. */
  hedgeDeltaThreshold: number;
}

export const DEFAULT_PARAMS: StratosParams = {
  plpTargetFraction: 0.50,      // matches the contract's 50% PLP floor
  targetTenorDays: 7,
  rangeSigmas: 1,
  rangeCapitalFraction: 0.30,
  innerBandFraction: 0.5,
  minDaysToExpiry: 1,
  hedgeDeltaThreshold: 0.10,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Pick the active expiry whose tenor is closest to the target. */
function pickExpiry(surface: SurfacePoint[], nowMs: number, targetDays: number): SurfacePoint | null {
  if (surface.length === 0) return null;
  const targetMs = nowMs + targetDays * MS_PER_DAY;
  return surface.reduce((best, p) =>
    Math.abs(p.expiryMs - targetMs) < Math.abs(best.expiryMs - targetMs) ? p : best
  );
}

/**
 * Rough net delta of the open range book, as a signed fraction of NAV.
 * A vertical range is short-vol: near-zero delta when spot sits mid-band,
 * growing negative as spot approaches the upper strike (we're effectively
 * short upside) and positive toward the lower strike. We approximate delta
 * by how far spot has drifted from the band midpoint, scaled by position size.
 */
function estimateNetDelta(positions: OpenPosition[], spot: number, nav: number): number {
  if (nav <= 0) return 0;
  let delta = 0;
  for (const pos of positions) {
    const mid = (pos.lowerStrike + pos.upperStrike) / 2;
    const halfWidth = (pos.upperStrike - pos.lowerStrike) / 2;
    if (halfWidth <= 0) continue;
    // normalized drift in [-1, 1]; positive when spot above mid
    const drift = Math.max(-1, Math.min(1, (spot - mid) / halfWidth));
    // short-vol: spot above mid => negative delta (need to buy to hedge)
    delta += -drift * (pos.size / nav);
  }
  return delta;
}

// ─── The strategy ────────────────────────────────────────────────────────────

export class StratosStrategy implements Strategy {
  readonly name = 'Floe Stratos';
  readonly description =
    'Three-stratum delta-managed range vault: PLP base yield + 1σ SVI range ladder + Margin delta hedge.';

  constructor(private readonly params: StratosParams = DEFAULT_PARAMS) {}

  decide(state: MarketState): RebalanceAction[] {
    const actions: RebalanceAction[] = [];
    const p = this.params;

    // ── Stratum A: keep PLP at the target floor ──────────────────────────────
    const plpValue = state.plpHeld * state.plpPrice;
    const plpTarget = state.nav * p.plpTargetFraction;
    const plpGap = plpTarget - plpValue;
    if (plpGap > 0 && state.idle > 0) {
      const supply = Math.min(plpGap, state.idle);
      if (supply > 0) actions.push({ kind: 'supply_plp', amount: supply });
    }

    // ── Stratum B: maintain one 1σ range at the target tenor ─────────────────
    // Close positions that are near expiry or have drifted out of the inner band.
    for (const pos of state.openPositions) {
      const daysLeft = (pos.expiryMs - state.nowMs) / MS_PER_DAY;
      const mid = (pos.lowerStrike + pos.upperStrike) / 2;
      const halfWidth = (pos.upperStrike - pos.lowerStrike) / 2;
      const spot = state.surface.find((s) => s.oracleId === pos.oracleId)?.spot ?? mid;
      const innerEdge = halfWidth * p.innerBandFraction;
      const driftedOut = Math.abs(spot - mid) > innerEdge;
      if (daysLeft <= p.minDaysToExpiry || driftedOut) {
        actions.push({ kind: 'close_range', positionId: pos.positionId });
      }
    }

    // Open a fresh range at the target tenor if we hold none there.
    const target = pickExpiry(state.surface, state.nowMs, p.targetTenorDays);
    if (target) {
      const haveAtExpiry = state.openPositions.some((pos) => pos.oracleId === target.oracleId);
      const freeCapital = Math.max(state.idle - 0, 0); // idle not earmarked for PLP gap
      if (!haveAtExpiry && freeCapital > 0) {
        const band = oneSigmaRange(target, p.rangeSigmas);
        const size = freeCapital * p.rangeCapitalFraction;
        if (size > 0) {
          actions.push({
            kind: 'open_range',
            oracleId: target.oracleId,
            expiryMs: target.expiryMs,
            lowerStrike: band.lowerStrike,
            upperStrike: band.upperStrike,
            size,
          });
        }
      }
    }

    // ── Stratum C: hedge net delta if past threshold ─────────────────────────
    const refSpot = target?.spot ?? state.surface[0]?.spot ?? 0;
    const netDelta = estimateNetDelta(state.openPositions, refSpot, state.nav);
    if (Math.abs(netDelta) > p.hedgeDeltaThreshold) {
      // netDelta < 0 (short) => we need long exposure => hedge isShort = false
      actions.push({
        kind: 'open_hedge',
        notional: Math.abs(netDelta) * state.nav,
        isShort: netDelta > 0,
      });
    } else if (state.hedgeNotional > 0 && Math.abs(netDelta) < p.hedgeDeltaThreshold * 0.5) {
      // delta neutralized comfortably — unwind the hedge
      actions.push({ kind: 'close_hedge' });
    }

    if (actions.length === 0) actions.push({ kind: 'noop', reason: 'within all bands' });
    return actions;
  }
}

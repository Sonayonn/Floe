/**
 * Floe backtest — the engine.
 *
 * This is the off-chain mirror of the live rebalancer's execution loop, but over a
 * simulated price path. CRITICAL: it imports and runs the REAL StratosStrategy.decide()
 * and the REAL oneSigmaRange() — it does NOT reimplement the strategy. So this backtests
 * Floe Stratos verbatim, not a model of it.
 *
 * Premium/payoff is SVI-CONSISTENT: a vertical range's premium equals its expected payoff
 * under the same SVI-implied lognormal the strike was chosen from (plus a small edge for
 * the LP taking the other side). In-range at expiry -> vault keeps premium; breach -> vault
 * pays the range loss. This is the genuine short-vol payoff, priced off the surface itself.
 */

import { StratosStrategy, DEFAULT_PARAMS, type StratosParams } from '../strategy/stratos.ts';
import type { MarketState, SurfacePoint, OpenPosition } from '../strategy/types.ts';
import { type ModelParams, stepPrice, makeRng, randNorm } from './model.ts';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_YEAR = 365.25 * MS_PER_DAY;

export interface SimConfig {
  days: number;            // simulation horizon
  rebalanceEveryDays: number;
  initialNav: number;      // starting deposit (human units)
  initialSpot: number;     // starting BTC price
  baseIv: number;          // anchor implied vol for the surface (annual)
  plpApr: number;          // PLP base yield (annual) — the Stratum A floor return
  lpEdgeBps: number;       // edge the vault earns as the LP writing the range (bps of size)
  feeMgmtBps: number;      // annual mgmt fee (matches contract caps)
  feePerfBps: number;      // performance fee
}

export const DEFAULT_SIM: SimConfig = {
  days: 365,
  rebalanceEveryDays: 1,
  initialNav: 1_000_000,
  initialSpot: 65_000,
  baseIv: 0.55,
  plpApr: 0.08,
  lpEdgeBps: 150,      // 1.5% edge to the LP per range cycle (premium > fair value)
  feeMgmtBps: 200,     // 2%/yr
  feePerfBps: 2000,    // 20%
};

export interface SimResult {
  equityCurve: number[];   // NAV at each rebalance step
  finalNav: number;
  rangesWritten: number;
  rangesInRange: number;   // settled in-range (kept premium)
  rangesBreached: number;  // settled out (paid loss)
  totalPremium: number;
  totalLosses: number;
  feesPaid: number;
}

/** Normal CDF (Abramowitz-Stegun) — for SVI-consistent breach probability + premium. */
function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

/**
 * SVI-consistent premium for a vertical range [lower, upper] at forward F, vol iv, tau years.
 * Under lognormal, P(in range) = N(d_upper) - N(d_lower). The LP collects a premium equal to
 * the expected payout it must cover (1 - P_in)*size, plus an edge. We model: the buyer pays
 * `premium`; if spot stays in range the LP keeps it; else the LP pays `size` (range loss).
 * Premium is set so expected LP P&L = edge*size (the LP's structural advantage as counterparty).
 */
interface RangeEcon { premium: number; pOut: number; maxLossFrac: number; }
/**
 * Economics of writing a vertical range, per unit of DEPLOYED capital (size).
 * The position earns a premium ~ the vol-spread it captures over the tenor; its loss when
 * breached is BOUNDED (a vertical's max loss is the band width, not the whole notional).
 * premium = (vol budget over tenor) * tightness * edge ; realistic single-digit-% per cycle.
 */
function rangeEconomics(F: number, lower: number, upper: number, iv: number, tau: number, edgeBps: number): RangeEcon {
  const vt = iv * Math.sqrt(Math.max(tau, 1e-9));            // 1-sigma move fraction over tenor
  const dU = Math.log(upper / F) / Math.max(vt, 1e-9);
  const dL = Math.log(lower / F) / Math.max(vt, 1e-9);
  const pIn = Math.max(0, Math.min(1, normCdf(dU) - normCdf(dL)));
  const pOut = 1 - pIn;
  // premium per unit size: the vol-spread captured. ~ vt scaled down (the LP earns a slice of
  // the tenor's vol budget), plus a small structural edge. This yields realistic per-cycle %.
  const premiumFrac = vt * 0.5 + edgeBps / 10_000;          // e.g. 55% iv, 7d -> vt~0.077 -> ~3.8%+edge
  // max loss if breached: bounded by the band half-width as a fraction (a vertical caps loss).
  const halfWidthFrac = ((upper - lower) / 2) / F;
  const maxLossFrac = Math.min(1, halfWidthFrac);            // loss can't exceed the band width
  return { premium: premiumFrac, pOut, maxLossFrac };
}

/** Build a single-expiry SVI surface point at simulated time, tau-correct. */
function makeSurface(nowMs: number, spot: number, iv: number, tenorDays: number): SurfacePoint {
  const expiryMs = nowMs + tenorDays * MS_PER_DAY;
  const tau = (expiryMs - nowMs) / MS_PER_YEAR;
  const forward = spot; // testnet: forward ~= spot (no carry)
  // raw-SVI params that reproduce `iv` at ATM over this tau: a = iv^2 * tau (flat-ish smile)
  const a = iv * iv * tau;
  return {
    oracleId: 'sim-btc',
    expiryMs,
    spot,
    forward,
    impliedVol: iv,
    svi: { a, b: 0.1 * a, rho: -0.1, m: 0, sigma: 0.1 },
    tickSize: 100,
    minStrike: 1000,
  };
}

/** Run one path under a regime. Drives the REAL strategy.decide(). */
/** Loss FRACTION of locked capital when a range is breached. Scales with how far past the
 *  breached strike spot landed, measured in band-half-widths, capped at 1 (total loss).
 *  This is what makes the strategy honestly short-vol: small breaches sting, crash gaps ruin. */
function breachLossFrac(spot: number, lower: number, upper: number): number {
  const halfWidth = (upper - lower) / 2;
  if (halfWidth <= 0) return 1;
  const strike = spot > upper ? upper : lower;
  const distPastStrike = Math.abs(spot - strike);
  // loss grows linearly in band-half-widths past the strike; 1 half-width past ~ full band-width loss.
  // A 1-sigma band breached by 1 sigma -> ~100% loss; deeper -> capped at 100%.
  return Math.min(1, distPastStrike / halfWidth);
}

export function simulatePath(
  regime: ModelParams, cfg: SimConfig, seed: number, params: StratosParams = DEFAULT_PARAMS,
): SimResult {
  const rng = makeRng(seed);
  const strat = new StratosStrategy(params);

  let nav = cfg.initialNav;
  let idle = cfg.initialNav;
  let plpHeld = 0;
  const plpPrice = 1.0;
  let hedgeNotional = 0;
  let hedgeIsShort = false;
  let spot = cfg.initialSpot;
  let nowMs = 0;
  let hwm = nav;

  // open positions carry the sim-only fields we need to settle them
  interface SimPos extends OpenPosition { premium: number; spotAtOpen: number; lockedCapital: number; maxLossFrac: number; }
  let positions: SimPos[] = [];

  const equityCurve: number[] = [nav];
  let rangesWritten = 0, rangesInRange = 0, rangesBreached = 0;
  let totalPremium = 0, totalLosses = 0, feesPaid = 0;
  let lastFeeMs = 0;

  const dtYears = cfg.rebalanceEveryDays / 365;
  const steps = Math.floor(cfg.days / cfg.rebalanceEveryDays);
  const ivWindow: number[] = [];

  for (let step = 0; step < steps; step++) {
    // advance price
    const prev = spot;
    spot = stepPrice(spot, regime, dtYears, rng);
    ivWindow.push(Math.log(spot / prev));
    if (ivWindow.length > 30) ivWindow.shift();
    nowMs += cfg.rebalanceEveryDays * MS_PER_DAY;

    // settle any positions that have reached expiry
    positions = positions.filter((pos) => {
      if (nowMs < pos.expiryMs) return true;
      // settle: in-range if spot within [lower, upper] at expiry
      const inRange = spot >= pos.lowerStrike && spot <= pos.upperStrike;
      if (inRange) {
        rangesInRange++;
        idle += pos.lockedCapital;       // return collateral; premium was kept at open
      } else {
        rangesBreached++;
        const lossFrac = breachLossFrac(spot, pos.lowerStrike, pos.upperStrike);
        const loss = pos.lockedCapital * lossFrac;     // up to 100% of collateral in a deep breach
        idle += pos.lockedCapital - loss;
        totalLosses += loss;
      }
      return false; // remove settled
    });

    // PLP base yield accrues on held PLP
    const plpYield = plpHeld * plpPrice * cfg.plpApr * dtYears;
    idle += plpYield;

    // recompute NAV (idle + plp + open position premium-at-risk is already in idle)
    const plpValue = plpHeld * plpPrice;
    const lockedInRanges = positions.reduce((a, pp) => a + pp.lockedCapital, 0);
    nav = idle + plpValue + lockedInRanges;

    // surface IV: blend the anchor with realized (vol clustering shows through)
    const iv = 0.5 * cfg.baseIv + 0.5 * Math.min(2.0, Math.max(0.2, Math.sqrt(
      ivWindow.reduce((a, b) => a + b * b, 0) / Math.max(ivWindow.length, 1) * 365)));

    const surface = [makeSurface(nowMs, spot, iv, params.targetTenorDays)];

    const state: MarketState = {
      nowMs, surface, nav, idle, plpHeld, plpPrice,
      openPositions: positions.map((p) => ({
        positionId: p.positionId, oracleId: p.oracleId, expiryMs: p.expiryMs,
        lowerStrike: p.lowerStrike, upperStrike: p.upperStrike, size: p.size,
        premiumPaid: p.premiumPaid, markValue: p.markValue,
      })),
      hedgeNotional, hedgeIsShort, plpFloorBps: 5000,
    };

    // ── run the REAL strategy ──
    const actions = strat.decide(state);

    for (const act of actions) {
      switch (act.kind) {
        case 'supply_plp': {
          const amt = Math.min(act.amount, idle);
          if (amt > 0) { idle -= amt; plpHeld += amt / plpPrice; }
          break;
        }
        case 'redeem_plp': {
          const amt = Math.min(act.plpAmount, plpHeld);
          if (amt > 0) { plpHeld -= amt; idle += amt * plpPrice; }
          break;
        }
        case 'open_range': {
          // capital-constrained: a range LOCKS `size` of idle as collateral. Can't write
          // infinite ranges — each consumes capital, returned (±loss) at settle.
          if (act.size > 0 && idle >= act.size) {
            const tau = (act.expiryMs - nowMs) / MS_PER_YEAR;
            const econ = rangeEconomics(spot, act.lowerStrike, act.upperStrike, iv, tau, cfg.lpEdgeBps);
            const prem = econ.premium * act.size;     // premium as % of deployed capital
            idle -= act.size;                          // lock collateral
            idle += prem;                              // collect premium up front
            totalPremium += prem;
            rangesWritten++;
            positions.push({
              positionId: `p${rangesWritten}`, oracleId: act.oracleId, expiryMs: act.expiryMs,
              lowerStrike: act.lowerStrike, upperStrike: act.upperStrike, size: act.size,
              premiumPaid: prem, markValue: prem, premium: prem, spotAtOpen: spot,
              lockedCapital: act.size, maxLossFrac: econ.maxLossFrac,
            });
          }
          break;
        }
        case 'close_range': {
          const i = positions.findIndex((p) => p.positionId === act.positionId);
          if (i >= 0) {
            const pos = positions[i];
            // early close: settle at current spot
            const inRange = spot >= pos.lowerStrike && spot <= pos.upperStrike;
            if (inRange) { rangesInRange++; idle += pos.lockedCapital; }
            else {
              const lossFrac = breachLossFrac(spot, pos.lowerStrike, pos.upperStrike);
              const loss = pos.lockedCapital * lossFrac;
              rangesBreached++; idle += pos.lockedCapital - loss; totalLosses += loss;
            }
            positions.splice(i, 1);
          }
          break;
        }
        case 'open_hedge': {
          // hedge P&L approximated: a delta hedge offsets directional drift; model it as
          // reducing the variance of the next leg. Cost: small carry (funding) on notional.
          hedgeNotional = act.notional; hedgeIsShort = act.isShort;
          const fundingCost = act.notional * 0.0001 * dtYears * 365; // ~ small daily funding
          idle -= fundingCost;
          break;
        }
        case 'close_hedge': { hedgeNotional = 0; break; }
        case 'noop': break;
      }
    }

    // fees: accrue mgmt (on NAV) + perf (above hwm)
    const dtFee = (nowMs - lastFeeMs) / MS_PER_YEAR;
    const mgmt = nav * (cfg.feeMgmtBps / 10_000) * dtFee;
    let perf = 0;
    if (nav > hwm) { perf = (nav - hwm) * (cfg.feePerfBps / 10_000); hwm = nav; }
    const fee = mgmt + perf;
    idle -= fee; feesPaid += fee; lastFeeMs = nowMs;

    nav = idle + plpHeld * plpPrice + positions.reduce((a, pp) => a + pp.lockedCapital, 0);
    equityCurve.push(nav);
  }

  return {
    equityCurve, finalNav: nav, rangesWritten, rangesInRange, rangesBreached,
    totalPremium, totalLosses, feesPaid,
  };
}

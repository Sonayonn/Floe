/**
 * Floe — SVI surface reader + 1σ range computation.
 *
 * Reads the live Block Scholes SVI surface from the Predict indexer and
 * computes the 1σ strike band that Stratum B writes.
 *
 * ENCODING (confirmed against Block Scholes docs): every decimal value from
 * the oracle — spot, forward, and all five SVI params — is an int64 with fixed
 * 9-decimal precision (1.23 -> 1_230_000_000). rho and m carry separate
 * `_negative` sign flags. We divide by 1e9 and apply the sign.
 *
 * SVI total-variance formula (raw SVI, per Block Scholes / Gatheral):
 *   w(k) = a + b * ( rho*(k - m) + sqrt((k - m)^2 + sigma^2) )
 * w is total variance over the option horizon; annualize then sqrt for IV.
 */

import type { SurfacePoint } from '../strategy/types.ts';
import { PREDICT } from '../config.ts';

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
const ORACLE_SCALAR = 1e9; // Block Scholes fixed 9-decimal encoding

// ─── SVI implied vol ─────────────────────────────────────────────────────────

export interface SviParams { a: number; b: number; rho: number; m: number; sigma: number }

/** Raw-SVI total variance at log-moneyness k. */
export function sviTotalVariance(svi: SviParams, k: number): number {
  return svi.a + svi.b * (svi.rho * (k - svi.m) + Math.sqrt((k - svi.m) ** 2 + svi.sigma ** 2));
}

/** Annualized ATM-forward implied vol from raw SVI params over horizon tau. */
export function sviImpliedVol(svi: SviParams, tauYears: number): number {
  const totalVar = Math.max(sviTotalVariance(svi, 0), 0); // k=0 = ATM-forward
  const variancePerYear = totalVar / Math.max(tauYears, 1e-9);
  return Math.sqrt(variancePerYear);
}

// ─── 1σ range ────────────────────────────────────────────────────────────────

export interface RangeBand {
  lowerStrike: number;
  upperStrike: number;
  impliedVol: number;
  tauYears: number;
  sigmaMove: number;
}

export function oneSigmaRange(point: SurfacePoint, sigmas = 1, nowMs: number = Date.now()): RangeBand {
  const tauYears = Math.max((point.expiryMs - nowMs) / MS_PER_YEAR, 1e-9);
  const move = point.impliedVol * Math.sqrt(tauYears) * sigmas;

  const rawLower = point.forward * Math.exp(-move);
  const rawUpper = point.forward * Math.exp(+move);

  // Snap to the oracle's strike grid: strikes must be integer multiples of
  // tickSize and >= minStrike (assert_valid_strike). Round lower DOWN and
  // upper UP so the snapped band always contains the computed 1σ band.
  const tick = point.tickSize > 0 ? point.tickSize : 1;
  const snap = (v: number, dir: 'down' | 'up') =>
    (dir === 'down' ? Math.floor(v / tick) : Math.ceil(v / tick)) * tick;

  let lowerStrike = Math.max(snap(rawLower, 'down'), point.minStrike);
  let upperStrike = Math.max(snap(rawUpper, 'up'), point.minStrike + tick);
  if (upperStrike <= lowerStrike) upperStrike = lowerStrike + tick;

  return {
    lowerStrike,
    upperStrike,
    impliedVol: point.impliedVol,
    tauYears,
    sigmaMove: point.forward * (Math.exp(move) - 1),
  };
}

// ─── Surface fetch from the Predict indexer ──────────────────────────────────

function dec(v: any): number {
  return Number(v ?? 0) / ORACLE_SCALAR;
}

function decSigned(v: any, negFlag: any): number {
  const mag = Number(v ?? 0) / ORACLE_SCALAR;
  return negFlag ? -mag : mag;
}

/**
 * Pull active oracles + their latest SVI/price state, build SurfacePoint[].
 * Oracles are queried under the global Predict object (PREDICT.objectId),
 * not the personal manager. Filters to status "active".
 */
export async function fetchSurface(): Promise<SurfacePoint[]> {
  const base = PREDICT.serverUrl;

  const listRes = await fetch(`${base}/predicts/${PREDICT.objectId}/oracles`);
  if (!listRes.ok) throw new Error(`oracle list failed: ${listRes.status}`);
  const oracles: any[] = await listRes.json();

  const active = oracles.filter((o) => o.status === 'active');
  const points: SurfacePoint[] = [];

  for (const o of active) {
    const stateRes = await fetch(`${base}/oracles/${o.oracle_id}/state`);
    if (!stateRes.ok) continue;
    const s: any = await stateRes.json();

    const lp = s.latest_price;
    const lsvi = s.latest_svi;
    if (!lp || !lsvi) continue; // no published price/svi yet

    const svi: SviParams = {
      a: dec(lsvi.a),
      b: dec(lsvi.b),
      rho: decSigned(lsvi.rho, lsvi.rho_negative),
      m: decSigned(lsvi.m, lsvi.m_negative),
      sigma: dec(lsvi.sigma),
    };
    const spot = dec(lp.spot);
    const forward = dec(lp.forward);
    const expiryMs = Number(o.expiry ?? s.oracle?.expiry ?? 0);

    const tauYears = Math.max((expiryMs - Date.now()) / MS_PER_YEAR, 1e-9);
    const impliedVol = sviImpliedVol(svi, tauYears);

    const tickSize = dec(o.tick_size ?? s.oracle?.tick_size);
    const minStrike = dec(o.min_strike ?? s.oracle?.min_strike);
    points.push({ oracleId: o.oracle_id, expiryMs, spot, forward, impliedVol, svi, tickSize, minStrike });
  }

  return points;
}

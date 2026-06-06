/**
 * Floe backtest — price + vol model.
 *
 * Merton jump-diffusion (GBM diffusion + Poisson-timed lognormal jumps), NOT plain GBM:
 * the literature is explicit that Gaussian models UNDERESTIMATE drawdowns (fat tails,
 * vol clustering). A short-vol range strategy's whole risk IS the tail, so modelling
 * jumps is the difference between an honest backtest and a misleading one. Params are
 * calibrated to BTC's empirical behaviour and labelled per regime.
 *
 * Deterministic, seedable RNG (mulberry32) so every run is reproducible.
 */

export type Regime = 'bull' | 'bear' | 'chop' | 'crash';

export interface ModelParams {
  mu: number;            // annual drift
  sigma: number;         // annual diffusive vol
  jumpIntensity: number; // expected jumps per year (Poisson lambda)
  jumpMean: number;      // mean jump size (log space)
  jumpStd: number;       // std of jump size (log space)
}

// Calibrated to BTC regimes (annualized), labelled honestly.
export const REGIMES: Record<Regime, ModelParams> = {
  bull:  { mu:  0.60, sigma: 0.55, jumpIntensity: 3,  jumpMean:  0.00, jumpStd: 0.04 },
  bear:  { mu: -0.45, sigma: 0.60, jumpIntensity: 4,  jumpMean: -0.01, jumpStd: 0.05 },
  chop:  { mu:  0.05, sigma: 0.40, jumpIntensity: 2,  jumpMean:  0.00, jumpStd: 0.03 },
  crash: { mu: -0.30, sigma: 0.90, jumpIntensity: 12, jumpMean: -0.04, jumpStd: 0.09 },
};

/** mulberry32 — tiny seedable PRNG for reproducible runs. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal via Box-Muller (seedable). */
export function randNorm(rng: () => number): number {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * One step of Merton jump-diffusion over dtYears. Returns the new spot.
 *   dS/S = (mu - 0.5 sigma^2) dt + sigma sqrt(dt) Z + jumps
 */
export function stepPrice(spot: number, p: ModelParams, dtYears: number, rng: () => number): number {
  const drift = (p.mu - 0.5 * p.sigma * p.sigma) * dtYears;
  const diffusion = p.sigma * Math.sqrt(dtYears) * randNorm(rng);
  let s = spot * Math.exp(drift + diffusion);
  const expectedJumps = p.jumpIntensity * dtYears;
  // Knuth Poisson sampler for the number of jumps this step
  const L = Math.exp(-expectedJumps);
  let k = 0, prod = rng();
  while (prod > L) { k++; prod *= rng(); }
  for (let i = 0; i < k; i++) s *= Math.exp(p.jumpMean + p.jumpStd * randNorm(rng));
  return s;
}

/** Realized annualized vol from daily log-returns. */
export function realizedVol(logReturns: number[]): number {
  if (logReturns.length < 2) return 0.5;
  const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
  const varc = logReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / (logReturns.length - 1);
  return Math.sqrt(varc * 365);
}

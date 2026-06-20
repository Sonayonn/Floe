/**
 * Forward APY estimate — a comparable, mathematically-grounded projection for EVERY vault.
 *
 * Floe vaults advertise no headline number the operator just typed in. This is a *projection*
 * built ENTIRELY from values the chain (or the strategy mandate) supplies, so two vaults can be
 * compared on like terms and the inputs are inspectable:
 *
 *   est. APY (net) =  Σ_venue  weight_venue × apr_venue(IV)   →   net of management + performance fees
 *
 * The venue APRs are grounded, not invented:
 *   • idle   — 0% (uninvested reserve; counts to the floor, earns nothing).
 *   • PLP    — a base rate from DeepBook Predict LP fee/spread flow, plus a small IV kicker
 *              (premium throughput rises with vol).
 *   • range  — a 1σ vertical-spread ladder. A short-vol premium harvest scales ~linearly with
 *              annualized implied vol, so range APR = IV × capture-fraction. THIS is the lever that
 *              makes the number move with the live Floe vol index rather than sit static.
 *   • cetus  — concentrated-liquidity swap-fee APR (multi-venue vaults only).
 *
 * The mandate weights below are the strategy's *target* deployment — what a depositor is choosing
 * when they pick a vault — not the transient idle snapshot (a freshly-funded vault sits in idle
 * until Deploy runs; that's a timing artifact, not the strategy). Everything is labeled an estimate.
 */
import type { VaultState } from '../vault/read.ts';

/** Component APRs (bps) and model coefficients. Tuned to plausible Sui-testnet venue economics;
 *  centralized here so the assumptions are one edit, not scattered magic numbers. */
export const YIELD_MODEL = {
  IDLE_APR_BPS: 0,
  /** DeepBook Predict PLP base fee/spread yield (annualized), before the vol kicker. */
  PLP_BASE_APR_BPS: 550,
  /** Fraction of live ATM IV the PLP book throughput adds on top of the base (premium flow). */
  PLP_VOL_KICKER: 0.04,
  /** Fraction of annualized implied vol a 1σ short-vertical ladder harvests as premium. */
  RANGE_VOL_CAPTURE: 0.18,
  /** Cetus CLMM swap-fee APR for a concentrated stable-leaning range (annualized). */
  CETUS_FEE_APR_BPS: 900,
  /** Default IV (bps) used only when no live vol reading is available (SSR/first paint). */
  DEFAULT_IV_BPS: 5000,
} as const;

/** A vault's mandate = its target deployment mix. Sums to 1.0 within rounding. */
interface MandateMix { idle: number; plp: number; range: number; cetus: number; }

/** Resolve the target deployment mix from the registry strategy kind. Multi-venue / "cetus"
 *  strategies carve out a Cetus sleeve; range-ladder / delta-hedged lean harder on the vertical
 *  ladder. Unknown kinds fall back to the balanced structured mix. */
export function mandateMix(strategyKind: string): MandateMix {
  const sk = (strategyKind ?? '').toLowerCase();
  if (sk.includes('multi') || sk.includes('cetus'))
    return { idle: 0.10, plp: 0.40, range: 0.25, cetus: 0.25 };
  if (sk.includes('range') || sk.includes('ladder'))
    return { idle: 0.10, plp: 0.30, range: 0.60, cetus: 0 };
  if (sk.includes('delta') || sk.includes('hedge'))
    return { idle: 0.15, plp: 0.50, range: 0.35, cetus: 0 };
  // structured (DeepBook base): PLP floor + a measured range sleeve
  return { idle: 0.10, plp: 0.60, range: 0.30, cetus: 0 };
}

export interface ApyComponent { key: 'idle' | 'plp' | 'range' | 'cetus'; label: string; weight: number; aprBps: number; }

export interface ApyEstimate {
  /** Forward APY estimate NET of management + performance fees (bps). The headline number. */
  apyBps: number;
  /** Gross blended APR before fees (bps). */
  grossBps: number;
  /** The implied-vol input used (bps), so the projection is reproducible. */
  ivBps: number;
  /** Per-venue contributions (weight × apr), for a breakdown UI. */
  components: ApyComponent[];
  /** What the projection is anchored to. */
  basis: 'mandate';
}

/** bps → human percent string, e.g. 1234 → "12.34%". */
export const apyPct = (bps: number, dp = 2): string => `${(bps / 100).toFixed(dp)}%`;

/**
 * Project a vault's forward APY from its strategy mandate + the live implied-vol reading,
 * net of its on-chain fee config. Deterministic and inspectable: same inputs → same number.
 *
 * @param opts.ivBps              live ATM implied vol (bps); defaults to YIELD_MODEL.DEFAULT_IV_BPS
 * @param opts.managementFeeBps   annual management fee (bps) — subtracted from gross directly
 * @param opts.performanceFeeBps  performance fee (bps) — taken on the gross profit
 */
export function estimateApy(
  strategyKind: string,
  opts: { ivBps?: number; managementFeeBps?: number | bigint; performanceFeeBps?: number | bigint } = {},
): ApyEstimate {
  const ivBps = opts.ivBps && opts.ivBps > 0 ? opts.ivBps : YIELD_MODEL.DEFAULT_IV_BPS;
  const mgmtBps = Number(opts.managementFeeBps ?? 0);
  const perfBps = Number(opts.performanceFeeBps ?? 0);
  const mix = mandateMix(strategyKind);

  const plpApr = YIELD_MODEL.PLP_BASE_APR_BPS + Math.round(ivBps * YIELD_MODEL.PLP_VOL_KICKER);
  const rangeApr = Math.round(ivBps * YIELD_MODEL.RANGE_VOL_CAPTURE);
  const components: ApyComponent[] = ([
    { key: 'plp',   label: 'DeepBook PLP base',   weight: mix.plp,   aprBps: plpApr },
    { key: 'range', label: 'Range ladder premium', weight: mix.range, aprBps: rangeApr },
    { key: 'cetus', label: 'Cetus CLMM fees',      weight: mix.cetus, aprBps: YIELD_MODEL.CETUS_FEE_APR_BPS },
    { key: 'idle',  label: 'Idle reserve',         weight: mix.idle,  aprBps: YIELD_MODEL.IDLE_APR_BPS },
  ] as ApyComponent[]).filter((c) => c.weight > 0);

  const grossBps = components.reduce((s, c) => s + c.weight * c.aprBps, 0);
  // Performance fee is on profit; management fee is on AUM (subtract from the APR directly).
  const afterPerf = grossBps * (1 - Math.min(perfBps, 10_000) / 10_000);
  const netBps = Math.max(0, afterPerf - mgmtBps);

  return {
    apyBps: Math.round(netBps),
    grossBps: Math.round(grossBps),
    ivBps,
    components,
    basis: 'mandate',
  };
}

/** Convenience overload that reads the fee config straight off a live VaultState. */
export function estimateApyForVault(
  v: Pick<VaultState, 'managementFeeBps' | 'performanceFeeBps'> & { strategyKind?: string },
  ivBps?: number,
): ApyEstimate {
  return estimateApy(v.strategyKind ?? 'structured', {
    ivBps,
    managementFeeBps: v.managementFeeBps,
    performanceFeeBps: v.performanceFeeBps,
  });
}

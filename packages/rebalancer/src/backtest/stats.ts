/**
 * Floe backtest — risk statistics.
 *
 * The panel a senior quant expects: not "APY!" but the full risk-adjusted picture,
 * per regime, across many paths — Sharpe/Sortino/Calmar, max drawdown, VaR, the in-range
 * (non-breach) rate that is the real credibility metric for a short-vol range strategy,
 * and the return distribution (median / p5 / p95) so the tail is visible, not hidden.
 */

import type { SimResult } from './engine.ts';

export interface RegimeStats {
  regime: string;
  paths: number;
  // return distribution (annualized, since horizon may differ)
  medianReturnPct: number;
  p5ReturnPct: number;
  p95ReturnPct: number;
  meanReturnPct: number;
  // risk-adjusted
  sharpe: number;
  sortino: number;
  calmar: number;
  maxDrawdownPct: number;
  var95Pct: number;        // 5th-percentile return (value-at-risk)
  // strategy-specific credibility metric
  inRangeRatePct: number;  // % of settled ranges that stayed in-range (Ribbon's "exercise rate" analog)
  winRatePct: number;      // % of paths ending profitable
  // distribution shape
  skew: number;
  kurtosis: number;
}

function pct(xs: number[], p: number): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length)));
  return sorted[idx];
}
function mean(xs: number[]): number { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; }
function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}
function maxDrawdown(curve: number[]): number {
  let peak = curve[0] ?? 0, mdd = 0;
  for (const v of curve) { if (v > peak) peak = v; const dd = peak > 0 ? (peak - v) / peak : 0; if (dd > mdd) mdd = dd; }
  return mdd;
}

/** Aggregate a batch of single-path results (one regime) into the stats panel. */
export function computeRegimeStats(regime: string, results: SimResult[], initialNav: number, horizonDays: number): RegimeStats {
  const yearFrac = horizonDays / 365;
  // annualized return per path
  const rets = results.map((r) => (Math.pow(r.finalNav / initialNav, 1 / Math.max(yearFrac, 1e-9)) - 1) * 100);
  const m = mean(rets), sd = std(rets);

  // downside deviation (for Sortino) — only negative returns
  const downside = rets.filter((r) => r < 0);
  const dd = downside.length ? Math.sqrt(downside.reduce((a, b) => a + b * b, 0) / downside.length) : 1e-9;

  const mdds = results.map((r) => maxDrawdown(r.equityCurve) * 100);
  const avgMdd = mean(mdds);

  // in-range rate across all settled ranges in the batch
  const totalSettled = results.reduce((a, r) => a + r.rangesInRange + r.rangesBreached, 0);
  const totalInRange = results.reduce((a, r) => a + r.rangesInRange, 0);
  const inRangeRate = totalSettled > 0 ? (totalInRange / totalSettled) * 100 : 0;

  const winRate = (rets.filter((r) => r > 0).length / Math.max(rets.length, 1)) * 100;

  // skew + excess kurtosis of the return distribution
  const skew = sd > 0 ? mean(rets.map((r) => ((r - m) / sd) ** 3)) : 0;
  const kurt = sd > 0 ? mean(rets.map((r) => ((r - m) / sd) ** 4)) - 3 : 0;

  const var95 = pct(rets, 5);
  const calmar = avgMdd > 0 ? m / avgMdd : 0;

  return {
    regime, paths: results.length,
    medianReturnPct: pct(rets, 50), p5ReturnPct: pct(rets, 5), p95ReturnPct: pct(rets, 95), meanReturnPct: m,
    sharpe: sd > 0 ? m / sd : 0,
    sortino: dd > 1e-6 ? Math.min(m / dd, 99) : 99,  // cap; ~no losing paths => effectively infinite
    calmar,
    maxDrawdownPct: avgMdd,
    var95Pct: var95,
    inRangeRatePct: inRangeRate,
    winRatePct: winRate,
    skew, kurtosis: kurt,
  };
}

export function formatPanel(all: RegimeStats[]): string {
  const h = (s: string, w: number) => s.padEnd(w);
  const n = (x: number, w: number, d = 1) => x.toFixed(d).padStart(w);
  let out = '\n  FLOE STRATOS — BACKTEST RESULTS (Monte Carlo, Merton jump-diffusion)\n';
  out += '  ' + '─'.repeat(86) + '\n';
  out += '  ' + h('Regime', 8) + h('Median', 9) + h('p5..p95', 16) + h('Sharpe', 8) + h('Sortino', 9)
       + h('MaxDD', 8) + h('VaR95', 9) + h('InRange', 9) + h('Win', 7) + '\n';
  out += '  ' + '─'.repeat(86) + '\n';
  for (const s of all) {
    out += '  ' + h(s.regime, 8)
      + n(s.medianReturnPct, 7) + '% '
      + (n(s.p5ReturnPct, 6) + '..' + n(s.p95ReturnPct, 6)).padEnd(16)
      + n(s.sharpe, 7, 2) + ' '
      + n(s.sortino, 8, 2) + ' '
      + n(s.maxDrawdownPct, 6) + '% '
      + n(s.var95Pct, 7) + '% '
      + n(s.inRangeRatePct, 7) + '% '
      + n(s.winRatePct, 5) + '%\n';
  }
  out += '  ' + '─'.repeat(86) + '\n';
  out += '  Returns annualized. p5..p95 = 5th–95th percentile band (the tail is shown, not hidden).\n';
  out += '  InRange = % of settled ranges that stayed in-band (the short-vol credibility metric).\n';
  return out;
}

/**
 * Floe backtest — runner. Orchestrates N paths x 4 regimes, prints the quant panel,
 * writes backtest-results.json, and emits an equity-curve + regime-comparison SVG.
 *
 * Run:  pnpm exec tsx src/backtest/run.ts            (from packages/rebalancer)
 *       pnpm exec tsx src/backtest/run.ts 2000       (override path count)
 */

import { writeFileSync } from 'fs';
import { REGIMES, type Regime } from './model.ts';
import { simulatePath, DEFAULT_SIM, type SimResult } from './engine.ts';
import { computeRegimeStats, formatPanel, type RegimeStats } from './stats.ts';

const PATHS = Number(process.argv[2] ?? 1000);
const cfg = DEFAULT_SIM;
const regimes = Object.keys(REGIMES) as Regime[];

console.log(`\nFloe Stratos backtest — ${PATHS} paths/regime, ${cfg.days}d horizon, jump-diffusion`);
console.log(`Driving the REAL StratosStrategy.decide() + oneSigmaRange() over simulated paths.\n`);

const allStats: RegimeStats[] = [];
const sampleCurves: Record<string, number[]> = {};
const allResults: Record<string, { median: number; p5: number; p95: number }> = {};

for (const regime of regimes) {
  const results: SimResult[] = [];
  for (let i = 0; i < PATHS; i++) {
    // distinct seed per (regime, path) — reproducible
    const seed = (regime.charCodeAt(0) << 20) ^ (i * 2654435761);
    results.push(simulatePath(REGIMES[regime], cfg, seed >>> 0));
  }
  const stats = computeRegimeStats(regime, results, cfg.initialNav, cfg.days);
  allStats.push(stats);
  // keep one representative equity curve (the path closest to the median final NAV)
  const sortedByFinal = [...results].sort((a, b) => a.finalNav - b.finalNav);
  sampleCurves[regime] = sortedByFinal[Math.floor(results.length / 2)].equityCurve;
  allResults[regime] = { median: stats.medianReturnPct, p5: stats.p5ReturnPct, p95: stats.p95ReturnPct };
}

console.log(formatPanel(allStats));

// ── blended (equal-weight across regimes) headline ──
const blendMedian = allStats.reduce((a, s) => a + s.medianReturnPct, 0) / allStats.length;
const blendInRange = allStats.reduce((a, s) => a + s.inRangeRatePct, 0) / allStats.length;
console.log(`  Blended (equal-weight regimes): median ${blendMedian.toFixed(1)}% APR | avg in-range ${blendInRange.toFixed(1)}%\n`);

// ── write results JSON ──
const out = {
  generatedAt: new Date().toISOString(),
  config: cfg,
  pathsPerRegime: PATHS,
  model: 'Merton jump-diffusion (GBM + Poisson lognormal jumps)',
  note: 'Drives the real StratosStrategy.decide(); premium SVI-consistent; tail shown not hidden.',
  regimes: allStats,
  blended: { medianReturnPct: blendMedian, avgInRangePct: blendInRange },
};
writeFileSync('backtest-results.json', JSON.stringify(out, null, 2));
console.log('  wrote backtest-results.json');

// ── emit equity-curve SVG (median path per regime) ──
function equityCurveSvg(curves: Record<string, number[]>): string {
  const W = 720, H = 360, pad = 50;
  const colors: Record<string, string> = { bull: '#34d399', bear: '#f87171', chop: '#60a5fa', crash: '#fbbf24' };
  const allVals = Object.values(curves).flat();
  const min = Math.min(...allVals), max = Math.max(...allVals);
  const maxLen = Math.max(...Object.values(curves).map((c) => c.length));
  const x = (i: number) => pad + (i / (maxLen - 1)) * (W - 2 * pad);
  const y = (v: number) => H - pad - ((v - min) / (max - min || 1)) * (H - 2 * pad);
  let paths = '';
  for (const [regime, curve] of Object.entries(curves)) {
    const d = curve.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    paths += `<path d="${d}" fill="none" stroke="${colors[regime]}" stroke-width="2"/>`;
    paths += `<text x="${W - pad + 4}" y="${y(curve[curve.length - 1]).toFixed(1)}" fill="${colors[regime]}" font-size="11" font-family="monospace">${regime}</text>`;
  }
  const initLine = y(DEFAULT_SIM.initialNav);
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<rect width="${W}" height="${H}" fill="#0b1220"/>
<text x="${pad}" y="24" fill="#e2e8f0" font-size="14" font-family="monospace">Floe Stratos — median equity curve per regime (NAV)</text>
<line x1="${pad}" y1="${initLine.toFixed(1)}" x2="${W - pad}" y2="${initLine.toFixed(1)}" stroke="#475569" stroke-width="1" stroke-dasharray="4 4"/>
<text x="${pad}" y="${(initLine - 4).toFixed(1)}" fill="#64748b" font-size="10" font-family="monospace">initial deposit</text>
${paths}
</svg>`;
}
writeFileSync('backtest-equity-curves.svg', equityCurveSvg(sampleCurves));
console.log('  wrote backtest-equity-curves.svg\n');

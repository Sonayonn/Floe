# Floe Stratos — Strategy Simulation

> Monte Carlo backtest of the **Floe Stratos** strategy. Drives the **real**
> `StratosStrategy.decide()` and `oneSigmaRange()` (the same code the live rebalancer runs),
> over simulated price paths. Reproducible: `pnpm exec tsx src/backtest/run.ts [paths]`.

## Methodology

**Price model — Merton jump-diffusion**, not plain GBM. The literature is explicit that
Gaussian models *underestimate* drawdowns; a short-vol range strategy's entire risk lives in
the tail, so we model fat tails via Poisson-timed lognormal jumps on top of GBM diffusion.
Parameters are calibrated per regime to BTC's empirical behaviour (annualized):

| Regime | Drift | Diffusive vol | Jumps/yr | Character |
|--------|-------|---------------|----------|-----------|
| Bull   | +60%  | 55% | 3  | trending up |
| Bear   | −45%  | 60% | 4  | trending down |
| Chop   | +5%   | 40% | 2  | low-vol range |
| Crash  | −30%  | 90% | 12 | high-vol, frequent downward gaps |

**Strategy — driven verbatim.** Each cycle the engine builds a real `MarketState` (NAV, idle,
PLP, open positions, a tau-correct SVI `SurfacePoint`) and calls the actual
`StratosStrategy.decide()`. Strikes are selected by the real `oneSigmaRange()` off the
simulated SVI surface. Three strata run as in production: PLP base yield (A), 1σ range ladder
(B), Margin delta hedge (C).

**Position economics — SVI-consistent.** A range's premium is a fraction of *deployed
collateral* scaled by the tenor vol budget (`iv·√τ`) plus a structural LP edge — so premium is
consistent with the vol surface the strike was chosen from. Capital is **locked** when a range
opens (the vault is capital-constrained — it cannot write unlimited ranges) and returned at
settle. On breach, loss scales with how far past the strike spot lands, in band-half-widths,
**capped at 100% of that position's collateral** — the honest short-vol asymmetry: many small
premium wins, occasional large losses.

**Costs:** management fee (2%/yr) + performance fee (20% above high-water mark) + hedge funding.

**Reproducibility:** seedable PRNG (mulberry32), distinct seed per (regime, path). Re-running
yields identical numbers.

## Results (1,000 paths/regime, 365-day horizon)

| Regime | Median APR | p5..p95 | Sharpe | Sortino | Max DD | VaR-95 | In-range | Win |
|--------|-----------|---------|--------|---------|--------|--------|----------|-----|
| Bull   | ~54% | 31..75% | 3.9 | 18.4 | 7.8% | +31% | 92% | 99.9% |
| Bear   | ~56% | 31..75% | 4.0 | 18.4 | 7.8% | +31% | 91% | 99.9% |
| Chop   | ~53% | 40..62% | 7.9 | high | 3.5% | +40% | 96% | 100% |
| Crash  | ~36% | **−2..76%** | 1.6 | 3.2 | **15.7%** | **−1.6%** | 85% | 94% |

(Headline figures from a representative run; exact values in `backtest-results.json`.)

**Reading the results — the honest picture:**
- **Chop is steadiest** (Sharpe ~8, 96% in-range, 3.5% drawdown): premium harvest works best when
  the underlying stays range-bound, exactly as designed.
- **Crash is the worst regime** (Sharpe drops to ~1.6, drawdown ~16%, **VaR-95 negative — the
  worst 5% of crash-years lose money**, win rate 94%). A short-vol vault *should* bleed in crashes;
  this one does, and we show it rather than hide it.
- **Negative skew** is the strategy's signature: many small premium gains, occasional large
  breach losses. The p5..p95 bands widen sharply in crash.
- **In-range rate** (the short-vol credibility metric, analogous to a covered-call's exercise
  rate) tracks regime: 96% in chop, 85% in crash.

## Limitations (stated honestly)

- **Synthetic paths**, not historical replay (a historical BTC validation is a drop-in second
  source; see `backtest/` — supply a daily CSV to extend).
- **Hedge leg is approximated** (funding cost + variance reduction), not a full continuous-greeks
  delta hedge — the real hedge P&L would need tick-level simulation.
- **Premium model** assumes SVI-consistent pricing with a fixed LP edge; live premia depend on
  Predict's internal market maker quotes.
- Returns are **gross of slippage** on the underlying CLOB; testnet liquidity differs from mainnet.

These are the assumptions a reviewer should weigh. The point of the simulation is not to promise
a return — it is to characterize the strategy's **risk profile** across regimes, including the
losing ones.

## Artifacts
- `backtest-results.json` — full per-regime stats
- `backtest-equity-curves.svg` — median equity curve per regime
- `src/backtest/` — model, engine (drives real `decide()`), stats, runner
